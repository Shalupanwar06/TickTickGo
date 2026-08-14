# TickTickGo — project context

One-day hackathon build. Read this before writing code.

## What this is

A support ticket triage tool. It takes a batch of raw support tickets, groups the ones that describe the same underlying problem, ranks those groups by customer impact, investigates the top ones, and produces two artifacts: an engineering-ready escalation packet, and drafted customer updates ready to queue in a CRM.

Built on SoftwareForge (Forge). Runs and demos from a Daytona sandbox.

## Architecture

A deterministic spine with exactly one agentic step inside it.

```
ingest → group (AI) → rank (arithmetic) → [human selects] → investigate (agent) → packet (AI) → customer drafts (AI)
      → fix (agent, sample app only) → device self-tests (deterministic) → PM approval (human)
```

Grouping never varies, so it is not an agent. Ranking is counting. The investigation and the fix are agentic, because the right lookups/edits genuinely differ per cluster.

Five AI calls total. Everything else is ordinary code. When something breaks, it is almost certainly in one of those five places.

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
9. **The fix agent patches only the sample storefront** (Meridian Supply Co., part of this demo) — write allowlist is exactly `storefront-fraud.js`, writes land in `*-fixed` copies (the broken original stays for before/after), tools operate on an in-memory overlay, a hard counter caps the loop at 6 calls, and the harness re-runs the check itself rather than trusting the model. It never touches the triage app, the ticket system, or any real repo.

## The AI calls

**1. Grouping.** Whole batch in one call. Returns JSON: array of groups, each with a plain-language name and member ticket IDs. Reading tickets together is what catches reports that share no vocabulary. Validate the JSON; every ticket ID in the response must exist in the input.

**2. Investigation.** Agent loop over the three tools. Streams each step to the UI as it happens. Output feeds the analysis.

**3. Analysis.** Structured sections: common factors, variations, already ruled out, hypotheses. Every line carries ticket IDs or a named tool result.

**4. Customer drafts.** One message per affected customer, referencing their own ticket and what they described. Personal, short, no marketing voice.

**5. Fix agent.** Capped agent loop (read_file / write_file / run_check) over the sample storefront's fraud module. See hard rule 9 for the rails. Output: steps, unified diff, harness check verdict, patched copy.

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

- Don't add a third *triage* screen. Cluster list and cluster detail only. (The storefront at `/storefront.html` is the sample app under test, not a triage screen. Superseded 14 Aug pm.)
- Don't make grouping agentic. It has no branches.
- Don't call real external services. Ticket history, accounts, and deploys are all local seed data.
- Don't let the fix agent touch anything beyond the sample storefront's allowlist (hard rule 9). The old blanket "no code fixes" rule was superseded 14 Aug pm — the fix is now the demo's closing act, but only under those rails.
- Don't put files in subdirectories of `app/public/` or `fixtures/` — deploy.sh globs are non-recursive; flat files only, or the sandbox silently misses them.
- Don't let the demo run on localhost. It runs from the Daytona sandbox.
