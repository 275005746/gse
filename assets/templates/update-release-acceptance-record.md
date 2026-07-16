# Update Or Release Acceptance Record

Use this in a project evidence log when a GSE update, workflow update, scaffold change, package release, or project release needs a compact acceptance record.

Keep the record short. Link to command output, CI, smoke reports, or evidence files instead of pasting long logs.

```text
Record type: update | release | scaffold | adapter | incident hotfix
Project path:
Goal or slice:
Release label or change id:
Evidence status: result | verified | accepted | not ready

Local decisions preserved:
Files changed:
Files intentionally not changed:
Commands run:
Focused verification:
Compatibility evidence:
Migration notes:
Rollback notes:
Owner or acceptance gate:
Accepted by:
Residual risks:
Next action:
```

## Status Rules

- `result`: the update, release notes, scaffold, adapter, or record exists.
- `verified`: focused checks prove the affected behavior in the current environment, and residual risk is recorded.
- `accepted`: the required owner, release policy, CI gate, smoke gate, archive gate, or explicitly named acceptance policy has accepted the verified result.
- `not ready`: required evidence is missing, contradicted, or outside the current environment.

## Anti-Overclaim Rules

- Do not mark `accepted` only because `validate-gse.mjs`, tests, lint, or a local smoke passed.
- Do not claim release publication, package install, production rollout, host runtime support, registry access, subagent support, MCP support, browser support, or owner approval unless the evidence names that gate.
- Keep unavailable or unverified tools as `unknown`, `documented`, or `unavailable`; do not convert them to `verified` through this record.
- If rollback is unknown, say `unknown`; do not infer rollback safety from file existence.
- If the user or release owner has not accepted a user-visible or irreversible change, write `Accepted by: not accepted`.

## Minimal Examples

```text
Evidence status: verified
Focused verification: node <skill>/scripts/validate-gse.mjs --root <skill> passed
Owner or acceptance gate: not required for internal template wording update
Accepted by: policy: Lite focused smoke policy
```

```text
Evidence status: verified
Focused verification: npm run smoke passed in target project
Owner or acceptance gate: release owner approval required
Accepted by: not accepted
Residual risks: production publish not executed; rollback not exercised
```
