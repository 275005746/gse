# Support

Use this file to decide where to start when GSE behavior is confusing, incomplete, or blocked.

## First Checks

Run:

```text
node scripts/validate-gse.mjs --root <gse-root> --json
```

For a target project using GSE, run:

```text
node scripts/audit-target-project.mjs --target <project-root> --json
node scripts/generate-session-prompt.mjs --target <project-root>
node scripts/audit-close-gate.mjs --target <project-root> --json
```

For package or install issues, run:

```text
node scripts/audit-distribution.mjs --root <gse-root> --json
node scripts/audit-remote-distribution.mjs --root <gse-root> --json
```

## What To Include In A Support Request

- GSE root path or installed package path.
- Target project path, if any.
- Command run and the compact JSON summary.
- Whether the problem is skill usage, project scaffold, package/install, host adapter, release, or evidence gating.
- Whether optional tools such as LSP, browser automation, MCP, CI, or subagent dispatch were actually available.

## Community

GateHub (`https://gatehub.top/`) supports GSE development and contributor coordination.
