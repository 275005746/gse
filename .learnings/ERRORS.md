# Errors

## [ERR-20260705-001] apply_patch_windowsapps_access_denied

**Logged**: 2026-07-05T00:00:00+08:00
**Priority**: high
**Status**: pending
**Area**: config

### Summary
`apply_patch` failed because the Codex WindowsApps executable wrapper returned `Access is denied` in this session.

### Error
```text
Access is denied.
Program 'codex.exe' failed to run: Access is denied
```

### Context
- Operation attempted: pipe a patch into `apply_patch` and `cmd /c apply_patch`.
- Wrapper path: `C:\Users\Admin\.codex\tmp\arg0\codex-arg0p5cXGQ\apply_patch.bat`.
- Target executable: `C:\Program Files\WindowsApps\OpenAI.Codex_26.623.13972.0_x64__2p2nqsd0c76g0\app\resources\codex.exe`.

### Suggested Fix
When this happens, verify the wrapper with `Get-Command apply_patch` and use a tightly scoped UTF-8 no-BOM file update fallback. Do not repeatedly retry the same wrapper path.

### Metadata
- Reproducible: yes
- Related Files: SKILL.md, references/host-adapters.md

---

## [ERR-20260706-002] installed_package_private_host_record_assumption

**Logged**: 2026-07-06T18:40:00+08:00
**Priority**: high
**Status**: resolved
**Area**: tests

### Summary
`audit-release-status-manifest.mjs` initially required one portable Codex host invocation record, which broke installed-copy validation because packaged installs do not necessarily include development-machine runtime evidence.

### Error
```text
RSM08 failed in installed-gse:
manifest covers host runtime evidence counts: expected native 0, portable 1
installed package had native 0, portable 0
```

### Context
- Operation attempted: `audit-distribution.mjs` and `audit-remote-distribution.mjs`.
- Failure surfaced in installed-copy `validate-gse.mjs`.
- Root cause: the audit treated a source-workspace Codex invocation record as a package invariant.

### Suggested Fix
Installed package audits must require the presence and type of host runtime evidence fields, not a machine-specific record count. Host runtime records are environment evidence and may be absent in a clean install.

### Metadata
- Reproducible: yes
- Related Files: scripts/audit-release-status-manifest.mjs

### Resolution
- **Resolved**: 2026-07-06T18:40:00+08:00
- **Notes**: `RSM08` now checks integer evidence counts greater than or equal to zero instead of requiring portable text-command records to equal one.

---

## [ERR-20260706-001] parallel_release_bundle_write_race

**Logged**: 2026-07-06T18:30:00+08:00
**Priority**: high
**Status**: pending
**Area**: tests

### Summary
Running `generate-release-bundle.mjs` and `audit-release-bundle.mjs` in parallel against the same output directory caused a transient bundle audit failure.

### Error
```text
audit-release-bundle.mjs reported RB02 failed while direct generate-release-bundle.mjs succeeded.
The audit and generator were both writing .gse/release-bundles/gse-release-bundle-audit at the same time.
```

### Context
- Operation attempted: parallel focused verification after adding `release-status-manifest.json`.
- Shared output: `.gse/release-bundles/gse-release-bundle-audit`.
- Root cause: `audit-release-bundle.mjs` itself calls `generate-release-bundle.mjs --force`; running another generator concurrently creates a write race.

### Suggested Fix
Do not parallelize commands that write the same generated directory. Run release bundle generation and release bundle audit serially, or use isolated output directories for concurrent checks.

### Metadata
- Reproducible: yes
- Related Files: scripts/generate-release-bundle.mjs, scripts/audit-release-bundle.mjs

---
