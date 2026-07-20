# GSE Host Runtime Evidence Handoff

Generated: 2026-07-18T19:15:59.125Z
Root: <gse-root>

## Purpose

Turn cross-host support into auditable runtime evidence. Generated adapters, docs, or command pointers are useful setup, but they are not proof that a host actually invoked GSE.

## Fast Path

- Native slash-command evidence is the final external gate.
- If a host can invoke `/gse continue` natively, record that first.
- Use portable text-command records only when native slash-command proof is unavailable.
- Keep host capability status separate from portable `.gse/` workflow status.

## Current Runtime Evidence

- Host runtime invocation records: 0
- Verified or accepted records: 0
- Hosts with records: none
- Native slash-command records: 0
- Portable text-command records: 0
- Audit command: `node scripts/audit-host-runtime-invocations.mjs --root __GSE_OR_PROJECT__ --json`

## Host Evidence Plan

### Codex-style

- Adapter location: `.codex/`, Codex skills, MCP config
- Current matrix status: verified for fixture pointer; host tools are project-specific
- Existing evidence: `examples/agent-runtime-host/.codex/gse-adapter.md`, `scripts/forward-test-gse.mjs`, `scripts/audit-fixtures.mjs`
- Fallback: Use `SKILL.md`, `.gse/project-profile.md`, and markdown workflow when Codex host tools are absent
- Required runtime proof: a persistent record under `.gse/evidence/host-invocations/` produced by `record-host-invocation.mjs` or manually matching the same fields.
- Record command:

```bash
node __GSE__/scripts/record-host-invocation.mjs --root __PROJECT_OR_GSE__ --host "Codex-style" --host-version "__VERSION_OR_UNKNOWN__" --project "__PROJECT_NAME__" --adapter-path "__HOST_ADAPTER_OR_POINTER__" --invocation-method "__NATIVE_SLASH_COMMAND_OR_PORTABLE_TEXT_COMMAND_OR_HOST_UI_COMMAND_OR_RUNTIME_BRIDGE__" --command "/gse continue" --status verified --evidence-owner "__PERSON_OR_AGENT__" --evidence "__THREAD_ID_TRANSCRIPT_SCREENSHOT_TERMINAL_OUTPUT_OR_HOST_LOG__" --portable-text-command true|false --native-slash-command true|false --generated-pointer true|false --owner-acceptance-required false --out __PROJECT_OR_GSE__/.gse/evidence/host-invocations/__DATE__-__HOST__-gse.md
```

### Claude Code-style

- Adapter location: `.claude/commands/`, `.claude/agents/`, `.claude/hooks/`
- Current matrix status: verified for fixture pointer; commands/agents/hooks remain project-specific
- Existing evidence: `examples/agent-runtime-host/.claude/gse-adapter.md`, `scripts/forward-test-gse.mjs`, `scripts/audit-fixtures.mjs`
- Fallback: Use `.gse/` docs directly; do not duplicate goal maps into `.claude/`
- Required runtime proof: a persistent record under `.gse/evidence/host-invocations/` produced by `record-host-invocation.mjs` or manually matching the same fields.
- Record command:

```bash
node __GSE__/scripts/record-host-invocation.mjs --root __PROJECT_OR_GSE__ --host "Claude Code-style" --host-version "__VERSION_OR_UNKNOWN__" --project "__PROJECT_NAME__" --adapter-path "__HOST_ADAPTER_OR_POINTER__" --invocation-method "__NATIVE_SLASH_COMMAND_OR_PORTABLE_TEXT_COMMAND_OR_HOST_UI_COMMAND_OR_RUNTIME_BRIDGE__" --command "/gse continue" --status verified --evidence-owner "__PERSON_OR_AGENT__" --evidence "__THREAD_ID_TRANSCRIPT_SCREENSHOT_TERMINAL_OUTPUT_OR_HOST_LOG__" --portable-text-command true|false --native-slash-command true|false --generated-pointer true|false --owner-acceptance-required false --out __PROJECT_OR_GSE__/.gse/evidence/host-invocations/__DATE__-__HOST__-gse.md
```

### Hermes/AION-style runtime

- Adapter location: `.gse/host-adapters/hermes-runtime.md`, runtime skills, worker adapters, memory/tool substrate docs
- Current matrix status: verified for generated pointer; runtime tools remain project-specific
- Existing evidence: `scripts/generate-command-adapter.mjs`, `scripts/audit-command-adapters.mjs`, `references/host-adapters.md`, `references/model-routing.md`, `examples/agent-runtime-host/docs/model-routing.md`
- Fallback: Treat runtime capabilities as `unknown` until project evidence verifies workers, memory, tools, or model routing
- Required runtime proof: a persistent record under `.gse/evidence/host-invocations/` produced by `record-host-invocation.mjs` or manually matching the same fields.
- Record command:

```bash
node __GSE__/scripts/record-host-invocation.mjs --root __PROJECT_OR_GSE__ --host "Hermes/AION-style runtime" --host-version "__VERSION_OR_UNKNOWN__" --project "__PROJECT_NAME__" --adapter-path "__HOST_ADAPTER_OR_POINTER__" --invocation-method "__NATIVE_SLASH_COMMAND_OR_PORTABLE_TEXT_COMMAND_OR_HOST_UI_COMMAND_OR_RUNTIME_BRIDGE__" --command "/gse continue" --status verified --evidence-owner "__PERSON_OR_AGENT__" --evidence "__THREAD_ID_TRANSCRIPT_SCREENSHOT_TERMINAL_OUTPUT_OR_HOST_LOG__" --portable-text-command true|false --native-slash-command true|false --generated-pointer true|false --owner-acceptance-required false --out __PROJECT_OR_GSE__/.gse/evidence/host-invocations/__DATE__-__HOST__-gse.md
```

### WorkBuddy/other IDE agents

- Adapter location: `.gse/host-adapters/workbuddy.md`, local docs, plugin settings, task templates
- Current matrix status: verified for generated pointer; IDE tools remain project-specific
- Existing evidence: `scripts/generate-command-adapter.mjs`, `scripts/audit-command-adapters.mjs`, `SKILL.md`, `references/host-adapters.md`
- Fallback: Use `.gse/README.md`, `.gse/project-profile.md`, and `references/router.md` when no host adapter exists
- Required runtime proof: a persistent record under `.gse/evidence/host-invocations/` produced by `record-host-invocation.mjs` or manually matching the same fields.
- Record command:

```bash
node __GSE__/scripts/record-host-invocation.mjs --root __PROJECT_OR_GSE__ --host "WorkBuddy/other IDE agents" --host-version "__VERSION_OR_UNKNOWN__" --project "__PROJECT_NAME__" --adapter-path "__HOST_ADAPTER_OR_POINTER__" --invocation-method "__NATIVE_SLASH_COMMAND_OR_PORTABLE_TEXT_COMMAND_OR_HOST_UI_COMMAND_OR_RUNTIME_BRIDGE__" --command "/gse continue" --status verified --evidence-owner "__PERSON_OR_AGENT__" --evidence "__THREAD_ID_TRANSCRIPT_SCREENSHOT_TERMINAL_OUTPUT_OR_HOST_LOG__" --portable-text-command true|false --native-slash-command true|false --generated-pointer true|false --owner-acceptance-required false --out __PROJECT_OR_GSE__/.gse/evidence/host-invocations/__DATE__-__HOST__-gse.md
```

### Copilot/Gemini-style assistants

- Adapter location: repository instructions, workspace docs
- Current matrix status: documented
- Existing evidence: `references/host-adapters.md`
- Fallback: Use repository instructions plus `.gse/` files; keep advanced tool claims `unknown`
- Required runtime proof: a persistent record under `.gse/evidence/host-invocations/` produced by `record-host-invocation.mjs` or manually matching the same fields.
- Record command:

```bash
node __GSE__/scripts/record-host-invocation.mjs --root __PROJECT_OR_GSE__ --host "Copilot/Gemini-style assistants" --host-version "__VERSION_OR_UNKNOWN__" --project "__PROJECT_NAME__" --adapter-path "__HOST_ADAPTER_OR_POINTER__" --invocation-method "__NATIVE_SLASH_COMMAND_OR_PORTABLE_TEXT_COMMAND_OR_HOST_UI_COMMAND_OR_RUNTIME_BRIDGE__" --command "/gse continue" --status verified --evidence-owner "__PERSON_OR_AGENT__" --evidence "__THREAD_ID_TRANSCRIPT_SCREENSHOT_TERMINAL_OUTPUT_OR_HOST_LOG__" --portable-text-command true|false --native-slash-command true|false --generated-pointer true|false --owner-acceptance-required false --out __PROJECT_OR_GSE__/.gse/evidence/host-invocations/__DATE__-__HOST__-gse.md
```

### Unknown or custom host

- Adapter location: `.gse/host-adapters/generic-agent.md`, host-specific docs decided by the project
- Current matrix status: verified for generated generic pointer; host runtime remains unknown
- Existing evidence: `scripts/generate-command-adapter.mjs`, `scripts/audit-command-adapters.mjs`
- Fallback: Create a fuller adapter from `assets/templates/host-adapter.md` only when the project has a real host mechanism
- Required runtime proof: a persistent record under `.gse/evidence/host-invocations/` produced by `record-host-invocation.mjs` or manually matching the same fields.
- Record command:

```bash
node __GSE__/scripts/record-host-invocation.mjs --root __PROJECT_OR_GSE__ --host "Unknown or custom host" --host-version "__VERSION_OR_UNKNOWN__" --project "__PROJECT_NAME__" --adapter-path "__HOST_ADAPTER_OR_POINTER__" --invocation-method "__NATIVE_SLASH_COMMAND_OR_PORTABLE_TEXT_COMMAND_OR_HOST_UI_COMMAND_OR_RUNTIME_BRIDGE__" --command "/gse continue" --status verified --evidence-owner "__PERSON_OR_AGENT__" --evidence "__THREAD_ID_TRANSCRIPT_SCREENSHOT_TERMINAL_OUTPUT_OR_HOST_LOG__" --portable-text-command true|false --native-slash-command true|false --generated-pointer true|false --owner-acceptance-required false --out __PROJECT_OR_GSE__/.gse/evidence/host-invocations/__DATE__-__HOST__-gse.md
```

## Verification

Run these commands after adding host evidence:

```bash
node scripts/audit-host-runtime-invocations.mjs --root __GSE_OR_PROJECT__ --json
node scripts/audit-final-readiness.mjs --root __GSE_OR_PROJECT__ --json
node scripts/validate-gse.mjs --root __GSE_OR_PROJECT__ --json
```

## Anti-Overclaim

- Do not claim native slash-command support from generated pointers or portable text-command records.
- Do not claim a host is supported without a host runtime invocation record for that host.
- Do not mark a host record accepted when `owner-acceptance-required` is true.
- Keep host capability status separate from portable `.gse/` workflow status.
- Treat subagents, MCP, LSP, browser tools, hooks, and plugins as host/session-specific until current evidence proves them.

## Next Action

Record real invocation evidence for Claude Code-style, Hermes/AION-style, WorkBuddy/other IDE agents, and any host-native slash-command mechanism that becomes available. Start with native slash-command proof when the host supports it.
