# Host Capabilities

Record current project and host capability facts here. A generated adapter, portable command, or another host's evidence is not proof for this host.

Status vocabulary: `verified`, `documented`, `unknown`, `unavailable`, `external-required`.

| Capability | Host/Tool | Status | Evidence | Claim Boundary | Last Checked |
|---|---|---|---|---|---|
| native-slash-command | current host | external-required | `.gse/evidence/host-invocations/2026-07-06-codex-background-thread.md` proves Codex background-thread text-command routing only | Native slash-command support requires real host runtime invocation evidence, not portable `/gse` runner output or text-command routing. | 2026-07-09 |
| browser | current host/browser tools | unknown | - | Browser proof requires a real browser/component/screenshot command for the target project and must be labeled as component or browser evidence. | 2026-07-09 |
| mcp | MCP servers | unknown | - | MCP status is host and project specific; adapter docs or server config alone do not prove tool availability. | 2026-07-09 |
| lsp | LSP or code index | unknown | - | LSP/index status is current-session specific unless project docs or a focused command prove it. | 2026-07-09 |
| subagent | host dispatch | unknown | - | Real subagent dispatch requires verified host/tool evidence; sequential role fallback and file/tool parallelism are not real dispatch. | 2026-07-09 |
| ci | GitHub Actions workflow | documented | `.github/workflows/validate-gse.yml`, `scripts/audit-ci-readiness.mjs` | Workflow readiness is documented locally; public CI run acceptance still requires a real run record. | 2026-07-09 |
