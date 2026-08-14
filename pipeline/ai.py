"""Model-call wrapper: structured JSON output + fixture fallback keyed by input hash.

Every AI call goes through call_structured(). On a good API response the parsed
output is saved as a fixture; if the API is unavailable (or FORCE_FIXTURES=1),
the fixture for the identical input serves instead. No fixture + no API = loud failure.
"""
import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any

def _load_dotenv():
    """Load repo-root .env into os.environ (existing env vars win). No deps."""
    env = Path(__file__).parent.parent / ".env"
    if not env.exists():
        return
    for line in env.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


_load_dotenv()

MODEL = "claude-opus-5"
# Provider switch: MESH_API_KEY set -> Mesh API (OpenAI-compatible gateway,
# https://developers.meshapi.ai), else the Anthropic API directly. Mesh model
# ids carry a provider prefix, e.g. anthropic/claude-opus-5.
USE_MESH = bool(os.environ.get("MESH_API_KEY"))
MESH_MODEL = os.environ.get("MESH_MODEL", "anthropic/claude-opus-5")
MESH_BASE_URL = os.environ.get("MESH_BASE_URL", "https://api.meshapi.ai/v1")
# Pipeline AI-call fixtures live here; the top-level fixtures/ dir is the
# frontend's (Shalu's) and must not be written to by the pipeline.
FIXTURE_DIR = Path(__file__).parent / "fixtures"

_client = None


def _get_client() -> Any:
    # Untyped on purpose: returns either an OpenAI (Mesh) or Anthropic client;
    # each call site sits behind the matching USE_MESH branch.
    global _client
    if _client is None:
        if USE_MESH:
            from openai import OpenAI
            _client = OpenAI(api_key=os.environ["MESH_API_KEY"], base_url=MESH_BASE_URL)
        else:
            import anthropic
            _client = anthropic.Anthropic()
    return _client


def _close_truncated_json(text: str) -> str:
    """Append the closers a truncated JSON object is missing (observed with
    Mesh: complete content, but the final `}`s cut off)."""
    stack = []
    in_string = escape = False
    for ch in text:
        if escape:
            escape = False
        elif in_string:
            if ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
        elif ch == '"':
            in_string = True
        elif ch in "{[":
            stack.append("}" if ch == "{" else "]")
        elif ch in "}]" and stack:
            stack.pop()
    if in_string:
        text += '"'
    return text + "".join(reversed(stack))


def parse_json_response(text: str) -> dict:
    """Parse a JSON object out of model text, tolerating code fences, prose,
    and truncated closing braces."""
    text = text.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    start = text.find("{")
    if start == -1:
        raise json.JSONDecodeError("no JSON object found", text, 0)
    end = text.rfind("}")
    if end > start:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            pass
    return json.loads(_close_truncated_json(text[start:]))


def _fixture_key(payload: dict) -> str:
    blob = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(blob.encode()).hexdigest()[:12]


def _fixture_path(name: str, key: str) -> Path:
    return FIXTURE_DIR / f"{name}_{key}.json"


def call_structured(name: str, system: str, user: str, schema: dict, max_tokens: int = 16000) -> dict:
    """One structured-output model call. Returns the parsed JSON object."""
    payload = {"name": name, "system": system, "user": user, "schema": schema}
    key = _fixture_key(payload)
    fixture = _fixture_path(name, key)

    if os.environ.get("FORCE_FIXTURES") == "1":
        if fixture.exists():
            print(f"[ai] {name}: serving fixture {fixture.name}")
            return json.loads(fixture.read_text())["output"]
        raise RuntimeError(f"FORCE_FIXTURES=1 but no fixture for {name} ({fixture.name})")

    try:
        client = _get_client()
        if USE_MESH:
            # Mesh is OpenAI-compatible and has no Anthropic-native structured
            # output, so the schema rides in the system prompt and the reply is
            # parsed defensively. Downstream validators enforce the shape.
            schema_note = (
                "\n\nRespond with a single JSON object that matches this JSON schema "
                "exactly. Output only the JSON — no prose, no code fences.\nSchema:\n"
                + json.dumps(schema)
            )
            # Without API-enforced structured output, long replies occasionally
            # arrive as malformed JSON — one resample usually fixes it.
            last_err = None
            for attempt in range(2):
                response = client.chat.completions.create(
                    model=MESH_MODEL,
                    max_tokens=max_tokens,
                    messages=[
                        {"role": "system", "content": system + schema_note},
                        {"role": "user", "content": user},
                    ],
                )
                choice = response.choices[0]
                if choice.finish_reason == "length":
                    raise RuntimeError(f"{name}: output truncated at max_tokens={max_tokens}")
                try:
                    output = parse_json_response(choice.message.content or "")
                    break
                except json.JSONDecodeError as err:
                    last_err = err
                    print(f"[ai] {name}: malformed JSON (attempt {attempt + 1}); retrying")
            else:
                raise RuntimeError(f"{name}: malformed JSON after retries ({last_err})")
        else:
            response = client.messages.create(
                model=MODEL,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user}],
                output_config={"format": {"type": "json_schema", "schema": schema}},
            )
            if response.stop_reason == "refusal":
                raise RuntimeError(f"{name}: model refused ({response.stop_details})")
            if response.stop_reason == "max_tokens":
                raise RuntimeError(f"{name}: output truncated at max_tokens={max_tokens}")
            text = next(b.text for b in response.content if b.type == "text")
            output = json.loads(text)
    except Exception as exc:
        if fixture.exists():
            print(f"[ai] {name}: API failed ({exc}); serving fixture {fixture.name}")
            return json.loads(fixture.read_text())["output"]
        raise RuntimeError(f"{name}: API call failed and no fixture exists ({exc})") from exc

    FIXTURE_DIR.mkdir(exist_ok=True)
    fixture.write_text(json.dumps({"input_key": key, "output": output}, indent=2, ensure_ascii=False))
    print(f"[ai] {name}: live call ok; fixture saved ({fixture.name})")
    return output
