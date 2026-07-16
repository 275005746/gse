# Project Guards

Project guards are reusable preflight rules promoted from repeated project lessons.

GSE reads this file during `/gse continue` and surfaces active guards before implementation. Keep it short, project-local, and evidence-bound.

| ID | Guard | Severity | Trigger | Check | Status |
|---|---|---|---|---|---|
| WIN-SHELL | Use shell syntax that matches the active host. On Windows, prefer `cmd /c` for npm, pnpm, npx, and similar commands when PowerShell shims or operators are unreliable. | high | Windows shell or package-manager command | Confirm command syntax is valid for the current shell before running or documenting it. | active |
| SPARSE-GIT | Check sparse checkout before staging generated workflow folders. | high | `.gse/`, host adapter, or generated scaffold changes | If sparse checkout is active and the path is outside the cone, use sparse-aware staging or record the limitation. | active |
| UTF8-DOC | Use UTF-8-safe readers for Chinese or multilingual docs before judging mojibake. | high | Chinese docs, encoding complaints, generated docs | Read with Node UTF-8 or another UTF-8-safe viewer; run the project encoding check when docs changed. | active |
| EVIDENCE-STALE | Treat stale, broken, or schema-weak evidence as a preflight problem. | high | `.gse/evidence/index.jsonl`, state, close gate | Validate JSONL and make sure latest evidence matches the current slice before closing. | active |
| UI-EVIDENCE | Label UI/browser verification downgrades explicitly. | medium | UI, browser, screenshot, component test, visual behavior | Mark evidence as unit, component, API, browser, CI, owner, release, or external instead of hiding downgrade under a generic verified label. | active |
| SUBAGENT-HONEST | Do not claim subagent dispatch unless the current host exposes real dispatch evidence. | high | multi-agent, subagent, role dispatch, parallel work | If no real dispatch tool exists, run roles sequentially or use file/tool parallelism and say so. | active |
| SYNC-NO-INTERRUPT | Do not interrupt running project sessions with cross-thread GSE sync messages. | high | GSE upgrade sync, delegation, background thread message | Prefer evidence records or owner action notes; only send a short cross-thread sync when the target session is idle or the owner explicitly asks. | active |
