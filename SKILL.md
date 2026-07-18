---
name: gse
description: Use GSE (Goal-Spec-Evidence Engineering) to help AI coding agents run long-lived software work across sessions. Read the repository state, continue the current functional Slice, preserve evidence boundaries, and record the next action without relying on chat history.
---

# GSE

GSE is a portable engineering Skill for AI coding agents. It gives an agent a durable project workspace, a risk-scaled workflow, bounded continuation, and explicit evidence levels.

```text
Goal -> Spec -> Execute -> Evidence -> Learn
```

GSE is not a host, plugin, MCP server, task manager, or hosted service. The host remains responsible for its own conversation, task, worker, and Goal lifecycle.

## When to use GSE

Use GSE when work will continue across sessions, when more than one agent or contributor shares a repository, or when a change needs explicit scope, acceptance, and proof. For a one-line edit or disposable experiment, use the host's lightest path instead.

## First read in a target project

A new or resumed agent must establish context from the repository, not from an earlier conversation:

1. Read `.gse/state.json`.
2. Read `.gse/current-slice.md`.
3. Read the evidence files named by `lastEvidence`.
4. Read `.gse/project-profile.md` and the applicable quality gates.
5. Run the portable continuation route:

```bash
node <gse-root>/scripts/run-gse-command.mjs \
  --target <project-root> \
  --command "/gse continue" \
  --json --compact
```

Use the packet's `currentSlice`, `functionalSlice`, `taskRouting`, `recommendedAction`, and `claim boundary` as the active contract. A completed Slice is not automatically a completed Goal.

## Functional Slice rule

A Slice is one complete, runnable, independently verifiable feature outcome. It is not merely a type change, call-site change, test-only change, resolver change, state flip, documentation change, or handoff.

Every active Slice must state:

- `outcome`
- `scope`
- `nonGoals`
- `acceptance`
- `proofBoundary`
- `evidenceMatrix`
- `risks`
- one explicit `nextAction`

Multiple Slices stay under the same approved top-level Plan Unit unless the continuation packet requires a rollover or an owner decision.

## Portable continuation and host boundaries

GSE can recommend the next bounded action and evaluate portable task admission. It does not create or dispatch host tasks and does not infer missing host capabilities.

Keep these claims separate:

```text
result -> verified -> accepted
```

- `result`: an artifact exists or a command ran.
- `verified`: focused checks prove the behavior in the current environment.
- `accepted`: an owner, CI system, registry, catalog, release gate, or other external authority accepted the result.

Missing host telemetry is `unknown` or `unavailable`. Local validation does not prove native slash-command support, worker dispatch, registry publication, catalog inclusion, or public acceptance.

## Install and discover GSE

### GitHub source

The canonical source is the public GitHub repository:

```text
https://github.com/275005746/gse
```

The root `SKILL.md` is the agent entrypoint. A Skill directory may index this repository by its GitHub URL; until a real listing or index record exists, directory inclusion remains `external-required`.

### Install as an Agent Skill

Clone or download the repository, then point the host at the checked-out directory containing `SKILL.md`:

```bash
git clone https://github.com/275005746/gse.git
```

The host-specific installation location is controlled by the host. Do not assume that a `.claude/`, `.codex/`, or other native directory exists or that a generated pointer proves runtime support.

### Install the CLI from npm

```bash
npm install -g @t275005746/gse
gse status --target .
```

Node.js 18 or newer is required. The npm package is a CLI distribution channel; npm publication does not by itself prove Skill-directory indexing.

## Initialize and continue a project

```bash
gse init --target .
gse status --target . --json
gse continue --target . --json --compact
```

Use an explicit mode only when the project owner needs it:

```bash
node <gse-root>/scripts/init-project.mjs --target <project-root> --mode lite
node <gse-root>/scripts/init-project.mjs --target <project-root> --mode standard
node <gse-root>/scripts/init-project.mjs --target <project-root> --mode enterprise
```

Initialization is conservative and preserves existing project documents.

## Core workflow

1. Discover the repository, real commands, current stage, and risks.
2. Select one coherent functional Slice under a top-level Plan Unit.
3. Specify scope, acceptance, proof, and non-goals.
4. Implement the Slice.
5. Run the narrowest check that proves the changed behavior.
6. Record evidence and update the portable state.
7. Continue with the next Slice or stop for an owner decision.
8. Capture reusable learning only when it improves future work.

A handoff is complete only when the next action is explicit and another session can resume from `.gse/` without the previous chat.

## Common commands

```bash
gse status --target .
gse continue --target . --json --compact
gse stage --target . --intent "deliver the next verified Slice"
gse doctor --target .
gse acceptance --target .
gse close --target .
```

Portable hosts may use the same semantics through `/gse` commands such as `/gse continue`. Route command-style usage through the complete command contract in [`references/commands.md`](references/commands.md).

## Verification

For GSE development:

```bash
node scripts/audit-agent-entrypoint.mjs --root . --json
node scripts/audit-project-capability-registry.mjs --root . --target . --json
node scripts/validate-gse.mjs --root . --profile lite --json
git diff --check
```

For a target project, use the smallest validation profile that proves the current claim. Use `references/quality-gates.md` before closing a Slice.

## Documentation map

- [`README.md`](README.md) and [`README.zh-CN.md`](README.zh-CN.md): human-facing discovery, installation, and workflow overviews.
- [`AGENTS.md`](AGENTS.md): repository entry contract for new and resumed agents.
- [`references/operating-model.md`](references/operating-model.md): GSE model and lifecycle.
- [`references/stage-orchestrator.md`](references/stage-orchestrator.md): meaningful-work stage detection and progressive disclosure.
- [`references/task-levels.md`](references/task-levels.md): risk-scaled task levels.
- [`references/context-orchestration.md`](references/context-orchestration.md): bounded context and retention.
- [`references/quality-gates.md`](references/quality-gates.md): evidence and close gates.
- [`references/marketplace-discovery.md`](references/marketplace-discovery.md): discovery metadata and external-acceptance boundaries.
- [`references/packaging.md`](references/packaging.md): package, install, and distribution evidence.
- [`references/public-release.md`](references/public-release.md): public metadata, owner decisions, and channel boundaries.
- `scripts/record-public-release.mjs`: record the owner-controlled public release decision.
- `scripts/generate-release-status-manifest.mjs`: regenerate the canonical release status manifest from authoritative audits.
- `scripts/generate-owner-external-gate-kit.mjs` and `scripts/audit-owner-external-gate-kit.mjs`: generate and verify the bounded handoff kit for remaining owner/external gates.

## License

MIT. See [`LICENSE`](LICENSE).
