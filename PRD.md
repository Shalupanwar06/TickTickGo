# TickTickGo — product requirements

**Track:** Internal tools & dashboards
**Platforms:** Built on SoftwareForge, run and demoed from Daytona

## Problem

Support teams receive tickets that are secretly the same bug, described in completely different words. "Checkout throws a 500," "I can't complete my purchase," and "the payment page is blank" share no vocabulary and get triaged as three separate issues by three different people.

Two costs follow. Nobody notices a problem is systemic until the fifth report or an enterprise escalation, days later. And the bug reports that reach engineering are thin, because each contains only what one customer happened to mention — the browser is in one ticket, the error code in another, the order threshold in a third. Engineering bounces them asking for detail that already exists, scattered across reports nobody read together.

A third cost is invisible: the customers who reported it never hear that it got fixed.

## Users

**Support lead.** Starts the week facing a queue with no way to tell what matters. Needs to know the three things actually hurting, not to triage one ticket at a time.

**Engineering manager.** Receives vague individual bug reports and can't tell which are widespread. Needs affected-customer counts before deciding whether to interrupt a sprint.

## What we're building

A batch analysis tool. Tickets in, ranked problems out, with an investigated writeup and drafted customer updates for any one of them.

Three deliberate constraints:

- **Read-only.** Never writes to the ticket system. Keeps the trust bar low and security review short.
- **Decision support, not automation.** It surfaces and ranks; a human decides what to escalate and what to send.
- **Batch, not live.** Run it on a batch when you want to. No streaming sync.

## Features

### F1 — Ingest
Paste or upload a batch of tickets (id, customer, timestamp, subject, body).

*Done when:* 50 tickets load and appear as a count in the header.

### F2 — Grouping
One model call reads the whole batch and returns groups with plain-language names.

*Done when:* the seeded non-obvious cluster — three tickets sharing no keywords — lands in one group. This is the acceptance test for the entire product.

### F3 — Ranking
Deterministic score from distinct customer count, recency, and acceleration. Ungrouped tickets shown as a remainder count.

*Done when:* clusters render in impact order with customer count as the headline number.

### F4 — Cluster list
Four rows: issue name, customer count, ticket count, first seen, trend. Rising issues badged.

*Done when:* a viewer can name the top problem in under five seconds.

### F5 — Investigation
Agent with three tools — ticket history search, account lookup, deploy log — capped at four steps. Each step streams into the UI as it completes.

*Done when:* the deploy correlation surfaces without being hardcoded, and the trace renders progressively rather than all at once.

### F6 — Analysis
Sections: common to every report, what varies, already ruled out, hypotheses. Every claim carries ticket IDs. Hypotheses are visually separated, labelled unconfirmed, and state what was not examined.

*Done when:* every displayed bullet has a citation and any of them can be spot-checked against the ticket list.

### F7 — Escalation packet
A single bug report merging detail across the cluster.

*Done when:* the packet contains at least one fact present in no single ticket.

### F8 — Customer drafts
One message per affected customer, referencing their own ticket and what they described. Queued for approval.

*Done when:* twelve drafts generate and two of them are visibly different from each other in content, not just name.

## Out of scope

Feature generation. Repo access or MCP integration. Automated code fixes. Real CRM sending. Live ticket-system sync. Auth. Multi-tenancy. Anything past a few hundred tickets per batch.

## Success criteria

**Demo:** a viewer with no context understands the problem within twenty seconds and sees a fact surfaced that no single ticket contained.

**Product:** a support lead sees four problems instead of forty-seven; engineering receives a report where the cross-ticket reading is already done; affected customers get a personalized update.

## Risks

**Grouping quality is the whole product.** If clusters are wrong, nothing downstream matters. Mitigated by testing it first, before any UI exists.

**Fabricated analysis.** The system has ticket text only and no code access, so it cannot know root causes. Mitigated by the citation requirement and the unconfirmed-hypothesis framing. It does the reading, not the diagnosis.

**Agent nondeterminism on stage.** Mitigated by the hard step cap, persisted investigations for replay, and fixture fallbacks for every call.

**Demo environment failure.** Mitigated by a recorded video backup and a Daytona snapshot taken the moment the build works.

## Roadmap (say, don't build)

Verified fixes: for a confirmed cluster, generate a failing test that reproduces it, produce a candidate fix, run the suite in a sandbox, and open a PR only when green. The sandbox verdict is real evidence, so human review means something. Then the customer update sends automatically when the fix ships — closing the loop from complaint to notification.
