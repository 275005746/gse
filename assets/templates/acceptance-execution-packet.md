# Acceptance Execution Packet

Use this packet when GSE needs external acceptance evidence instead of another structural audit.

Choose exactly one path per packet.

```text
Acceptance path: fresh-session | owner-approved project write
Target project or session:
Purpose:
Required inputs:
Allowed files:
Forbidden files:
Allowed commands:
Forbidden commands:
Expected output:
Evidence record path:
Acceptance gate:
Accepted by:
Stop conditions:
Residual risk if incomplete:
Next action after completion:
```

## Fresh-Session Path

Use when a separate session, thread, host worker, or equivalent can run the GSE continuation path without hidden conversation history.

Required inputs:

- `SKILL.md`
- `.gse/gse-design-master-plan.md`
- `.gse/goal-map.md`
- `.gse/current-slice.md`
- `references/forward-test.md`
- `references/evidence-taxonomy.md`

Acceptance gate: the separate session identifies the current slice, states outcome/scope/acceptance/evidence/risk/next action, runs or describes the smallest valid verification, and records `Accepted by: fresh-session` only if it actually executed the packet.

## Owner-Approved Project Write Path

Use when a target project owner explicitly allows GSE to write project-local `.gse/` adoption or update artifacts.

Required inputs:

- Project owner approval text or issue/task link.
- Target project rule file such as `AGENTS.md`, `CLAUDE.md`, or README.
- `references/adoption-recipes.md`
- `assets/templates/target-adoption-evidence.md`
- `assets/templates/update-release-acceptance-record.md`

Default allowed files:

- `.gse/README.md`
- `.gse/project-profile.md`
- `.gse/goal-map.md`
- `.gse/quality-gates.md`
- `.gse/tooling.md`
- `.gse/evidence/YYYY-MM-DD.md`

Default forbidden files:

- Source code, lockfiles, secrets, generated outputs, screenshots, build artifacts, and unrelated host config.

Acceptance gate: the owner-approved project record exists, project-local verification ran, residual risks are recorded, and the owner or named policy accepts the verified record.

## Anti-Overclaim Rules

- Do not write `Accepted by: fresh-session` unless a separate session actually ran the packet.
- Do not write `Accepted by: owner` unless owner approval is explicit and recorded.
- Do not treat a generated packet, local validation, fixture audit, or read-only discovery as acceptance.
- Do not expand allowed files or commands without updating the packet and recording why.
- If a stop condition occurs, record `Evidence status: not ready` or `verified` with `Accepted by: not accepted`.
