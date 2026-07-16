# GSE Agent Entry

GSE is the portable workflow source for this repository. Read this file first, then load only the references required by the current stage.

## Start

1. Read `.gse/project-profile.md`, `.gse/state.json`, and `.gse/current-slice.md`.
2. Use `references/stage-orchestrator.md` for meaningful work and inspect repository evidence before advancing stages.
3. Route `/gse ...` or `gse: ...` through `references/commands.md`.
4. Treat `.gse/goal-map.md` as the execution projection; the canonical product goal source named in `.gse/state.json` owns durable intent.
5. Read `.gse/quality-gates.md` before claiming completion.

## Portable Source Of Truth

- Project state and current slice: `.gse/`
- Command semantics: `references/commands.md`
- Workflow routing: `references/router.md`
- Stage control: `references/stage-orchestrator.md`
- Roles and dispatch: `.gse/agents/`
- Capability status: `.gse/host-capabilities.md` and the registries under `.gse/skills/`, `.gse/plugins/`, `.gse/hooks/`, `.gse/mcp/`, and `.gse/lsp/`
- Evidence: `.gse/evidence/`

Host-specific folders such as `.claude/` and `.codex/` are thin adapters. Do not duplicate portable policy into them and do not treat generated pointers as runtime proof.

## Evidence Rules

- Use `verified`, `documented`, `unknown`, `unavailable`, or `external-required` for capability status.
- Do not claim native slash commands, browser, MCP, LSP, hooks, plugins, or subagents without direct evidence for the current host and project.
- Preserve the distinction between result, verified evidence, accepted evidence, and external-required evidence.

## Verification

Run the lightest checks that prove the current claim. For GSE self-development, the normal close path includes:

```text
node scripts/audit-agent-entrypoint.mjs --root . --json
node scripts/audit-project-capability-registry.mjs --root . --target . --json
node scripts/validate-gse.mjs --root . --profile lite --json
git diff --check
```
