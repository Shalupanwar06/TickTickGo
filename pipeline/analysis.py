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
        "packet_markdown": {"type": "string"},
    },
    "required": ["common_factors", "variations", "ruled_out", "hypotheses", "packet_markdown"],
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
- packet_markdown is a single engineering-ready bug report that merges detail across the
  whole cluster. It must contain at least one fact that appears in no single ticket —
  something only visible when the reports are read together (e.g. a threshold that emerges
  across the reported amounts). Cite ticket IDs inline throughout. Keep it under a page.
- Round every number."""


def _valid_cite(cite: str, valid_ids: set[str], step_count: int) -> bool:
    if cite in valid_ids:
        return True
    m = re.fullmatch(r"(search_ticket_history|get_account|check_deploys)#(\d+)", cite)
    return bool(m and 1 <= int(m.group(2)) <= step_count)


def enforce_citations(analysis: dict, valid_ids: set[str], step_count: int) -> dict:
    dropped = 0
    for section in ("common_factors", "variations", "ruled_out", "hypotheses"):
        kept = []
        for item in analysis[section]:
            cites = [c for c in item["cites"] if _valid_cite(c, valid_ids, step_count)]
            if cites:
                item["cites"] = cites
                kept.append(item)
            else:
                dropped += 1
                print(f"[analysis] DROPPED uncited {section} item: {item['text'][:80]!r}")
        analysis[section] = kept
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
    analysis = enforce_citations(raw, valid_ids, len(investigation["steps"]))
    analysis["cluster_id"] = cluster["id"]
    return analysis
