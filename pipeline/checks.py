"""Deterministic self-checks. Run: python -m pipeline.checks

Verifies every corpus invariant the WORKPLAN calls non-negotiable, then runs
ranking against the hand-labeled ground-truth grouping (tests/expected_groups.json)
and asserts the contract shape. No model calls.
"""
import json
import re
import sys
from pathlib import Path

from .ingest import load_corpus, parse_ts
from .ranking import run_ranking
from .tools import STOPWORDS

EXPECTED = Path(__file__).parent.parent / "tests" / "expected_groups.json"

FAILURES = []


def check(label: str, ok: bool, detail: str = ""):
    mark = "ok  " if ok else "FAIL"
    print(f"[{mark}] {label}" + (f" — {detail}" if detail else ""))
    if not ok:
        FAILURES.append(label)


def content_words(text: str) -> set[str]:
    words = re.findall(r"[a-z']+", text.lower())
    return {w for w in words if w not in STOPWORDS and len(w) > 1
            and w not in {"us", "so", "if", "am", "an", "do", "he", "she", "her", "his",
                          "them", "they", "there", "is", "its", "get", "got", "has", "had",
                          "have", "can", "cant", "wont", "all", "out", "up", "now", "one",
                          "two", "both", "just", "very", "than", "then", "when", "what",
                          "who", "how", "why", "went", "said", "told", "say", "saying"}}


def main():
    corpus = load_corpus()
    expected = json.loads(EXPECTED.read_text())
    tickets_by_id = corpus["tickets_by_id"]

    # --- corpus shape ---
    check("50 tickets", len(corpus["tickets"]) == 50, str(len(corpus["tickets"])))
    check("12 accounts", len(corpus["accounts"]) == 12)
    grouped = [tid for g in expected["groups"] for tid in g["ticket_ids"]]
    check("5 labeled issues", len(expected["groups"]) == 5)
    check("grouped + ungrouped covers all tickets, no overlap",
          sorted(grouped + expected["ungrouped_ids"]) == sorted(tickets_by_id)
          and len(grouped) == len(set(grouped)))

    # --- the demo's best moment: 3 tickets, zero shared vocabulary ---
    trio = expected["no_shared_vocab_trio"]
    top_ids = set(expected["groups"][0]["ticket_ids"])
    check("no-vocab trio is inside the top cluster", set(trio) <= top_ids, str(trio))
    words = {tid: content_words(f"{tickets_by_id[tid]['subject']} {tickets_by_id[tid]['body']}")
             for tid in trio}
    pairs_clean = True
    for i, a in enumerate(trio):
        for b in trio[i + 1:]:
            overlap = words[a] & words[b]
            if overlap:
                pairs_clean = False
                print(f"       {a} ∩ {b} = {sorted(overlap)}")
    check("trio shares NO content vocabulary", pairs_clean)

    # --- deploy correlation: d6 exactly 38 minutes before first checkout ticket ---
    d6 = next(d for d in corpus["deploys"] if d["id"] == expected["top_cluster_deploy"])
    first = min(parse_ts(tickets_by_id[tid]["created_at"]) for tid in top_ids)
    gap_min = (first - parse_ts(d6["shipped_at"])).total_seconds() / 60
    check("deploy d6 lands 38 min before first report", gap_min == 38, f"gap={gap_min:.0f} min")
    check("d6 is a payment-service deploy", d6["service"] == "payment-service")

    # --- top cluster spans all 12 customers (F8: twelve drafts) ---
    top_customers = {tickets_by_id[tid]["customer_id"] for tid in top_ids}
    check("top cluster has 12 distinct customers", len(top_customers) == 12, str(len(top_customers)))

    # --- ranking against ground truth ---
    print("\n--- ranking (on hand-labeled groups) ---")
    contract = run_ranking({"groups": expected["groups"],
                            "ungrouped_ids": expected["ungrouped_ids"]}, corpus)
    clusters = contract["clusters"]
    check("contract keys exact",
          all(set(c) == {"id", "name", "ticket_ids", "first_seen", "customer_count", "score"}
              for c in clusters) and set(contract) == {"clusters", "ungrouped_ids"})
    check("checkout cluster ranks #1", set(clusters[0]["ticket_ids"]) == top_ids,
          f"#1 is {clusters[0]['name']!r}")
    check("top cluster first_seen matches HANDOFF example",
          clusters[0]["first_seen"] == "2026-08-11T14:14:00Z", clusters[0]["first_seen"])
    check("customer_count primary: scores strictly ordered",
          all(clusters[i]["score"] >= clusters[i + 1]["score"] for i in range(len(clusters) - 1)))
    check("all scores are rounded ints 0-100",
          all(isinstance(c["score"], int) and 0 <= c["score"] <= 100 for c in clusters))
    check("12 ungrouped one-offs", len(contract["ungrouped_ids"]) == 12)

    print()
    if FAILURES:
        sys.exit(f"{len(FAILURES)} check(s) FAILED: {FAILURES}")
    print(f"all checks passed")


if __name__ == "__main__":
    main()
