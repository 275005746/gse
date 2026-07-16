# LSP And Indexing

Record code navigation tools for this project. Search fallback is portable; LSP availability is host-specific.

## Inventory

| Capability | Host/Tool | Purpose | Status | Evidence | Fallback | Claim Boundary |
|---|---|---|---|---|---|---|
| File search | ripgrep | Find files and text across the repository | documented | GSE development rules and repository commands use `rg` first | PowerShell `Get-ChildItem` and `Select-String` | Documentation does not prove `rg` is installed on every host |
| Symbol navigation | LSP or code index | Navigate definitions, references, and symbols | unknown | - | Use `rg`, focused file reads, and existing tests | No LSP/index runtime is verified for this project session |

## Notes

- Prefer symbol navigation for large projects when available.
- Fall back to rg and existing tests when LSP is unavailable.
- Use only `verified`, `documented`, `unknown`, `unavailable`, or `external-required` for status.
