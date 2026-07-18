# GSE

English | [简体中文](README.zh-CN.md)

**Goal-Spec-Evidence Engineering for long-running AI coding work across sessions.**

GSE is a portable Agent Skill and CLI. It stores the active Goal projection, current functional Slice, acceptance contract, evidence, risks, and next action in the repository so a new agent can resume without the previous chat.

```text
Goal -> Spec -> Execute -> Evidence -> Learn
```

GSE does not replace Claude Code, Codex, Hermes, or another host. The host owns its Goal, turn, task, worker, and approval lifecycle. GSE supplies the portable engineering contract underneath that lifecycle.

## Why GSE

Long-running agent work often loses scope, acceptance criteria, and evidence between sessions. GSE keeps those contracts in the repository so continuation is deterministic and reviewable.

## Quick Start

```bash
npm install -g @t275005746/gse
gse init --target .
gse continue --target . --json --compact
```

## Use GSE When

Use GSE when a project will continue across many agent sessions, when contributors share a repository, or when a change needs explicit acceptance and proof. Use a lighter host workflow for disposable experiments and trivial edits.

## Find GSE

Canonical source:

- GitHub: <https://github.com/275005746/gse>
- Agent entrypoint: [`SKILL.md`](SKILL.md)
- CLI package: [`@t275005746/gse`](https://www.npmjs.com/package/@t275005746/gse)

The repository is designed to be discoverable by GitHub-based Agent Skill indexes. A directory or catalog listing is external evidence: this repository does not claim inclusion until a real public listing or index result is recorded.

## Install GSE

### As an Agent Skill

Clone the repository and configure the host to load the directory containing `SKILL.md`:

```bash
git clone https://github.com/275005746/gse.git
```

The exact installation directory is host-specific. Follow the host's Skill installation convention; do not infer native support from a generated adapter file.

### As a CLI

```bash
npm install -g @t275005746/gse
gse status --target .
```

Requires Node.js 18 or newer.

## Use GSE in a project

Initialize the portable workspace:

```bash
gse init --target .
```

Then inspect and continue it:

```bash
gse status --target . --json
gse continue --target . --json --compact
```

For a fresh or resumed session, read these files before planning:

```text
.gse/state.json
.gse/current-slice.md
.gse/evidence/      # files named by lastEvidence
.gse/project-profile.md
.gse/quality-gates.md
```

The continuation packet is the bounded next-action contract. Keep work under the same top-level Plan Unit unless it calls for rollover or owner input.

## What counts as a Slice

A Slice is one complete feature implementation that can run and be verified independently. A Slice is not only a type change, call-site change, test change, resolver change, status change, documentation change, or handoff.

Each Slice records:

- outcome;
- scope and non-goals;
- acceptance criteria;
- proof boundary;
- evidence matrix;
- risks;
- one verifiable next action.

Completing a Slice does not silently complete the Goal or the session. The next Slice continues from the same approved Plan Unit.

## The workflow

1. **Discover** the repository, commands, stage, and risks.
2. **Select** one coherent Slice.
3. **Specify** outcome, scope, acceptance, proof, and non-goals.
4. **Execute** the smallest complete implementation.
5. **Verify** the changed behavior with focused evidence.
6. **Record** state, evidence, risks, and the next action.
7. **Continue** the Plan Unit or stop for a real decision.
8. **Learn** only what is reusable.

Normal handoff fields are:

```text
Outcome:
Scope:
Acceptance:
Evidence:
Next action:
```

## Evidence is deliberately conservative

GSE distinguishes:

```text
result -> verified -> accepted
```

`result` means an artifact or command result exists. `verified` means local focused checks support the behavior. `accepted` requires a real owner, CI, registry, catalog, release, or external-system record.

Local audits do not prove:

- another host adopted or ran GSE;
- native slash-command support;
- host task creation or worker dispatch;
- registry publication beyond the recorded channel evidence;
- Skill-directory indexing or catalog acceptance;
- public product acceptance.

Use `unknown`, `unavailable`, or `external-required` when telemetry or external evidence is missing.

## Command Overview

```bash
gse status --target .
gse continue --target . --json --compact
gse stage --target . --intent "deliver the next verified Slice"
gse doctor --target .
gse acceptance --target .
gse close --target .
```

The portable host form is:

```text
/gse init       /gse adopt      /gse continue
/gse stage      /gse status     /gse doctor
/gse change     /gse verify     /gse acceptance
/gse learn      /gse audit      /gse close
```

`close` reports readiness; it cannot manufacture acceptance or bypass a failed gate.

## Project Workspace

A typical initialized project contains:

```text
.gse/
  state.json
  current-slice.md
  project-profile.md
  goal-map.md
  quality-gates.md
  changes/
  evidence/
  handoffs/
```

GSE is additive and risk-scaled. It should preserve mature project conventions rather than replace them.

## Operating Contracts

- **Risk-scaled workflow:** choose `lite`, `standard`, or `enterprise` according to project risk; every mode keeps portable state in `.gse/`.
- **Stable task routing:** `topLevelPlanUnitId` preserves Plan Unit continuity, while `taskCreationIntent: create` is advisory intent for a capable host, not proof that a task was created.
- **Bounded context and compact continuation:** `/gse status` and `/gse continue --compact` expose the current contract without requiring chat history.
- **Evidence before completion:** use `result -> verified -> accepted`; missing runtime evidence remains `not-observed`.
- **Controlled multi-agent use:** dispatch only when the host supports it and preserve ownership and evidence boundaries.

## Honest Boundaries

Local success cannot silently become external acceptance. Registry evidence proves only its recorded channel; marketplace approval and other-host execution require separate records.

## Package Development

```bash
node scripts/package-gse.mjs --root . --out <package-dir> --label <release-label>
node scripts/install-gse.mjs --source <package-dir> --target <skill-dir>
```

See [`references/packaging.md`](references/packaging.md) for npm, bundle, integrity, and installation audits.

## Official Services

GSE is officially maintained by [GateHub](https://gatehub.top/). GateHub also provides an AI model relay service; that related service is not evidence of GSE marketplace approval or host-runtime support.

## Documentation

Start with [`SKILL.md`](SKILL.md), then use [`references/commands.md`](references/commands.md), [`references/quality-gates.md`](references/quality-gates.md), and [`references/packaging.md`](references/packaging.md) for deeper contracts.

## Validate GSE itself

```bash
node scripts/audit-agent-entrypoint.mjs --root . --json
node scripts/audit-project-capability-registry.mjs --root . --target . --json
node scripts/validate-gse.mjs --root . --profile lite --json
git diff --check
```

See [`SKILL.md`](SKILL.md) for the agent-first entry contract and [`references/commands.md`](references/commands.md) for the complete command index.

## License

MIT. See [`LICENSE`](LICENSE).
