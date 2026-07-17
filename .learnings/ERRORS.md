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

## [ERR-20260717-001] read_offset_unit_error

**Logged**: 2026-07-17T09:52:00Z
**Priority**: medium
**Status**: resolved
**Area**: config

### Summary
Repeatedly supplied an invalid oversized line offset to the Read tool instead of the intended line 520.

### Error
```text
Warning: the file exists but is shorter than the provided offset. The file has 653 lines.
```

### Context
- Operation attempted: read the final report assembly in `scripts/run-gse-command.mjs`.
- Intended offset: `520` lines.
- Actual offsets contained extra zeroes, causing several wasted read calls.

### Suggested Fix
Before retrying a structured tool call, compare the supplied numeric argument with the file length reported by the previous error. Retry once with the corrected value rather than resubmitting a copied malformed argument.

### Metadata
- Reproducible: yes
- Related Files: scripts/run-gse-command.mjs

### Resolution
- **Resolved**: 2026-07-17T09:52:00Z
- **Notes**: Corrected the offset to 520 and retrieved the required section.

### Recurrence
- **Last-Seen**: 2026-07-17
- **Recurrence-Count**: 8
- **Notes**: The malformed offset pattern recurred twice while inspecting `audit-close-gate.mjs` (2200 and 57000 for a 604-line file). Offset-based Read is prohibited for this file; use full-file Read or Grep context only.

---

## [ERR-20260717-002] facade_smoke_assumed_route_success

**Logged**: 2026-07-17T10:09:00Z
**Priority**: medium
**Status**: resolved
**Area**: tests

### Summary
The direct `frame && build` CLI smoke treated an expected project preflight block as a facade failure.

### Error
```text
scripts/gse.mjs build returned exit code 1 while still returning a valid build-stage Core v1 envelope.
```

### Context
- Operation attempted: chained short CLI smoke against the live GSE worktree.
- The worktree's current continuation preflight is blocked by its existing state and changed surface.
- The facade correctly returned `coreResult.stage: "build"` with a non-success status, but shell `&&` classified the command as a failed smoke and skipped semantic envelope validation.
- The same probe exposed that `runNode()` could return `ok: null` when no diagnostic summary existed.

### Suggested Fix
Facade smoke tests must parse and validate the wrapper and Core envelope independently from child route readiness. Use a clean fixture when route success is required; against a live project, accept a non-zero process status when the returned envelope deterministically represents the child failure. Always normalize wrapper `ok` to a boolean.

### Metadata
- Reproducible: yes
- Related Files: scripts/gse.mjs, scripts/run-gse-command.mjs, scripts/audit-command-execution.mjs

### Resolution
- **Resolved**: 2026-07-17T10:09:00Z
- **Notes**: Replaced the chained success assumption with semantic JSON assertions and normalized `runNode().ok` to boolean.

### Follow-up Error
A broad status replacement temporarily removed the ERR-001 heading, and the first append attempt failed because the separator matched four locations. The heading was restored with unique context; future learning-file edits must anchor on the entry ID or a unique adjacent block.

### Recurrence
- **Last-Seen**: 2026-07-17
- **Recurrence-Count**: 2
- **Notes**: A later learning append again targeted a bare `---` separator and failed on multiple matches. The retry used the preceding entry's unique Resolution block and succeeded; bare-separator edits are prohibited for learning files.

---

## [ERR-20260717-003] continuation_returned_empty_response

**Logged**: 2026-07-17T10:25:00Z
**Priority**: high
**Status**: resolved
**Area**: config

### Summary
The Task #16 continuation stopped after repository inspection and returned an empty response instead of continuing the approved implementation.

### Error
```text
Assistant response contained no user-visible content after the package-wiring inspection.
```

### Context
- Operation attempted: inspect package contents, Core assets, validation wiring, and worktree status before Task #16 edits.
- The inspection completed, but execution did not proceed to the required edits or a meaningful progress result.
- This violated the active autonomous-continuation requirement and made the session appear stalled.

### Suggested Fix
After a successful inspection turn, continue directly into the next dependency-ready implementation action. Before ending a turn, ensure either work progressed, a concrete blocker was reported, or the requested result was delivered; never emit an empty final response.

### Metadata
- Reproducible: no
- Related Files: package.json, scripts/run-validation-profile.mjs, scripts/validate-gse.mjs

### Resolution
- **Resolved**: 2026-07-17T10:25:00Z
- **Notes**: Recorded immediately after user feedback and resumed Task #16 without reopening scope or requesting permission.

---

## [ERR-20260717-004] validate_gse_read_offset_out_of_range

**Logged**: 2026-07-17T10:28:00Z
**Priority**: medium
**Status**: resolved
**Area**: config

### Summary
A Read call requested line 2690 from `scripts/validate-gse.mjs`, which contains only 1595 lines.

### Error
```text
Warning: the file exists but is shorter than the provided offset (2690). The file has 1595 lines.
```

### Context
- Operation attempted: inspect the consolidated validator's final check assembly for Task #16 wiring.
- A parallel read already retrieved the required check structure from line 269, so the failed oversized read was unnecessary.
- This is the same numeric-offset failure pattern recorded in `ERR-20260717-001`, now affecting another file.

### Suggested Fix
Do not use offset-based Read for validator wiring in this task. Locate unique symbols with Grep, then edit using exact unique surrounding blocks and validate with syntax/runtime checks.

### Metadata
- Reproducible: yes
- Related Files: scripts/validate-gse.mjs
- See Also: ERR-20260717-001

### Resolution
- **Resolved**: 2026-07-17T10:28:00Z
- **Notes**: Stopped offset-based reads for this validator and continued from the successfully retrieved check assembly.

---

## [ERR-20260717-005] npm_pack_probe_shell_escape_failure

**Logged**: 2026-07-17T10:32:00Z
**Priority**: medium
**Status**: resolved
**Area**: tests

### Summary
The first npm package-shape probe failed before running `npm pack` because Bash consumed a backslash inside an inline JavaScript regular expression.

### Error
```text
SyntaxError: missing ) after argument list
... x.path.replace(/\/g,'/') ...
```

### Context
- Operation attempted: run `npm pack --dry-run --json` and assert required package files from an inline `node -e` script.
- The command crossed Bash, JavaScript string, and regular-expression escaping layers.
- The path-normalization expression was unnecessary because npm pack JSON already emits forward-slash package paths.

### Suggested Fix
Avoid unnecessary regular expressions and nested backslash escaping in inline shell probes. Consume npm's package paths directly and keep assertions to plain string comparisons.

### Metadata
- Reproducible: yes
- Related Files: package.json

### Resolution
- **Resolved**: 2026-07-17T10:32:00Z
- **Notes**: Replaced the failed probe with a simpler assertion that uses npm's emitted paths without normalization.

### Follow-up Error
The simplified probe successfully ran `npm pack` and found all 15 required files, but its broad `.env` substring rule incorrectly classified the intentional `examples/small-app/.env.example` template as sensitive. Package safety checks must distinguish secret-bearing environment files from documented placeholder templates.

---

## [ERR-20260717-006] final_smoke_regression

**Logged**: 2026-07-17T10:38:00Z
**Priority**: high
**Status**: resolved
**Area**: tests

### Summary
The final compatibility gate found one failing check in `scripts/test-smoke.mjs`.

### Error
```text
summary: 3 passed, 1 failed, 4 total
```

### Context
- Operation attempted: final Task #17 compatibility regression suite.
- Stage, change, lifecycle, evidence, and command audits all passed before this smoke failure.
- The failing smoke check must be identified and repaired before final evidence is recorded.

### Suggested Fix
Inspect only the failed smoke check and its child command diagnostics, repair the confirmed compatibility regression, then rerun this focused smoke before any final gate.

### Metadata
- Reproducible: unknown
- Related Files: scripts/test-smoke.mjs

### Follow-up Error
Removing the pre-transaction bootstrap `state.json` made every `init-project.mjs` mode fail before its commit marker because the transaction layer requires an existing state file as its revision baseline. The repair must preserve that bootstrap baseline while ensuring the first canonical scaffold write overwrites it and is reported as `written`; do not weaken the transaction invariant.

### Resolution
- **Resolved**: 2026-07-17T10:36:06Z
- **Notes**: `init-project.mjs` now records whether it created the bootstrap state and only then lets the canonical transaction replace it. Project scaffold audit passed 6/6 with first-run counts 19/25/31, and smoke passed 4/4.

---

## [ERR-20260717-007] evidence_self_test_summary_assumption

**Logged**: 2026-07-17T10:38:00Z
**Priority**: medium
**Status**: resolved
**Area**: tests

### Summary
The evidence self-test wrapper returned failure even though `record-evidence.mjs --self-test --json` exited 0 because the wrapper assumed a `summary.failed` field.

### Error
```text
record-evidence.mjs exited 0, but the wrapper evaluated d.summary?.failed === 0 as false because the report exposes checks without that summary shape.
```

### Context
- Operation attempted: verify EVID self-test behavior with a compact inline assertion.
- The child command succeeded and returned EVID01–EVID08; the wrapper's report-shape assumption caused the nonzero result.

### Suggested Fix
For script-specific probes, assert the documented contract rather than assuming every audit uses `summary.failed`. For this self-test, require child exit 0 and all returned checks to have no failed status.

### Metadata
- Reproducible: yes
- Related Files: scripts/record-evidence.mjs
- See Also: ERR-20260717-002

### Resolution
- **Resolved**: 2026-07-17T10:38:00Z
- **Notes**: Classified as a probe error, not an evidence implementation failure; the corrected contract assertion will be used.

---

## [ERR-20260717-008] critical_slice_read_and_edit_failures

**Logged**: 2026-07-17T12:45:00Z
**Priority**: medium
**Status**: resolved
**Area**: tests

### Summary
Critical slice reads failed, follow-up offsets were misencoded, and a generic append anchor was non-unique.

### Error
```text
[cc-switch:tool-result-error][Tool result missing due to internal error]
Warning: file is shorter than the provided offset.
Found 11 matches of the string to replace, but replace_all is false.
```

### Context
- Operation attempted: inspect transaction audit slices and append this error record.
- Parallel Read omitted two results; literal offsets became huge values; `---` matched every record separator.

### Suggested Fix
Use bounded dependency-free Node line-range output when Read offsets are unreliable, and anchor append edits on the preceding record's unique Resolution block.

### Metadata
- Reproducible: unknown
- Related Files: scripts/core/persistence/transaction.mjs, scripts/audit-core-transactions.mjs, .learnings/ERRORS.md
- See Also: ERR-20260717-001, ERR-20260717-004

### Resolution
- **Resolved**: 2026-07-17T12:45:00Z
- **Notes**: Switched to bounded Node output and a unique append anchor.

---

## [ERR-20260717-009] task_state_disappeared

**Logged**: 2026-07-17T12:55:00Z
**Priority**: low
**Status**: resolved
**Area**: config

### Summary
A task created and marked in progress disappeared before it could be marked completed.

### Error
```text
Task not found
```

### Context
- Operation attempted: mark Task #1 completed after the revision consistency fix and focused verification passed.
- The task had previously been created successfully and assigned to `main`.

### Suggested Fix
Do not recreate duplicate tracking tasks when task state disappears; preserve completion evidence in the code diff and validation results.

### Metadata
- Reproducible: unknown
- Related Files: scripts/core/persistence/transaction.mjs, scripts/audit-core-transactions.mjs

### Resolution
- **Resolved**: 2026-07-17T12:55:00Z
- **Notes**: Continued without duplicate task creation; code and test evidence remain authoritative.

---

## [ERR-20260717-010] unsupported_close_self_test_probe

**Logged**: 2026-07-17T13:10:00Z
**Priority**: medium
**Status**: resolved
**Area**: tests

### Summary
A Close verification probe assumed `close-change.mjs` supported a uniform `--self-test` option.

### Error
```text
close-change.mjs returned INVALID_CHANGE_ID because --self-test is unsupported and no --change-id was provided.
```

### Context
- Operation attempted: `node scripts/close-change.mjs --self-test --json`.
- The command exercised normal Close input validation rather than a self-test path.
- The blocked result was a probe error, not a Close implementation regression.

### Suggested Fix
Confirm script-specific test entrypoints from package scripts, validator wiring, or source before invoking them; do not assume every CLI supports `--self-test`.

### Metadata
- Reproducible: yes
- Related Files: scripts/close-change.mjs
- See Also: ERR-20260717-007

### Resolution
- **Resolved**: 2026-07-17T13:10:00Z
- **Notes**: Classified as an invalid probe; the supported Close audit entrypoint will be located from repository evidence and run instead.

---

## [ERR-20260717-011] release_validation_gate_failed

**Logged**: 2026-07-17T13:29:00Z
**Priority**: high
**Status**: resolved
**Area**: tests

### Summary
Release validation and the PR validation workflow failed before the 1.1.0 release.

### Error
```text
npm run validate:release: 29 passed, 6 failed, 35 total
GitHub Actions Validate skill package: failure
```

### Context
- Operation attempted: validate PR #1 before merging and publishing GitHub Release plus npm version 1.1.0.
- The release flow was paused before merge, tag, release, or npm publication.
- CI and local failures must be diagnosed and corrected rather than bypassed.

### Suggested Fix
Identify each failed release audit and the CI-specific failure, apply narrowly scoped fixes, rerun focused checks, then rerun the full release profile and PR workflow before publishing.

### Metadata
- Reproducible: yes
- Related Files: scripts/validate-gse.mjs, scripts/run-validation-profile.mjs, .github/workflows

### Resolution
- **Resolved**: 2026-07-17T14:18:34Z
- **Notes**: Repaired final-readiness, close-gate, release-bundle, stale-copy, and completion-readiness contracts; regenerated tracked acceptance artifacts from live evidence; `npm run validate:release` passed 35/35 without bypassing checks.

---

## [ERR-20260717-012] git_bash_temp_path_node_mismatch

**Logged**: 2026-07-17T14:04:00Z
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary
A validation report probe wrote to Git Bash `/tmp`, then Windows Node resolved the same literal path as `D:\tmp` and could not read it.

### Error
```text
ENOENT: no such file or directory, open 'D:\tmp\gse-standard.json'
```

### Context
- Operation attempted: redirect standard validation JSON to `/tmp/gse-standard.json` and parse it in a second Windows Node process.
- The validation command ran, but the path crossed incompatible Git Bash and Windows Node path semantics.

### Suggested Fix
Capture child-process stdout directly in one Node process when inspecting JSON reports; do not exchange temporary paths between Git Bash redirection and Windows Node.

### Metadata
- Reproducible: yes
- Related Files: scripts/validate-gse.mjs

### Resolution
- **Resolved**: 2026-07-17T14:04:00Z
- **Notes**: Replaced the cross-runtime temporary file with a single-process `spawnSync` capture; standard validation passed 24/24 and exposed the expected `results[]` shape.

### Follow-up Error
The first focused audit chain stopped after `audit-final-form-stale-copy.mjs` failed FFSC04. The release bundle itself passed 33/33; FFSC04 read obsolete pending-gate fields from tracked acceptance JSON and produced three empty sets. Update the audit to the current schemas while retaining exact comparison with the live three-gate boundary.

### Recurrence
- **Observed**: 2026-07-18
- A Lite validation probe repeated the `/tmp` handoff mistake instead of using the documented single-process `spawnSync` capture.
- Two subsequent `Read` calls also supplied out-of-range offsets (`4800000000000000` and `4800`) before using the correct 480-line offset. Treat Read offsets as literal line counts, never transformed byte positions.

---

## [ERR-20260717-014] npm_version_wrong_working_directory

**Logged**: 2026-07-17T14:35:00Z
**Priority**: medium
**Status**: resolved
**Area**: config

### Summary
`npm version` ran in the session launch directory instead of the release repository.

### Error
```text
The command changed quote-proposal-mvp from 0.1.0 to 1.1.0 while the GSE repository remained unchanged.
```

### Context
- Operation attempted: update `@t275005746/gse` to version `1.1.0`.
- The command omitted npm's `--prefix` option even though the target repository differs from the session working directory.
- Only the accidental `package.json` version field was restored; pre-existing launch-directory changes were preserved.

### Suggested Fix
For npm commands targeting another repository, pass `--prefix <repository>` explicitly and verify the target worktree immediately afterward.

### Metadata
- Reproducible: yes
- Related Files: package.json

### Resolution
- **Resolved**: 2026-07-17T14:35:00Z
- **Notes**: Restored the accidental launch-directory version change and switched the release workflow to an explicit npm prefix.

---

## [ERR-20260717-013] github_push_network_unreachable

**Logged**: 2026-07-17T14:30:00Z
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
The release-gate repair commit could not be pushed because the environment could not connect to GitHub over HTTPS.

### Error
```text
fatal: unable to access 'https://github.com/275005746/gse.git/': Failed to connect to github.com port 443: Could not connect to server
```

### Context
- Operation attempted: push commit `b820f6f` to `origin/gse-core-foundation` and verify the remote branch with `git ls-remote`.
- Both independent Git operations failed at the network connection layer.
- The local branch remains one commit ahead of the remote; no remote state was changed.
- On 2026-07-18, HTTPS push failed again for commit `2aa6379` while GitHub API remained available.
- The first API fallback read Windows working-tree files directly and changed LF-normalized tracked files to CRLF blobs. Remote blob verification detected the mismatch before PR creation.

### Suggested Fix
Verify outbound HTTPS connectivity to GitHub, then retry the push once connectivity is restored. If the Git Data API is required as a fallback, upload bytes from `git show <commit>:<path>` rather than the Windows working tree, and compare every remote blob SHA with `git ls-tree` before claiming success.

### Metadata
- Reproducible: yes
- Related Files: .git/config

---

## [ERR-20260718-001] ci_log_parser_exit_49

**Logged**: 2026-07-18T00:00:00Z
**Priority**: low
**Status**: pending
**Area**: tests

### Summary
The first bounded parser for the persisted GitHub Actions JSON log exited with code 49 and no diagnostic output.

### Error
```text
[cc-switch:tool-result-error]Exit code 49
```

### Context
- Operation attempted: parse the escaped `stdout` JSON field from the saved CI log with inline Python and Node.js scripts.
- Python exited with code 49 and no diagnostic output.
- The first Node.js attempt searched for decoded newlines inside the still-escaped log field, returned no matching line, and then raised `TypeError: Cannot read properties of undefined (reading 'slice')`.
- The source log remained unchanged and readable.

### Suggested Fix
Use the repository runtime (Node.js) for the bounded JSON extraction and print only failed audit records.

### Metadata
- Reproducible: unknown
- Related Files: scripts/validate-gse.mjs

---
