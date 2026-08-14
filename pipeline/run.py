"""Pipeline CLI.

  python -m pipeline.run group              AI #1 → out/groups.json
  python -m pipeline.run rank               arithmetic → out/clusters.json (the contract)
  python -m pipeline.run investigate c1     AI #2 → out/investigations.json (streamed)
  python -m pipeline.run analyze c1         AI #3 → out/analysis_c1.json + out/packet_c1.md
  python -m pipeline.run drafts c1          AI #4 → out/drafts_c1.json
  python -m pipeline.run all                group → rank → investigate/analyze/drafts for top cluster

FORCE_FIXTURES=1 serves saved fixtures instead of calling the API (demo fallback).
"""
import json
import sys
from pathlib import Path

from .analysis import run_analysis
from .drafts import run_drafts
from .grouping import run_grouping
from .ingest import load_corpus
from .investigator import investigate, print_step
from .ranking import run_ranking

OUT = Path(__file__).parent.parent / "out"


def _write(name: str, data) -> Path:
    OUT.mkdir(exist_ok=True)
    path = OUT / name
    if isinstance(data, str):
        path.write_text(data)
    else:
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    print(f"[out] wrote {path.relative_to(OUT.parent)}")
    return path


def _load(name: str):
    path = OUT / name
    if not path.exists():
        sys.exit(f"missing {path} — run the earlier stage first")
    return json.loads(path.read_text())


def _get_cluster(cluster_id: str) -> dict:
    contract = _load("clusters.json")
    for c in contract["clusters"]:
        if c["id"] == cluster_id:
            return c
    sys.exit(f"no cluster {cluster_id!r} in out/clusters.json")


def cmd_group(corpus):
    _write("groups.json", run_grouping(corpus))


def cmd_rank(corpus):
    _write("clusters.json", run_ranking(_load("groups.json"), corpus))


def cmd_investigate(corpus, cluster_id):
    cluster = _get_cluster(cluster_id)
    record = investigate(corpus, cluster, on_step=print_step)
    path = OUT / "investigations.json"
    existing = json.loads(path.read_text()) if path.exists() else {}
    existing[cluster_id] = record
    _write("investigations.json", existing)
    return record


def cmd_analyze(corpus, cluster_id):
    cluster = _get_cluster(cluster_id)
    investigations = _load("investigations.json")
    if cluster_id not in investigations:
        sys.exit(f"no investigation for {cluster_id} — run investigate first")
    analysis = run_analysis(corpus, cluster, investigations[cluster_id])
    packet = analysis.pop("packet_markdown")
    _write(f"analysis_{cluster_id}.json", analysis)
    _write(f"packet_{cluster_id}.md",
           packet + "\n\n---\n*Generated from synthetic demo data.*\n")
    return analysis


def cmd_drafts(corpus, cluster_id):
    cluster = _get_cluster(cluster_id)
    status = (f"Cluster '{cluster['name']}' is confirmed across {cluster['customer_count']} "
              "customers, correlated with a recent deploy, and escalated to engineering. "
              "No fix shipped yet.")
    _write(f"drafts_{cluster_id}.json", run_drafts(corpus, cluster, status))


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    cmd = sys.argv[1]
    corpus = load_corpus()

    if cmd == "group":
        cmd_group(corpus)
    elif cmd == "rank":
        cmd_rank(corpus)
    elif cmd in ("investigate", "analyze", "drafts"):
        if len(sys.argv) < 3:
            sys.exit(f"usage: python -m pipeline.run {cmd} <cluster_id>")
        {"investigate": cmd_investigate, "analyze": cmd_analyze, "drafts": cmd_drafts}[cmd](corpus, sys.argv[2])
    elif cmd == "all":
        cmd_group(corpus)
        cmd_rank(corpus)
        clusters = _load("clusters.json")["clusters"]
        if not clusters:
            sys.exit("grouping produced no multi-ticket clusters — nothing to investigate")
        top = clusters[0]["id"]
        print(f"\n=== investigating top cluster {top} ===")
        cmd_investigate(corpus, top)
        cmd_analyze(corpus, top)
        cmd_drafts(corpus, top)
    else:
        sys.exit(f"unknown command {cmd!r}\n{__doc__}")


if __name__ == "__main__":
    main()
