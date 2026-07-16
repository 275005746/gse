# GSE Maintenance Snapshot

Generated: 2026-07-13T05:35:23.406Z
Root: D:\codex\tmp\gse-ci-push
Target: D:\codex\tmp\gse-ci-push
Status: failed

## Checks

- [x] MS01 maintenance cadence: passed
- [ ] MS02 final-form roadmap: failed
- [x] MS03 state freshness: passed
- [x] MS04 continue preflight: warning
- [x] MS05 evidence levels: passed
- [x] MS06 learning drift: passed
- [x] MS07 public acceptance: passed
- [x] MS08 installed sync: passed
- [x] MS09 session sync: passed

## Limits

- This snapshot proves recurring maintenance checks ran at a point in time.
- When writing the canonical latest-maintenance-snapshot.json, failed checks are written to latest-maintenance-snapshot.failed.json and do not overwrite the last passing snapshot.
- It does not prove native host slash-command support.
- Without --installed-root, installed sync is package-only and does not prove an installed copy is fresh.
