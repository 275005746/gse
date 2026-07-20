# GSE Agent Entry

GSE is the portable source of truth for this repository. Read this file first, then load only the references required by the current stage.

## Start

1. Read `.gse/project-profile.md`, `.gse/state.json`, and `.gse/current-slice.md`.
2. Use `references/stage-orchestrator.md` for meaningful work and inspect repository evidence before advancing stages.
3. Route `/gse ...` or `gse: ...` through `references/commands.md`.
4. Treat `.gse/goal-map.md` as the execution projection; the canonical product goal source named in `.gse/state.json` owns durable intent.
5. Read `.gse/quality-gates.md` before claiming completion.

## Cross-Session Continuation

A new or resumed session must use the current portable state before making a plan:

1. Read `.gse/state.json`, `.gse/current-slice.md`, and `.gse/evidence/` references named by `lastEvidence`.
2. Use the `currentSlice` outcome, scope, acceptance, proof boundary, risks, and `nextAction` as the active work contract; do not treat a completed Slice as Goal completion.
3. Run `/gse continue --json --compact` (or `node scripts/run-gse-command.mjs --target <project-root> --command "/gse continue" --json --compact`) to obtain the bounded next action when the state is resumable.
4. Keep work under the same top-level Plan Unit unless the packet explicitly requires a rollover or an owner decision.
5. After a Slice, record focused evidence and update `.gse/current-slice.md`, `.gse/state.json`, `.gse/goal-map.md`, and the evidence index when the portable capability changes.
6. Treat missing host telemetry as `unknown` or `unavailable`; portable packets do not create or dispatch Host tasks and do not prove Goal completion, native commands, publication, marketplace approval, or public acceptance.

A handoff is complete only when the next action is explicit, the claim boundary is preserved, and the next session can resume from `.gse/` without relying on prior conversation history.


- Project state and current slice: `.gse/`
- Command semantics: `references/commands.md`
- Workflow routing: `references/router.md`
- Stage control: `references/stage-orchestrator.md`
- Roles and dispatch: `.gse/agents/`
- Capability status: `.gse/host-capabilities.md` and the registries under `.gse/skills/`, `.gse/plugins/`, `.gse/hooks/`, `.gse/mcp/`, and `.gse/lsp/`
- Evidence: `.gse/evidence/`

Host-specific folders such as `.claude/` and `.codex/` are thin adapters. Do not duplicate portable policy into them and do not treat generated pointers as runtime proof.

## Evidence Rules

- Use `verified`, `documented`, `unknown`, `unavailable`, or `external-required` for capability status.
- Do not claim native slash commands, browser, MCP, LSP, hooks, plugins, or subagents without direct evidence for the current host and project.
- Preserve the distinction between result, verified evidence, accepted evidence, and external-required evidence.

## Verification

Run the lightest checks that prove the current claim. For GSE self-development, the normal close path includes:

```text
node scripts/audit-agent-entrypoint.mjs --root . --json
node scripts/audit-project-capability-registry.mjs --root . --target . --json
node scripts/validate-gse.mjs --root . --profile lite --json
git diff --check
```
