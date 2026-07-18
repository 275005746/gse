# GSE Goal Map

Updated: 2026-07-19

## North Star

GSE is a portable Goal-Spec-Evidence Engineering workflow for long-running agent-assisted software projects. The canonical product plan is `.gse/gse-design-master-plan.md`.

## Current Focus

- Priority: P0
- Active slice: GSE-172 cross-session entrypoint is verified for local engineering.
- Next action: select the next independently verifiable functional Slice under the same top-level Plan Unit; keep external acceptance owner-gated.

## Goal Nodes

| ID | Goal | Status | Priority | Evidence | Next Slice |
|---|---|---|---|---|---|
| GSE-001 | Define the portable Goal-Spec-Evidence operating model | verified | P0 | `README.md`, `README.zh-CN.md`, `SKILL.md`, `references/operating-model.md`, `references/evidence-taxonomy.md`, `references/commands.md` | Keep public docs aligned with 1.0.0 |
| GSE-002 | Provide project bootstrap, profile, and quality gates | verified | `scripts/init-project.mjs`, `scripts/discover-project-profile.mjs`, `.gse/project-profile.md`, `.gse/quality-gates.md`, `.gse/state.json` | Preserve scaffold compatibility |
| GSE-003 | Provide native Goal/Spec/change execution packs | verified | `scripts/init-change.mjs`, `scripts/audit-change-system.mjs`, `assets/templates/`, `references/spec-workflow.md` | Keep templates small and verifiable |
| GSE-004 | Provide portable command execution | verified | `scripts/run-gse-command.mjs`, `scripts/gse.mjs`, `scripts/audit-command-execution.mjs`, `references/commands.md` | Preserve host-neutral command semantics |
| GSE-005 | Provide stage orchestration and progressive disclosure | verified | `references/stage-orchestrator.md`, `scripts/detect-project-stage.mjs`, `scripts/audit-stage-orchestrator.mjs` | Keep context packs bounded |
| GSE-006 | Provide natural-language goal discovery and Goal/Spec promotion | verified | `scripts/generate-goal-discovery-packet.mjs`, `scripts/promote-goal-discovery.mjs`, `scripts/audit-goal-discovery.mjs` | Use real project goals for future hardening |
| GSE-007 | Provide validation profiles and CI-ready checks | verified | `scripts/validate-gse.mjs`, `scripts/run-validation-profile.mjs`, `.github/workflows/validate-gse.yml`, `package.json` | Keep Lite validation suitable for routine CI |
| GSE-008 | Productize v1.0 execution-state workflow | verified | `scripts/audit-v1-target-validation.mjs`, `scripts/audit-target-project.mjs`, `scripts/audit-close-gate.mjs`, `.gse/state.json`, `.gse/current-slice.md` | Preserve final readiness boundaries |
| GSE-009 | Provide repository agent entrypoint and capability registries | verified | `AGENTS.md`, `.codex/gse-adapter.md`, `.claude/gse-adapter.md`, `.gse/skills/README.md`, `.gse/plugins/README.md`, `.gse/hooks/README.md`, `.gse/mcp/README.md`, `.gse/lsp/README.md`, `scripts/audit-agent-entrypoint.mjs`, `scripts/audit-project-capability-registry.mjs` | Keep capability statuses honest |
| GSE-010 | Add budget-aware context health and agent routing | verified | `references/context-orchestration.md`, `scripts/context-health.mjs`, `scripts/audit-context-health.mjs`, `scripts/generate-context-checkpoint.mjs`, `scripts/audit-context-orchestrator.mjs` | Keep rollover advice portable and bounded |
| GSE-011 | Provide release, package, and public readiness workflows | verified | `scripts/package-gse.mjs`, `scripts/install-gse.mjs`, `scripts/generate-release-bundle.mjs`, `scripts/audit-release-bundle.mjs`, `references/packaging.md`, `references/public-release.md`, `references/final-readiness.md` | Publish clean 1.0.0 release artifacts |
| GSE-012 | Provide learning, drift, maintenance, and installed-copy sync checks | verified | `scripts/record-learning.mjs`, `scripts/audit-learning-system.mjs`, `scripts/audit-learning-drift.mjs`, `scripts/generate-maintenance-snapshot.mjs`, `scripts/audit-installed-sync.mjs` | Keep maintenance snapshots current |
| GSE-170 | Provide portable task admission and bounded handoff routing | verified | `scripts/task-admission.mjs`, `scripts/audit-task-admission.mjs`, `scripts/generate-continue-packet.mjs`, `scripts/audit-context-orchestrator.mjs` | Preserve stable IDs, lifecycle blocks, and no-fake-dispatch boundaries |
| GSE-171 | Repair compact continuation baseline and evidence classification | verified | `scripts/audit-continue-preflight.mjs`, `scripts/generate-continue-packet.mjs`, `.gse/current-slice.md`, `.gse/state.json` | Select the next functional Slice under the same Plan Unit |
| GSE-172 | Make GSE usable across independent sessions through a portable entrypoint and bounded handoff contract | verified | `AGENTS.md`, `scripts/audit-agent-entrypoint.mjs`, `.gse/current-slice.md`, `.gse/state.json`, `.gse/evidence/2026-07-19.md` | Select the next functional Slice under the same Plan Unit |

## Claim Boundaries

- Native slash-command support is an optional host-adapter claim and needs host invocation evidence.
- Subagent, browser, MCP, LSP, CI, and host UI support are optional capabilities and must be recorded as verified before they are claimed.
- Local validation proves the package and workflow checks, not arbitrary project success.
- Portable continuation, task admission, and bounded handoff do not prove host task creation, worker dispatch, Goal completion, or external acceptance.
