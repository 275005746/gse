# GSE Learnings

## [LRN-20260718-001] cross-repository-validation

**Logged**: 2026-07-18T00:00:00Z
**Priority**: medium
**Status**: pending
**Area**: infra

### Summary
Cross-repository validation commands must use the target repository path explicitly.

### Details
The active shell checkout was `gse-lang-fix`, while the implementation target was `gse-recreate-clean-core-foundation`. Running relative Node script paths therefore reported a missing `scripts/task-admission.mjs` even though the target file existed. Re-running with target absolute paths produced the expected audit result.

### Suggested Action
When working across checkouts, invoke scripts with the target repository absolute path or an explicit command prefix and inspect the target root before validation.

### Metadata
- Source: error
- Related Files: scripts/task-admission.mjs
- Tags: validation, multi-repository

---

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

## [LRN-20260717-001] correction

**Logged**: 2026-07-17T09:47:15Z
**Priority**: high
**Status**: promoted
**Area**: tests

### Summary
Use focused verification while implementing and reserve broad validation profiles for stage completion.

### Details
After a two-line task-routing repair, the full Lite validation profile was run repeatedly. That profile executes 21 audit commands, which distracted from functional delivery and made internal verification appear as uncontrolled task creation. The correct workflow is to finish the functional plan unit first, using syntax checks and only the directly affected audit fixtures during development.

### Suggested Action
Run the smallest audit that proves the changed behavior. Run Lite once when closing a top-level stage, or earlier only when focused evidence indicates a broader regression risk. Keep reviews, probes, retries, and evidence collection internal rather than representing them as global tasks.

### Metadata
- Source: user_feedback
- Related Files: scripts/run-validation-profile.mjs, scripts/audit-context-orchestrator.mjs
- Tags: validation, task-granularity, function-first, gse
- Pattern-Key: workflow.function_first_focused_validation
- Recurrence-Count: 1
- First-Seen: 2026-07-17
- Last-Seen: 2026-07-17
- Promoted: C:\Users\Admin\.claude\CLAUDE.md

### Resolution
- **Resolved**: 2026-07-17T09:47:15Z
- **Notes**: Added global rules requiring focused verification during implementation and mandatory self-improvement logging for reusable errors and user corrections.

---

## [LRN-20260717-002] correction

**Logged**: 2026-07-17T11:05:00Z
**Priority**: high
**Status**: promoted
**Area**: config

### Summary
Task-count limits must apply to review-skill and subagent fan-out, not only GSE tasks and validation commands.

### Details
A high-effort code-review skill launched several finder Agents, and one general-purpose Agent expanded into roughly 85 internal tasks. Although GSE top-level task routing and validation profiles had already been bounded, invoking an unbounded review workflow recreated the same task-explosion experience and violated the user's five-concurrent-task limit.

### Suggested Action
When the user limits task or subagent counts, treat that limit as a total execution budget across skills, Agents, workflows, and nested work. Do not invoke review modes that prescribe fan-out; perform a bounded inline review unless the user explicitly authorizes orchestration.

### Metadata
- Source: user_feedback
- Related Files: C:\Users\Admin\.claude\CLAUDE.md
- Tags: agents, code-review, concurrency, task-granularity
- Pattern-Key: workflow.task_limit_includes_nested_fanout
- Recurrence-Count: 1
- First-Seen: 2026-07-17
- Last-Seen: 2026-07-17
- Promoted: C:\Users\Admin\.claude\CLAUDE.md
- See Also: LRN-20260717-001

### Resolution
- **Resolved**: 2026-07-17T11:05:00Z
- **Notes**: Stopped the fan-out review path and switched the remaining review to a single inline execution stream without Agents, workflows, or task creation.

---
