# Project Guards

Project guards are reusable preflight rules promoted from repeated project lessons.

They sit between learning notes and hard quality gates:

```text
lesson -> project guard -> quality gate -> script/test/skill update
```

Use guards when a mistake is likely to recur across sessions, but the rule still needs project context.

## Guard File

Default project-local path:

```text
.gse/project-guards.md
```

The file uses a small table so humans can edit it and scripts can audit it:

| ID | Guard | Severity | Trigger | Check | Status |
|---|---|---|---|---|---|
| UTF8-DOC | Use UTF-8-safe readers for Chinese or multilingual docs before judging mojibake. | high | Chinese docs or encoding complaint | Read with Node UTF-8 or another UTF-8-safe viewer; run the project encoding check when docs changed. | active |

## Default Guard Set

- `WIN-SHELL`: shell syntax must match the active host.
- `SPARSE-GIT`: sparse checkout must be checked before staging generated workflow folders.
- `UTF8-DOC`: multilingual docs need UTF-8-safe reads and encoding checks.
- `EVIDENCE-STALE`: stale or broken evidence is a preflight issue.
- `UI-EVIDENCE`: UI/browser downgrades must be labeled explicitly.
- `SUBAGENT-HONEST`: subagent dispatch claims require real host evidence.
- `SYNC-NO-INTERRUPT`: cross-thread GSE upgrade sync must not interrupt a running project session.

## Continue Behavior

`/gse continue` reads `.gse/project-guards.md` when present and returns an active guard summary in the compact packet.

Missing guard files are a warning for mature projects, not a hard failure. Broken state or evidence remains the hard preflight failure.

## Promotion

- First occurrence: record in `.gse/learnings.md`.
- Second occurrence: update a checklist, template, or guard candidate.
- Third occurrence: promote to `.gse/project-guards.md` or `.gse/quality-gates.md`.
- Fifth occurrence: automate as a script, test, or skill update.

Do not hardcode product-specific behavior into the GSE skill. AION and MuseFlow can supply examples and evidence, but project guards must stay generic.

Cross-thread sync is a guard-sensitive action: prefer evidence records, release notes, or owner action notes. Send a message to another active project session only when it is idle or the owner explicitly asks for immediate sync.
