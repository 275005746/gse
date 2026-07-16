# Plugins

Record optional host plugins and runtime adapters here. Plugins are never inferred from pointer files alone.

## Inventory

| Plugin | Host | Purpose | Required | Status | Evidence | Fallback | Claim Boundary |
|---|---|---|---|---|---|---|---|
| GSE Claude adapter | Claude Code | Point host commands back to portable GSE policy | no | documented | `.claude/gse-adapter.md`, `.claude/commands/gse.md` | Read `AGENTS.md` and run portable commands | Pointer files do not prove native command invocation |
| GSE Codex adapter | Codex | Point host command text back to portable GSE policy | no | documented | `.codex/gse-adapter.md`, `.codex/gse-command.md` | Read `AGENTS.md` and run portable commands | Pointer files do not prove native slash-command support |
| Other host plugins | other hosts | Optional runtime acceleration | no | unknown | - | Use `AGENTS.md`, `.gse/`, and the portable runner | No plugin is claimed until its installation and invocation are recorded |

## Rules

- Plugins are optional accelerators unless the project explicitly requires them.
- Provide a markdown fallback when a plugin is unavailable.
- Use only `verified`, `documented`, `unknown`, `unavailable`, or `external-required` for status.
