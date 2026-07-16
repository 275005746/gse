# Codex Adapter

Source of truth: `.gse/`.

- Start from the repository `AGENTS.md`; it is the shared entrypoint for every host.
- Start meaningful work from `.gse/project-profile.md`, `.gse/goal-map.md`, and `.gse/quality-gates.md`.
- Use `.gse/goals/` for module-level goal details when the root goal map becomes too large.
- Record current-session evidence before marking subagents, MCP, browser, LSP, or model routing as verified.

Capability status vocabulary: `verified`, `documented`, `unknown`, `unavailable`, `external-required`.

This adapter is a pointer. It does not prove native Codex slash-command, tool, or dispatch support.
