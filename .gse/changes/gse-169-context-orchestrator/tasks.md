# Tasks

Change ID: gse-169-context-orchestrator

## Slice Plan

- [x] Define outcome, scope, acceptance, evidence, risk, and next action.
- [x] Define GSE-native context boundaries, fixed budgets, bounded retrieval, and worker packet contracts.
- [x] Implement Codex rollout health classification and fixed budgets.
- [x] Add `/gse context` inspection and execute-gated checkpoint generation.
- [x] Feed context health into `/gse continue` and route orange/red to rollover.
- [x] Enforce bounded target-contained context packs and result capsule metadata.
- [x] Add focused fixtures for thresholds, compactions, sentinel, missing evidence, privacy, budgets, containment, and continue routing.
- [x] Update command docs, script index, capability matrix, package script, SKILL routing, and Lite validation.
- [x] Run focused verification, Lite validation, encoding, syntax, and diff checks.
- [x] Record evidence and residual host boundaries.
- [x] Update state, goal map, and handoff notes.

## Non-Goals

- Host-native task creation, host compaction, or proof of real subagent dispatch.
- Automatic compaction of canonical product history or arbitrary project files.
- Release publication or installed-copy synchronization in this implementation-only slice.

## Dependencies

- Node.js 18 or newer.
- Codex rollout JSONL for host-specific usage evidence; portable behavior remains available without it.
- Existing GSE continue packet, command runner, validation profile, state, and evidence contracts.

## Stop Conditions

- Stop scope expansion at orange or red context health.
- Stop if a selected context file resolves outside the target root.
- Stop completion if focused audits, Lite validation, encoding, syntax, or diff checks fail.
- Stop before claiming host-native task creation or real subagent dispatch without direct host evidence.
