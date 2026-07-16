# Recovery And Handoff

Use this when work is interrupted, verification fails, a tool or runtime is unavailable, partial edits exist, release rollback may be needed, or a future agent must continue without relying on hidden context.

Recovery and handoff are part of the evidence loop. The goal is to make the current state understandable, resumable, and reversible.

## Trigger Conditions

Run this protocol when any of these are true:

- A session is interrupted, refreshed, compacted, or handed to another agent or host.
- A command, tool, MCP server, browser path, model route, subagent dispatch, or verification gate fails unexpectedly.
- The worktree has partial edits, generated artifacts, dirty files, or uncertain ownership.
- A release, migration, rollback, hotfix, incident, or compatibility issue is involved.
- The current agent cannot finish safely within the active slice but has useful evidence or decisions to preserve.
- The user asks to continue from another session, branch, host, or agent.

Do not create a heavy handoff for a tiny completed edit that already has direct evidence and no residual risk.

## Failure Classification

Classify the situation before deciding the next step.

| Class | Meaning | Default action |
|---|---|---|
| recoverable failure | A command, test, tool, or assumption failed, but the path is still clear | Record failure, fix smallest cause, rerun focused evidence |
| blocked work | Progress needs user input, missing credentials, unavailable external service, or unavailable required tool | Record blocker, preserve state, ask for the smallest required input |
| rollback required | Current edits or release state are unsafe, misleading, or harmful | Stop new work, identify owned edits, follow project rollback policy |
| handoff required | Another session, agent, host, branch, or future run must continue | Record goal, current state, changed files, evidence, risks, and next action |
| incident recovery | Main path, data, security, privacy, release, or user-visible behavior is broken | Stabilize first, preserve evidence, route through release/incident gates |

Never hide a failed check by reducing acceptance. Either fix it, mark it as residual risk, or move the slice to not ready.

## Resume Or Rollback Decision

Choose one path and record why:

- Resume: use when edits are scoped, evidence is trustworthy, and the next verification step is clear.
- Repair: use when a known broken command, test, route, or doc can be fixed inside the current slice.
- Roll back owned edits: use when the current changes are unsafe, contradict scope, or cannot be verified.
- Preserve and hand off: use when meaningful progress exists but completion requires another session, role, host, or external condition.
- Stop and ask: use when user input is required and any assumption would risk data, security, release, or product direction.

Do not revert user work or unrelated dirty files. Use references/file-ownership.md before rollback or cleanup.

## Failed Verification Path

When verification fails, do not reduce the acceptance bar to make the slice look complete.

Use this sequence:

1. Preserve the failed command, status, and narrow failure reason.
2. Decide whether the failure invalidates the result, only blocks verification, or exposes unrelated existing risk.
3. Fix the smallest reusable artifact when the cause is inside the slice.
4. Re-run the same focused verification before adding new scope.
5. If the failure cannot be fixed in the slice, mark readiness `not ready` or `result`, record the blocker, and set the next action.

If the failure concerns release, migration, rollback, public behavior, security/privacy, or data safety, route through `references/release.md` before claiming readiness.

## Release Recovery Path

Use this when release validation, install/update handoff, migration, rollback, compatibility, or incident gates fail.

Minimum release recovery record:

```text
Release scope:
Failed gate:
Release level:
Readiness after failure: not ready | result | verified | accepted
What changed:
What remains safe:
Rollback or resume decision:
Files or artifacts to revert:
Verification to rerun:
Owner or decision needed:
Next action:
```

Rules:

- Do not call a release accepted while a required release gate is failing.
- Prefer file-level revert for low-risk docs/scripts when ownership is clear.
- For generated scaffolds, host adapters, state, schema, runtime config, or compatibility-impacting changes, document downstream regeneration or migration impact.
- If rollback touches user or unrelated files, stop and use `references/file-ownership.md` before changing them.

## Incident Follow-Up Path

Use `assets/templates/incident-review.md` when the recovery involves user-visible breakage, data loss/corruption risk, security/privacy risk, release blocker, repeated failed verification, or a broken main path.

Incident follow-up must separate:

- Impact and affected users/systems.
- Timeline and detection signal.
- Root cause and contributing factors.
- Immediate stabilization.
- Verification that proves stabilization.
- Long-term prevention tasks.
- Evidence links and owners.

Do not turn every failed command into an incident. Use incident review only when the failure has product, release, safety, or repeated-process significance.

## Future-Agent Continuation Packet

When work must continue elsewhere, provide a compact packet that a future agent can run without hidden memory:

```text
Goal or spec:
Active slice:
Current evidence status:
Changed files:
Files intentionally untouched:
Commands already run:
Failed or unavailable tools:
Release/recovery decision:
Rollback notes:
Next verification command:
Next action:
```

If the handoff is meant to prove fresh-session acceptance, use `references/forward-test.md` and record `accepted by: fresh-session` only after a separate session actually follows the packet.

## Minimum Recovery Record

Use this compact format in evidence logs, handoffs, or final status:

```text
Recovery class:
Current objective:
Current state:
Changed files:
Commands run:
Failed or unavailable tools:
Evidence that still holds:
Evidence that is missing or weak:
Rollback or resume decision:
Risks:
Next action:
```

Keep command output short. Link to logs or evidence files instead of pasting noisy output.

## Handoff Requirements

A future-agent handoff must include:

- The active goal or spec and the current slice outcome.
- Files changed and files intentionally left untouched.
- Commands/tests/smokes already run and their result status.
- Known blockers, assumptions, unavailable tools, and residual risk.
- The next concrete action, not a vague instruction to investigate everything.
- Any project-specific rules from `.gse/project-profile.md`, AGENTS.md, or host adapter notes that affected the work.
- Whether the work is result, verified, accepted, blocked, rollback required, or not ready according to references/evidence-taxonomy.md.

If real subagent tools are unavailable, say so. A sequential-role note or handoff is not real delegation.

## Verification After Recovery

After resuming from recovery or handoff:

- Re-read the controlling goal, current slice, and project rules before editing.
- Inspect current files instead of trusting the handoff blindly.
- Re-run the smallest focused evidence that proves the recovered path still works.
- Reclassify readiness with references/evidence-taxonomy.md.
- Update the evidence log with what changed since the handoff.

If evidence changed or contradicted the handoff, prefer current-state evidence.

## Integration

- Use references/file-ownership.md before reverting, moving, deleting, or cleaning files.
- Use references/release.md when recovery affects release, rollback, migration, changelog/release notes, or release acceptance.
- Use references/quality-gates.md when failed verification, cancellation, retry, or recovery behavior affects completion.
- Use references/review.md when recovery changes code, shared workflow rules, release paths, security/privacy behavior, or user-visible product behavior.
- Use references/forward-test.md when recovery or handoff rules become reusable GSE behavior that future agents must follow.
- Use references/learning-system.md only for reusable lessons; do not log noisy transient failures.
