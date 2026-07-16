# Project Agent Workspace

Use this when the user asks whether GSE can create a project-local directory for agent workflow files, hooks, skills, roles, LSP notes, MCP notes, plugins, and tool adapters.

## Design Rule

GSE owns `.gse/` as the portable layer. Tool-specific folders are adapters, not the source of truth.

```text
project-root/
  .gse/
    README.md
    goal-map.md
    quality-gates.md
    tooling.md
    learnings.md
    agent-workspace.md
    agents/
      roles.md
      dispatch.md
    hooks/
      README.md
    skills/
      README.md
    mcp/
      README.md
    lsp/
      README.md
    plugins/
      README.md
    changes/
    evidence/
    templates/
```

## Why `.gse/` Instead of `.claude/` or `.codex/`

- `.claude/`, `.codex/`, `.agents/`, and product-specific runtime folders can be useful, but they bind the project to one host.
- `.gse/` is the neutral contract any agent can read.
- Adapters may mirror or link from `.gse/`, but durable workflow decisions should remain in `.gse/`.

## Directory Responsibilities

| Path | Purpose | Required |
|---|---|---|
| `.gse/goal-map.md` | Current goals, priorities, risks, next slice | yes |
| `.gse/quality-gates.md` | Verification and release gates | yes |
| `.gse/tooling.md` | Available tools and optional adapters | yes |
| `.gse/agent-workspace.md` | Map of local agent folders and host adapters | standard+ |
| `.gse/agents/roles.md` | Role definitions and boundaries | standard+ |
| `.gse/agents/dispatch.md` | How to delegate work when subagents exist | standard+ |
| `.gse/hooks/README.md` | Hook ideas and host-specific hook mapping | enterprise |
| `.gse/skills/README.md` | Project-local skill inventory and install notes | standard+ |
| `.gse/mcp/README.md` | MCP servers, permissions, and setup notes | enterprise |
| `.gse/lsp/README.md` | Indexing/LSP commands and symbol navigation notes | standard+ |
| `.gse/plugins/README.md` | Optional plugins and runtime adapters | enterprise |

## Host Adapter Pattern

Use adapters only when the host supports them:

- Codex: `.codex/`, Codex skills, MCP config, available subagent tools.
- Claude Code: `.claude/`, commands, hooks, agents, MCP config.
- Hermes or AION-like runtimes: runtime skills, worker adapters, memory, tool substrate.
- WorkBuddy or other hosts: local docs, commands, MCP, index, and automation conventions.

When an adapter is needed, write a short pointer from the host folder back to `.gse/` rather than duplicating the whole process.

## Lessons Borrowed From Skill Repositories

## Missing Areas To Keep Tracking

- Secrets and permission boundaries for MCP/tools.
- Cross-agent lock files or ownership rules for concurrent edits.
- CI integration for quality gates.
- Release and rollback playbooks.
- Observability for long-running agent work: traces, cost, failed commands, retries.
- Prompt/context budgets and compaction handoff format.
- Drift audits for stale local skills, hooks, or generated docs.

