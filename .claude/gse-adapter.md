# Claude Code Adapter

Source of truth: `.gse/`.

- Start from the repository `AGENTS.md`; it is the shared entrypoint for every host.
- Commands, agents, hooks, and skills should point back to `.gse/` for goals, evidence, quality gates, and learning rules.
- Keep host-specific prompts short; keep reusable workflow policy in `.gse/`.
- Use `.gse/goals/` for module-level goal details when the root goal map becomes too large.

Capability status vocabulary: `verified`, `documented`, `unknown`, `unavailable`, `external-required`.

This adapter is a pointer. It does not prove native Claude Code command, hook, tool, or dispatch support.
