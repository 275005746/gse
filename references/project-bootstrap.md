# Project Bootstrap

Use this when initializing GSE in a project.

Use `references/adoption-recipes.md` when choosing between fresh install, existing repo adoption, GSE update, or host adapter adoption paths.

## Modes

- `auto`: default mode; chooses a scaffold from project files, scripts, CI, host folders, and runtime/tooling signals.
- `lite`: minimal workflow files for small tasks or small projects.
- `standard`: adds project-local agent workspace files for durable agent-assisted development.
- `enterprise`: adds hooks, MCP, plugins, release, incident, and audit placeholders for large or long-running projects.

## Minimal `.gse/` Files

```text
.gse/
  README.md
  state.json
  project-profile.md
  goal-map.md
  goals/
    README.md
  quality-gates.md
  tooling.md
  learnings.md
  changes/
  evidence/
    index.jsonl
  templates/
```

## Standard Agent Workspace Files

See `project-agent-workspace.md` for responsibilities.

```text
.gse/
  agent-workspace.md
  agents/
    roles.md
    dispatch.md
  skills/
    README.md
  lsp/
    README.md
```

## Enterprise Files

```text
.gse/
  hooks/README.md
  mcp/README.md
  plugins/README.md
  release.md
  incident-review.md
  audit.md
```

## Host Adapter Files

When `enterprise` mode is selected and host folders already exist, `init-project.mjs` can add thin adapters such as:

```text
.codex/gse-adapter.md
.claude/gse-adapter.md
```

These files point back to `.gse/` and must not duplicate the portable goal map, quality gates, or evidence log.

For new host command/pointer adapters, prefer:

```bash
node <skill-dir>/scripts/generate-command-adapter.mjs --target <project-root> --host claude|codex|hermes|workbuddy|copilot|gemini|generic|all
```

The older `.codex/gse-adapter.md` and `.claude/gse-adapter.md` files remain compatibility pointers for existing scaffold and fixture coverage.

## Recommended Command

```bash
node <skill-dir>/scripts/init-project.mjs --target <project-root>
```

This uses `--mode auto`. Pass `--mode lite`, `--mode standard`, or `--mode enterprise` when the project owner wants a specific scaffold.

The script should not overwrite existing files unless `--force` is passed.

## Existing Product Goal Source

When adopting an existing project, do not require the owner to rename their roadmap or maintain two competing maps.

1. Look for an existing roadmap, architecture, PRD, vision, product plan, north-star, strategy, or goal document. Scan common project docs and headings; do not depend on a fixed filename.
2. Record that file as the canonical product goal source in `.gse/project-profile.md` or `.gse/state.json`.
3. Use `.gse/goal-map.md` only as the GSE execution projection: current focus, slice ledger, evidence pointers, risks, and next actions.
4. If `.gse/goal-map.md` conflicts with the canonical product source, the canonical product source wins.

## Bootstrap Smoke

Use this after changing scaffold behavior or before trusting a packaged GSE skill:

```bash
node <skill-dir>/scripts/audit-project.mjs --root <skill-dir>
```

This verifies `lite`, `standard`, `enterprise`, and representative `auto` scaffold selection in temporary directories and checks rerun safety. It does not certify arbitrary real repositories, package installs, CI, or fresh-session acceptance.

## AGENTS.md Integration

Add a short project rule only with explicit approval:

```markdown
## GSE Workflow

This project follows GSE (Goal-Spec-Evidence Engineering). Start meaningful work by reading `.gse/README.md`, bind non-trivial tasks to `.gse/goal-map.md`, and finish with evidence in `.gse/evidence/` or the project-specific evidence log.
```

## Bootstrap Acceptance

- `.gse/README.md` exists.
- `.gse/state.json` exists and records mode, phase, current slice status, tool statuses, last evidence, and residual risks.
- `.gse/project-profile.md` exists and can capture project-specific standards, commands, tools, and permissions.
- Canonical product goal source is recorded or explicitly marked as not yet discovered.
- Goal map has a North Star and Current Focus section and states that it is a GSE execution projection when a canonical product source exists.
- `.gse/evidence/index.jsonl` exists and contains at least one machine-readable adoption or slice record.
- `.gse/goals/README.md` exists so large projects can place module-level goal details outside the root goal map.
- Quality gates list at least universal, code, UI, release, and learning gates.
- Tooling file records available and optional tools.
- Standard mode records project-local agent workspace files.
- Enterprise mode records hooks, MCP, plugins, release, incident, and audit placeholders.
- Enterprise auto mode writes compatibility host adapter files for existing `.codex/` or `.claude/` folders; command adapters for broader hosts use `generate-command-adapter.mjs`.
