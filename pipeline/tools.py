"""The investigator's three tools. Hardcoded — no dynamic discovery, no additions.

All read-only, all against local seed data. Never touches an external service.
"""
from .ingest import parse_ts

STOPWORDS = {"the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is",
             "are", "was", "were", "our", "your", "my", "we", "i", "it", "this",
             "that", "at", "with", "from", "not", "no", "any", "but", "as", "be"}


def search_ticket_history(corpus: dict, query: str, include_archive: bool = True) -> list[dict]:
    """Keyword search over current tickets and the resolved-ticket archive."""
    terms = [w for w in query.lower().split() if w not in STOPWORDS]
    results = []
    pools = [(corpus["tickets"], False)]
    if include_archive:
        pools.append((corpus["archive"], True))
    for pool, archived in pools:
        for t in pool:
            haystack = f"{t['subject']} {t['body']}".lower()
            hits = sum(1 for w in terms if w in haystack)
            if hits:
                results.append({
                    "id": t["id"],
                    "customer_id": t["customer_id"],
                    "created_at": t["created_at"],
                    "subject": t["subject"],
                    "snippet": t["body"][:160],
                    "archived": archived,
                    "resolution": t.get("resolution"),
                    "_hits": hits,
                })
    results.sort(key=lambda r: (-r["_hits"], r["created_at"]))
    for r in results:
        del r["_hits"]
    return results[:20]


def get_account(corpus: dict, customer_id: str) -> dict:
    account = corpus["accounts_by_id"].get(customer_id)
    if not account:
        return {"error": f"no account with customer_id {customer_id!r}"}
    return account


def check_deploys(corpus: dict, since: str | None = None, until: str | None = None,
                  service: str | None = None) -> list[dict]:
    deploys = corpus["deploys"]
    if since:
        s = parse_ts(since)
        deploys = [d for d in deploys if parse_ts(d["shipped_at"]) >= s]
    if until:
        u = parse_ts(until)
        deploys = [d for d in deploys if parse_ts(d["shipped_at"]) <= u]
    if service:
        deploys = [d for d in deploys if service.lower() in d["service"].lower()]
    return deploys


TOOL_DEFINITIONS = [
    {
        "name": "search_ticket_history",
        "description": (
            "Keyword search over all support tickets, including the archive of resolved tickets "
            "from previous months. Use it to check whether a problem existed before, how far back "
            "reports go, or to find related reports. Returns up to 20 matches with snippets; "
            "archived results include their resolution."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Space-separated keywords to search for"},
                "include_archive": {"type": "boolean", "description": "Search resolved historical tickets too (default true)"},
            },
            "required": ["query"],
            "additionalProperties": False,
        },
        "strict": True,
    },
    {
        "name": "get_account",
        "description": (
            "Look up one customer account: name, plan tier, region, and annual contract value. "
            "Use it to establish who is affected and how much revenue is at stake."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "customer_id": {"type": "string", "description": "Customer id, e.g. a03"},
            },
            "required": ["customer_id"],
            "additionalProperties": False,
        },
        "strict": True,
    },
    {
        "name": "check_deploys",
        "description": (
            "List production deploys, optionally filtered by time window and service name. "
            "Use it to check whether a deploy landed shortly before the first report of a problem."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "since": {"type": "string", "description": "ISO 8601 lower bound, inclusive"},
                "until": {"type": "string", "description": "ISO 8601 upper bound, inclusive"},
                "service": {"type": "string", "description": "Substring match on service name"},
            },
            "required": [],
            "additionalProperties": False,
        },
        "strict": True,
    },
]


def execute_tool(corpus: dict, name: str, tool_input: dict):
    if name == "search_ticket_history":
        return search_ticket_history(corpus, tool_input["query"],
                                     tool_input.get("include_archive", True))
    if name == "get_account":
        return get_account(corpus, tool_input["customer_id"])
    if name == "check_deploys":
        return check_deploys(corpus, tool_input.get("since"), tool_input.get("until"),
                             tool_input.get("service"))
    raise ValueError(f"unknown tool {name!r}")
