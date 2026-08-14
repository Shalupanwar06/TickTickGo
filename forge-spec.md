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

## States

- **Loading:** skeleton rows / panels.
- **Streaming:** trace panels appended as events arrive; spinner on the pending step.
- **Error / API down:** fall back to fixtures automatically and show a small "fixture data" note. Fail loud in the console, never blank the screen.
- **Empty:** ingest prompt with a "load sample batch" button.

## Explicit non-goals (do not build)

Third screen · auth · live sync · sending anything · repo/MCP access · editing tickets. See PRD "Out of scope".
