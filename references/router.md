# Router

Use this to choose the GSE path before loading detailed references. The router selects; it does not replace the selected reference files.

## Inputs

Classify the request with these inputs:

- Work target: GSE skill itself, a project adopting GSE, or ordinary project work inside a GSE project.
- Task level: Lite, Standard, or Enterprise from `task-levels.md`.
- Change type: setup, feature, bug, refactor, research, UI, release, incident, skill improvement, or tool adapter.
- Tool availability: verified, documented, unknown, or unavailable from `tool-adapters.md`.
- Project constraints: `.gse/project-profile.md`, AGENTS/CLAUDE/GEMINI rules, CI, MCP, LSP, browser, release, and security boundaries.
- Command-style usage: `/gse ...`, `gse: ...`, or equivalent natural-language command from `commands.md`.

## Universal Start

For meaningful work:

1. Read project or skill rules first.
2. Read `.gse/project-profile.md` when working inside a project.
3. Read `.gse/gse-design-master-plan.md`, `.gse/goal-map.md`, and `.gse/current-slice.md` when improving GSE itself.
4. If the request starts with `/gse` or `gse:`, load `references/commands.md` and map the command before selecting the route.
5. For meaningful project delivery, use `stage-orchestrator.md` to identify the first unmet stage gate from repository evidence.
6. Select one route below.
7. Load only the current-stage reference files required by that route.

## Route Map

| Situation | Route | Required References | Optional Adapters |
|---|---|---|---|
| User asks `/gse ...` or `gse: ...` | Command routing | `commands.md`, then the mapped route reference | host-specific slash command adapters |
| Improve GSE skill itself | GSE self-development | `.gse/gse-development-protocol.md`, `.gse/gse-design-master-plan.md`, `benchmark-audit.md` | `audit-gse.mjs`, capability matrix audit |
| Initialize GSE in a project | Project bootstrap | `project-bootstrap.md`, `project-profile.md`, `project-agent-workspace.md` | `init-project.mjs` |
| Discover project rules/tools | Project profile | `project-profile.md`, `tool-adapters.md` | future `discover-project-profile.mjs`, LSP, MCP, CI |
| Plan feature or product slice | Spec workflow | `task-levels.md`, `goal-map.md`, `spec-workflow.md`, `quality-gates.md` | change packs, role packets, subagents when verified |
| Turn vague goal text into options and a choice prompt | Goal discovery | `commands.md`, `stage-orchestrator.md`, `spec-workflow.md` | product/context inspection when needed |
| Implement bounded slice | Execute workflow | `operating-model.md`, `quality-gates.md`, `tool-adapters.md` | TDD, LSP, browser QA, CI |
| Start, continue, or rescue meaningful project work | Stage orchestration | `stage-orchestrator.md`, then only its current-stage pack | stage-specific Skills, tools, or sequential roles |
| Debug bug or incident | Recovery workflow | `quality-gates.md`, `learning-system.md`; add recovery reference when available | browser/API smoke, logs, incident review |
| UI or browser-visible change | UI verification | `quality-gates.md`, `tool-adapters.md`, project profile | Browser, Playwright, screenshots |
| Multi-agent execution | Role workflow | `agent-roles.md`, `quality-gates.md` | subagent tools, worktrees, file ownership reference when available |
| Release or migration | Release workflow | `quality-gates.md`; add release reference when available | CI, deployment, smoke, rollback |
| Add or evaluate tool adapter | Adapter workflow | `tool-adapters.md`, `project-profile.md`, `benchmark-audit.md` for GSE changes | MCP, LSP, browser, model routing |
| Record reusable lesson | Learning workflow | `learning-system.md` | learning records |

## Level Rules

Lite:

- Use when the task is small, local, low-risk, and independently verifiable.
- Keep artifacts minimal: outcome, scope, acceptance, evidence, next action.
- Do not create a change folder unless it prevents confusion.

Standard:

- Use for user-visible behavior, API/state changes, multi-file edits, project setup, or GSE reference/script changes.
- Bind to goal map or current slice.
- Record evidence in `.gse/evidence/` or the project evidence log.

Enterprise:

- Use for cross-module architecture, release, migration, security, multi-agent execution, compliance, or long-running productization.
- Require explicit gates for risk, rollback, ownership, verification, and learning.

## Tool Routing Rules

- Use `rg`/`rg --files` first for code and file discovery.
- Use LSP/index when verified or documented for the project.
- Use browser/Playwright for user-visible UI behavior.
- Use API smoke or focused tests for API/state behavior.
- Use GSE change packs when the change benefits from formal lifecycle artifacts.
- Use subagents only when real dispatch tools exist; otherwise execute roles sequentially and say so.
- Use markdown fallback when optional tools are unavailable.

## GSE Self-Development Route

When changing GSE itself:

1. Read `.gse/gse-design-master-plan.md`, `.gse/goal-map.md`, and `.gse/current-slice.md`.
2. Run or consult `scripts/audit-gse.mjs` to see current structural gaps.
3. If the change is non-trivial, update or create a GSE gap audit.
4. Prefer scripts/templates/gates for repeatable behavior.
5. Validate with focused smoke.
6. Update `.gse/evidence/YYYY-MM-DD.md`, goal map, and current slice.

## Anti-Routes

- Do not use GSE as a reason to ignore project rules.
- Do not load every reference file by default.
- Do not trust a stated phase when repository evidence shows an earlier required gate is missing.
- Do not treat optional tools as hard prerequisites.
- Do not claim a route succeeded without evidence.
- Do not keep adding prose when a script or template would make the behavior repeatable.
