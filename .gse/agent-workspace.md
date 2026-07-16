# Agent Workspace

This project keeps portable agent workflow files under .gse/.

Host-specific folders such as .codex/, .claude/, .agents/, or runtime-specific directories may point back here, but .gse/ is the source of truth.

Repository entrypoint: `AGENTS.md`.

## Local Map

- Goal map: .gse/goal-map.md
- Quality gates: .gse/quality-gates.md
- Agent roles: .gse/agents/roles.md
- Dispatch rules: .gse/agents/dispatch.md
- Role fallback packets: .gse/agents/role-fallback-packets.md
- Project skills: .gse/skills/README.md
- Project plugins: .gse/plugins/README.md
- Project hooks: .gse/hooks/README.md
- MCP notes: .gse/mcp/README.md
- LSP/index notes: .gse/lsp/README.md

## Adapter Rule

Do not duplicate the whole workflow into a host-specific folder. Add a short pointer from that host folder back to .gse/ when needed.
