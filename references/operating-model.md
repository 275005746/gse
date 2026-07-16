# Operating Model

Use the same loop for every task, scaled by task level.

## 1. Goal

Identify the project goal, user outcome, current priority, and non-goals.

For long-running work, bind to `.gse/goal-map.md` or the project's existing goal map.

## 2. Spec

Define boundaries before implementation:

- Inputs and outputs
- UI/API/state behavior
- Error and recovery behavior
- Permissions and privacy boundaries
- Acceptance criteria
- Test or smoke plan

Do not over-spec Level 1 tasks.

## 3. Execute

Use the smallest verifiable slice.

- Locate code with `rg`, `rg --files`, LSP, or an index before editing.
- Follow existing patterns.
- Keep unrelated refactors out.
- Use subagents only when actual dispatch tools exist and ownership is clear.
- Use `references/file-ownership.md` before editing dirty files, shared files, or files assigned to another role.
- Avoid making every internal state transition its own product slice. When several small states only matter as one user-visible chain, merge them and verify the chain.

## 4. Evidence

Completion needs evidence appropriate to the risk:

- Unit/component/contract test
- API smoke
- Browser or Playwright smoke
- Build/typecheck/lint
- Screenshot or trace for UI
- Commit hash or change summary

Choose the gate profile from `references/task-levels.md` and `references/quality-gates.md`. A small docs or state slice should not pay the same verification cost as a release/install/cross-host slice. Conversely, release, public contract, install, and host-runtime claims need hard gates and cannot be proven by narrow tests alone.

## 5. Learn

Record reusable lessons when a failure, correction, tool gap, repeated bug, or better process is discovered.

Escalate repeated lessons into quality gates or project rules.
