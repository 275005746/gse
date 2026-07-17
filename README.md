# GSE

English | [简体中文](README.zh-CN.md)

**Goal-Spec-Evidence Engineering for long-running AI-assisted software development.**

GSE is an engineering control layer for coding agents. It keeps product intent, the current implementation slice, verification evidence, and the next action in a small project-local workspace so work can continue across sessions without relying on chat history.

```text
Goal -> Spec -> Execute -> Evidence -> Learn
```

GSE does not replace Claude Code, Codex, or another coding host. It gives the host a portable operating model, machine-readable state, focused validation routes, and honest evidence boundaries.

GSE is officially maintained by [GateHub](https://gatehub.top/). GateHub also provides an AI model relay service, model access, and project support for developers and teams using GSE.

## Why GSE

Agent-assisted development becomes unreliable when:

- requirements and decisions disappear into long conversations;
- the agent starts implementing before the outcome and acceptance criteria are clear;
- every continuation creates another task or repeats repository discovery;
- large logs and nested reports consume the coordinator context;
- a recommended worker is mistaken for a worker that was actually dispatched;
- “the command ran” is reported as “the feature is complete”;
- local checks are used to claim CI, marketplace, registry, or production acceptance.

GSE addresses these problems by keeping durable intent in the repository, selecting one bounded plan unit at a time, separating execution from evidence, and making external claims remain unaccepted until real external evidence exists.

## What GSE Provides

### Durable project context

GSE creates a `.gse/` workspace that can hold:

- the current goal and active slice;
- project-specific commands, standards, and constraints;
- change specifications and acceptance criteria;
- focused quality gates;
- evidence records, handoffs, risks, and next actions.

The workspace is designed to be read by future sessions and different agent hosts. It complements existing roadmaps, architecture documents, and issue trackers instead of replacing them.

### Risk-scaled workflow

GSE keeps small tasks light and applies stronger controls only when the risk requires them.

| Level | Use it for | Typical proof |
|---|---|---|
| `lite` | Small fixes, scripts, documentation, narrow refactors | One focused check or direct evidence |
| `standard` | User-visible features, API or state changes, multi-file behavior | Focused tests plus an integration, API, or UI smoke when needed |
| `enterprise` | Security, migrations, public contracts, releases, architecture, long-running coordination | Risk-specific hard gates, review, rollback, and accepted evidence |

Choosing `enterprise` does not make every change heavyweight. Routine work still gets focused checks; review, rollback planning, and hard gates are added when release, security, migration, or similar risks call for them.

### Stable task routing

GSE distinguishes a **top-level plan unit** from the internal actions needed to complete it.

- A selected new slice has a stable `topLevelPlanUnitId` and `taskCreationIntent: create`.
- Repeated continuation of the same active slice reports `taskCreationIntent: reuse`.
- Reads, searches, tests, reviews, retries, repairs, evidence collection, and context rollover remain internal actions.
- Alternative next-slice candidates are advisory and cannot independently create host tasks.

This makes repeated `gse continue` calls idempotent at the planning boundary while preserving legitimate task creation for genuinely new work.

### Bounded context and compact continuation

Long sessions can request a compact machine-readable continuation packet:

```bash
gse continue --target . --json --compact
```

The compact packet contains the active slice, routing intent, selected candidate, first steps, focused commands, context health, worker recommendation, risks, and a bounded prompt. GSE reports an estimated output budget and avoids nesting the full child report inside another JSON envelope.

GSE can bound its own packets. It cannot guarantee the total token cost of the host, hidden system context, external tools, or independently executed agents.

### Controlled multi-agent use

GSE defines coordinator, planner, locator, builder, verifier, reviewer, QA, evidence, and release responsibilities. These are accountability roles, not proof that real subagents were launched.

A real worker is recommended only when the work is bounded, independent, explicitly owned, and benefits from parallel execution. Dispatch remains `not-observed` until the host records actual execution evidence. If the host has no subagent capability, the same roles can run sequentially in the main session.

### Evidence before completion

GSE uses three evidence levels:

```text
result -> verified -> accepted
```

- `result`: an artifact exists or a command ran;
- `verified`: focused checks prove behavior in the current environment;
- `accepted`: an owner, CI gate, review gate, release gate, product gate, or external system accepts the verified result.

Local success cannot silently become a public, production, marketplace, registry, or cross-host claim.

## Quick Start

### Install from npm

```bash
npm install -g @t275005746/gse
gse status --target .
```

Node.js 18 or newer is required.

### Initialize a project

```bash
gse init --target .
```

GSE selects a conservative mode automatically. You can also choose one explicitly:

```bash
node scripts/init-project.mjs --target . --mode lite
node scripts/init-project.mjs --target . --mode standard
node scripts/init-project.mjs --target . --mode enterprise
```

Initialization is additive. Existing product, architecture, and engineering documents stay where they are.

### Inspect current state

```bash
gse status --target . --json
```

### Continue the current work

```bash
gse continue --target .
gse continue --target . --json --compact
```

### Run focused validation

```bash
node scripts/run-validation-profile.mjs --target . --profile lite
```

Use `standard`, `enterprise`, or `release` only when the change or claim requires that level of evidence.

## Typical Workflow

1. **Discover** the project, its real commands, current state, and unresolved risks.
2. **Select** one coherent outcome as the active plan unit.
3. **Specify** scope, acceptance criteria, evidence, and stop conditions in proportion to risk.
4. **Execute** the smallest implementation slice that proves the outcome.
5. **Verify** with the narrowest check that covers the changed behavior.
6. **Review** only at the boundary justified by the risk.
7. **Record evidence** and either close the slice, repair it, or select the next one.
8. **Learn** from reusable failures without turning every incident into more process.

A normal continuation should answer:

```text
Outcome:
Scope:
Acceptance:
Evidence:
Next action:
```

## Project Workspace

A typical project starts with:

```text
.gse/
  README.md
  state.json
  project-profile.md
  goal-map.md
  quality-gates.md
  changes/
  evidence/
  handoffs/
  templates/
```

Not every project needs every file. GSE scaffolding degrades by project size and should not overwrite mature repository conventions.

## Command Overview

Common CLI routes:

```bash
gse status --target .
gse continue --target .
gse continue --target . --json --compact
gse stage --target . --intent "ship the next verified slice"
gse doctor --target .
gse acceptance --target .
gse close --target .
```

Portable command semantics are also available to hosts that invoke GSE as a skill:

```text
/gse init       /gse adopt      /gse continue
/gse stage      /gse status     /gse doctor
/gse change     /gse verify     /gse acceptance
/gse learn      /gse audit      /gse close
/gse package    /gse install    /gse release
```

`close` is a readiness check, not permission to fabricate evidence or bypass a failed gate.

For the complete command and script index, see [`references/commands.md`](references/commands.md) and [`references/script-index.md`](references/script-index.md).

## Honest Boundaries

GSE can:

- preserve project-local engineering context;
- route work by risk and current stage;
- produce stable task-routing metadata;
- bound its compact continuation output;
- prepare worker packets and role assignments;
- run local audits and record evidence;
- detect missing owner or external acceptance.

GSE cannot by itself:

- force a host to create, reuse, or dispatch tasks correctly;
- prove that a subagent ran without host evidence;
- compact a host's private live conversation state;
- guarantee total model or tool token consumption;
- replace owner approval, CI, registry, marketplace, or production evidence;
- turn a local verification into external acceptance.

These boundaries are part of the engineering model, not missing success messages.

## Use GSE When

GSE is useful when:

- a project will continue across many agent sessions;
- several agents, models, tools, or human contributors share the work;
- changes need explicit scope and acceptance criteria;
- releases, public contracts, security, or migrations require auditable evidence;
- context cost and repeated orchestration are becoming hard to control;
- you want agents to say what is verified and what is still only claimed.

For a one-line edit or disposable experiment, use the lightest path or no scaffold at all.

## Documentation

- [`SKILL.md`](SKILL.md): agent entrypoint and routing rules
- [`references/operating-model.md`](references/operating-model.md): core operating model
- [`references/task-levels.md`](references/task-levels.md): risk-scaled task levels
- [`references/context-orchestration.md`](references/context-orchestration.md): context budgets and task reuse
- [`references/agent-roles.md`](references/agent-roles.md): role and dispatch boundaries
- [`references/quality-gates.md`](references/quality-gates.md): verification and completion gates
- [`references/release.md`](references/release.md): release workflow and claim boundaries

## Packaging and Development

Validate a checked-out copy:

```bash
node scripts/validate-gse.mjs --root . --profile lite --json
```

Package and install a local copy:

```bash
node scripts/package-gse.mjs --root . --out <package-dir> --label <release-label>
node scripts/install-gse.mjs --source <package-dir> --target <skill-dir>
```

Release bundles, integrity manifests, signing, and trust records are documented in [`references/packaging.md`](references/packaging.md).

## Official Services

[GateHub](https://gatehub.top/) is the official maintenance and support platform for GSE. It also provides an AI model relay service, model access, GSE support, and project collaboration services.

## License

MIT. See [`LICENSE`](LICENSE).
