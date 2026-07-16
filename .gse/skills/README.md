# Project Skills

Record project-local skills and reusable workflows here. Status describes repository evidence, not assumed host availability.

## Inventory

| Skill | Host | Purpose | Source | Status | Fallback | Claim Boundary |
|---|---|---|---|---|---|---|
| GSE | portable | Goal-Spec-Evidence routing, state, validation, and evidence workflow | `SKILL.md`, `references/`, `scripts/`; `node scripts/validate-gse.mjs --root . --profile lite --json` | verified | Use the repository Markdown and Node.js scripts directly | Verifies the repository skill implementation; it does not prove native host command discovery |
| brainstorming | current Codex environment | Design exploration before non-trivial implementation | installed skill outside this repository | documented | Use an explicit design note and owner approval | Installation is environment-specific and is not bundled by this repository |
| code review and verification skills | current Codex environment | Review and completion checks | installed skills outside this repository | documented | Run repository audits and review the diff sequentially | Documentation does not prove another host has the same skills installed |

## Rules

- Prefer portable instructions under .gse/ when a workflow is useful across hosts.
- Keep host-specific skills small and point back to .gse/ for project policy.
- Do not claim a skill exists unless it is installed or documented here.
- Use only `verified`, `documented`, `unknown`, `unavailable`, or `external-required` for status.
