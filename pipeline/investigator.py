"""AI call #2: the investigator agent.

The only agentic step in the pipeline. Loop over the three hardcoded tools with a
HARD counter at 4 tool calls — the counter breaks the loop, not a prompt instruction.
On cap, the model is forced to report what it has. Each step is streamed to a
callback as it completes and the full trace persists for replay.
"""
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from .ai import MODEL, MESH_MODEL, USE_MESH, FIXTURE_DIR, _fixture_key, _get_client
from .tools import TOOL_DEFINITIONS, execute_tool

MAX_TOOL_CALLS = 4  # hard cap — do not raise

SYSTEM = """You are an incident investigator for a support-ticket triage tool.
You are given a cluster of support tickets that describe the same underlying problem.
Investigate using the three tools available, then write up your findings.

Constraints:
- You have a hard budget of 4 tool calls total, enforced by the harness. Spend them well.
- You are read-only. You cannot change tickets, accounts, or deploys.
- You have ticket text and tool results only — no access to code or logs. You cannot know
  root causes; you can only establish correlations and rule things out.
- In your final report, tie every claim to ticket IDs (e.g. t228) or a named tool result
  (e.g. "check_deploys: d6"). State clearly what you did NOT examine."""


def _summarize_result(result) -> str:
    text = json.dumps(result, ensure_ascii=False)
    return text if len(text) <= 300 else text[:300] + "…"


def investigate(corpus: dict, cluster: dict, on_step=None) -> dict:
    """Run the agent loop for one cluster. Returns the persisted investigation record."""
    members = [corpus["tickets_by_id"][tid] for tid in cluster["ticket_ids"]]
    ticket_block = "\n".join(
        f"[{t['id']}] customer={t['customer_id']} at={t['created_at']}\n"
        f"  subject: {t['subject']}\n  body: {t['body']}"
        for t in members
    )
    user = (
        f"Cluster: {cluster['name']}\n"
        f"First seen: {cluster['first_seen']} — {cluster['customer_count']} distinct customers, "
        f"{len(members)} tickets.\n\nMember tickets:\n{ticket_block}\n\n"
        "Investigate this cluster, then report your findings."
    )

    fixture_key = _fixture_key({"name": "investigation", "system": SYSTEM, "user": user})
    fixture = FIXTURE_DIR / f"investigation_{fixture_key}.json"

    def _replay() -> dict:
        record = json.loads(fixture.read_text())["output"]
        for step in record["steps"]:
            if on_step:
                on_step(step)
        print(f"[investigator] replayed fixture {fixture.name}")
        return record

    if os.environ.get("FORCE_FIXTURES") == "1":
        if fixture.exists():
            return _replay()
        raise RuntimeError(f"FORCE_FIXTURES=1 but no investigation fixture ({fixture.name})")

    try:
        run = _live_run_mesh if USE_MESH else _live_run
        return run(corpus, cluster, user, fixture, fixture_key, on_step)
    except Exception as exc:
        if fixture.exists():
            print(f"[investigator] live run failed ({exc}); replaying fixture")
            return _replay()
        raise RuntimeError(f"investigator: live run failed and no fixture exists ({exc})") from exc


def _live_run(corpus: dict, cluster: dict, user: str, fixture, fixture_key: str, on_step) -> dict:
    client = _get_client()
    messages = [{"role": "user", "content": user}]
    steps: list[dict] = []
    calls_used = 0
    findings = ""

    while True:
        capped = calls_used >= MAX_TOOL_CALLS
        response = client.messages.create(
            model=MODEL,
            max_tokens=16000,
            system=SYSTEM,
            messages=messages,
            tools=TOOL_DEFINITIONS,
            tool_choice={"type": "none"} if capped else {"type": "auto"},
        )
        if response.stop_reason == "refusal":
            raise RuntimeError(f"investigator: model refused ({response.stop_details})")
        if response.stop_reason == "max_tokens":
            raise RuntimeError("investigator: turn truncated at max_tokens — not trusting partial output")

        tool_uses = [b for b in response.content if b.type == "tool_use"]
        findings = "\n".join(b.text for b in response.content if b.type == "text") or findings

        if not tool_uses:
            break

        messages.append({"role": "assistant", "content": response.content})
        results = []
        for block in tool_uses:
            if calls_used >= MAX_TOOL_CALLS:
                # Hard counter: the loop refuses to execute, regardless of what the model asked.
                results.append({"type": "tool_result", "tool_use_id": block.id,
                                "content": "Tool budget exhausted (4 calls). Report your findings now.",
                                "is_error": True})
                continue
            calls_used += 1
            try:
                result = execute_tool(corpus, block.name, block.input)
                is_error = False
            except Exception as exc:
                # A bad tool input (e.g. a non-ISO date) is the model's problem to
                # correct, not a reason to kill the investigation. Still counts
                # against the budget — the counter stays predictable.
                result = f"Error: {exc}"
                is_error = True
            step = {
                "step": calls_used,
                "tool": block.name,
                "input": block.input,
                "result_summary": _summarize_result(result),
                "result": result,
            }
            steps.append(step)
            if on_step:
                on_step(step)
            results.append({"type": "tool_result", "tool_use_id": block.id,
                            "content": result if is_error else json.dumps(result, ensure_ascii=False),
                            "is_error": is_error})
        messages.append({"role": "user", "content": results})

    record = {
        "cluster_id": cluster["id"],
        "cluster_name": cluster["name"],
        "steps": steps,
        "findings": findings,
        "tool_calls_used": calls_used,
        "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    FIXTURE_DIR.mkdir(exist_ok=True)
    fixture.write_text(json.dumps({"input_key": fixture_key, "output": record},
                                  indent=2, ensure_ascii=False))
    print(f"[investigator] live run ok: {calls_used} tool calls; fixture saved")
    return record


def _openai_tools() -> list[dict]:
    """The same three hardcoded tools in OpenAI function-calling format (for Mesh)."""
    return [
        {"type": "function",
         "function": {"name": t["name"], "description": t["description"],
                      "parameters": t["input_schema"]}}
        for t in TOOL_DEFINITIONS
    ]


def _live_run_mesh(corpus: dict, cluster: dict, user: str, fixture, fixture_key: str, on_step) -> dict:
    """Same agent loop as _live_run, over Mesh's OpenAI-compatible API.

    The hard 4-call counter is identical: the loop refuses to execute past the
    cap and tells the model to report with what it has.
    """
    client = _get_client()
    messages: list[dict] = [{"role": "system", "content": SYSTEM},
                            {"role": "user", "content": user}]
    steps: list[dict] = []
    calls_used = 0
    findings = ""

    while True:
        capped = calls_used >= MAX_TOOL_CALLS
        response = client.chat.completions.create(
            model=MESH_MODEL,
            max_tokens=16000,
            messages=messages,
            tools=_openai_tools(),
            tool_choice="none" if capped else "auto",
        )
        choice = response.choices[0]
        if choice.finish_reason == "length":
            raise RuntimeError("investigator: turn truncated at max_tokens — not trusting partial output")
        msg = choice.message
        if msg.content:
            findings = msg.content

        if not msg.tool_calls:
            break

        messages.append({
            "role": "assistant",
            "content": msg.content,
            "tool_calls": [
                {"id": tc.id, "type": "function",
                 "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                for tc in msg.tool_calls
            ],
        })
        for tc in msg.tool_calls:
            if calls_used >= MAX_TOOL_CALLS:
                # Hard counter: the loop refuses to execute, regardless of what the model asked.
                messages.append({"role": "tool", "tool_call_id": tc.id,
                                 "content": "Tool budget exhausted (4 calls). Report your findings now."})
                continue
            calls_used += 1
            tool_input = json.loads(tc.function.arguments or "{}")
            try:
                result = execute_tool(corpus, tc.function.name, tool_input)
                # Mesh's upstream (Bedrock Converse) requires toolResult JSON to
                # be an *object* — bare arrays are rejected with a 400. Wrap them.
                payload = result if isinstance(result, dict) else {"results": result}
                content = json.dumps(payload, ensure_ascii=False)
            except Exception as exc:
                result = f"Error: {exc}"
                content = result  # plain text, not JSON — model can self-correct
            step = {
                "step": calls_used,
                "tool": tc.function.name,
                "input": tool_input,
                "result_summary": _summarize_result(result),
                "result": result,
            }
            steps.append(step)
            if on_step:
                on_step(step)
            # Mesh's upstream (Bedrock Converse) requires tool results to be
            # JSON objects, and our tools often return arrays — wrap them.
            messages.append({"role": "tool", "tool_call_id": tc.id,
                             "content": content})

    record = {
        "cluster_id": cluster["id"],
        "cluster_name": cluster["name"],
        "steps": steps,
        "findings": findings,
        "tool_calls_used": calls_used,
        "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    FIXTURE_DIR.mkdir(exist_ok=True)
    fixture.write_text(json.dumps({"input_key": fixture_key, "output": record},
                                  indent=2, ensure_ascii=False))
    print(f"[investigator] live run ok (mesh): {calls_used} tool calls; fixture saved")
    return record


def print_step(step: dict):
    print(f"[step {step['step']}] {step['tool']}({json.dumps(step['input'])})")
    print(f"          → {step['result_summary']}")
