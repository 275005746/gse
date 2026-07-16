# GSE Example Fixtures

These fixtures are intentionally small. They are project shapes for forward tests and future agents, not full applications.

Use `references/adoption-recipes.md` to map fixture behavior to fresh install, existing repo adoption, update, or host adapter adoption paths.

## Fixtures

| Fixture | Shape | GSE workflows it can exercise |
|---|---|---|
| `small-app` | JavaScript/TypeScript app shape with package scripts, CI, Playwright config, and `.env.example` | bootstrap, project-profile discovery, quality gates, release evidence |
| `agent-runtime-host` | Agent-runtime product shape with `.gse/`, host adapter notes, MCP config placeholder, and runtime docs | host adapter, drift audit, recovery/handoff, tool/model status classification |
| `cli-tool` | JavaScript/TypeScript CLI package shape with `bin`, smoke, build, lint, typecheck, and package dry-run scripts | package adoption, command smoke evidence, release dry-run evidence, project-profile discovery |

## Rules

- No secrets. Use `.env.example` with placeholder names only.
- No lockfiles, caches, screenshots, build outputs, or generated noise.
- Keep fixture files short enough for a future agent to inspect quickly.
- Treat config presence as documented, not verified, until a focused command is run.
- Use these fixtures for structural and fixture forward tests; do not claim fresh-session acceptance from fixture presence alone.
- Run `node scripts/audit-fixtures.mjs --root <gse-skill-root> --json` for the repeatable fixture smoke.
