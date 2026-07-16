# Execution Quality Pack

Change ID: gse-169-context-orchestrator

## Task Profile

- Level: enterprise
- Change type: runtime governance and host adapter
- User-visible impact: safer long-running GSE continuation and rollover
- Data/security/release impact: read-only rollout inspection; execute-gated checkpoint writes; no release publication

## Required GSE Roles And Controls

| Role / Control | Purpose | Required | Evidence |
|---|---|---|---|
| Coordinator / gse | Scope, integration, evidence | yes | spec, state, evidence |
| Staged context loading | Active-goal and context-pack boundary | yes | context policy |
| Fixed context budgets | Coordinator, worker, reviewer, reserve, tool-output, and capsule limits | yes | shared constants and audit |
| Bounded pack refinement | Limit retrieval to the smallest sufficient target-contained context pack | yes | max 3 cycles contract |
| Worker packet contract | Isolated context pack plus fixed result capsule | yes | context pack/result capsule |
| QA / Verification | Threshold, routing, privacy, regression proof | yes | focused and Lite audits |
| Reviewer | Spec, quality, architecture, privacy | yes | review.md |

## Tool Routing

| Tool | Use | Status | Fallback |
|---|---|---|---|
| Codex rollout JSONL | Host context evidence | optional host evidence | unavailable portable policy |
| rg / git diff | Focused repository context | verified | PowerShell scoped reads |
| `/gse context` | Health and checkpoint route | verified portable | direct scripts |
| Subagents | Bounded independent work | host-specific | sequential roles |

## Quality Gates Selected

- Deterministic health thresholds and compaction escalation.
- Aggregate-only tool pressure reporting.
- Dry-run checkpoint and explicit write gate.
- Target-contained context pack and fixed budgets.
- Orange/red continuation rollover.
- Honest host and subagent claim boundaries.
- Focused, Lite, encoding, syntax, command, matrix, and diff verification.

## Evidence Plan

See `evidence.md` and `.gse/evidence/2026-07-16.md`.

## Review And Closure

Implementation verified locally. Git commit, push, PR, CI, and merge remain delivery actions after final diff review.
