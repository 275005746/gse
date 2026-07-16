# Host Adapters

Use this when a project needs GSE to work across Codex, Claude Code, Hermes/AION-style runtimes, WorkBuddy, Copilot-style agents, Gemini-style agents, or another agent host. Use `references/compatibility.md` to check host support status and adoption evidence before making capability claims.

## Core Rule

`.gse/` is the portable source of truth. Host-specific folders are adapters.

Adapters may expose commands, hooks, skills, MCP servers, indexes, or local UI metadata for one host, but they must point back to `.gse/` for project policy, goals, evidence, quality gates, and learning rules.

Portable workflow artifacts can define workflow discipline, specs, roles, evidence, and quality gates. They do not create host-native slash commands, real subagent dispatch, browser automation, MCP servers, LSP indexes, CI runners, or host UI integration. Treat those as host capabilities and verify them through records before claiming support.

## Adapter Decision

Create or update a host adapter only when at least one condition is true:

- The host has a real folder, command, hook, skill, MCP, index, or plugin mechanism.
- The project already has host-specific rules that future agents need to find.
- A host-specific capability needs a short pointer to `.gse/` to avoid duplicate policy.
- A migration is needed from an existing `.claude/`, `.codex/`, `.agents/`, or runtime-specific workflow into `.gse/`.

Do not create host folders just for decoration. If the host capability is unknown, document it as `unknown` in `.gse/project-profile.md`, `.gse/tooling.md`, or `.gse/host-capabilities.md`.

## Supported Host Shapes

| Host shape | Common adapter location | Adapter should contain | Must not contain |
|---|---|---|---|
| Codex-style | `.codex/`, Codex skills, MCP config | Pointer to `.gse/`, skill routing notes, MCP/index notes when verified | Full duplicate goal map or stale project rules |
| Claude Code-style | `.claude/commands/`, `.claude/agents/`, `.claude/hooks/` | Command/agent/hook entrypoints that read `.gse/` first | Independent process constitution that conflicts with `.gse/` |
| Hermes/AION-style runtime | runtime skills, worker adapters, memory/tool substrate docs | Runtime bridge notes and internal capability mapping | User-facing product identity or runtime leakage |
| WorkBuddy/other IDE agents | local docs, plugin settings, task templates | How that host finds `.gse/` and which tools are verified | Claims that unsupported subagent or tool APIs exist |
| Copilot/Gemini-style assistants | repository instructions, workspace docs | Short instruction to use `.gse/project-profile.md` and relevant gates | Host-specific long workflow copies |

## Adapter Contents

Use `assets/templates/host-adapter.md` for each adapter note.

For command adapters, use:

```text
node <gse-skill>/scripts/generate-command-adapter.mjs --target <project-root> --host claude|codex|hermes|workbuddy|copilot|gemini|generic|all
```

This creates the smallest host command pointer available for the selected host. Generated files must still point back to `.gse/`.

Generated command adapter locations:

| Host | Generated path | Native slash-command claim |
|---|---|---|
| Claude Code-style | `.claude/commands/gse.md` | yes, file-shape only; runtime proof still needs a host invocation record |
| Codex-style | `.codex/gse-command.md` | no |
| Hermes/AION-style runtime | `.gse/host-adapters/hermes-runtime.md` | no |
| WorkBuddy-style IDE agent | `.gse/host-adapters/workbuddy.md` | no |
| GitHub Copilot-style assistant | `.github/copilot-instructions.md` | no |
| Gemini-style assistant | `GEMINI.md` | no |
| Generic or unknown agent host | `.gse/host-adapters/generic-agent.md` | no |

The Hermes, WorkBuddy, Copilot, Gemini, and generic adapters are portable pointers. They exist to prevent host workflow drift, not to prove runtime support.

For real host execution evidence, use:

```text
node <gse-skill>/scripts/record-host-invocation.mjs --root <skill-or-project> --host <host> --invocation-method <method> --evidence-owner <owner> --evidence <thread-or-log> --portable-text-command true --native-slash-command false
```

Then run:

```text
node <gse-skill>/scripts/audit-host-runtime-invocations.mjs --root <skill-or-project>
```

Before release handoff or cross-host claims, run the fixture drill:

```text
node <gse-skill>/scripts/audit-host-runtime-invocation-drill.mjs --root <skill-or-project>
```

The drill writes temporary records for Claude, Codex, Hermes/AION-style, WorkBuddy, and generic hosts, then audits native versus portable evidence counts. It proves the record/audit mechanics only; it does not prove real host runtime support.

Generated adapters are not runtime proof. A host capability becomes verified only when a persistent host invocation record exists and the audit can parse it.

Minimum fields:

- Host name and adapter path.
- Source of truth: always `.gse/` unless the project explicitly says otherwise.
- Verified capabilities: commands, hooks, MCP, LSP/index, subagents, browser, CI.
- Unverified or unavailable capabilities.
- How to start meaningful work in this host.
- Safety and permissions.
- Drift check owner or cadence.

## Host Capability Records

Use `.gse/host-capabilities.md` to keep a compact, auditable status table for host-native and tool capabilities:

- `native-slash-command`
- `browser`
- `mcp`
- `lsp`
- `subagent`
- `ci`

Status vocabulary: `verified`, `documented`, `unknown`, `unavailable`, `external-required`.

Rules:

- `verified` needs concrete project or host evidence.
- Native slash-command support cannot be verified from portable `run-gse-command.mjs` output.
- `documented` and `external-required` rows must include a claim boundary.
- Missing records are a continuation warning for new projects; invalid or overclaimed records fail the host capability audit.

Audit command:

```text
node <gse-skill>/scripts/audit-host-capabilities.mjs --target <project-root> --json
```

## Tool Status Rules

Use the same vocabulary as `references/tool-adapters.md`:

- `verified`: checked in this project or trusted local docs.
- `documented`: present in docs or config, not tested in this session.
- `unknown`: not confirmed.
- `unavailable`: expected but missing or failing.

Never mark a host capability as `verified` because another host has it. Subagents, hooks, MCP, and browser tools are host-specific.

## Drift Prevention

Use `references/drift-audit.md` when host-specific folders, hooks, skills, MCP, subagents, runtime adapters, or capability claims may have drifted from `.gse/`.

When adding a host adapter:

1. Keep policy in `.gse/` and link back from the host folder.
2. Copy only the shortest host-specific command or pointer needed.
3. Add the adapter to `.gse/project-profile.md` under `Agent Host Adapters`.
4. Add any verified commands to `.gse/tooling.md`.
5. If the adapter changes task routing, update `.gse/goal-map.md` or `.gse/quality-gates.md` only once in the portable layer.

## Review Checklist

- Does the adapter point to `.gse/` before host-specific instructions?
- Are verified and unverified capabilities separated?
- Are secrets and write-capable tools documented without exposing credentials?
- Is there only one authoritative goal map and evidence location?
- Can a future agent using a different host still follow the project workflow?
