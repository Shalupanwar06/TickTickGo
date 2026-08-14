"""H+5 integration adapter: translate pipeline output into the five fixture
files the frontend server reads (fixtures/*.json).

Run deliberately at integration time, after the pipeline has produced out/:

    python -m pipeline.export_frontend c1

It overwrites Shalu's placeholder fixtures — that is the agreed integration
mechanism (see forge-spec.md and the fixture notes). Then redeploy via
scripts/deploy.sh.

Shape translations (frontend expects ≠ pipeline emits):
  - investigation: single record, steps use "n" not "step", analysis embedded
    with sections named common/varies (not common_factors/variations)
  - tool-reference cites like "check_deploys#2" move to the item's "tool" field
  - packet: structured JSON object from the analysis output (requires the
    analysis stage to have emitted a "packet" object)
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
OUT = ROOT / "out"
FIXTURES = ROOT / "fixtures"
DATA = Path(__file__).parent / "data"

TOOL_REF = re.compile(r"^(search_ticket_history|get_account|check_deploys)#\d+$")


def _read(path: Path):
    if not path.exists():
        sys.exit(f"missing {path.relative_to(ROOT)} — run the pipeline stages first")
    return json.loads(path.read_text())


def _write(name: str, data):
    path = FIXTURES / name
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    print(f"[export] wrote {path.relative_to(ROOT)}")


def _split_tool_cites(item: dict) -> dict:
    """Move tool-reference cites into the frontend's optional `tool` field."""
    tool_refs = [c for c in item["cites"] if TOOL_REF.match(c)]
    out = {"text": item["text"], "cites": [c for c in item["cites"] if not TOOL_REF.match(c)]}
    if tool_refs:
        out["tool"] = tool_refs[0].split("#")[0]
    if "not_examined" in item:
        out["not_examined"] = item["not_examined"]
    return out


def export(cluster_id: str):
    # 1 + 2: drop-ins
    _write("clusters.json", _read(OUT / "clusters.json"))
    _write("tickets.json", {"tickets": _read(DATA / "tickets.json")["tickets"]})

    # 3: investigation — merge record + analysis, rename fields
    investigations = _read(OUT / "investigations.json")
    if cluster_id not in investigations:
        sys.exit(f"no investigation for {cluster_id} in out/investigations.json")
    inv = investigations[cluster_id]
    analysis = _read(OUT / f"analysis_{cluster_id}.json")
    _write("investigation.json", {
        "cluster_id": cluster_id,
        "created_at": inv["created_at"],
        "steps": [
            {"n": s["step"], "tool": s["tool"], "input": s["input"],
             "result_summary": s["result_summary"]}
            for s in inv["steps"]
        ],
        "analysis": {
            "common": [_split_tool_cites(i) for i in analysis["common_factors"]],
            "varies": [_split_tool_cites(i) for i in analysis["variations"]],
            "ruled_out": [_split_tool_cites(i) for i in analysis["ruled_out"]],
            "hypotheses": [_split_tool_cites(i) for i in analysis["hypotheses"]],
        },
    })

    # 4: drafts — drop-in
    _write("drafts.json", _read(OUT / f"drafts_{cluster_id}.json"))

    # 5: packet — structured object from the analysis stage
    if "packet" not in analysis:
        sys.exit("analysis output has no structured 'packet' — re-run "
                 f"'python -m pipeline.run analyze {cluster_id}' on the current pipeline")
    _write("packet.json", {"cluster_id": cluster_id, "packet": analysis["packet"]})

    print(f"[export] done — deploy with scripts/deploy.sh")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python -m pipeline.export_frontend <cluster_id>")
    export(sys.argv[1])
