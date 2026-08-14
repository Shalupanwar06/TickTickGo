# TickTickGo — handoff

Start here. This is the document to read first if you're picking the project up cold, resuming after a break, or taking over someone else's track.

**Team:** Raushan (pipeline), [your name] (app, platforms, demo)
**Event:** SF Enterprise Hackathon, 14 Aug 2026
**Built on:** SoftwareForge · **Runs on:** Daytona

---

## In one line

Support teams drown in tickets that are secretly the same bug. TickTickGo groups them, ranks them by how many customers are affected, investigates the top issue, and hands engineering a report more complete than any ticket that went into it — plus a personalized update for every customer who reported it.

---

## Status

Update the right column as you go. This is the fastest way for either of you to see where the other actually is.

| Piece | Owner | Status |
|---|---|---|
| Seed corpus | Raushan | not started |
| Grouping call | Raushan | not started |
| Ranking | Raushan | not started |
| Investigator agent | Raushan | not started |
| Analysis + packet | Raushan | not started |
| Customer drafts | Raushan | not started |
| Forge spec | You | done — `forge-spec.md` |
| Daytona sandbox | You | done — sandbox `ticktickgo`, hello-world + fixture API live |
| Cluster list screen | You | done — live on the sandbox, fixture-backed |
| Cluster detail screen | You | done — trace, analysis, packet, drafts |
| Streaming trace | You | done — SSE, verified 4 steps + analysis + done |
| Snapshot + video backup | You | not started |

---

## Settled decisions

These were argued through already. Don't relitigate them at hour five — that's how sprint days get eaten.

**Bugs, not features.** The system surfaces problems that already have evidence. It never proposes building something. Feature requests have no oracle — nothing tells you whether the feature was right — while a bug cluster is verifiable against the tickets themselves.

**Grouping is not an agent.** It has no branches; it always runs, always the same way. Wrapping a loop around it would buy nondeterminism and no capability. Only the investigation is agentic, because the right lookups genuinely differ per cluster.

**Four-step hard cap on the investigator.** A counter that breaks the loop, not a line in the prompt. Predictable failure beats capable failure on a demo day.

**Every claim cites ticket IDs.** The system has ticket text only and no code access, so it cannot know root causes. Citations are what keep it honest and let a judge spot-check any line. Hypotheses are labelled unconfirmed and state what wasn't examined. The framing is: it does the reading, not the diagnosis.

**Read-only, drafts only.** Never writes to the ticket system. Customer messages queue for approval and never send. This is the single biggest reason a real security review would pass.

**Customer count is the headline number, not ticket count.** Twelve customers reporting once is a worse problem than one customer reporting twelve times, and most support tools conflate them.

**Two screens.** Cluster list, cluster detail. A third screen is scope creep wearing a disguise.

---

## The contract

Everything crosses this boundary. Frontend builds against fixtures matching this shape; backend emits it.

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

If this needs to change, both people agree before either changes code.

---

## Timeline

Hours are relative to start, not clock time.

```
          H+0     H+1     H+2     H+3     H+4     H+5     H+6     H+7
          |-------|-------|-------|-------|-------|-------|-------|
Raushan   [Corpus][Grouping+rank ][Investigator  ][Analys][Drafts]
You       [Setup ][Cluster ls][Detail vw ][Stream][Wireup][Rehrse]
                             ^                   ^           ^
                         grouping            integrate     freeze
                           check
```

| Hour | Raushan | You |
|---|---|---|
| H+0–1 | Seed corpus | Forge spec + Daytona hello-world |
| H+1–3 | Grouping call, then ranking | Cluster list (on fixtures) |
| H+3–5 | Investigator + three tools | Detail view, then streaming trace |
| H+5–6 | Analysis + packet | Wire frontend to real pipeline |
| H+6–7 | Customer drafts | Snapshot, record video, rehearse |

**Joint checkpoints:** H+2.5 grouping must work · H+5 first integration · H+6.5 feature freeze.

The lanes only meet at those three points — that's what makes this parallelize, and why the contract above has to be settled before either of you writes code. The app track deliberately front-loads its risk: setup and both screens land before H+4, leaving the last three hours for wiring and rehearsal rather than building. Protect that shape.

A slide-ready SVG of the same swimlane is in `swimlane.svg`.

---

## Picking this up cold

1. Read this file, then CLAUDE.md for the hard rules.
2. Check the status table above for where things actually are.
3. Run it from the Daytona sandbox, not localhost.
4. If an AI call is misbehaving, check whether a fixture exists for it before debugging the prompt.

---

## Deliberately not built

Feature generation. Repo access or MCP. Automated code fixes. Real CRM sending. Live ticket sync. Auth. Multi-tenancy. Anything past a few hundred tickets in a batch.

Two of these have prepared answers if a judge asks:

**Scale.** Reading the whole batch in one call is what makes grouping work at 50 tickets and what breaks it at 5,000. The production version embeds first and groups by similarity, then uses the model only to inspect and name each candidate group.

**Enterprise deployment.** Runs in their cloud, uses their existing LLM contract, redacts PII before any call, reads from the ticket system without write access. Rolls out as a weekly batch alongside the current process so the team can compare before changing anything.

---

## Demo-day essentials

- Snapshot the Daytona environment the moment the build works. Not later.
- Record a full video run before you think you need to. Venue wifi takes down more demos than bugs do.
- Pre-warm sandboxes right before presenting.
- Say the corpus is synthetic the first time you show it.
- Cut lines, in order: customer drafts → investigator becomes a fixed sequence → packet becomes a template → analysis drops to common factors only.

Clustering plus the ranked list is the product. If those two work and you've rehearsed twice, you have a demo.
