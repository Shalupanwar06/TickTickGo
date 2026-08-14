"""AI call #3: structured analysis + escalation packet, with mandatory citations.

Every bullet must cite ticket IDs or a named tool result. Uncited bullets are
DROPPED (loudly) before anything reaches the screen — do not relax this.
Hypotheses are labelled unconfirmed and must state what was not examined.
"""
import json
import re

from .ai import call_structured

CITED_ITEM = {
    "type": "object",
    "properties": {
        "text": {"type": "string"},
        "cites": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["text", "cites"],
    "additionalProperties": False,
}

ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "common_factors": {"type": "array", "items": CITED_ITEM},
        "variations": {"type": "array", "items": CITED_ITEM},
        "ruled_out": {"type": "array", "items": CITED_ITEM},
        "hypotheses": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "cites": {"type": "array", "items": {"type": "string"}},
                    "not_examined": {"type": "string"},
                },
                "required": ["text", "cites", "not_examined"],
                "additionalProperties": False,
            },
        },
        "packet": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "impact": {"type": "string"},
                "evidence": {"type": "array", "items": CITED_ITEM},
                "suggested_repro": {"type": "string"},
                "not_examined": {"type": "string"},
                "merged_note": {"type": "string"},
            },
            "required": ["title", "impact", "evidence", "suggested_repro",
                         "not_examined", "merged_note"],
            "additionalProperties": False,
        },
        "packet_markdown": {"type": "string"},
    },
    "required": ["common_factors", "variations", "ruled_out", "hypotheses",
                 "packet", "packet_markdown"],
    "additionalProperties": False,
}

SYSTEM = """You write the engineering escalation for an investigated support-ticket cluster.

Hard rules:
- Every item in common_factors, variations, ruled_out, and hypotheses must carry citations:
  ticket IDs (e.g. "t228"), archive ticket IDs (e.g. "t107"), deploy IDs (e.g. "d6"), or a
  tool-result reference (e.g. "search_ticket_history#2" for investigation step 2). Items
  without valid citations are deleted by the renderer — an uncited claim is a wasted claim.
- You have ticket text and tool results only. No code access. You cannot know root causes.
  Hypotheses are unconfirmed correlations; each must say what was NOT examined.
- The escalation packet comes in two forms carrying the same content:
  * packet: structured — title (one line naming the bug), impact (who is affected: tiers,
    regions, revenue at stake), evidence (cited facts, same citation rules as above),
    suggested_repro (the most likely reproduction based on the tickets), not_examined
    (what this analysis could not check), merged_note (THE cross-ticket fact: something
    present in no single ticket that only appears when the reports are read together,
    e.g. a threshold emerging across the reported amounts — cite the tickets it emerges from).
  * packet_markdown: the same packet as a single engineering-ready markdown bug report,
    under a page, with ticket IDs cited inline.
- Round every number."""


def _valid_cite(cite: str, valid_ids: set[str], steps: list[dict]) -> bool:
    if cite in valid_ids:
        return True
    m = re.fullmatch(r"(search_ticket_history|get_account|check_deploys)#(\d+)", cite)
    if not m:
        return False
    n = int(m.group(2))
    # The named tool must actually be what ran at that step — a fabricated
    # tool reference is not a citation.
    return 1 <= n <= len(steps) and steps[n - 1]["tool"] == m.group(1)


def _filter_items(items: list[dict], valid_ids: set[str], steps: list[dict],
                  label: str) -> tuple[list[dict], int]:
    kept, dropped = [], 0
    for item in items:
        cites = [c for c in item["cites"] if _valid_cite(c, valid_ids, steps)]
        if cites:
            item["cites"] = cites
            kept.append(item)
        else:
            dropped += 1
            print(f"[analysis] DROPPED uncited {label} item: {item['text'][:80]!r}")
    return kept, dropped


def enforce_citations(analysis: dict, valid_ids: set[str], steps: list[dict]) -> dict:
    dropped = 0
    for section in ("common_factors", "variations", "ruled_out", "hypotheses"):
        analysis[section], d = _filter_items(analysis[section], valid_ids, steps, section)
        dropped += d
    analysis["packet"]["evidence"], d = _filter_items(
        analysis["packet"]["evidence"], valid_ids, steps, "packet evidence")
    dropped += d
    if dropped:
        print(f"[analysis] {dropped} uncited item(s) dropped")
    return analysis


def run_analysis(corpus: dict, cluster: dict, investigation: dict) -> dict:
    members = [corpus["tickets_by_id"][tid] for tid in cluster["ticket_ids"]]
    ticket_block = "\n".join(
        f"[{t['id']}] customer={t['customer_id']} at={t['created_at']}\n"
        f"  subject: {t['subject']}\n  body: {t['body']}"
        for t in members
    )
    steps_block = "\n".join(
        f"step {s['step']}: {s['tool']}({json.dumps(s['input'])}) → {json.dumps(s['result'], ensure_ascii=False)}"
        for s in investigation["steps"]
    )
    user = (
        f"Cluster: {cluster['name']} ({cluster['customer_count']} customers, {len(members)} tickets, "
        f"first seen {cluster['first_seen']})\n\nMember tickets:\n{ticket_block}\n\n"
        f"Investigation trace:\n{steps_block}\n\n"
        f"Investigator's findings:\n{investigation['findings']}\n\n"
        "Produce the structured analysis and the escalation packet."
    )
    raw = call_structured("analysis", SYSTEM, user, ANALYSIS_SCHEMA)

    valid_ids = ({t["id"] for t in corpus["tickets"]}
                 | {t["id"] for t in corpus["archive"]}
                 | {d["id"] for d in corpus["deploys"]})
    analysis = enforce_citations(raw, valid_ids, investigation["steps"])
    analysis["cluster_id"] = cluster["id"]
    return analysis
