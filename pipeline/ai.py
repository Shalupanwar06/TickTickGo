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


def parse_json_response(text: str) -> dict:
    """Parse a JSON object out of model text, tolerating code fences and prose."""
    text = text.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            raise
        return json.loads(text[start:end + 1])


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
            output = parse_json_response(choice.message.content or "")
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
