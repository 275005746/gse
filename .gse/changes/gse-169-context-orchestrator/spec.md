# Spec

Change ID: gse-169-context-orchestrator

## User Outcome

Long-running GSE work can inspect Codex context pressure, keep coordinator headroom, route bounded worker context, and create a safe rollover checkpoint before the host context is exhausted.

## Behavior

- Classify context health as `green`, `yellow`, `orange`, `red`, or `unavailable` from the latest Codex token sample, compaction count, and exhaustion sentinel.
- Route green to normal coordination, yellow to compact output and at most one bounded worker, orange to finish-current-atom plus checkpoint, and red to block expansion and require a new task.
- Expose `/gse context` as read-only health inspection and `/gse context --checkpoint --execute` as the explicit bounded handoff write path.
- Feed context health into `/gse continue`; orange and red must choose `context-rollover` before other next-slice actions.
- Limit context packs to 8 files and 8,000 estimated tokens, reject includes outside the target root, and declare a maximum 800-token result capsule with required fields.
- Detect `.gse/goal-map.md` payload risk and document the 8-12 line active-goal execution-index contract.
- Keep tool-output reporting aggregate and summary-first, with a 1,500 estimated-token chat-path budget.

## State / Data Flow

1. Resolve an explicit rollout path/session id or the newest Codex rollout whose cwd matches the target.
2. Parse JSONL incrementally and retain token, compaction, and aggregate tool-output pressure only.
3. Combine usage and compaction severity into a health route and fixed budget policy.
4. Surface health in `/gse context` and `compactState.contextHealth`.
5. Generate a dry-run checkpoint by default; write only under explicit `--execute`.
6. Return machine-readable `contextPack`, `resultCapsule`, rejected-file reasons, and host claim boundaries.

## Error and Recovery

- Missing or unreadable host evidence returns `unavailable` and preserves portable compact-policy operation.
- Invalid token budgets fall back to the fixed 8,000-token maximum.
- Missing or out-of-target context includes are rejected rather than read.
- Orange/red health stops scope expansion and recommends checkpoint plus fresh-task rollover.
- GSE does not claim to compact the host, create a Codex task, or prove real subagent dispatch.

## Permissions and Privacy

- Rollout inspection is read-only.
- Reports expose aggregates, not raw function output content.
- Checkpoint generation is dry-run unless `--execute` is supplied.
- Selected context files must resolve inside the declared target root.

## Acceptance Criteria

- Exact 65/80/90 percent thresholds and compaction escalation are fixture-tested.
- Missing host evidence degrades without failing portable GSE operation.
- Real exhaustion sentinel evidence classifies as red.
- `/gse continue --session <rollout>` consumes orange health and returns `context-rollover` with scope expansion disabled.
- Context packs enforce file count, token budget, target containment, and result capsule fields.
- `/gse context` command semantics, documentation, script index, package script, capability matrix, and Lite validation wiring are present.
- Focused context audit, continue preflight, command audit, capability matrix audit, Lite validation, encoding check, syntax checks, and `git diff --check` pass.

## Non-goals

- Preventing the Codex host from injecting active-goal data.
- Mutating or compacting an active host conversation.
- Automatically creating, archiving, or switching Codex tasks.
- Claiming real subagent execution from a portable fixture.
- Proving lower total token cost; the budgets protect coordinator headroom.
