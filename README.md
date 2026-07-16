# GSE

English | [简体中文](https://github.com/275005746/gse/blob/main/README.zh-CN.md)

Goal-Spec-Evidence Engineering for long-running agent-assisted software projects.

GSE gives coding agents and human teams a small project workspace for goals, specs, execution notes, evidence, and handoff. It keeps the next change clear, the proof close to the work, and future sessions easy to resume.

It is designed for agentic engineering, spec-driven development, SDD-style project work, and evidence-based delivery across different AI coding hosts.

```text
Goal -> Spec -> Execute -> Evidence -> Learn
```

## Highlights

- Project-local `.gse/` workspace for durable engineering context
- Evidence-based stage detection with current-stage-only context loading
- Goal maps, change specs, quality gates, evidence logs, and handoff notes
- Lite, standard, and enterprise scaffolds for different project sizes
- Portable `/gse ...` command semantics for Codex, Claude Code, Hermes-style runtimes, WorkBuddy, and similar agent hosts
- Focused validation profiles for day-to-day work and release checks
- Optional adapters for host folders, LSP notes, MCP notes, hooks, plugins, and project skills
- Release, packaging, public-collaboration, and evidence-gate workflows for mature projects

## Installation

Install from npm:

```bash
npm install -g @t275005746/gse
gse status --target .
```

Use GSE from a checked-out copy:

```bash
node scripts/validate-gse.mjs --root . --json
```

Package a checked-out copy for handoff:

```bash
node scripts/package-gse.mjs --root . --out <package-dir> --label <release-label>
```

Install from a local package:

```bash
node scripts/install-gse.mjs --source <package-dir> --target <install-skill-dir>
```

Install from a URL-shaped package source:

```bash
node scripts/install-gse.mjs --source-url <file-or-http-package-url> --target <install-skill-dir>
```

For release bundles, signing, and trust records, see `references/packaging.md`.

## Quick Start

Initialize GSE in a project:

```bash
node scripts/init-project.mjs --target <project-root>
```

Choose a scaffold explicitly when you already know the project shape:

```bash
node scripts/init-project.mjs --target <project-root> --mode lite
node scripts/init-project.mjs --target <project-root> --mode standard
node scripts/init-project.mjs --target <project-root> --mode enterprise
```

Inspect a project without writing files:

```bash
node scripts/discover-project-profile.mjs --target <project-root> --json
```

Validate this GSE package:

```bash
node scripts/validate-gse.mjs --root . --json
```

Check Node package metadata before publishing or handoff:

```bash
node scripts/audit-npm-package-metadata.mjs --root . --json
node scripts/audit-npm-tarball-install.mjs --root . --json
node scripts/audit-npm-publish-dry-run.mjs --root . --json
npm pack --dry-run --json
```

## When To Use GSE

Use GSE when:

- the project will continue across many agent sessions,
- requirements and decisions are getting buried in chat history,
- each change needs a clear scope and acceptance check,
- multiple agents, workers, tools, or model routes touch the same project,
- you want evidence before calling work done.

For a small one-off task, use the lightest path. For a product, runtime, platform, or open-source release, use the stricter gates.

## How It Works

GSE keeps five things visible:

| Step | Purpose |
|---|---|
| Goal | Keep the north star, current focus, risks, and next slices visible. |
| Spec | Define the current change before implementation drifts. |
| Execute | Follow the project rules and existing code patterns. |
| Evidence | Prove the change with focused tests, API smokes, browser smokes, review, or structural checks. |
| Learn | Record reusable lessons and promote repeated failures into gates or templates. |

The workflow scales by risk: light for small changes, stricter for shared behavior, release work, security-sensitive work, and cross-host claims.

## What It Creates

GSE creates a portable `.gse/` workspace inside the target project.

| Mode | Adds | Good for |
|---|---|---|
| `lite` | Goal map, project profile, quality gates, tooling notes, evidence logs, change templates | Small projects, low-risk tasks, first adoption |
| `standard` | Everything in `lite`, plus agent roles, dispatch notes, project skills, LSP/index notes | Projects that agents will continue over time |
| `enterprise` | Everything in `standard`, plus hooks, MCP notes, plugins, release notes, incident review, audit notes, host adapters | Larger projects, multiple hosts, runtime integrations, governance |
| `auto` | Selects a conservative scaffold from project signals | When you want GSE to choose |

Large projects can start directly with `standard` or `enterprise`.

## Project Layout

Typical workspace:

```text
.gse/
  README.md
  project-profile.md
  goal-map.md
  goals/
  quality-gates.md
  tooling.md
  changes/
  evidence/
  templates/
```

Standard and enterprise projects may also include:

```text
.gse/
  agents/
  skills/
  lsp/
  hooks/
  mcp/
  plugins/
  release.md
  incident-review.md
  audit.md
```

Use `.gse/goal-map.md` as the short index. Put module-level detail under `.gse/goals/`. Keep existing product roadmaps, architecture docs, and project rules where they already live; point to them from GSE instead of copying them.

## Commands

GSE defines portable command meanings that agents can follow when they can read this skill:

```text
/gse help
/gse init
/gse adopt
/gse continue
/gse stage
/gse status
/gse doctor
/gse acceptance
/gse owner-actions
/gse probe
/gse release
/gse package
/gse install
/gse public-release
/gse change
/gse slice
/gse verify
/gse learn
/gse audit
/gse close
```

`/gse close` is a read-only readiness check. Use `scripts/close-change.mjs` when you need to archive a named change pack after evidence exists.

Portable runner:

```bash
node scripts/gse.mjs continue --target <project-root>
node scripts/run-gse-command.mjs --target <project-root> --command "/gse continue"
node scripts/run-gse-command.mjs --target <project-root> --command "/gse stage <intent>"
node scripts/run-gse-command.mjs --target <project-root> --command "/gse learn --summary <lesson>" --execute --json
```

Validation profiles:

```bash
node scripts/run-validation-profile.mjs --target <project-root> --profile lite
node scripts/run-validation-profile.mjs --target <project-root> --profile standard
node scripts/run-validation-profile.mjs --target <project-root> --profile enterprise
node scripts/run-validation-profile.mjs --target <project-root> --profile release
```

## Evidence Model

GSE uses three evidence levels:

```text
result -> verified -> accepted
```

- `result`: an artifact exists or a command ran.
- `verified`: focused checks prove the behavior in the current environment.
- `accepted`: the project owner, policy, CI gate, release gate, review gate, or product acceptance gate accepts the verified result.

This keeps normal product work fast while still making release, security, and cross-host claims auditable.

## Documentation

- `SKILL.md`: agent entrypoint and routing rules
- `references/`: workflow references and deeper operating notes
- `scripts/`: project bootstrap, validation, release, and audit helpers
- `assets/templates/`: reusable records and handoff templates
- `README.zh-CN.md`: Chinese README

## Community

GateHub ([gatehub.top](https://gatehub.top/)) supports GSE development and contributor collaboration.

## License

MIT. See `LICENSE`.
