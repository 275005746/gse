# agent-runtime-host fixture

Purpose: representative agent-runtime product shape for host adapter, drift audit, recovery/handoff, and model/tool status tests.

Suggested checks:

- Inspect `.gse/project-profile.md` for host/tool status vocabulary.
- Inspect `.codex/gse-adapter.md` and `.claude/gse-adapter.md` for `.gse/` source-of-truth pointers.
- Run drift audit guidance against host capability claims and `.gse/tooling.md`.
- Confirm no runtime or subagent capability is marked verified without evidence.
