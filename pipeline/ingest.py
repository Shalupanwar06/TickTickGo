"""Load and validate the seed corpus. Fails loud on malformed data."""
import json
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"

TICKET_FIELDS = {"id", "customer_id", "created_at", "subject", "body"}
ACCOUNT_FIELDS = {"customer_id", "name", "tier", "region", "contract_value"}
DEPLOY_FIELDS = {"id", "shipped_at", "service", "description"}


def parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def _load(name: str) -> dict:
    path = DATA_DIR / name
    with open(path) as f:
        data = json.load(f)
    if not data.get("synthetic"):
        raise ValueError(f"{name}: corpus files must be marked synthetic")
    return data


def load_corpus() -> dict:
    tickets = _load("tickets.json")["tickets"]
    accounts = _load("accounts.json")["accounts"]
    deploys = _load("deploys.json")["deploys"]
    archive = _load("ticket_archive.json")["tickets"]

    account_ids = {a["customer_id"] for a in accounts}
    seen = set()
    for t in tickets:
        missing = TICKET_FIELDS - t.keys()
        if missing:
            raise ValueError(f"ticket {t.get('id')} missing fields: {missing}")
        if t["id"] in seen:
            raise ValueError(f"duplicate ticket id {t['id']}")
        seen.add(t["id"])
        if t["customer_id"] not in account_ids:
            raise ValueError(f"ticket {t['id']} references unknown customer {t['customer_id']}")
        parse_ts(t["created_at"])
    for a in accounts:
        if ACCOUNT_FIELDS - a.keys():
            raise ValueError(f"account {a.get('customer_id')} missing fields")
    for d in deploys:
        if DEPLOY_FIELDS - d.keys():
            raise ValueError(f"deploy {d.get('id')} missing fields")
        parse_ts(d["shipped_at"])

    return {
        "tickets": tickets,
        "accounts": accounts,
        "deploys": deploys,
        "archive": archive,
        "tickets_by_id": {t["id"]: t for t in tickets},
        "accounts_by_id": {a["customer_id"]: a for a in accounts},
    }


if __name__ == "__main__":
    corpus = load_corpus()
    print(f"tickets: {len(corpus['tickets'])}")
    print(f"accounts: {len(corpus['accounts'])}")
    print(f"deploys: {len(corpus['deploys'])}")
    print(f"archive: {len(corpus['archive'])}")
