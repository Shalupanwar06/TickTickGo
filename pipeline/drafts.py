"""AI call #4: customer update drafts.

One message per affected customer, referencing their own ticket and what they
described. Drafts queue with status pending_approval — NOTHING SENDS, EVER.
"""
from .ai import call_structured

DRAFTS_SCHEMA = {
    "type": "object",
    "properties": {
        "drafts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "customer_id": {"type": "string"},
                    "ticket_id": {"type": "string"},
                    "body": {"type": "string"},
                },
                "required": ["customer_id", "ticket_id", "body"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["drafts"],
    "additionalProperties": False,
}

SYSTEM = """You draft short customer update messages for a support team to review.

Rules:
- One draft per affected customer. Address what THAT customer reported, in their terms —
  reference the specifics from their own ticket (their amounts, their symptoms, their words).
- Personal and short: 3-5 sentences. No marketing voice, no apology theater, no "we take
  this seriously". A human support agent should be able to send it as-is.
- Be honest about status: the issue is identified and under investigation; do not promise
  a fix date or claim it is resolved.
- If a customer filed multiple tickets in this cluster, write one draft referencing their
  most recent ticket."""


def run_drafts(corpus: dict, cluster: dict, status_summary: str) -> dict:
    members = [corpus["tickets_by_id"][tid] for tid in cluster["ticket_ids"]]
    by_customer: dict[str, list[dict]] = {}
    for t in sorted(members, key=lambda t: t["created_at"]):
        by_customer.setdefault(t["customer_id"], []).append(t)

    lines = []
    for cid, ts in by_customer.items():
        account = corpus["accounts_by_id"][cid]
        lines.append(f"Customer {cid} — {account['name']} ({account['tier']}, {account['region']}):")
        for t in ts:
            lines.append(f"  [{t['id']}] at={t['created_at']} subject: {t['subject']}\n"
                         f"    body: {t['body']}")
    user = (
        f"Issue: {cluster['name']}\n"
        f"Current status (for your framing): {status_summary}\n\n"
        f"Affected customers and their tickets:\n" + "\n".join(lines) +
        "\n\nWrite one draft per customer."
    )
    raw = call_structured("drafts", SYSTEM, user, DRAFTS_SCHEMA)

    valid_pairs = {(t["customer_id"], t["id"]) for t in members}
    drafts, seen = [], set()
    for d in raw["drafts"]:
        if (d["customer_id"], d["ticket_id"]) not in valid_pairs:
            raise ValueError(f"draft references invalid customer/ticket pair: {d['customer_id']}/{d['ticket_id']}")
        if d["customer_id"] in seen:
            raise ValueError(f"multiple drafts for customer {d['customer_id']}")
        seen.add(d["customer_id"])
        drafts.append({
            "cluster_id": cluster["id"],
            "customer_id": d["customer_id"],
            "ticket_id": d["ticket_id"],
            "body": d["body"],
            "status": "pending_approval",
        })
    missing = set(by_customer) - seen
    if missing:
        raise ValueError(f"no draft generated for customers: {sorted(missing)}")
    print(f"[drafts] {len(drafts)} drafts, all pending_approval")
    return {"cluster_id": cluster["id"], "drafts": drafts}
