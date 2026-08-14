# TickTickGo — project context

One-day hackathon build. Read this before writing code.

## What this is

A support ticket triage tool. It takes a batch of raw support tickets, groups the ones that describe the same underlying problem, ranks those groups by customer impact, investigates the top ones, and produces two artifacts: an engineering-ready escalation packet, and drafted customer updates ready to queue in a CRM.

Built on SoftwareForge (Forge). Runs and demos from a Daytona sandbox.

## Architecture

A deterministic spine with exactly one agentic step inside it.

```
ingest → group (AI) → rank (arithmetic) → [human selects] → investigate (agent) → packet (AI) → customer drafts (AI)
```

Grouping never varies, so it is not an agent. Ranking is counting. Only the investigation is agentic, because the right lookups genuinely differ per cluster.

Four AI calls total. Everything else is ordinary code. When something breaks, it is almost certainly in one of those four places.

## Hard rules

These are not preferences. Breaking one of them breaks the product's core claim.

1. **Read-only.** Never write to the ticket system. No replies, no status changes, no closes.
2. **Every analysis claim cites ticket IDs.** The renderer drops uncited bullets rather than displaying them. Do not "fix" this by relaxing the renderer.
3. **Investigator caps at 4 tool calls.** A hard counter that breaks the loop, not an instruction in the prompt. On cap, report what it has.
4. **Three tools, hardcoded.** `search_ticket_history`, `get_account`, `check_deploys`. No dynamic tool discovery, no additions.
5. **CRM messages are drafts.** They queue for approval. Nothing sends.
6. **Bugs, not features.** The system never proposes building something. It surfaces problems that already have evidence.
7. **Hypotheses are labelled as unconfirmed** and state what was not examined.
8. **Synthetic demo data is labelled as synthetic in the UI.**

## The AI calls

**1. Grouping.** Whole batch in one call. Returns JSON: array of groups, each with a plain-language name and member ticket IDs. Reading tickets together is what catches reports that share no vocabulary. Validate the JSON; every ticket ID in the response must exist in the input.

**2. Investigation.** Agent loop over the three tools. Streams each step to the UI as it happens. Output feeds the analysis.

**3. Analysis.** Structured sections: common factors, variations, already ruled out, hypotheses. Every line carries ticket IDs or a named tool result.

**4. Customer drafts.** One message per affected customer, referencing their own ticket and what they described. Personal, short, no marketing voice.

## Data model

- `tickets` — id, customer_id, created_at, subject, body
- `accounts` — customer_id, name, tier, region, contract_value
- `deploys` — id, shipped_at, service, description
- `clusters` — id, name, ticket_ids, first_seen, customer_count, score
- `investigations` — cluster_id, steps[], analysis, created_at
- `drafts` — cluster_id, customer_id, ticket_id, body, status

`investigations` persists the step trace so a demo can replay without live model calls.

## Conventions

- All model output is parsed as JSON and validated before use. Fail loud, never silently pass through malformed output.
- Every AI call has a fixture fallback keyed by input hash. If the API is slow or down during the demo, the fixture serves.
- Ranking score: distinct customer count is primary, recency and acceleration secondary. Ticket count is not the headline number — twelve customers reporting once is worse than one customer reporting twelve times.
- Round every number that reaches the screen.

## Don't

- Don't add a third screen. Cluster list and cluster detail only.
- Don't make grouping agentic. It has no branches.
- Don't call real external services. Ticket history, accounts, and deploys are all local seed data.
- Don't generate code fixes or touch a repo. Out of scope for this build.
- Don't let the demo run on localhost. It runs from the Daytona sandbox.
