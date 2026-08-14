# TickTickGo — Forge spec

App spec for SoftwareForge, derived from PRD.md. Two screens, one small server, fixtures first. Read CLAUDE.md for the hard rules; this spec restates the ones the app enforces.

## Shape

Single-page web app served by a minimal Node server (no framework, no build step). The server serves static assets and a JSON API. During H+1→H+5 the API serves fixtures from `fixtures/`; at H+5 it proxies Raushan's pipeline behind the same routes, with the fixture path kept as a toggle (`?source=fixtures` or `FIXTURES=1` env).

Runs from a Daytona sandbox on port 3000. Never demoed from localhost.

## Data contract

The frozen boundary between pipeline and app (see HANDOFF.md — changes require both people):

```json
{
  "clusters": [{
    "id": "c1",
    "name": "Checkout fails on high-value orders",
    "ticket_ids": ["t204", "t218", "t231"],
    "first_seen": "2026-08-11T14:14:00Z",
    "customer_count": 12,
    "score": 88
  }],
  "ungrouped_ids": ["t101", "t142"]
}
```

## API surface

| Route | Returns |
|---|---|
| `GET /api/clusters` | The contract object above, clusters sorted by score desc |
| `GET /api/tickets` | Ticket list (id, customer_id, created_at, subject, body) |
| `GET /api/clusters/:id/investigation` | Persisted investigation: `{ steps: [], analysis: {} }` |
| `GET /api/clusters/:id/investigation/stream` | SSE; emits each step as an event, then `analysis`, then `done` |
| `GET /api/clusters/:id/drafts` | Customer drafts, all `status: "pending_approval"` |
| `GET /api/clusters/:id/packet` | Escalation packet (merged, cited bug report) |
| `GET /api/clusters/:id/fix` | Fix-agent record: `{cluster_id, steps:[{n,tool,input,result_summary}], summary, diff, check}` |
| `GET /api/clusters/:id/fix/stream` | SSE; each `step` event, then `patch` (summary/diff/check), then `done` |
| `GET\|POST /api/clusters/:id/approval` | In-memory PM decision; POST `{decision:"approved"\|"returned", note?}` → `{decision,note,at}`; GET defaults `{decision:"pending"}` |

The SSE route replays persisted steps with a short delay between events when serving fixtures, so the streaming UI behaves identically on fixtures and live pipeline.

## Screen 1 — Cluster list

- **Header:** app name · ticket count loaded ("50 tickets") · a visible **Synthetic data** badge (hard rule 8).
- **Rows** (bordered, one per cluster, impact order): issue name · **customer count as the headline number** (largest type in the row) · ticket count (secondary) · first seen (relative, e.g. "3d ago") · trend, with a **Rising** badge when accelerating.
- **Footer row:** ungrouped remainder — "12 tickets unmatched" — visually muted.
- Clicking a row opens Screen 2.
- *Done when:* a viewer can name the top problem in under five seconds.

## Screen 2 — Cluster detail

Top to bottom:

1. **Header:** cluster name, customer count, ticket count, first seen.
2. **Member tickets:** compact list of subject + customer + timestamp; each ticket ID is a chip. Chips are the citation anchors used everywhere below.
3. **Investigation trace:** one panel per agent step (tool name, input, result summary). Panels appear **one at a time** as steps complete (SSE). Maximum four panels ever — the cap is upstream, but the UI also renders at most 4.
4. **Analysis card**, four sections: common to every report · what varies · already ruled out · hypotheses.
   - Every bullet must carry ≥1 ticket-ID chip or a named tool result. **The renderer drops uncited bullets** (hard rule 2). Do not relax this.
   - **Hypotheses** live in a visually separated box, labelled **Unconfirmed**, and end with a "Not examined:" line.
5. **Actions:** two buttons — *Escalation packet* (renders the merged bug report) and *Customer drafts* (renders the queued drafts, each labelled `pending_approval`; there is no send button anywhere).

## Screen 2 extensions — fix → test → approve (added 14 Aug pm)

Progressive disclosure after the investigation completes, all inline on the detail screen:

6. **Build a fix:** button streams the fix agent's steps (same panel component as the trace), then a fix card: summary · harness-check badge · unified diff with +/− coloring · links to `/storefront.html?fixed=1` (patched) vs `/storefront.html` (broken) for the before/after moment.
7. **Test on devices:** three bezeled iframes — phone 375×667, tablet 768×1024, desktop 1280×800 — loading `/storefront.html?fixed=1&selftest=1&device=…`, scaled with `transform: scale()`. The storefront's self-test posts `{ttg:"selftest", device, results:[{name,pass}]}`; green/red badges render per device.
8. **PM approval:** Approve fix / Return to devs (+ optional note) → POST to the approval route. Approve flips the drafts badge to **"released for send review"** (display-only — still no send button anywhere). State is in server memory and resets on restart, which is desirable between demo runs.

## The sample app — Meridian Supply Co.

`/storefront.html` (+ `storefront.css/js`, all **flat files in `app/public/` — deploy.sh globs are non-recursive, subdirectories silently fail to deploy**). A small storefront with its own branding where the bug lives: `storefront-fraud.js` throws for totals ≥ $1,000 ("deploy d6"). `?fixed=1` loads `storefront-fraud-fixed.js`, the fix agent's patched copy. Checkout failure shows a red banner and a prefilled "Report a problem" modal linking `/#/cluster/c1` — this is narratively where the corpus tickets came from.

## States

- **Loading:** skeleton rows / panels.
- **Streaming:** trace panels appended as events arrive; spinner on the pending step.
- **Error / API down:** fall back to fixtures automatically and show a small "fixture data" note. Fail loud in the console, never blank the screen.
- **Empty:** ingest prompt with a "load sample batch" button.

## Explicit non-goals (do not build)

Auth · live sync · sending anything · editing tickets · auto-applying patches (the fix agent writes only `*-fixed` copies of allowlisted sample-app files) · a real device farm (device testing = viewport iframes + in-page self-test). See PRD "Out of scope".

*(Superseded 14 Aug pm: "third screen" — the storefront is the sample app under test, not a triage screen; "repo/MCP access" — the fix agent touches only the sample storefront via a hardcoded allowlist.)*
