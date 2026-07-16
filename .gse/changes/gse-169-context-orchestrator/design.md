# Design

Change ID: gse-169-context-orchestrator

## Approach

Compose staged context loading, hard budgets, bounded pack refinement, worker packet contracts, and checkpoint/restore behavior behind portable GSE commands.

## State / Data Flow

Codex rollout JSONL -> incremental aggregate inspection -> health classification -> `/gse context` and `/gse continue` routing -> optional bounded checkpoint.

## Interfaces And Contracts

- `classifyContextHealth`: deterministic health and route.
- `audit-context-health.mjs`: read-only host evidence adapter.
- `generate-context-checkpoint.mjs`: dry-run by default, execute-gated write.
- `compactState.contextHealth`: continuation input.
- `contextPack`: max 8 files, target-contained, max 8,000 estimated tokens, max 3 retrieval cycles.
- `resultCapsule`: max 800 estimated tokens with eight required fields.

## Permissions And Privacy

Inspect rollout files read-only, report aggregates instead of raw tool output, reject context includes outside target, and require `--execute` for checkpoint writes.

## Error And Recovery

Unavailable host evidence degrades to compact portable policy. Orange/red stop expansion and require checkpoint/rollover. Invalid max-token values fall back to the fixed maximum.

## Alternatives Considered

- Always compress: rejected because host compaction is outside GSE control.
- Send full conversation to workers: rejected because it duplicates pressure and stale context.
- One generic compression step: rejected because reliable context control requires coordinated budgeting, retrieval, routing, and recovery.

## Rollback

Remove the `/gse context` route, CP26 integration, validation entry, and new scripts; existing `/gse continue` behavior remains independently available.

## Open Questions

Future host adapters may expose direct task creation or richer token telemetry; those require separate host-specific evidence and should not change portable claims.
