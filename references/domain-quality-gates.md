# Domain Quality Gates

Use this when a task has domain risk beyond basic file or script correctness. Pick only the gates that match the changed behavior and project risk.

This reference is risk-based. Lite work should not inherit every gate by default. Commercial, user-visible, data-bearing, security-sensitive, release, or long-running work should receive stronger gates.

## Selection Rule

Choose gates by asking:

1. What could fail for users, data, operators, maintainers, or future agents?
2. Which project files, tests, commands, docs, or runtime checks can prove the risk is controlled?
3. Is the evidence `result`, `verified`, or `accepted` according to `references/evidence-taxonomy.md`?
4. Is a tool merely documented, or was it actually run in this project/session?

Do not claim scan, audit, browser, accessibility, security, or resilience results unless the relevant command or inspection was actually executed.

## Scale Guidance

| Level | Default domain gate weight |
|---|---|
| Lite | Use only the directly relevant gate and one focused evidence point. |
| Standard | Use relevant domain gates plus regression or smoke evidence. |
| Enterprise | Use a risk matrix, review axis, release/recovery path, and project-specific evidence. |

Upgrade the gate weight when a change touches public APIs, user data, auth, payments, model/provider routing, migrations, release, cross-module state, worker orchestration, browser automation, or main-path UX.

## Gate Matrix

| Domain | Trigger | Minimum evidence | Escalate when |
|---|---|---|---|
| Security/privacy | Secrets, auth, permissions, user data, provider payloads, MCP/tools, browser traces, logs | Secret scan or file inspection, permission boundary review, no raw secrets/provider payloads in committed or user-visible output | Data exposure, auth bypass, destructive tools, public release, external services |
| Performance/cost | Latency, heavy context loading, loops, model/tool routing, worker queues, browser automation, large files | Focused timing, complexity review, query/count check, or explicit cost/latency rationale | Main path, repeated tasks, expensive models, user-visible slowness, scale-sensitive code |
| Accessibility | UI, keyboard flow, forms, visual states, text contrast, semantic structure | Browser smoke, component inspection, keyboard/focus check, or accessibility tool result when available | User-facing UI, forms, navigation, mobile/responsive layout, public release |
| Resilience/recovery | Retry, cancellation, timeout, idempotency, duplicate prevention, state recovery, fallback | Failure-path inspection, focused test/smoke for retry/cancel/error state, recovery record when interrupted | Worker/runtime changes, long tasks, external APIs, stateful workflows, release rollback |
| UI/browser | Visual behavior, loading/empty/error/success states, routing, layout, streaming, browser automation | Browser smoke, screenshot/visual inspection, component test, or DOM/state inspection | Main user flow, responsive UI, visual regression risk, rich interaction |
| API/state | API contracts, persistence, state machines, cache, sessions, concurrency, idempotency | Focused API smoke, state transition test, schema/config inspection, replay/idempotency check | Public API, cross-session state, migrations, concurrent writes, data retention |
| Data/migration | Schema, storage, generated artifacts, imports/exports, backward compatibility | Migration/rollback notes, fixture data smoke, backup/restore plan, compatibility check | Production data, irreversible transform, downgrade uncertainty, multi-version support |
| Model/tool routing | Model provider, tool call, MCP, browser, subagent, permission, cost route | Tool status marked documented/verified/unknown/unavailable; provider/model behavior verified only after execution | New provider, fallback, sensitive data, expensive model, hidden tool traces |
| Release/operations | Install, update, release notes, rollback, incident, observability | `references/release.md`, `references/recovery.md`, release readiness audit, known risks | Public handoff, package update, runtime compatibility, incident hotfix |

## Evidence Mapping

Use the narrowest evidence that would fail if the changed behavior were broken.

- File inspection can verify docs, templates, source-of-truth boundaries, and secret absence in touched files.
- Focused tests can verify code behavior, state transitions, error paths, and regressions.
- API smokes can verify contracts, persistence, and session behavior.
- Browser smokes can verify UI, accessibility basics, streaming, loading/error states, and layout-sensitive flows.
- Architecture/review scans can verify coupling, ownership, release risk, and residual risk when runtime execution is not available.

If evidence is unavailable, record `unknown` or `not ready`; do not promote to `verified`.

## Review Routing

- Use `references/review.md` for spec compliance, code quality, architecture drift, security/privacy, regression, and evidence review axes.
- Use `references/architecture-health.md` when the task touches structural boundaries, source-of-truth drift, dependency/security risk, performance/resilience, migration, or release impact.
- Use `references/release.md` and `references/recovery.md` when domain risk affects release, rollback, migration, incident response, or future-agent continuation.
- Use `.gse/project-profile.md` for project-specific commands, owners, threat model, performance budget, browser matrix, release gates, and compliance requirements.

## Output Format

Record domain gates compactly:

```text
Domain gates selected:
Why selected:
Evidence run:
Evidence status: result | verified | accepted | not ready
Unverified tools:
Residual risk:
Next action:
```

For skipped gates, say why they are not applicable or what evidence would be needed later.
