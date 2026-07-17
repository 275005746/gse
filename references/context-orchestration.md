# Context Orchestration

Use this when a long GSE session, repeated compaction, large tool output, or delegated work could exhaust the coordinator context.

## Health Policy

| Health | Trigger | Output policy | Route |
|---|---|---|---|
| green | usage below 65% and no compaction | normal, still summarize large logs | main agent |
| yellow | usage 65-80% or one compaction | compact output and bounded context packs | main agent or one focused worker |
| orange | usage 80-90% or two compactions | finish current atom, write checkpoint, stop expansion | rollover after current atom |
| red | usage at least 90% or three compactions | block expansion and generate handoff | fresh execution context for the same top-level plan unit |

Compaction count can raise health severity even when the latest post-compaction token sample is small. A host exhaustion sentinel is red.

## Fixed Budgets

```yaml
coordinator_context_target: 40%
worker_context_target: 25%
reviewer_context_target: 20%
emergency_reserve: 15%
max_context_pack_tokens: 8000
max_agent_result_tokens: 800
max_tool_output_tokens: 1500
max_retrieval_cycles: 3
max_parallel_writers: 2
```

These budgets protect coordinator headroom. They do not claim lower total token cost. GSE enforces the 1,500-token estimate for its compact continuation projection; external host tools and agent results remain host-enforced boundaries.

## Routing

- Keep integration, final judgment, and shared-file decisions in the coordinator.
- Use a read-only Locator for file discovery and return paths plus relevance, not file contents.
- Use a Researcher only for an independent source question.
- Use an Implementer for one bounded write surface.
- Use Verifier and Reviewer as read-only roles unless evidence files are explicitly assigned.
- Parallel writers require isolated worktrees or proven non-overlapping files.
- At orange or red, do not start another worker; checkpoint first.
- Context rollover continues the same top-level plan unit in a fresh execution context. It is an `internal-only` execution action and must not create a new global task.
- Reads, searches, probes, tests, reviews, retries, fixes, and evidence collection remain internal execution actions within their owning plan unit.
- Only a coherent, user-visible top-level plan unit may be marked `global-task-eligible`; routing metadata declares eligibility but does not create or persist a host task.
- `topLevelPlanUnitId` is stable across repeated continuation. `taskCreationIntent` is `create` only for the selected new slice, `reuse` for work owned by an active slice, and `none` for advisory candidates or unowned internal work.
- Only the selected next-slice candidate is globally task-eligible. Alternative candidates remain advisory and cannot trigger host task creation.
- Worker routing is a recommendation, not dispatch evidence. A role or `one-bounded-worker` recommendation remains `not-observed` until the host supplies real dispatch evidence.

## Context Pack
## Tool Output Policy

Use summary-first commands before requesting detail:

- `git status --short` and then filter to the owned paths.
- `git diff --stat`, then `git diff --name-only`, then `git diff -- <specific-files>`.
- Bound search output with a path scope and a result limit such as `Select-Object -First 80`.
- Parse JSON and return selected fields instead of printing complete audit payloads.
- On failures, return the failing check and nearby diagnostic lines, not the complete successful suite log.

Do not send an unbounded repository-wide `git diff`, full generated JSON report, full rollout, or full search result into the coordinator context. The default chat-path tool output budget is 1,500 estimated tokens.

## Active Goal Contract

The host may inject the active goal on every automatic continuation. GSE cannot disable that host behavior, so the active goal must stay an 8-12 line execution index. Keep durable intent in the canonical goal source, current detail in `.gse/current-slice.md`, and historical proof in `.gse/evidence/` or slice logs. A `.gse/goal-map.md` above 30,000 characters or 320 lines is `goal-payload-risk` and must not be copied into the active goal.

Use iterative retrieval for at most three cycles: dispatch, evaluate, refine, then stop when the bounded pack is sufficient.

A worker receives objective, acceptance, constraints, allowed files, selected high-relevance excerpts, verification, and stop conditions. It does not inherit full conversation history or raw tool logs.

## Result Capsule

Every worker returns at most 800 estimated tokens with status, concise outcome, files inspected/changed, verification, evidence, residual risks, and one next action. The coordinator requests a targeted follow-up when detail is missing; it does not ask for the complete worker transcript.

## Host Boundary

`scripts/audit-context-health.mjs` can read Codex rollout JSONL when available. Missing host evidence returns `unavailable` and does not make portable GSE unusable. The audit is read-only and reports aggregates, not tool-output contents.

`scripts/generate-context-checkpoint.mjs` is dry-run by default. `--execute` writes a bounded handoff under `.gse/handoffs/`. It does not create a host task or dispatch a real subagent.
