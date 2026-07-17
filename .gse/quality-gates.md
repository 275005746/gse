# Quality Gates

## Universal

- One slice must have outcome, scope, acceptance, evidence, risk, and next action.
- Do not claim external tools ran unless command output or host evidence proves it.
- Keep `result`, `verified`, and `accepted` distinct.
- Preserve optional adapters: GSE must work without host-specific tools, delegated execution, MCP, LSP, browser tooling, or CI services.

## GSE Skill Changes

- Run the lightest validation profile that proves the claim.
- For change/spec behavior, run `node scripts/audit-change-system.mjs --root <skill-root> --json`.
- For README or command behavior, ensure the relevant audit remains wired into `scripts/validate-gse.mjs`.
- Before claiming Section 20 foundation behavior, all three commands must pass:
  - `node scripts/audit-core-contracts.mjs --root <skill-root> --json`
  - `node scripts/audit-core-compatibility.mjs --root <skill-root> --json`
  - `node scripts/audit-core-transactions.mjs --root <skill-root> --json`
- Update `.gse/evidence/YYYY-MM-DD.md` and `.gse/evidence/index.jsonl` when the slice creates new evidence.

## Target-Project Claims

- Use `scripts/audit-target-project.mjs` before claiming a target project is GSE-ready.
- Use `scripts/audit-close-gate.mjs` before saying a slice can close.
- Real project adoption still needs project-specific tests, smokes, or owner acceptance according to that repo's rules.

## Release Boundary

Local validation is not marketplace approval, external install verification, CI publication, host-native support, or owner acceptance unless the matching evidence record exists.
