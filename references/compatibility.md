# Compatibility And Adoption Matrix

Use this to record what GSE can honestly claim across agent hosts. This matrix is about GSE portability, not proof that every host-specific tool is installed in a project.

## Status Vocabulary

- `verified`: backed by a local file, script, fixture, command, or trusted project-specific evidence in the current GSE skill or target project.
- `documented`: described by GSE references, examples, or project files, but not exercised in the current evidence set.
- `unknown`: no reliable evidence yet.
- `unavailable`: expected capability is missing or failed when checked.

Never upgrade a host capability from `documented` to `verified` just because another host has a similar capability.

## Portable Source Of Truth

`.gse/` is the portable source of truth for goals, profile, quality gates, evidence, learning, and project-specific workflow rules.

Host-specific folders are adapters. They may contain commands, hooks, skills, MCP notes, UI metadata, or short pointers, but they should point back to `.gse/` instead of copying the whole workflow.

## Host Matrix

| Host family | Adapter location | Source-of-truth pointer | Current status | Evidence | Fallback |
|---|---|---|---|---|---|
| Codex-style | `.codex/`, Codex skills, MCP config | Must point to `.gse/` | `verified` for fixture pointer; host tools are project-specific | `examples/agent-runtime-host/.codex/gse-adapter.md`, `scripts/forward-test-gse.mjs`, `scripts/audit-fixtures.mjs` | Use `SKILL.md`, `.gse/project-profile.md`, and markdown workflow when Codex host tools are absent |
| Claude Code-style | `.claude/commands/`, `.claude/agents/`, `.claude/hooks/` | Must point to `.gse/` | `verified` for fixture pointer; commands/agents/hooks remain project-specific | `examples/agent-runtime-host/.claude/gse-adapter.md`, `scripts/forward-test-gse.mjs`, `scripts/audit-fixtures.mjs` | Use `.gse/` docs directly; do not duplicate goal maps into `.claude/` |
| Hermes/AION-style runtime | `.gse/host-adapters/hermes-runtime.md`, runtime skills, worker adapters, memory/tool substrate docs | Must keep AION/product policy in `.gse/` or project docs; runtime details are adapters | `verified` for generated pointer; runtime tools remain project-specific | `scripts/generate-command-adapter.mjs`, `scripts/audit-command-adapters.mjs`, `references/host-adapters.md`, `references/model-routing.md`, `examples/agent-runtime-host/docs/model-routing.md` | Treat runtime capabilities as `unknown` until project evidence verifies workers, memory, tools, or model routing |
| WorkBuddy/other IDE agents | `.gse/host-adapters/workbuddy.md`, local docs, plugin settings, task templates | Must point to `.gse/` | `verified` for generated pointer; IDE tools remain project-specific | `scripts/generate-command-adapter.mjs`, `scripts/audit-command-adapters.mjs`, `SKILL.md`, `references/host-adapters.md` | Use `.gse/README.md`, `.gse/project-profile.md`, and `references/router.md` when no host adapter exists |
| Copilot/Gemini-style assistants | repository instructions, workspace docs | Short instruction to read `.gse/project-profile.md` and relevant gates | `documented` | `references/host-adapters.md` | Use repository instructions plus `.gse/` files; keep advanced tool claims `unknown` |
| Unknown or custom host | `.gse/host-adapters/generic-agent.md`, host-specific docs decided by the project | Must link back to `.gse/` | `verified` for generated generic pointer; host runtime remains unknown | `scripts/generate-command-adapter.mjs`, `scripts/audit-command-adapters.mjs` | Create a fuller adapter from `assets/templates/host-adapter.md` only when the project has a real host mechanism |

## Capability Matrix

| Capability | Portable GSE layer | Codex-style | Claude Code-style | Hermes/AION-style | WorkBuddy/other | Notes |
|---|---|---|---|---|---|---|
| Goal map and evidence | `verified` | `documented` | `documented` | `documented` | `documented` | Portable files live under `.gse/`; host adapters should point there |
| Project bootstrap | `verified` | `documented` | `documented` | `documented` | `documented` | Verified by `scripts/audit-project.mjs` and `scripts/validate-gse.mjs` |
| Project profile discovery | `verified` | `documented` | `documented` | `documented` | `documented` | Verified by `scripts/audit-adoption.mjs`; host use still depends on project files |
| Host adapter pointer | `verified` for generated pointers | `verified` | `verified` | `verified` for generated pointer | `verified` for generated pointer | Generated pointers are verified by `scripts/audit-command-adapters.mjs`; runtime invocation still needs host records |
| Subagents | `documented` fallback rules | `unknown` | `unknown` | `unknown` | `unknown` | Real subagent availability must be checked per host/session |
| MCP | `documented` status vocabulary | `unknown` | `unknown` | `unknown` | `unknown` | Config presence is documented, not tool availability |
| LSP/index | `documented` recommendation | `unknown` | `unknown` | `unknown` | `unknown` | Verify per project before relying on symbol navigation |
| Browser/Playwright | `documented` evidence rules | `unknown` | `unknown` | `unknown` | `unknown` | Fixture config can document Playwright; running browser tests is separate evidence |
| Model routing | `documented` reference | `unknown` | `unknown` | `documented` | `unknown` | Provider/model behavior needs provider-specific evidence |
| Hooks/plugins | `documented` adapter rule | `unknown` | `unknown` | `unknown` | `unknown` | Do not enable hooks or plugins without project approval and evidence |

## Adoption Rules

1. Start from `.gse/README.md`, `.gse/project-profile.md`, and `.gse/goal-map.md` when they exist.
2. If a host folder exists, read only the short host adapter first, then return to `.gse/` for policy and evidence.
3. Record host-specific commands, hooks, MCP servers, subagents, models, browser tools, and indexes as `unknown` until checked in that project/session.
4. Use `documented` for config or docs that exist but have not been executed.
5. Use `verified` only when current evidence proves the claim.
6. Use `unavailable` when an expected host feature is missing or failing.
7. Use `references/drift-audit.md` when host folders and `.gse/` disagree.

## Minimum Host Adapter

A host adapter should be short:

```text
# <Host> Adapter

Source of truth: `.gse/`.

- Read `.gse/project-profile.md` before using host-specific tools.
- Mark host capabilities verified only after current-session evidence.
- Use `references/drift-audit.md` when adapter claims and current tools disagree.
```

Use `assets/templates/host-adapter.md` when a fuller adapter record is needed.
