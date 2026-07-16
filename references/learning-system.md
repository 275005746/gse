# Learning System

Learnings keep long projects from repeating mistakes.

## Capture When

- User corrects an assumption.
- A command, tool, API, or integration fails unexpectedly.
- A bug root cause was non-obvious.
- A recurring workflow can be shortened or hardened.
- A missing quality gate allowed a defect through.

## Do Not Capture

- Raw chain of thought.
- Temporary attempts.
- Long command output.
- One-off details unlikely to help future work.

## Upgrade Rule

Use `references/drift-audit.md` when a repeated lesson suggests stale docs, stale project-profile facts, stale host adapters, stale tool assumptions, or stale evidence state.

- First occurrence: learning note.
- Second occurrence: checklist or template update.
- Third occurrence: project guard, project rule, or quality gate.
- Fifth occurrence: script, test, or dedicated skill.

Use `scripts/audit-learning-promotion.mjs --target <project-root> --json` to classify and count repeated lessons. The audit is read-only by default. Use `/gse learn --promote --execute` only to write `.gse/learning-promotions.md` candidate output; it does not mutate `.gse/project-guards.md`, `.gse/quality-gates.md`, templates, scripts, or skill files without a deliberate follow-up change.

Use `scripts/audit-learning-drift.mjs --root <gse-skill> --target <project-root> --json` after promotion analysis. It checks whether promoted guard or script candidates are covered by project guards, quality gates, `/gse continue`, `/gse close`, or a focused audit script. Uncovered high-severity candidates are surfaced as warnings so the next slice can deliberately promote them.

Promotion categories:

- `shell`: shell syntax, host command behavior, Windows/Unix command differences.
- `encoding`: UTF-8, mojibake, localized document handling.
- `evidence`: JSONL, evidence levels, stale records, close gates.
- `browser`: browser smoke, Playwright, screenshot, component-test downgrade.
- `git`: sparse checkout, staging, commit boundaries.
- `host-tool`: subagents, MCP, LSP, native slash commands, host runtime claims.
- `project-rule`: canonical product goal sources, AGENTS.md, local project conventions.
- `release`: CI, registry, marketplace, security contact, release evidence.

## Suggested Stores

- `.gse/learnings.md` for portable project lessons.
- `.gse/project-guards.md` for recurring preflight rules promoted from lessons.
- `.learnings/` when the project already uses that convention.
- `AGENTS.md` for durable project rules.
- ADRs for architectural decisions.

