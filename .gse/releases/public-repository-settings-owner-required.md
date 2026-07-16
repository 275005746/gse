# Public Repository Settings Record

Repository URL: https://github.com/275005746/gse

Default branch: main

Visibility: public

Settings status: accepted

Evidence owner: 275005746

Evidence date: 2026-07-07

Evidence URL or run id: https://api.github.com/repos/275005746/gse/branches/main/protection

## Required Public Settings

- Issues enabled: true
- Pull requests enabled: true
- Discussions enabled: unknown
- Security policy visible: true
- Branch protection enabled: true
- Required status checks enabled: true
- Required checks: Validate skill package
- Require review before merge: true
- Require conversation resolution: true
- Restrict force pushes: true
- Restrict deletions: true

## GSE-Specific Checks

- CI workflow path: `.github/workflows/validate-gse.yml`
- PR template path: `.github/PULL_REQUEST_TEMPLATE.md`
- Issue templates path: `.github/ISSUE_TEMPLATE/`
- Public release record path: `.gse/releases/public-release-owner-required.md`
- Final acceptance packet path: `.gse/acceptance/final-acceptance-packet.md`

## Verification

Verification command: node scripts/validate-gse.mjs --root . --json

Verification result: passed

## Acceptance

Evidence status: accepted

Accepted by: 275005746

Accepted at: 2026-07-07

## Residual Risk

- Public repository settings are not verified until owner/external evidence is attached.

## Next Action

- Attach public repository settings evidence and re-run repository settings audit.
