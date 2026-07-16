# Project Profile

Use this when a project has its own development standards, commands, tool connections, CI, MCP servers, LSP/index setup, release process, security rules, or agent-host conventions.

## Principle

Project-local rules override generic GSE defaults. GSE should adapt to the project, not flatten the project into a generic workflow.

## Discovery Order

Read only what is relevant to the task and risk level:

1. Agent rules: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `.windsurfrules`, or host equivalents.
2. Project docs: README, CONTRIBUTING, CODING_STANDARDS, architecture docs, ADRs, `CONTEXT.md`.
3. Commands and scripts: `package.json`, `Makefile`, task runners, CI workflows, test config.
4. Tooling connections: MCP config, browser/Playwright config, LSP/index config, deployment config, observability config.
5. Secrets and permissions: `.env.example`, secret docs, write-capable tools, destructive commands.
6. Existing GSE files: `.gse/project-profile.md`, `.gse/tooling.md`, `.gse/quality-gates.md`.

Avoid reading generated output, large logs, lockfiles, caches, screenshots, or archives unless the current task needs them.

## What To Capture

Keep `.gse/project-profile.md` short and factual:

- Product or system identity.
- Canonical product goal source: the existing roadmap, architecture, PRD, vision, product plan, or goal document that owns product intent.
- Repository type and main languages/frameworks.
- Development commands and focused verification commands.
- Coding standards and formatting rules.
- Testing strategy and required gates.
- Tool connections: MCP, LSP/index, browser automation, CI, deploy, observability.
- Model routing: project-approved providers, model/tool ids, capability fit, cost/latency expectations, privacy limits, and fallback policy.
- Agent host adapters: Codex, Claude Code, Hermes/AION-style runtime, WorkBuddy, or other hosts; use `references/compatibility.md` for support status labels.
- Security and permission boundaries.
- Release and rollback expectations.
- Known gotchas.

## What Not To Capture

- Do not mirror large sections of the project's own architecture, roadmap, or README.
- Do not record speculative facts as if they were confirmed.
- Do not write tool support as present unless it has been seen in docs, config, or a successful check.
- Do not turn the profile into a second project spec or design doc.

## Conflict Rules

- User instruction in the current conversation wins.
- Project rules beat GSE generic defaults.
- The project's canonical product goal source beats `.gse/goal-map.md` for product intent. `.gse/goal-map.md` is only the GSE execution projection and must be corrected when it drifts.
- More specific docs beat broad docs when they clearly apply to the current subsystem.
- If two project rules conflict, surface the conflict before editing.
- Never invent tool availability. Mark unverified connections as `unknown` until tested or documented.

## Refresh Triggers

Use `references/drift-audit.md` when current project facts may have diverged from recorded profile, tooling, host, release, or permission assumptions.

Refresh `.gse/project-profile.md` when:

- The user says a tool/config/standard exists but GSE cannot see it.
- A command fails because the wrong package manager, shell, or service was assumed.
- CI/test/deploy config changes.
- New MCP, LSP, browser, worker, model, or plugin connections are added.
- A recurring issue appears in evidence or incident reviews.

