"""Deterministic ranking. Pure arithmetic — no model calls.

Score (0-100), rounded:
  - distinct customer count is primary: 5 points per customer, capped at 60
  - recency: up to 20 points, linear decay over 7 days since the cluster's last ticket
  - acceleration: up to 20 points, ratio of tickets in the last 48h vs the 48h before

Emits the frozen contract shape: {"clusters": [...], "ungrouped_ids": [...]}.
"""
from datetime import timedelta

from .ingest import parse_ts


def score_cluster(ticket_ids: list[str], tickets_by_id: dict, now) -> dict:
    members = [tickets_by_id[tid] for tid in ticket_ids]
    times = [parse_ts(t["created_at"]) for t in members]
    customers = {t["customer_id"] for t in members}

    customer_pts = min(60, 5 * len(customers))

    days_since_last = (now - max(times)).total_seconds() / 86400
    recency_pts = max(0, round(20 * (1 - days_since_last / 7)))

    last_48h = sum(1 for ts in times if ts > now - timedelta(hours=48))
    prev_48h = sum(1 for ts in times if now - timedelta(hours=96) < ts <= now - timedelta(hours=48))
    accel_pts = min(20, round(10 * last_48h / max(prev_48h, 1)))

    return {
        "score": customer_pts + recency_pts + accel_pts,
        "customer_count": len(customers),
        "first_seen": min(times),
        "rising": last_48h > prev_48h,
    }


def run_ranking(groups: dict, corpus: dict) -> dict:
    tickets_by_id = corpus["tickets_by_id"]
    now = max(parse_ts(t["created_at"]) for t in corpus["tickets"])

    scored = []
    for g in groups["groups"]:
        s = score_cluster(g["ticket_ids"], tickets_by_id, now)
        scored.append({"name": g["name"], "ticket_ids": g["ticket_ids"], **s})
    scored.sort(key=lambda c: (-c["score"], c["first_seen"]))

    clusters = [
        {
            "id": f"c{i + 1}",
            "name": c["name"],
            "ticket_ids": c["ticket_ids"],
            "first_seen": c["first_seen"].strftime("%Y-%m-%dT%H:%M:%SZ"),
            "customer_count": c["customer_count"],
            "score": c["score"],
        }
        for i, c in enumerate(scored)
    ]
    result = {"clusters": clusters, "ungrouped_ids": groups["ungrouped_ids"]}
    for c in clusters:
        print(f"[rank] {c['id']} score={c['score']} customers={c['customer_count']} "
              f"tickets={len(c['ticket_ids'])} — {c['name']}")
    return result
