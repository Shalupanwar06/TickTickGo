"""AI call #1: group the whole batch in one call.

Grouping is not an agent — no branches, always runs the same way.
The output is validated hard: every returned ticket ID must exist in the input,
no ticket may appear in two groups, singleton groups dissolve into ungrouped.
"""
import json

from .ai import call_structured

GROUPING_SCHEMA = {
    "type": "object",
    "properties": {
        "groups": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "ticket_ids": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["name", "ticket_ids"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["groups"],
    "additionalProperties": False,
}

SYSTEM = """You group support tickets that describe the same underlying problem.

Rules:
- Read the whole batch together. Reports of the same bug often share no vocabulary at all — group by what is actually broken, not by surface wording.
- Only group tickets that describe the same underlying malfunction. A group needs at least 2 tickets.
- Feature requests, questions, praise, and one-off reports stay ungrouped — leave them out entirely.
- Give each group a short, plain-language name describing the problem (e.g. "Checkout fails on high-value orders"), not a category label.
- Every ticket_id you output must be copied exactly from the input. A ticket belongs to at most one group."""


def build_prompt(tickets: list[dict]) -> str:
    lines = ["Group these support tickets. Return only the groups (2+ tickets each); leave everything else out.\n"]
    for t in tickets:
        lines.append(
            f"[{t['id']}] customer={t['customer_id']} at={t['created_at']}\n"
            f"  subject: {t['subject']}\n  body: {t['body']}"
        )
    return "\n".join(lines)


def validate_groups(raw: dict, tickets: list[dict]) -> dict:
    known = {t["id"] for t in tickets}
    seen: set[str] = set()
    groups = []
    for g in raw["groups"]:
        ids = []
        for tid in g["ticket_ids"]:
            if tid not in known:
                raise ValueError(f"grouping returned unknown ticket id {tid!r}")
            if tid in seen:
                # Model judgment error, not corruption: keep the first placement.
                print(f"[grouping] WARN: {tid} appears in multiple groups — keeping first placement")
                continue
            seen.add(tid)
            ids.append(tid)
        if len(ids) < 2:
            continue  # singleton groups dissolve into ungrouped
        groups.append({"name": g["name"].strip(), "ticket_ids": ids})
    ungrouped = sorted(known - {tid for g in groups for tid in g["ticket_ids"]})
    return {"groups": groups, "ungrouped_ids": ungrouped}


def run_grouping(corpus: dict) -> dict:
    tickets = corpus["tickets"]
    raw = call_structured("grouping", SYSTEM, build_prompt(tickets), GROUPING_SCHEMA)
    result = validate_groups(raw, tickets)
    print(f"[grouping] {len(result['groups'])} groups, {len(result['ungrouped_ids'])} ungrouped")
    for g in result["groups"]:
        print(f"  - {g['name']} ({len(g['ticket_ids'])} tickets)")
    return result


if __name__ == "__main__":
    from .ingest import load_corpus
    print(json.dumps(run_grouping(load_corpus()), indent=2))
