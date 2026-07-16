# GSE Learnings

## [LRN-20260707-001] best_practice

**Logged**: 2026-07-07T06:53:48+08:00
**Priority**: medium
**Status**: pending
**Area**: tests

### Summary
Use `cmd /c` when testing npm-installed `.cmd` bin shims on Windows.

### Details
The npm tarball install audit proved that `node_modules/.bin/gse.cmd` existed after installing the packed GSE tarball into a clean consumer project, but direct `spawn` of the `.cmd` file did not reliably execute on Windows. Running the shim through `cmd /c` matched normal Windows shell behavior and made the installed-bin verification pass without weakening the assertion.

### Suggested Action
When writing cross-platform package or CLI audits, invoke Windows `.cmd` shims through `cmd /c <shim.cmd> ...`; invoke POSIX shims directly.

### Metadata
- Source: error
- Related Files: scripts/audit-npm-tarball-install.mjs
- Tags: windows, npm, cli, verification
- Pattern-Key: windows.npm_bin_shim_cmd_c
- Recurrence-Count: 1
- First-Seen: 2026-07-07
- Last-Seen: 2026-07-07

---

## [LRN-20260707-002] best_practice

**Logged**: 2026-07-07T07:08:00+08:00
**Priority**: medium
**Status**: pending
**Area**: docs

### Summary
README audits should reward concise public clarity, not require explanatory positioning sections.

### Details
The GSE README had a `How GSE Fits` section that mixed agent hosts, engineering practices, integrations, and execution units into one table. That made the README feel like keyword stuffing and defensive explanation. The fix removed the section, kept natural positioning in the opening copy, and changed the README audit so it rejects the old mixed-layer section instead of requiring it.

### Suggested Action
When adding README gates, check for the minimum public-facing clarity needed by users. Put detailed boundaries, comparisons, and caveats in references or audits, not the README homepage.

### Metadata
- Source: user_feedback
- Related Files: README.md, README.zh-CN.md, scripts/audit-readme-docs.mjs
- Tags: readme, docs, audit, public-writing
- Pattern-Key: docs.readme_audit_no_caveat_bloat
- Recurrence-Count: 1
- First-Seen: 2026-07-07
- Last-Seen: 2026-07-07

---
