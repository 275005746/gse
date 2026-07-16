# Model Routing

Use this when GSE work needs to choose a model, provider, hosted tool, local tool, browser agent, worker, or role-specific agent capability.

## Core Rule

Route by capability first, then cost, latency, privacy, context size, tool use, reliability, and evidence.

Do not hard-code one provider, one model family, or one host as the GSE default. Projects may define preferred providers, but GSE must preserve a portable fallback path.

## Capability-First Selection

Define the task capability before picking a model:

| Capability | Typical use | Routing preference |
|---|---|---|
| Fast classification | triage, route selection, small labels | lowest reliable latency/cost |
| Code location | symbol search, call chains, existing tests | LSP/index/search before stronger model reasoning |
| Mechanical edit | narrow transforms, boilerplate, local fixes | lower-cost coding-capable model if verification is strong |
| Implementation | bounded code slice, tests, integration | standard coding model with project context |
| Architecture/root cause | invariants, multi-file reasoning, debugging | highest-reasoning model available and approved |
| Review/QA | spec compliance, security, regressions, UI evidence | independent reviewer model or fresh context when risk is high |
| Long context synthesis | session working set, docs, logs, migration notes | model with adequate context and summarization behavior |
| Tool/worker execution | browser, shell, MCP, CI, queue, runtime worker | verified host/tool adapter, not just model choice |

## Status Vocabulary

Keep model availability separate from model behavior.

- `documented`: project docs, provider config, or host settings mention the model/tool.
- `verified`: this session or project evidence ran the model/tool successfully for the relevant capability.
- `unknown`: no trustworthy evidence yet.
- `unavailable`: expected model/tool is missing, blocked, failing, or forbidden.

A documented model is not verified. A verified chat response does not verify tool use, long context, latency, cost, or privacy behavior.

## Routing Inputs

Record these in `.gse/project-profile.md`, `.gse/tooling.md`, or a host adapter when relevant:

- Provider or host:
- Model/tool id:
- Capability:
- Status: documented | verified | unknown | unavailable
- Evidence path or command:
- Cost tier:
- Latency expectation:
- Context limit or practical context budget:
- Tool-use support:
- Privacy/security boundary:
- Fallback:
- Known failure modes:

## Decision Order

1. Use project-specific routing rules if they exist and do not conflict with current user instruction.
2. Prefer verified local tools for code location, tests, browser smoke, and CI before spending model reasoning.
3. Choose the cheapest/fastest model that can satisfy the capability with adequate verification.
4. Escalate to a stronger model when there is a clear reasoning, context, safety, or integration gap.
5. Use fresh context for review, QA, or high-risk architecture when current-session context may bias the result.
6. Fall back to a documented or generic model only when the task risk is low or verification can catch mistakes.
7. Record residual risk when model behavior is unknown or only structurally verified.

## Fallback Rules

- If preferred model is unavailable, use the next project-approved model with the same capability class.
- If tool-use support is unavailable, switch to manual shell/browser/CI verification when possible.
- If long-context support is unavailable, build a smaller working set and record omitted context.
- If privacy constraints forbid remote models, use local tools, local models, or ask for a project-approved path.
- If cost is high, reduce context, split the task, or use lower-tier models for locator/QA roles.
- Do not claim a fallback preserved quality unless focused evidence proves it.

## Evidence Requirements

For model routing claims, record:

```text
Capability:
Chosen model/tool:
Why this route:
Status: documented | verified | unknown | unavailable
Cost/latency notes:
Context/tool-use notes:
Privacy/security notes:
Fallback:
Evidence:
Residual risk:
```

## What Not To Do

- Do not route all tasks to the strongest model by default.
- Do not route all tasks to the cheapest model when failure would be expensive.
- Do not treat provider marketing claims as project evidence.
- Do not expose secrets, raw provider payloads, hidden reasoning, or private tool traces in user-facing output.
- Do not confuse model routing with provider adapter implementation.

## Project Integration

- `references/project-profile.md` records project-approved providers, model/tool ids, privacy limits, and fallback policy.
- `references/tool-adapters.md` records availability and verification status for host tools and model-backed tools.
- `references/host-adapters.md` records host-specific model, subagent, MCP, browser, and worker capabilities.
- `references/evidence-taxonomy.md` decides whether routing evidence is result, verified, or accepted.
