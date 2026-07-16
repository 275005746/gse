# Project Profile

## Identity

- Product/system name: Example Runtime
- Repository type: agent-runtime product fixture
- Main languages/frameworks: TypeScript, Node.js

## Tool Connections

| Tool | Purpose | Command/config | Status |
|---|---|---|---|
| MCP | external tools/data | `.mcp.json` | documented |
| Subagents | delegated work | host-specific | unknown |
| Browser | UI smoke | not configured | unknown |
| Model router | provider/model routing | docs/model-routing.md | documented |

## Agent Host Adapters

- Codex: `.codex/gse-adapter.md` documented.
- Claude Code: `.claude/gse-adapter.md` documented.
- Other hosts: unknown.

## Known Gotchas

- Config presence is documented, not verified.
- Drift audit is required before trusting old host capability claims.
