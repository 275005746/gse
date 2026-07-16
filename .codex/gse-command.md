# GSE Command Adapter For Codex

Source of truth: .gse/.

This file is a Codex-facing pointer, not proof of a native project-level /gse slash-command mechanism.

Use the installed GSE skill and references/commands.md when the user writes /gse ..., gse: ..., or asks to continue with GSE.

Portable execution path:

```text
node <gse-skill>/scripts/run-gse-command.mjs --target <project-root> --command "/gse help"
```

Read in order:

1. AGENTS.md
2. .gse/README.md
3. .gse/project-profile.md
4. .gse/state.json
5. .gse/goal-map.md
6. .gse/quality-gates.md

Capability status vocabulary: verified, documented, unknown, unavailable.
