# Architecture Health

Use this when a change may affect the long-term shape of a project, not only the immediate behavior. Architecture health checks look for structural drift that can make future work slower, riskier, or harder for agents to understand.

## Trigger Conditions

Run an architecture health scan when any of these are true:

- A change crosses module boundaries, package boundaries, runtime boundaries, product boundaries, or host adapter boundaries.
- A new subsystem, provider, model route, worker, storage layer, queue, browser/runtime path, or deployment path is added.
- Repeated bugs suggest hidden coupling, unclear ownership, duplicated logic, or a missing source of truth.
- A dependency, security boundary, permission model, migration, release path, or rollback path changes.
- Performance, resilience, cancellation, retry, state recovery, or observability behavior is material to the slice.
- Project docs, generated artifacts, code, and .gse/ records disagree about the intended design.

Do not run a broad scan for tiny local edits unless the edit touches a structural boundary.

## Scope Levels

Pick the smallest scan that can prove the risk is understood.

| Level | Use when | Minimum evidence |
|---|---|---|
| Lightweight local scan | One file, one module, one adapter, or one narrow workflow changed | Relevant files, nearest tests/checks, project rules that govern the area |
| Subsystem scan | A feature crosses modules, storage/state, API/UI, worker/runtime, or tool boundaries | Call flow, data ownership, source-of-truth records, focused verification |
| Broad architecture review | Large refactor, new platform capability, release/migration risk, recurring failures, or uncertain ownership | Architecture docs, ADRs, project profile, dependency/release notes, evidence and follow-up slices |

## Scan Axes

### Module Boundaries

- Are module boundaries, package boundaries, runtime boundaries, and host adapter boundaries still clear?
- Did the change import across layers in a way the project does not already allow?
- Is shared behavior placed in the right owner instead of copied into callers?

### Coupling And Cohesion

- Did the change create tight coupling between UI, API, worker, storage, tools, models, or host-specific adapters?
- Can a future agent change one concern without understanding unrelated concerns?
- Are abstractions justified by repeated complexity or existing project patterns?

### Source Of Truth Drift

- Is there one source of truth for goals, specs, state, memory, routing, configuration, and evidence?
- Do docs, code, scripts, templates, generated files, and .gse/ records agree?
- Are compatibility names or legacy internal names contained behind adapters rather than exposed as product truth?

### Dependency And Security Risk

- Did dependencies, provider SDKs, MCP/tool integrations, or browser/runtime permissions change?
- Are dependency and security assumptions verified, documented, or explicitly unknown?
- Are secrets, raw provider payloads, hidden reasoning, and privileged tool traces excluded from user-visible or committed outputs?

### Ownership And Change Control

- Which module, team, role, or agent owns the changed behavior?
- Are file ownership and multi-agent lock rules clear enough to prevent overlapping edits?
- Does the change need an ADR, project-profile update, or future release note?

### Performance And Resilience

- Could the design add latency, heavy context loading, unnecessary worker paths, repeated browser loops, or expensive model routes?
- Are cancellation, retry, timeout, recovery, idempotency, and duplicate prevention considered where relevant?
- Is observability enough to diagnose failure without leaking sensitive data?

### Migration And Release Impact

- Does the change affect install, upgrade, data migration, backward compatibility, rollback, or release acceptance?
- Are migration and release risks captured as decisions or follow-up slices rather than hidden assumptions?
- Is the verification scope strong enough for the release risk?

## Output Format

Keep the output concise. Link to evidence instead of pasting long logs.

```text
Scan scope:
Findings:
Risks:
Decisions needed:
Follow-up slices:
Evidence:
```

## Classification Rules

- Findings are observed facts from code, docs, scripts, tests, or runtime behavior.
- Risks are plausible future failures or maintenance costs that the current evidence does not eliminate.
- Decisions needed are architecture choices that require owner, user, or project-standard confirmation.
- Follow-up slices are bounded implementation or documentation steps that can be verified later.

Do not label a guess as a finding. If evidence is indirect, record it as a risk or assumption and choose a follow-up slice.

## Integration

- Use references/review.md for the review axes and severity language.
- Use references/quality-gates.md to decide whether architecture health is required for the task risk.
- Use references/file-ownership.md when ownership, dirty worktree, or multi-agent overlap is unclear.
- Use references/project-profile.md and project architecture docs as the source of project-specific standards.
- Use references/release.md when architecture risk affects migration, rollback, compatibility, changelog/release notes, or release acceptance.
- Use references/evidence-taxonomy.md to classify the final claim as result, verified, or accepted.
