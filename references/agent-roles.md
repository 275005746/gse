# Agent Roles

Use roles to make multi-agent work predictable.

## Coordinator

Owns scope, task level, context selection, final integration, and final answer.

Never delegates final judgment.

## Planner

Defines the slice outcome, scope, acceptance, evidence, residual risk, and next action.

Maps to Coordinator or Product Analyst in smaller tasks.

## Product Analyst

Clarifies user outcome, pain, audience, competitive baseline, and priority.

## Architect

Defines state, data flow, module boundaries, contracts, risks, and rollback.

## Code Locator

Read-only. Finds files, symbols, call chains, existing tests, and local patterns.

Also called Locator in portable role fallback packets.

## Builder

Implements a bounded slice. Avoids unrelated refactors.

Also called Implementer in portable role fallback packets.

## Verifier

Runs focused checks and records what evidence level the check proves.

Maps to QA in smaller tasks.

## Reviewer

Checks correctness, regressions, architecture drift, security, and missing tests using `references/review.md`.

## QA

Runs focused verification, browser smoke, API smoke, or screenshot checks.

## Docs/Evidence

Writes evidence, changelog notes, ADR links, and learning entries. Does not modify implementation unless explicitly assigned.

## Release

Checks release, CI, package, public, owner, marketplace, registry, and host-runtime claim boundaries. Does not turn local evidence into external acceptance.

## Dispatch Rules

Use `references/stage-orchestrator.md` to select accountable roles for the current stage. Worker output remains provisional until that stage's evidence gate passes.

- Use real subagent tools only when exposed by the current host.
- Give each agent a role, files allowed, expected output, and forbidden actions. Use `assets/templates/dispatch-packet.md` when the assignment needs durable boundaries or evidence.
- For portable fallback packets, use `references/role-dispatch-fallback.md` and `assets/templates/role-fallback-packet.md`.
- Avoid parallel writes to the same files.
- If subagents are unavailable, execute roles sequentially in the main session and say so.

## File Ownership

Use `references/file-ownership.md` before assigning write access, running parallel implementation, or editing in a dirty worktree. Keep locator, verifier, reviewer, release, and QA roles read-only unless explicitly assigned otherwise.

