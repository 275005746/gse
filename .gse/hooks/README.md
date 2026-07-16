# Hooks

Record host-specific automation hooks here. Hooks stay opt-in and must be proved in the target host.

## Hook Inventory

| Hook | Host | Trigger | Command | Risk | Status | Evidence | Fallback | Claim Boundary |
|---|---|---|---|---|---|---|---|---|
| GSE validation hook | current repository | pre-commit or pre-push | `node scripts/validate-gse.mjs --root . --profile lite --json` | Long-running validation can block local workflow | unknown | - | Run the command manually or in CI | No local hook is enabled by this repository record |
| GSE close-gate hook | current repository | before declaring a slice complete | `node scripts/audit-close-gate.mjs --target . --json` | Generated or dirty state can block closure | unknown | - | Run the command manually | The command exists, but automatic host execution is not verified |

## Rules

- Hooks must be explicit, reversible, and safe for the project.
- Keep secrets out of hook files.
- Document any destructive or networked behavior before enabling it.
- Use only `verified`, `documented`, `unknown`, `unavailable`, or `external-required` for status.
