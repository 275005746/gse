# Public Release Record

Release name: GSE

Release version or label: public-defaults

Release date: 2026-07-06

Distribution channel: github-public-repo-and-release-planned

Release scope: GSE public release metadata and distribution readiness

## License

License status: selected

SPDX identifier: MIT

License file: LICENSE

Approved by: owner-confirmed-in-current-codex-thread

Decision date: 2026-07-07

Notes: Owner-selected license decision recorded.

## Artifacts

Package or source path: <install-skill-dir>

Changelog path: CHANGELOG.md

Install/update instructions: references/packaging.md

Integrity or signing record: references/release-trust.md

Marketplace/catalog record: references/marketplace-discovery.md

## Verification

Validation command: node scripts/validate-gse.mjs --root <skill> --json

Validation result: pending current run

Focused smoke: scripts/audit-public-release-metadata.mjs

Acceptance evidence: Owner license decision accepted; public release still requires remaining public and host evidence.

## Risks

Known unsupported claims: public marketplace approval, public registry publication, legal suitability, and host-native slash-command runtime support are not implied by this record.

Known compatibility limits: host behavior must be verified per host runtime.

Rollback or unpublish path: remove public listing/package and publish corrected release record.

## Acceptance

Evidence status: accepted

Accepted by: owner-confirmed-in-current-codex-thread

Accepted at: 2026-07-07

Next action: Run release validation and preserve acceptance evidence.
