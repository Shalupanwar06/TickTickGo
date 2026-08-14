# TickTickGo — iteration board

Sprint: SF Enterprise Hackathon, 14 Aug 2026 (single day).
Tickets map to the WORKPLAN lanes. Update **Status** as you go: `todo` → `in progress` → `done` (or `blocked: <reason>`).

Statuses: ⬜ todo · 🟨 in progress · ✅ done · ⛔ blocked

## Raushan — pipeline

| ID | Ticket | Status | Acceptance (from PRD/WORKPLAN) |
|---|---|---|---|
| TTG-1 | Seed corpus — 50 tickets, 5 issues + one-offs, 12 accounts, deploy log | ✅ done | Non-obvious cluster of 3 tickets sharing no vocabulary exists; deploy d6 lands 38 min before top cluster's first ticket |
| TTG-2 | Ingest + validation | ✅ done | 50 tickets load; count available for header; malformed data fails loud |
| TTG-3 | Grouping call (AI #1) | ⛔ blocked: needs ANTHROPIC_API_KEY | One call, whole batch, JSON validated (every ticket ID exists in input); the 3 no-shared-vocab tickets land in one group |
| TTG-4 | Ranking (deterministic) | ✅ done | Emits the contract shape (clusters + ungrouped_ids); distinct customer count primary; clusters in impact order; all numbers rounded |
| TTG-5 | Investigator agent (AI #2) — 3 tools, hard 4-step cap, streamed steps | 🟨 code done, ⛔ live run needs key | Deploy correlation surfaces without hardcoding; steps persist to `out/investigations.json` for replay; counter (not prompt) breaks the loop |
| TTG-6 | Analysis + escalation packet (AI #3) | 🟨 code done, ⛔ live run needs key | Every bullet carries ticket-ID or tool-result citations (uncited dropped); hypotheses labelled unconfirmed + what wasn't examined; packet contains ≥1 fact present in no single ticket |
| TTG-7 | Customer drafts (AI #4) | 🟨 code done, ⛔ live run needs key | 12 drafts, one per affected customer, referencing their own ticket; status `pending_approval`; ≥2 visibly different |
| TTG-8 | Fixtures — save every good AI output keyed by input hash | 🟨 mechanism done | If API is slow/down, fixture serves; `FORCE_FIXTURES=1` runs fully offline |

## Shalu — app, platforms, demo

| ID | Ticket | Status | Acceptance |
|---|---|---|---|
| TTG-9 | Forge spec + Daytona hello-world | ✅ done | `forge-spec.md`; sandbox `ticktickgo` live with fixture API |
| TTG-10 | Cluster list screen (on fixtures) | ✅ done | Live on sandbox, fixture-backed |
| TTG-11 | Cluster detail screen | ✅ done | Trace, analysis, packet, drafts |
| TTG-12 | Streaming trace | ✅ done | SSE, verified 4 steps + analysis + done |
| TTG-13 | Wire frontend to real pipeline (fixture path stays as toggle) | ⬜ todo | First end-to-end run at H+5 |
| TTG-14 | Snapshot + video + rehearsal | ⬜ todo | Daytona snapshot the moment it works; full video recorded; rehearsed twice |

## Contract (frozen — both agree before changing)

`out/clusters.json`:
```json
{
  "clusters": [{ "id": "c1", "name": "...", "ticket_ids": ["t201"], "first_seen": "ISO8601", "customer_count": 12, "score": 88 }],
  "ungrouped_ids": ["t239"]
}
```
`ticket_count` is derivable (`len(ticket_ids)`); trend is derivable from tickets + `ticket_ids`. If Shalu wants a `trend` field added, we agree first.

## Checkpoints
- **H+2.5** — grouping works (TTG-3). If not, everyone stops.
- **H+5** — first integration (TTG-13).
- **H+6.5** — feature freeze.

## Cut lines (in order, if behind)
1. TTG-7 → one hardcoded example draft
2. TTG-5 → fixed 3-lookup sequence, same streaming UI
3. TTG-6 packet → static template
4. TTG-6 analysis → common-factors section only

## Running the pipeline

```
export ANTHROPIC_API_KEY=...        # required for AI calls (fixtures serve after first good run)
./.venv/bin/python -m pipeline.run all          # full pipeline for top cluster
./.venv/bin/python -m pipeline.run group        # AI #1 → out/groups.json
./.venv/bin/python -m pipeline.run rank         # → out/clusters.json (the contract)
./.venv/bin/python -m pipeline.run investigate c1
./.venv/bin/python -m pipeline.run analyze c1   # → out/analysis_c1.json + out/packet_c1.md
./.venv/bin/python -m pipeline.run drafts c1    # → out/drafts_c1.json
FORCE_FIXTURES=1 ... run all                    # offline/demo mode
```
