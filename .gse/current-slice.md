# Current Slice

## Outcome

GSE-169 adds budget-aware context governance: Codex rollout health is audited, `/gse continue` changes route under context pressure, and workers receive bounded target-contained context packs plus a fixed result capsule contract.

Roadmap anchor: `references/final-form-roadmap.md` (`final-form`) and `references/capability-execution-matrix.md` (`Context health and budget-aware agent routing`).

## Scope

In scope: incremental rollout inspection; green/yellow/orange/red health policy; fixed coordinator/worker/reviewer/reserve budgets; `/gse context`; execute-gated checkpoint generation; `/gse continue` rollover routing; context-pack containment and size limits; result capsule contract; focused audits; Lite validation; command and reference documentation.

Out of scope: host-native task creation, mutation of a live Codex context, automatic host compaction, real subagent-dispatch claims, or external release publication.

## Acceptance

- Token use, compaction count, and exhaustion sentinel map to deterministic health and routing.
- Orange/red disable scope expansion and make `/gse continue` recommend `context-rollover`.
- Missing host evidence returns `unavailable` without disabling portable policy.
- Context packs are limited to 8 files and 8,000 estimated tokens and reject paths outside the target root.
- Result capsules declare an 800 estimated-token limit and eight required fields.
- Goal payload risk and the 8-12 line active-goal contract are surfaced.
- Focused audits, Lite validation, encoding, syntax, command/matrix audits, and diff checks pass.

## Evidence Plan

- `node scripts/audit-context-orchestrator.mjs --root . --json`
- `node scripts/audit-context-health.mjs --target . --session-id 019f65e7-fa54-7f52-a45e-242bcef79d0b --json`
- `node scripts/audit-continue-preflight.mjs --root . --json`
- `node scripts/audit-commands.mjs --root . --json`
- `node scripts/audit-capability-execution-matrix.mjs --root . --json`
- `cmd /c npm run validate:lite`
- `cmd /c npm run check:encoding`
- `git diff --check`

## Risk

- GSE can detect pressure and prepare rollover, but cannot prevent host injection or create a new Codex task through portable scripts.
- Rollout formats are host-specific and may change; missing/unreadable evidence must continue to degrade honestly.
- The current historical `.gse/goal-map.md` is intentionally retained as durable repository evidence and is flagged as `goal-payload-risk`; it must not be copied into an active host goal.

## Next Action

Review the final diff, commit the GSE-169 branch, push it, and open a pull request.
