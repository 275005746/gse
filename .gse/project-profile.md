# Project Profile

## Product

GSE is a portable Goal-Spec-Evidence Engineering skill for long-running agent-assisted software projects.

## Canonical Plan

- Master plan: `.gse/gse-design-master-plan.md`
- Goal map: `.gse/goal-map.md`
- Current slice: `.gse/current-slice.md`
- Evidence index: `.gse/evidence/index.jsonl`

## Commands

- Full validation: `node scripts/validate-gse.mjs --root <skill-root> --json`
- Lite validation: `node scripts/validate-gse.mjs --root <skill-root> --profile lite --json`
- Structural audit: `node scripts/audit-gse.mjs --root <skill-root> --json`
- Change pack audit: `node scripts/audit-change-system.mjs --root <skill-root> --json`
- Close gate: `node scripts/audit-close-gate.mjs --target <skill-root> --json`
- Core contracts: `node scripts/audit-core-contracts.mjs --root <skill-root> --json`
- Core compatibility: `node scripts/audit-core-compatibility.mjs --root <skill-root> --json`
- Core transactions: `node scripts/audit-core-transactions.mjs --root <skill-root> --json`

All three Core audits are required before claiming Section 20 foundation behavior. Release and public acceptance remain separately authorized evidence boundaries.

## Tool Notes

- Keep optional adapters optional unless current-session evidence proves they are available.
- Host-native slash commands, subagents, browser automation, MCP, LSP, CI, and host UI support require explicit evidence before they are claimed.
- Use the project test/build commands and GSE validation profile that match the risk of the change.

## Ownership

Do not mark a GSE change complete until the claim has focused validation evidence or an explicit owner acceptance record.
