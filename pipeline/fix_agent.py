"""AI call #5: the fix agent.

Patches the sample storefront's fraud module — and ONLY that module. Safety rails
are structural, not prompt-level:
  - tools operate on an in-memory overlay of the storefront files, never disk
  - write_file allowlist is exactly {storefront-fraud.js}
  - a hard counter breaks the loop at 6 tool calls
  - the harness runs its own final check; the model's claims are not trusted
  - the patch is persisted as storefront-fraud-fixed.js (a COPY — the original
    stays broken so the demo can show before/after)

Run: python -m pipeline.fix_agent c1   (FORCE_FIXTURES=1 replays the fixture)
"""
import difflib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from .ai import MESH_MODEL, USE_MESH, FIXTURE_DIR, _fixture_key, _get_client

ROOT = Path(__file__).parent.parent
PUBLIC = ROOT / "app" / "public"
OUT = ROOT / "out"

MAX_TOOL_CALLS = 6  # hard cap — do not raise
READ_ALLOWLIST = ("storefront-fraud.js", "storefront.js", "storefront.html")
WRITE_ALLOWLIST = ("storefront-fraud.js",)

SYSTEM = """You are a coding agent fixing one production bug in a small e-commerce storefront.

The bug (from the engineering escalation): checkout fails for orders at or above $1,000
because the fraud screening module routes high-value orders to an extended-verification
endpoint that no longer exists.

Your task: patch storefront-fraud.js so high-value orders succeed through STANDARD
screening, flagged with `requiresManualReview: true` in the returned object so the
risk team still reviews them. Low-value behavior must not change, and the module's
public API (window.fraudCheck) must stay identical.

Constraints, enforced by the harness:
- You may only WRITE storefront-fraud.js. Reads are limited to the storefront files.
- Hard budget of 6 tool calls. Read the module, write the fix, then run_check.
- Keep the patch minimal — this is a bug fix, not a refactor.
- Always finish by calling run_check and confirming both cases pass; then summarize
  what you changed and why in 2-4 sentences."""

TOOLS = [
    {"type": "function", "function": {
        "name": "read_file",
        "description": "Read one of the storefront source files.",
        "parameters": {"type": "object", "properties": {
            "path": {"type": "string", "enum": list(READ_ALLOWLIST)}},
            "required": ["path"]}}},
    {"type": "function", "function": {
        "name": "write_file",
        "description": "Replace the full contents of storefront-fraud.js with your patched version.",
        "parameters": {"type": "object", "properties": {
            "path": {"type": "string", "enum": list(WRITE_ALLOWLIST)},
            "content": {"type": "string"}},
            "required": ["path", "content"]}}},
    {"type": "function", "function": {
        "name": "run_check",
        "description": "Run the checkout smoke checks ($40 order and $1,300 order must both be approved) against your current version of storefront-fraud.js.",
        "parameters": {"type": "object", "properties": {}}}},
]

CHECK_HARNESS = """
const cases = [];
function t(name, fn) {
  try { const r = fn(); cases.push({name, pass: true, detail: JSON.stringify(r) || ""}); }
  catch (e) { cases.push({name, pass: false, detail: String(e && e.message || e)}); }
}
t("$40 order approved", () => {
  const r = window.fraudCheck({total: 40});
  if (!r || r.approved !== true) throw new Error("not approved: " + JSON.stringify(r));
  return r;
});
t("$1,300 order approved", () => {
  const r = window.fraudCheck({total: 1300});
  if (!r || r.approved !== true) throw new Error("not approved: " + JSON.stringify(r));
  return r;
});
console.log(JSON.stringify({passed: cases.every(c => c.pass), cases}));
"""


def run_check(module_source: str) -> dict:
    script = "const window = {};\n" + module_source + "\n" + CHECK_HARNESS
    try:
        proc = subprocess.run(["node", "-e", script], capture_output=True, text=True, timeout=15)
    except subprocess.TimeoutExpired:
        return {"passed": False, "cases": [], "error": "check timed out"}
    if proc.returncode != 0:
        return {"passed": False, "cases": [], "error": proc.stderr.strip()[:400]}
    try:
        return json.loads(proc.stdout.strip().splitlines()[-1])
    except Exception:
        return {"passed": False, "cases": [], "error": f"unparseable check output: {proc.stdout[:200]}"}


def _summarize(result) -> str:
    text = result if isinstance(result, str) else json.dumps(result, ensure_ascii=False)
    return text if len(text) <= 300 else text[:300] + "…"


def _execute(overlay: dict, name: str, tool_input: dict):
    if name == "read_file":
        path = tool_input["path"]
        if path not in READ_ALLOWLIST:
            raise ValueError(f"read of {path!r} not allowed")
        if path not in overlay:
            raise FileNotFoundError(f"{path} does not exist yet")
        return overlay[path]
    if name == "write_file":
        path = tool_input["path"]
        if path not in WRITE_ALLOWLIST:
            raise ValueError(f"write of {path!r} not allowed — only {WRITE_ALLOWLIST}")
        overlay[path] = tool_input["content"]
        return {"written": path, "bytes": len(tool_input["content"])}
    if name == "run_check":
        return run_check(overlay["storefront-fraud.js"])
    raise ValueError(f"unknown tool {name!r}")


def build_fix(cluster_id: str, on_step=None) -> dict:
    original = (PUBLIC / "storefront-fraud.js").read_text()
    analysis_path = OUT / f"analysis_{cluster_id}.json"
    packet = json.loads(analysis_path.read_text())["packet"] if analysis_path.exists() else {}
    user = (
        f"Escalation packet for cluster {cluster_id}:\n{json.dumps(packet, indent=2, ensure_ascii=False)}\n\n"
        "Fix the bug. Start by reading storefront-fraud.js."
    )

    fixture_key = _fixture_key({"name": "fix_agent", "system": SYSTEM, "user": user,
                                "original": original})
    fixture = FIXTURE_DIR / f"fix_{fixture_key}.json"

    def _replay() -> dict:
        record = json.loads(fixture.read_text())["output"]
        for step in record["steps"]:
            if on_step:
                on_step(step)
        print(f"[fix_agent] replayed fixture {fixture.name}")
        return record

    if os.environ.get("FORCE_FIXTURES") == "1":
        if fixture.exists():
            return _replay()
        raise RuntimeError(f"FORCE_FIXTURES=1 but no fix fixture ({fixture.name})")

    try:
        return _live_run(cluster_id, original, user, fixture, fixture_key, on_step)
    except Exception as exc:
        if fixture.exists():
            print(f"[fix_agent] live run failed ({exc}); replaying fixture")
            return _replay()
        raise RuntimeError(f"fix_agent: live run failed and no fixture exists ({exc})") from exc


def _live_run(cluster_id: str, original: str, user: str, fixture, fixture_key: str, on_step) -> dict:
    if not USE_MESH:
        raise RuntimeError("fix_agent currently runs via Mesh — set MESH_API_KEY")
    client = _get_client()
    overlay = {"storefront-fraud.js": original}
    for name in READ_ALLOWLIST[1:]:
        path = PUBLIC / name
        if path.exists():
            overlay[name] = path.read_text()

    messages = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}]
    steps, calls_used, summary = [], 0, ""

    while True:
        capped = calls_used >= MAX_TOOL_CALLS
        response = client.chat.completions.create(
            model=MESH_MODEL, max_tokens=16000, messages=messages,
            tools=TOOLS, tool_choice="none" if capped else "auto",
        )
        choice = response.choices[0]
        if choice.finish_reason == "length":
            raise RuntimeError("fix_agent: turn truncated at max_tokens")
        msg = choice.message
        if msg.content:
            summary = msg.content
        if not msg.tool_calls:
            break

        messages.append({"role": "assistant", "content": msg.content, "tool_calls": [
            {"id": tc.id, "type": "function",
             "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
            for tc in msg.tool_calls]})
        for tc in msg.tool_calls:
            if calls_used >= MAX_TOOL_CALLS:
                messages.append({"role": "tool", "tool_call_id": tc.id,
                                 "content": "Tool budget exhausted (6 calls). Summarize now."})
                continue
            calls_used += 1
            tool_input = json.loads(tc.function.arguments or "{}")
            try:
                result = _execute(overlay, tc.function.name, tool_input)
                payload = result if isinstance(result, dict) else {"result": result}
                content = json.dumps(payload, ensure_ascii=False)
            except Exception as exc:
                result = f"Error: {exc}"
                content = result
            shown_input = {k: (v if k != "content" else f"<{len(v)} chars>")
                           for k, v in tool_input.items()}
            step = {"step": calls_used, "tool": tc.function.name, "input": shown_input,
                    "result_summary": _summarize(result)}
            steps.append(step)
            if on_step:
                on_step(step)
            messages.append({"role": "tool", "tool_call_id": tc.id, "content": content})

    patched = overlay["storefront-fraud.js"]
    if patched == original:
        raise RuntimeError("fix_agent finished without writing a patch")
    check = run_check(patched)  # harness verdict — the model's claims are not trusted
    if not check.get("passed"):
        raise RuntimeError(f"fix_agent patch fails the harness check: {check}")

    diff = "".join(difflib.unified_diff(
        original.splitlines(keepends=True), patched.splitlines(keepends=True),
        fromfile="a/storefront-fraud.js", tofile="b/storefront-fraud.js"))
    record = {
        "cluster_id": cluster_id,
        "steps": steps,
        "summary": summary,
        "diff": diff,
        "check": check,
        "patched_content": patched,
        "tool_calls_used": calls_used,
        "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    FIXTURE_DIR.mkdir(exist_ok=True)
    fixture.write_text(json.dumps({"input_key": fixture_key, "output": record},
                                  indent=2, ensure_ascii=False))
    print(f"[fix_agent] live run ok: {calls_used} tool calls, check passed; fixture saved")
    return record


def print_step(step: dict):
    print(f"[step {step['step']}] {step['tool']}({json.dumps(step['input'])})")
    print(f"          → {step['result_summary']}")


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: python -m pipeline.fix_agent <cluster_id>")
    cluster_id = sys.argv[1]
    record = build_fix(cluster_id, on_step=print_step)

    OUT.mkdir(exist_ok=True)
    out_path = OUT / f"fix_{cluster_id}.json"
    out_path.write_text(json.dumps(record, indent=2, ensure_ascii=False))
    print(f"[out] wrote {out_path.relative_to(ROOT)}")

    fixed = PUBLIC / "storefront-fraud-fixed.js"
    fixed.write_text("// GENERATED BY THE FIX AGENT — patched copy of storefront-fraud.js.\n"
                     "// The original (broken) module is left untouched for the before/after demo.\n"
                     + record["patched_content"])
    print(f"[out] wrote {fixed.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
