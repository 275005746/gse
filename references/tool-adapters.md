# Tool Adapters

GSE has few hard requirements. Tools enhance the workflow when available.
Use markdown fallback when optional tools are unavailable.
Do not treat optional tools as hard prerequisites.

## Minimum Tools

- Git
- A shell
- Project build/test commands when present

Recommended:

- `rg` / `rg --files` for search
- LSP for symbol navigation
- Browser or Playwright for UI verification

## Context and Code Location

Use in order:

1. Project rules: `AGENTS.md`, `CLAUDE.md`, README, or equivalent.
2. `.gse/project-profile.md` for project-specific standards, commands, tools, and permissions.
3. `.gse/README.md` and `goal-map.md` when present.
4. `rg --files` and `rg` to find relevant code.
5. LSP or code index when available.
6. Existing tests and recent commits.

Avoid broad reads of generated outputs, logs, lockfiles, or historical archives unless required.

## Project-Specific Tools

Use `references/drift-audit.md` when recorded tool status, command assumptions, MCP, LSP/index, browser, CI, package manager, or deployment facts may be stale.

Use `.gse/project-profile.md`, `.gse/tooling.md`, and `.gse/host-capabilities.md` to record tool connections and status.

Status vocabulary:

- `verified`: command/config was tested or documented in a trusted project file.
- `documented`: project docs mention it, but this session has not tested it.
- `unknown`: not confirmed.
- `unavailable`: expected but missing or failing.

Project-specific commands and standards override generic recommendations. If the project says to use `pnpm`, `bun`, `make`, a custom smoke script, a specific LSP/index, or a private MCP server, follow that after verifying it is present or documenting its status.

For the standard host/tool capability table, run:

```text
node <gse-skill>/scripts/audit-host-capabilities.mjs --target <project-root> --json
```

This audit checks native slash-command, browser, MCP, LSP/index, subagent dispatch, and CI rows. It labels missing records as a warning, but fails invalid statuses, `verified` rows without evidence, and native slash-command overclaims based only on portable command output.

## Model Routing

Use `references/model-routing.md` when choosing model, provider, hosted tool, worker, or role-specific agent capability. Record documented vs verified behavior separately.

## Host Adapters

Use `references/host-adapters.md` and `references/compatibility.md` when a project has `.codex/`, `.claude/`, `.agents/`, Hermes/AION-style runtime folders, WorkBuddy settings, MCP configs, hooks, local skills, or other host-specific workflow files.

Host adapters are pointers and capability maps. They should not duplicate `.gse/goal-map.md`, `.gse/quality-gates.md`, or `.gse/evidence/`.

## External Workflow Tools

Use external workflow tools only when they are already available in the current project and the task benefits from them. GSE markdown packs remain the portable fallback.

## Self-Improvement

Use when a user correction, repeated failure, tool gap, non-obvious root cause, or better recurring method is discovered.

## Subagents

Use when actual tools exist, such as `spawn_agent` / `wait_agent` or thread dispatch equivalents. Do not claim delegation when the tools are absent.
