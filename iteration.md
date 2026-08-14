# TickTickGo — iteration board

Sprint: SF Enterprise Hackathon, 14 Aug 2026 (single day).
Tickets map to the WORKPLAN lanes. Update **Status** as you go: `todo` → `in progress` → `done` (or `blocked: <reason>`).

Statuses: ⬜ todo · 🟨 in progress · ✅ done · ⛔ blocked

## Raushan — pipeline

| ID | Ticket | Status | Acceptance (from PRD/WORKPLAN) |
|---|---|---|---|
| TTG-1 | Seed corpus — 50 tickets, 5 issues + one-offs, 12 accounts, deploy log | ✅ done | Non-obvious cluster of 3 tickets sharing no vocabulary exists; deploy d6 lands 38 min before top cluster's first ticket |
| TTG-2 | Ingest + validation | ✅ done | 50 tickets load; count available for header; malformed data fails loud |
| TTG-3 | Grouping call (AI #1) | ✅ done | Live via Mesh: 5/5 clusters match ground truth exactly; no-vocab trio grouped; 12 one-offs ungrouped |
| TTG-4 | Ranking (deterministic) | ✅ done | Emits the contract shape (clusters + ungrouped_ids); distinct customer count primary; clusters in impact order; all numbers rounded |
| TTG-5 | Investigator agent (AI #2) — 3 tools, hard 4-step cap, streamed steps | ✅ done | Live run: exactly 4 calls; d6 deploy correlation surfaced organically in step 1; trace persisted for replay |
| TTG-6 | Analysis + escalation packet (AI #3) | ✅ done | Live run: 24/24 items cited; packet merged_note carries the emergent >$1k threshold fact — acceptance met |
| TTG-7 | Customer drafts (AI #4) | ✅ done | Live run: 12/12 drafts, all pending_approval, visibly personalized |
| TTG-8 | Fixtures — save every good AI output keyed by input hash | ✅ done | All 4 live outputs captured in pipeline/fixtures/; `FORCE_FIXTURES=1` demo fallback works offline |
| TTG-15 | H+5 integration adapter (`pipeline/export_frontend.py`) + code-review fixes | ✅ done | Translates `out/*` into the 5 fixture files the frontend serves; 6 review findings fixed (tz-safe timestamps, tool-error recovery, truncation guard, validator recovery, cite/tool matching, empty-cluster guard); analysis now also emits the structured packet the UI needs |

## Shalu — app, platforms, demo

| ID | Ticket | Status | Acceptance |
|---|---|---|---|
| TTG-9 | Forge spec + Daytona hello-world | ✅ done | `forge-spec.md`; sandbox `ticktickgo` live with fixture API |
| TTG-10 | Cluster list screen (on fixtures) | ✅ done | Live on sandbox, fixture-backed |
| TTG-11 | Cluster detail screen | ✅ done | Trace, analysis, packet, drafts |
| TTG-12 | Streaming trace | ✅ done | SSE, verified 4 steps + analysis + done |
| TTG-13 | Wire frontend to real pipeline (fixture path stays as toggle) | ✅ done | Real pipeline output exported + deployed; sandbox serves live results |
| TTG-14 | Snapshot + video + rehearsal | ⬜ todo | Daytona snapshot the moment it works; full video recorded; rehearsed twice |

## FULL-LOOP RESTRUCTURE (approved 14 Aug pm) — new tickets

The demo becomes the full loop: sample enterprise app → tickets → triage → coding agent builds the fix → device testing → PM approval. This supersedes the "two screens" / "no code fixes" non-goals (docs being amended). Architecture + step details: see the plan summary in HANDOFF once amended; seams below are frozen.

| ID | Ticket | Owner | Status | Acceptance |
|---|---|---|---|---|
| TTG-16 | Storefront "Meridian Supply Co." — `storefront.html/css/js` FLAT in `app/public/` (deploy.sh globs are non-recursive; no subdirs) + 2-link topbar nav in index.html. Fraud module `storefront-fraud.js` already provided (Raushan). Loader: `?fixed=1` → `storefront-fraud-fixed.js`. `runSelfTest()` gated on `?selftest=1` posts `{ttg:"selftest", device, results:[{name,pass}]}` to parent | Shalu | ✅ done | $40 order succeeds; $1,300 fails with red banner + "Report a problem" modal prefilled in corpus voice linking `/#/cluster/c1` |
| TTG-17 | Fix agent (AI#5) `pipeline/fix_agent.py` + `fixtures/fix.json` export + `storefront-fraud-fixed.js`; server SSE route `GET /api/clusters/:id/fix/stream` (+ one-shot fallback) and `app.js` Build-fix button/`fixCard` are Shalu's halves | Raushan (pipeline) + Shalu (routes/UI) | ✅ done | Streamed steps + ±diff render; `storefront.html?fixed=1` passes a $1,300 order |
| TTG-18 | Device testing — `devicesCard()`: phone 375×667 / tablet 768×1024 / desktop 1280×800 iframes (`?fixed=1&selftest=1`), scaled, green/red badges from postMessage | Shalu | ✅ done | Three frames show 2/2 green on the sandbox preview URL |
| TTG-19 | PM approval — in-memory `GET|POST /api/clusters/:id/approval` (`{decision:"approved"\|"returned", note?}` → `{decision,note,at}`, default pending) + `approvalCard()`; approve flips drafts badge to "released for send review" (display-only) | Shalu | ✅ done | Approve/return both render; nothing sends, ever |

**Frozen seams:** fix record `{cluster_id, steps:[{n,tool,input,result_summary}], summary, diff, check:{passed,cases[]}}` in `fixtures/fix.json` / `out/fix_c1.json` · approval API above · selftest postMessage above. Change = both sign off.

**New cut lines (in order):** device tests → approval note field → live fix run (hand-authored fixture instead) → storefront cart (single buy buttons).

## Contract (frozen — both agree before changing)

`out/clusters.json`:
```json
{
  "clusters": [{ "id": "c1", "name": "...", "ticket_ids": ["t201"], "first_seen": "ISO8601", "customer_count": 12, "score": 88 }],
  "ungrouped_ids": ["t239"]
}
```
`ticket_count` is derivable (`len(ticket_ids)`); trend is derivable from tickets + `ticket_ids`. If Shalu wants a `trend` field added, we agree first.

## Integration notes (for H+5)

- Run `python -m pipeline.run all`, then `python -m pipeline.export_frontend c1`, then `scripts/deploy.sh`. The adapter overwrites `fixtures/*.json` with real pipeline output — deploy clusters+tickets **together** (a mixed deploy shows broken ticket chips).
- **Heads-up for Shalu:** `app/server.js` ignores the cluster `:id` on the investigation/packet/drafts routes — every cluster drills into the same detail data. Fine for the demo if we only click the top cluster; a ~5-line per-id lookup fixes it properly.

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
