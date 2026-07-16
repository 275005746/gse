# GSE Design Basis

This file separates GSE-owned requirements from design judgment.

## Product Requirements Captured

- GSE must target large, long-running commercial projects first, while degrading for small projects.
- GSE must be agent-agnostic across Codex, Claude Code, Hermes, WorkBuddy, and similar tools.
- GSE must support goal maps, specs, evidence, roles, tool acceleration, learning, release, incident, and quality gates.
- GSE must have few hard prerequisites; optional tools should enhance, not block.
- GSE itself must be developed using GSE principles.
- GSE must not invent unsupported facts; evidence and assumptions must be separated.
- GSE improvements must be expressed as GSE-owned controls, commands, templates, scripts, or evidence gates.

## Design Judgments

- Use GSE as the public name because it is short and captures the core loop: Goal, Spec, Evidence.
- Use `.gse/` as the durable project folder because hidden workflow folders are familiar and avoid polluting product docs.
- Use task levels so small tasks do not inherit enterprise ceremony.
- Use markdown fallback for all optional tools so the workflow remains portable.
- Use recurring GSE gap audits because a purely reactive process lets users discover missing requirements through failures.

## Boundary

- This file is for GSE engineering provenance, not public attribution.

## Open Questions

- Whether GSE should later publish official adapters for specific hosts, such as Codex Desktop or Claude Code.
- Whether GSE should include a telemetry dashboard by default or only expose script-level audit output.
- Whether project initialization should update `AGENTS.md` automatically or require explicit approval.
- How often GSE gap audits should run by default: every major project phase, every N slices, or only on explicit request.
