Slice ID: `GSE-173-change-lifecycle-hardening`
Status: `verified`

## Outcome

GSE-173 completes the portable Node Change lifecycle: initialization publishes source files, derived cache, and project state atomically; evidence publication refreshes the cache; Close archives transactionally and writes an idempotent goal-map execution link.

Roadmap anchor: `references/final-form-roadmap.md` (Wave 2 Change lifecycle hardening).

## Scope

In scope: shared active Change derivation; atomic Change initialization; evidence/cache revision synchronization; lock-held dependency revalidation; transactional archive publication; goal-map execution projection; replay, conflict, race, and dependency-drift audits.

Out of scope: host-native invocation, real subagent dispatch, CI proof, marketplace approval, public acceptance, owner acceptance, full schema validation, generic state repair, and Close policy redesign.

## Acceptance

- Initialization publishes active state and derived cache at one revision.
- Evidence publication rederives source digests and advances state/cache/evidence together.
- Close remains fail-closed for stale evidence, archive collisions, races, and dependency drift.
- Archive publication moves the Change, records closure evidence, clears active state, and adds one goal-map execution link.
- Replaying Close does not mutate archive, state, evidence, or goal map.

## Evidence

- `node scripts/audit-change-lifecycle.mjs --root . --json` (13/13 passed)
- `node scripts/audit-change-system.mjs --root . --json` (exit 0)
- `node scripts/record-evidence.mjs --self-test --json` (13/13 passed)
- `node scripts/audit-close-gate.mjs --root . --json` (17/17 passed)
- `node scripts/audit-close-gate-hardening.mjs --root . --json` (8/8 passed)
- `node scripts/validate-gse.mjs --root . --profile lite --json` (29/29 passed)
- `git diff --check` (passed; existing CRLF conversion warnings only)

## Risk

- Local portable Node validation does not prove host-native commands, real host dispatch, browser/MCP/LSP behavior, or CI execution.
- Registry publication, marketplace approval, other-host runtime evidence, public acceptance, and owner acceptance remain separate claims.
- The goal-map lifecycle section is an execution projection only and does not modify or complete the canonical product goal.

## Next Action

Select the next independently verifiable local functional Slice; keep Host and external acceptance claims evidence-gated.
