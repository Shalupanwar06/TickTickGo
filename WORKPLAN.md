# TickTickGo — work plan

Two people. Hours are relative to when you start (H+0), not clock time.

Rename the tracks if the split doesn't match your strengths — what matters is that one person owns the pipeline and the other owns the app, and that they agree on the contract before splitting.

## The move that makes parallel work possible

**Spend the first 30 minutes together defining the JSON contract, then don't touch each other's code.**

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

Write it down. Commit it. The frontend builds against fixtures matching this shape from minute 31, and never waits on the backend.

---

## Raushan — pipeline

**H+0 → H+1 · Seed corpus**
50 tickets across 5 underlying issues plus ~12 one-offs. Vary voice, detail level, and reporter competence. 12 accounts with tiers and regions. A deploy log with one entry 38 minutes before the top cluster's first ticket.

*Non-negotiable:* one cluster must contain three tickets sharing no vocabulary at all. If the corpus doesn't have this, the demo has no best moment.

**H+1 → H+2.5 · Grouping**
One call, whole batch, JSON out. Validate every returned ticket ID exists in the input. Iterate the prompt until the non-obvious cluster groups correctly.

*Checkpoint at H+2.5: if grouping isn't working, say so loudly. Everything downstream assumes it.*

**H+2.5 → H+3 · Ranking**
Pure arithmetic. Distinct customers primary, recency and acceleration secondary. Emit the contract shape.

**H+3 → H+5 · Investigator**
Three tools against local seed data. Hard counter at four steps. Stream each step as it completes. Persist to `investigations`.

**H+5 → H+6 · Analysis + packet**
Structured sections with mandatory citations. Packet merges detail across the cluster.

**H+6 → H+7 · Customer drafts**
One per affected customer, referencing their own ticket. Status `pending_approval`.

**Throughout:** save a fixture for every AI call as soon as it produces good output.

---

## You — app, platforms, demo

**H+0 → H+1 · Forge spec + Daytona**
Write the Forge spec from the PRD. Get a Daytona sandbox running with a hello-world deploy before anything else exists — you want the deployment path proven while it's cheap to debug.

**H+1 → H+2.5 · Cluster list**
Built against fixtures. Bordered rows, customer count as the headline number, rising badge, ungrouped remainder at the bottom.

**H+2.5 → H+4 · Cluster detail**
Header, investigation trace panels, analysis card with citation styling, hypothesis box visually separated, two action buttons.

**H+4 → H+5 · Streaming trace**
Trace panels appear one at a time as steps complete. This is ten minutes of plumbing that converts a static screen into something that looks alive — don't skip it.

**H+5 → H+6 · Wire to real pipeline**
Swap fixtures for Raushan's output. Keep the fixture path as a toggle.

**H+6 → H+6.5 · Snapshot + record**
Daytona snapshot the moment it works. Record a full run as video. Do this before you think you need to.

**H+6.5 → H+7 · Demo prep**
Write the script, rehearse twice with a timer, pre-warm sandboxes.

---

## Joint checkpoints

**H+2.5 — grouping works?** If not, both of you stop and fix it. Nothing else matters.

**H+5 — integration.** First real end-to-end run. Budget for it to be uglier than expected.

**H+6.5 — feature freeze.** Whatever works, works. From here it's rehearsal only. Resist the last feature; it is always the one that breaks on stage.

---

## Cut lines, in order

Take these in sequence if you're behind. Each one is designed to remove work without breaking what's above it.

1. **Customer drafts** → drop to one example draft, hardcoded.
2. **Investigator** → fixed three-lookup sequence with the same streaming UI. Looks nearly identical; describe it accurately as automated rather than autonomous.
3. **Packet** → static template with slots filled in.
4. **Analysis** → common factors section only.

Clustering plus the ranked list is the product. Everything else is amplification. If you have those two working and rehearsed, you have a demo.

---

## Demo script (3 min)

**0:00** The pile. Forty-seven tickets scrolling, unreadable. "This is a normal week."

**0:20** Cut to four ranked clusters. Let the contrast sit for a beat before speaking.

**0:45** Drill into the top issue. Show the three tickets sharing no keywords. "Same bug. No shared words. Keyword search finds none of this."

**1:15** Trigger the investigation. Let the trace stream — history, accounts, deploys. The deploy correlation lands.

**1:50** Analysis. Point at one cited fact that exists in no single ticket.

**2:15** Customer drafts. "Twelve people reported this. Today, none of them ever hear it got fixed."

**2:35** Where it runs — sandbox visible on screen — and the roadmap sentence: *next step is handing engineering a tested fix instead of a bug report.*

**2:50** The arithmetic. Four problems instead of forty-seven, ranked by who's actually hurting.

Say the corpus is synthetic when you first show it. Costs nothing, and pretending otherwise costs everything if someone asks.
