# Role Dispatch Fallback

Use this reference when real subagent tools are unavailable, unknown, or not appropriate for the current slice.

GSE must never turn role names into fake delegation. A role packet is evidence that the work boundary was explicit; it is not evidence that a real subagent ran unless the host produced current dispatch evidence.

## Required Roles

The portable fallback set is:

| Role | Purpose | Default write access | Fallback output |
|---|---|---|---|
| Planner | Define outcome, scope, acceptance, evidence, risk, and next action. | docs/state only | Slice plan with non-goals and selected gates |
| Locator | Locate files, symbols, commands, existing tests, and ownership boundaries. | read-only | File/function/test map and relevant patterns |
| Implementer | Make the bounded code or document change. | assigned files only | Diff summary and files changed |
| Verifier | Run focused tests, smokes, audits, or structural checks. | evidence/test output only | Commands, results, evidence level, residual risk |
| Reviewer | Review spec compliance, regression risk, quality, and missing tests. | read-only | Findings or explicit no-findings report |
| Docs/Evidence | Record slice evidence, state changes, release notes, and learnings. | docs/evidence only | Evidence record and state/doc update summary |
| Release | Check release, public, owner, CI, package, and host-runtime boundaries. | docs/release only | Release readiness and external gate summary |

## Fallback Packet Requirements

Every auditable role packet, whether real or sequential, must state:

- Execution mode: `real-subagent`, `sequential-role`, or `handoff-session`.
- Real delegation used: `yes` or `no`.
- Host/tool used and tool status.
- Fallback reason when real delegation is not used.
- Role, objective, allowed files, forbidden files, and expected output.
- Role output evidence.
- Verification command or check.
- Evidence level.
- Stop condition.
- Claim boundary.

## Claim Boundary

- `real-subagent` means a current host dispatch tool created an agent/task and returned evidence.
- `sequential-role` means the main agent executed the role checklist locally.
- `handoff-session` means another human or agent session owns the work after handoff.
- File/tool parallelism is not subagent dispatch.
- A role packet without dispatch evidence can still prove disciplined fallback, but it cannot prove real multi-agent execution.

## Close Rule

Before a slice closes, the coordinator should be able to answer:

1. Which roles were required for this slice?
2. Which roles ran as real delegation, sequential fallback, or handoff?
3. What files or evidence did each role touch?
4. What verification or review did each role produce?
5. What claim must not be made because a tool was unavailable?

`scripts/audit-close-gate.mjs` enforces the no-fake-dispatch boundary when `.gse/agents/role-fallback-packets.md` is present: a row that says real delegation was used must also have verified tool status.
