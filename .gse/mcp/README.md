# MCP

Record MCP servers, permissions, and setup notes here. MCP availability is session- and host-specific.

## Servers

| Server | Purpose | Permissions | Setup | Owner | Status | Evidence | Fallback | Claim Boundary |
|---|---|---|---|---|---|---|---|---|
| Project MCP servers | Optional repository, browser, memory, or service integrations | server-specific | Configure outside committed secrets | project owner | unknown | - | Use filesystem, shell, local docs, and repository scripts | No MCP server is required or verified for this repository |

## Rules

- Keep real secrets out of source control.
- Document write-capable tools and approval expectations.
- Use only `verified`, `documented`, `unknown`, `unavailable`, or `external-required` for status.
