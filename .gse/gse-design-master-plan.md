# GSE Design Master Plan

Updated: 2026-07-16

This is the canonical design plan for GSE itself. GSE is a portable Goal-Spec-Evidence Engineering workflow for long-running agent-assisted software projects.

## North Star

GSE helps an agent keep long-running work controlled through explicit goals, scoped specs, bounded execution, evidence gates, and reusable learning. It stays portable across agent hosts by keeping `.gse/` as the project-local source of truth and treating host integrations as optional adapters.

## Product Positioning

GSE is a workflow skill, project scaffold, command runner, validation suite, and evidence model. It is designed for teams and individual builders who need agent work to remain auditable across long sessions, context pressure, handoffs, and release decisions.

## Design Principles

1. Project rules override GSE defaults.
2. Keep prerequisites minimal; optional tools enhance the workflow but must not block it.
3. Repeatable behavior should become scripts, templates, or gates.
4. Separate verified facts, design judgments, assumptions, and open questions.
5. Scale by task level: Lite, Standard, and Enterprise.
6. Preserve future-agent readability through short entrypoints and local state.
7. Never claim tool availability, host-native support, delegated execution, tests, or evidence without proof.
8. Prefer vertical slices with focused verification over broad unverified plans.
9. Keep context usage bounded with compact packets, checkpoints, and rollover advice.
10. Develop GSE itself with the same Goal-Spec-Evidence discipline.

## Target Capability Map

### Skill Core

GSE exposes a concise `SKILL.md`, bilingual READMEs, command references, reusable templates, host-neutral scripts, and validation profiles. The public entrypoints explain what GSE does, how to install or run it, and which claims require evidence.

### Project Bootstrap And Profile

GSE initializes `.gse/` project scaffolds, records project standards, discovers project shape, and keeps canonical product goals separate from the GSE execution projection.

### Goal And Spec System

GSE turns intent into scoped work using goal maps, change briefs, specs, designs, tasks, evidence logs, reviews, execution-quality packs, and close gates.

### Command And Stage Orchestration

GSE provides host-neutral `/gse` command semantics for status, continue, stage, discover, doctor, repair, package, release, public-release, maintenance, learning, and close flows.

### Context Orchestration

GSE detects context pressure from available host evidence, classifies green/yellow/orange/red states, recommends compact output or rollover, and generates bounded checkpoint packs. Portable scripts can advise and write handoff artifacts; they cannot compact a live host session or create a new host task by themselves.

### Tool And Adapter Layer

GSE tracks host and tool capabilities with explicit statuses: verified, documented, unknown, or unavailable. Optional adapters include host command pointers, browser/UI evidence, MCP, LSP, CI, subagent routing, and host UI/runtime invocation records.

### Multi-Agent And Role Execution

GSE supports role definitions, dispatch packets, file ownership, bounded result capsules, and no-fake-delegation rules. Real delegated execution remains a host capability and must be proven separately.

### Verification And Evidence Gates

GSE separates `result`, `verified`, and `accepted` evidence. It provides evidence templates, evidence-level audits, review queues, UI/browser downgrade policy, public acceptance records, release status manifests, and final readiness checks.

### Release, Distribution, And Maintenance

GSE includes packaging, install, validation, signing, release bundle, public release checklist, repository readiness, CI readiness, security contact, repository settings, channel publication, maintenance snapshot, and installed-copy sync workflows.

### Learning And Drift Control

GSE records reusable lessons, detects learning promotion candidates, surfaces drift, and keeps recurring maintenance checks visible without turning optional host claims into core blockers.

## Current 1.0 Baseline

GSE 1.0.0 is the public baseline. The baseline includes:

- Portable command execution through `scripts/run-gse-command.mjs` and `scripts/gse.mjs`.
- Natural-language goal discovery and explicit Goal/Spec promotion.
- Stage orchestration and progressive disclosure.
- Context health detection, budget-aware routing, checkpoints, and rollover advice.
- Project capability registries for skills, plugins, hooks, MCP, LSP, and host capabilities.
- Lite validation for routine CI and release-focused validation for distribution-sensitive claims.
- Bilingual public documentation and open-source collaboration files.

## Current Priority

Keep GSE 1.0.0 verifiable as a clean public release. The active maintenance priority is to preserve short-entry continuation, context-health routing, evidence boundaries, and public release hygiene without reintroducing old release history into the public repository.

## Acceptance For Future GSE Development

A GSE change is complete only when:

- It maps to a clear GSE goal.
- It has outcome, scope, acceptance, evidence, risk, and next action.
- It changes the smallest useful set of files.
- It has focused validation evidence.
- It preserves optional adapter boundaries.
- It updates the relevant local state or evidence artifacts when the change affects them.
