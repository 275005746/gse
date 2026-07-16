# /gse

Use GSE for this project.

Read in order:

1. Project instructions such as AGENTS.md, CLAUDE.md, or repository-specific rules.
2. .gse/README.md
3. .gse/project-profile.md
4. .gse/state.json
5. .gse/goal-map.md
6. .gse/quality-gates.md

Route the user's arguments through references/commands.md in the installed GSE skill.

Portable execution path:

```text
node <gse-skill>/scripts/run-gse-command.mjs --target <project-root> --command "/gse help"
```

Do not duplicate the goal map, evidence log, or quality gates in .claude/.
Do not mark tools, subagents, MCP, browser, LSP, hooks, or slash commands as verified unless this session checked them.

Expected command shapes:

- /gse help
- /gse init
- /gse adopt
- /gse continue
- /gse change
- /gse slice
- /gse verify
- /gse audit
- /gse close
