# Contributing to GSE

Thanks for helping improve GSE.

GSE is a workflow skill and project scaffold for agent-assisted software engineering. Contributions should make long-running project work more explicit, verifiable, portable, or easier to recover.

## What To Contribute

Good contributions usually fit one of these paths:

- Improve the Goal -> Spec -> Execute -> Evidence -> Learn workflow.
- Add or tighten an audit script.
- Improve project scaffold templates.
- Clarify host adapter boundaries.
- Add examples that prove a workflow in a small, reproducible project.
- Fix documentation that overstates support or leaves future agents guessing.

Avoid changes that make optional tools mandatory unless there is a clear fallback path.

## Development Rules

- Keep `SKILL.md` short and route details into `references/`.
- Prefer scripts and templates over repeated prose when behavior must be repeatable.
- Do not claim support for a host, marketplace, model, MCP server, subagent, or slash command unless there is evidence.
- Keep evidence statuses honest: `result`, `verified`, or `accepted`.
- Do not choose a public license on behalf of the owner. Use `references/public-release.md` and `scripts/record-public-release.mjs`.

## Validation

Before proposing a change, run:

```text
node scripts/validate-gse.mjs --root <gse-root> --json
```

For packaging or install behavior, also run:

```text
node scripts/audit-distribution.mjs --root <gse-root> --json
node scripts/audit-remote-distribution.mjs --root <gse-root> --json
```

For public release handoff, also run:

```text
node scripts/audit-release-bundle.mjs --root <gse-root> --json
node scripts/audit-public-release-metadata.mjs --root <gse-root> --json
```

## Evidence

Record meaningful changes in `.gse/evidence/YYYY-MM-DD.md` and append a compact record to `.gse/evidence/index.jsonl`.

Do not paste secrets, raw provider payloads, private reasoning, long command logs, screenshots, or noisy transient output into evidence files.

## Review

Review should check:

- The change maps to `.gse/goal-map.md` or the design master plan.
- Scope did not expand silently.
- Validation covers the changed behavior.
- Unsupported claims remain explicit.
- Installed-copy validation still passes when package behavior changes.
