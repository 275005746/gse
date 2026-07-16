# File Ownership And Dirty Worktree

Use this when GSE work touches files in a dirty worktree, uses real subagents, simulates roles sequentially, or coordinates multiple agents, branches, worktrees, or review loops.

## Core Rule

Protect user work first. Then protect agent work from other agent work.

A file is not safe to edit just because it is in scope. First inspect whether it already has unrelated changes, generated output, local-only edits, or another active owner.

## Ownership Levels

| Level | Use when | Required action |
|---|---|---|
| Observe | Read-only location, review, QA, code search | Do not write. Report files inspected if useful. |
| Soft claim | One agent edits a small bounded slice | State intended files before editing and keep diff scoped. |
| Explicit claim | Multi-agent work, broad refactor, dirty worktree, shared files | Record owner, allowed files, forbidden files, and release condition. |
| Isolated worktree | Parallel implementation, risky experiment, long-running branch | Use a separate branch/worktree when the project supports git. |

Level 1 and 2 tasks should not require formal lock files. Escalate only when collision risk is real.

## Dirty Worktree Policy

Before editing implementation or shared docs:

1. Check project status with the safest available command, usually `git status --short` when the directory is a git repo.
2. If the directory is not a git repo, state that git ownership evidence is unavailable and rely on file scope plus timestamps/diff if available.
3. Identify files already modified before your work.
4. Treat pre-existing changes as user or another agent changes unless evidence proves otherwise.
5. Do not revert, overwrite, format, move, or delete unrelated changes.
6. If the target file is already dirty, inspect it and merge around existing changes. Ask only if the existing change makes the requested edit ambiguous or unsafe.
7. After editing, verify the final changed-file set matches the slice.

## Claim Format

Use this lightweight claim in dispatch packets, slice notes, or comments when explicit ownership is needed:

For delegated or role-separated work, prefer `assets/templates/dispatch-packet.md` so the claim also includes objective, context, expected output, verification, and stop conditions.

```text
Owner:
Purpose:
Allowed files:
Forbidden files:
Expected edits:
Verification:
Release condition:
```

Claims should be short and local to the task. Do not create permanent process artifacts for one-off edits unless the project already requires them.

## Subagent And Role Rules

When real subagent tools exist:

- Give each subagent a role, objective, allowed files, forbidden files, and expected output.
- Prefer read-only locator/reviewer/QA roles for broad exploration.
- Keep release roles focused on release/public/owner/external claim boundaries unless they are explicitly assigned release-file edits.
- Do not dispatch parallel builders to the same files or tightly coupled modules.
- Require implementers to report files changed and verification run.
- Run spec review before code-quality review when both exist.
- Coordinator owns final integration and evidence.

When no real subagent tool exists:

- Execute roles sequentially in the main session.
- Say that no real subagent dispatch occurred if the distinction matters.
- Keep the same ownership boundaries: locator is read-only, builder writes assigned files, reviewer is read-only, QA writes evidence only.
- Verifier records commands and evidence level; release records claim boundaries and external gates.
- Do not fake parallelism, independent review, or subagent status.

## Shared File Rules

Shared files include routing docs, config, package manifests, migration files, generated clients, lockfiles, schemas, shared types, and design-system primitives.

For shared files:

- Read surrounding patterns before editing.
- Avoid formatting churn.
- Keep behavior and formatting changes separate when feasible.
- Check for generated-file policy before editing generated outputs.
- If multiple slices need the same shared file, serialize edits through the coordinator.

## Ownership Conflicts

If two tasks need the same file:

1. Prefer sequencing over parallel edits.
2. If both are small and related, merge into one slice.
3. If they are independent but touch the same file, split by branch/worktree or pick one owner.
4. If an unexpected dirty change appears, stop destructive actions, inspect the diff, and continue only if the merge path is clear.
5. Record unresolved conflict as a risk or blocker, not as completed work.

## Verification Checklist

Before claiming completion:

- Intended files are the only files changed, or every extra file is explained.
- Pre-existing dirty files were not reverted or overwritten.
- Generated/test/output artifacts are excluded unless the project requires them.
- Subagent work, if any, has role, allowed files, and verification evidence.
- The evidence record names focused validation and residual risk.

`scripts/audit-close-gate.mjs` reports staged, unstaged, untracked, mixed, conflict, and common generated/test artifact paths so close reviews do not have to infer ownership from prose.

## Project Integration

- `references/agent-roles.md` defines role responsibilities.
- `references/operating-model.md` defines when ownership is checked in the execute loop.
- `references/quality-gates.md` requires dirty-worktree evidence before completion.
- `.gse/project-profile.md` should record project-specific branching, generated-file, and lockfile rules.
