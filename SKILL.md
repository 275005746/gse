---
name: gse
description: Use GSE (Goal-Spec-Evidence Engineering) to initialize, operate, audit, or improve a commercial-grade agentic engineering workflow for long-running software projects. Use when starting or standardizing a project, planning complex work, coordinating multiple coding agents, creating goal maps/specs/evidence gates, setting project quality gates, or converting ad hoc development into a durable workflow across Codex, Claude Code, Hermes, WorkBuddy, and similar agents.
---

# GSE - Goal-Spec-Evidence Engineering

GSE is a lightweight, tool-adaptive engineering operating model for AI-agent-assisted software projects.

Core loop:

```text
Goal -> Spec -> Execute -> Evidence -> Learn
```

Default stance: keep the workflow as light as the task allows and as rigorous as the risk requires.

## Start Here

1. Use `references/router.md` to select the GSE route.
2. For meaningful project work, use `references/stage-orchestrator.md` to detect the current stage and load only that stage's context pack. Use `scripts/detect-project-stage.mjs` as deterministic advice when repository state is unclear.
3. Classify the task level using `references/task-levels.md`.
4. If the user writes `/gse ...` or `gse: ...`, route through `references/commands.md`.
5. For human-facing setup or overview, use `README.md` and `README.zh-CN.md`.
6. If the project has `.gse/README.md`, read it before making changes.
7. If the project has `.gse/state.json`, read it as the machine-readable project phase, current slice, tool status, last evidence, and residual-risk summary.
8. If the project lacks `.gse/`, offer or run `node <skill>/scripts/init-project.mjs --target <project-root>`.
   The default is `--mode auto`; use `--mode lite`, `--mode standard`, or `--mode enterprise` when the owner wants a specific scaffold.
9. Read or create `.gse/project-profile.md` for project-specific standards, commands, tools, and permissions.
10. For project adoption drift, run `node <skill>/scripts/audit-target-project.mjs --target <project-root>` before claiming a target project is GSE-ready.
11. Use `references/operating-model.md` for the workflow and `references/tool-adapters.md` for optional tool routing.
12. Use `references/host-adapters.md` when host-specific folders, hooks, skills, MCP, subagents, or runtime adapters are involved.
13. For GSE improvements, run `references/benchmark-audit.md` to proactively find missing capability coverage.
14. For GSE self-development capability work, use `references/capability-execution-matrix.md` before implementation; if the capability row is missing, add or update the row first.
15. Before declaring GSE skill changes complete, run the lightest validation profile that proves the claim, for example `node <skill>/scripts/validate-gse.mjs --root <skill> --profile lite --json`; reserve the default/full validator for release or distribution-sensitive claims.
16. Before declaring completion, check `references/quality-gates.md`.
17. Record reusable lessons using `references/learning-system.md`.

Portable command helpers:

- Short CLI wrapper: `node <skill>/scripts/gse.mjs status --target <project-root> --json`
- Short continuation packet: `node <skill>/scripts/generate-continue-packet.mjs --target <project-root> --brief|--profile default|--doctor`
- Current-stage advice: `node <skill>/scripts/run-gse-command.mjs --target <project-root> --command "/gse stage <intent>" --json`
- Goal discovery packet: `node <skill>/scripts/generate-goal-discovery-packet.mjs --target <project-root> --intent "<goal text>" --json`
- Goal discovery route: `node <skill>/scripts/run-gse-command.mjs --target <project-root> --command "/gse discover <intent>" --json`
- Portable command runner: `node <skill>/scripts/run-gse-command.mjs --target <project-root> --command "/gse continue"`
- State/evidence repair doctor: `node <skill>/scripts/run-gse-command.mjs --target <project-root> --command "/gse repair" --json`
- Direct repair audit: `node <skill>/scripts/audit-state-repair.mjs --target <project-root> --json`
- Document hygiene audit: `node <skill>/scripts/audit-document-hygiene.mjs --target <project-root> --json`
- Canonical goal source compaction dry-run: `node <skill>/scripts/compact-canonical-goal-source.mjs --target <project-root> --dry-run --json`
- Validation profile runner: `node <skill>/scripts/run-validation-profile.mjs --target <project-root> --profile lite|standard|enterprise|release`
- Consolidated validator with profile routing: `node <skill>/scripts/validate-gse.mjs --root <skill> --profile lite|standard|enterprise|release|full --json`
- Close readiness check: `node <skill>/scripts/audit-close-gate.mjs --target <project-root>`
- Project guard preflight: `node <skill>/scripts/audit-project-guards.mjs --target <project-root> --json`
- Capability execution matrix audit: `node <skill>/scripts/audit-capability-execution-matrix.mjs --root <skill> --json`
- Existing project state/index update: `node <skill>/scripts/update-project-state.mjs --target <project-root>`
- Change spec pack: `node <skill>/scripts/init-change.mjs --target <project-root> --change-id <id> --level lite|standard|enterprise`
- Release/owner routes: `/gse owner-actions" --json --compact`, `/gse probe --public-repo-url <url>`, `/gse package`, `/gse install`, and `/gse public-release`; details live in `references/commands.md` and `references/script-index.md`.
- Learning capture route: `node <skill>/scripts/record-learning.mjs` or `/gse learn --summary <lesson> --execute --json`
- Deep script index: `references/script-index.md`

## Required Questions Before Adding Process

For every new GSE artifact, rule, or gate, answer briefly:

- Is this step necessary for this task level?
- Can it be shorter?
- Can it be automated?
- Can it degrade by project scale?
- Is it friendly to future agents with limited context?
- Does it prevent a real failure or improve quality measurably?

If the answer is weak, defer the artifact or make it optional.

## Evidence Rules

- Do not state unverified tool behavior as fact. Label inferred behavior as an assumption.
- Prefer local tool help, installed skill docs, project files, official docs, and focused experiments as evidence.
- If a tool is unavailable, use the markdown fallback and say which enhancement was skipped.
- Do not require optional external workflow tools, subagents, LSP, or browser automation. Use optional tools only when available and appropriate.

## Minimal Outputs

For normal work, always keep these five fields visible:

```text
Outcome:
Scope:
Acceptance:
Evidence:
Next action:
```

For long-running projects, bind product intent to the project's canonical product goal source when one exists, and use `.gse/goal-map.md` as the GSE execution projection for current focus, slice ledger, evidence, risks, and next actions.

## Reference Routing

- Project bootstrap: `references/project-bootstrap.md`
- Command semantics: `references/commands.md`
- Project adoption recipes: `references/adoption-recipes.md`
- Validation profile runner: `scripts/run-validation-profile.mjs`, `scripts/audit-validation-profiles.mjs`
- Target project doctor: `scripts/audit-target-project.mjs`
- Route selection: `references/router.md`
- Stage detection and progressive disclosure: `references/stage-orchestrator.md`, `scripts/detect-project-stage.mjs`, `scripts/audit-stage-orchestrator.mjs`
- Goal discovery and Goal/Spec promotion: `references/commands.md`, `references/spec-workflow.md`, `scripts/generate-goal-discovery-packet.mjs`, `scripts/promote-goal-discovery.mjs`, `scripts/audit-goal-discovery.mjs`
- Context health and rollover: `references/context-orchestration.md`, `scripts/audit-context-health.mjs`, `scripts/generate-context-checkpoint.mjs`, `scripts/audit-context-orchestrator.mjs`
- Project-specific standards and tools: `references/project-profile.md`
- Project-local agent workspace: `references/project-agent-workspace.md`
- Host-specific adapters: `references/host-adapters.md`, `references/compatibility.md`
- GSE gap audit: `references/benchmark-audit.md`
- Capability execution matrix: `references/capability-execution-matrix.md`, `scripts/audit-capability-execution-matrix.mjs`
- Final form roadmap: `references/final-form-roadmap.md`, `scripts/audit-final-form-roadmap.mjs`
- Task level selection: `references/task-levels.md`
- Goal maps: `references/goal-map.md`
- Specs and change folders: `references/spec-workflow.md`
- Agent roles and ownership: `references/agent-roles.md`, `references/file-ownership.md`
- Tool acceleration and model routing: `references/tool-adapters.md`, `references/model-routing.md`
- Review protocol: `references/review.md`
- Architecture health scans: `references/architecture-health.md`
- Quality gates: `references/quality-gates.md`
- Domain quality gates: `references/domain-quality-gates.md`
- Release workflow: `references/release.md`
- Public release metadata: `references/public-release.md`
- Open-source defaults: `references/open-source-defaults.md`
- Community channels: `references/community-channels.md`
- Public release decision audit: `scripts/audit-public-release-decision.mjs`
- Public CI run: `scripts/record-public-ci-run.mjs`, `scripts/audit-public-ci-run.mjs`
- Public security contact: `scripts/record-public-security-contact.mjs`, `scripts/audit-public-security-contact.mjs`
- Public repository settings: `scripts/record-public-repository-settings.mjs`, `scripts/audit-public-repository-settings.mjs`
- Public channel publication: `scripts/record-public-channel-publication.mjs`, `scripts/audit-public-channel-publication.mjs`
- Public acceptance doctor: `scripts/audit-public-acceptance-readiness.mjs`
- Public external gate probe: `scripts/probe-public-external-gates.mjs`, `scripts/audit-public-external-gate-probe.mjs`
- Public acceptance handoff: `scripts/generate-public-acceptance-handoff.mjs`, `scripts/audit-public-acceptance-handoff.mjs`
- Owner/external gate kit: `scripts/generate-owner-external-gate-kit.mjs`, `scripts/audit-owner-external-gate-kit.mjs`
- Release status manifest: `scripts/generate-release-status-manifest.mjs`, `scripts/audit-release-status-manifest.mjs`
- Release owner action plan: `scripts/generate-release-owner-action-plan.mjs`, `scripts/audit-release-owner-action-plan.mjs`
- Release owner action plan drill: `scripts/audit-release-owner-action-plan-drill.mjs`
- Public release checklist: `scripts/generate-public-release-checklist.mjs`, `scripts/audit-public-release-checklist.mjs`
- Final-form progress report: `scripts/generate-final-form-progress-report.mjs`, `scripts/audit-final-form-progress-report.mjs`
- Packaging and maintenance: `references/packaging.md`, `references/maintenance-cadence.md`, `scripts/audit-maintenance-cadence.mjs`, `scripts/generate-maintenance-snapshot.mjs`, `scripts/audit-maintenance-snapshot.mjs`, `scripts/audit-installed-sync.mjs`, `scripts/record-session-sync.mjs`, `scripts/audit-session-sync.mjs`
- CI readiness: `.github/workflows/validate-gse.yml`, `scripts/audit-ci-readiness.mjs`
- Public collaboration templates: `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/`, `scripts/audit-public-collaboration-templates.mjs`
- Release trust and key custody: `references/release-trust.md`
- Marketplace discovery: `references/marketplace-discovery.md`
- Host UI invocation record: `assets/templates/host-ui-invocation-record.md`
- Host runtime invocation records: `scripts/record-host-invocation.mjs`, `scripts/audit-host-runtime-invocations.mjs`
- Host runtime invocation drill: `scripts/audit-host-runtime-invocation-drill.mjs`
- Host runtime evidence handoff: `scripts/generate-host-runtime-evidence-handoff.mjs`, `scripts/audit-host-runtime-evidence-handoff.mjs`
- Final readiness matrix: `references/final-readiness.md`, `scripts/audit-final-readiness.mjs`
- Final readiness promotion: `scripts/audit-final-readiness-promotion.mjs`
- Final acceptance packet: `scripts/generate-final-acceptance-packet.mjs`, `scripts/audit-final-acceptance-packet.mjs`
- Recovery and handoff: `references/recovery.md`
- Forward testing: `references/forward-test.md`
- Learning loop: `references/learning-system.md`
- Learning capture: `scripts/record-learning.mjs`, `scripts/audit-learning-system.mjs`
- Learning drift: `scripts/audit-learning-drift.mjs`
- Conservative evidence-level backfill: `scripts/backfill-evidence-levels.mjs`
- Historical evidence review queue: `scripts/audit-evidence-review-queue.mjs`
- UI/browser evidence policy: `scripts/audit-ui-browser-evidence-policy.mjs`
- Target hardening drills: `scripts/audit-target-hardening-drills.mjs`
- Project guards: `references/project-guards.md`, `scripts/audit-project-guards.mjs`
- Drift audit: `references/drift-audit.md`
- Design basis and source boundaries: `references/design-basis.md`
