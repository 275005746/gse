# Review Protocol

Use this when GSE work needs a review beyond simple local verification: code changes, workflow rules, scaffolds, agent roles, adapters, release paths, security-sensitive behavior, or user-visible product behavior.

## Core Rule

Review must answer two separate questions:

1. Spec compliance: did we build the requested thing and only the requested thing?
2. Code/workflow quality: is the result maintainable, safe, testable, and consistent with the project?

Do not collapse these into a vague "looks good" check.

## When Review Is Required

| Task risk | Review requirement |
|---|---|
| Level 1 tiny edit | Optional; self-check against acceptance is enough when evidence is direct |
| Level 2 normal slice | Required if code, shared config, reusable templates, workflow rules, or user-visible behavior changed |
| Level 3 large/risky work | Required; separate spec compliance, quality, QA/evidence, and coordinator integration review |
| Security/privacy/release impact | Required; include security/privacy and rollback/evidence review |
| Multi-agent or delegated work | Required when roles modify files or produce evidence |

Review is unnecessary for evidence-only status updates, typo-only edits, or transient notes unless they change process meaning.

## Review Axes

### 1. Spec Compliance Review

Checks whether the result matches the defined outcome, scope, non-goals, and acceptance criteria.

Questions:

- Does the change satisfy the requested outcome?
- Did scope expand silently?
- Were non-goals respected?
- Are required files/artifacts present?
- Is the evidence directly tied to acceptance?
- Are user-visible names, identities, and permissions correct?

### 2. Code Quality Review

Checks maintainability and implementation quality.

Questions:

- Does the change follow existing project patterns?
- Is the code or workflow simpler than the problem requires?
- Are abstractions justified?
- Are generated files, lockfiles, or unrelated refactors avoided?
- Are edge cases, errors, retries, cancellation, or recovery handled when relevant?

### 3. Architecture Drift Review

Checks whether the change preserves project boundaries and long-term shape.

Questions:

- Did this introduce a new pattern without need?
- Does it cross module, package, product, or host boundaries incorrectly?
- Does it duplicate a source of truth?
- Does it create coupling that future agents will misunderstand?
- Should the issue be handled by a `references/architecture-health.md` scan?

### 4. Security And Privacy Review

Checks user data, secrets, permissions, external services, and tool traces.

Questions:

- Are secrets, tokens, raw provider payloads, and hidden reasoning excluded from user-visible output and committed files?
- Are write-capable tools and destructive commands bounded?
- Are external inputs treated as untrusted?
- Are privacy constraints respected for model routing, logs, browser traces, and MCP/tools?

### 5. Regression And Missing-Test Review

Checks whether the verification actually covers the changed behavior.

Questions:

- Would the focused test/smoke fail if the change were broken?
- Are existing tests or checks enough for this risk?
- Is a regression test needed for a bug fix?
- Are UI/API/state/error/cancel/retry paths covered when relevant?

### 6. Evidence Review

Checks whether the final claim is supported.

Questions:

- Is the status result, verified, or accepted according to `references/evidence-taxonomy.md`?
- Is residual risk recorded?
- Is a forward test required by `references/forward-test.md`?
- Are tool statuses documented, verified, unknown, or unavailable without exaggeration?

## Review Output

Use this concise format:

```text
Review type: spec compliance | code quality | architecture drift | security/privacy | regression/missing-test | evidence
Verdict: approve | request changes | needs context | not applicable
Severity: critical | important | suggestion | note
Findings:
Evidence checked:
Required fixes:
Deferred risks:
```

For no-issue reviews, say which axes were checked. Do not rubber-stamp with only `LGTM`.

## Severity Rules

- `critical`: security issue, data loss, broken main path, destructive operation, irreversible release risk.
- `important`: likely bug, missing acceptance evidence, meaningful architecture drift, missing regression coverage.
- `suggestion`: improvement that is useful but not required for this slice.
- `note`: context for future work, no action required.

## Multi-Agent Review Order

When using real subagents or sequential role simulation:

1. Builder reports files changed and verification run.
2. Spec compliance review checks scope and acceptance first.
3. Code quality review checks maintainability and risks second.
4. QA/evidence review confirms the verification story.
5. Coordinator integrates findings and decides final status.

Do not start code-quality approval before unresolved spec compliance issues are addressed.

## Bounded Review Cycle

A normal top-level implementation unit receives one bounded specification-compliance review and one bounded code/workflow-quality review. These reviews, along with QA/evidence checks, are `internal-only` execution actions inside the owning plan unit; they are not separate global tasks.

Re-review only the affected scope after a confirmed finding has been repaired. Suggestions, unconfirmed concerns, reads, probes, tests, retries, fix attempts, and evidence collection must not create review loops or global tasks. Additional risk-specific axes may still be selected, but they remain bounded internal actions. Separate reviewers are optional when independent judgment is unnecessary; sequential role execution is valid when its evidence boundary is stated honestly.

## Project Integration

- `references/agent-roles.md` defines Reviewer and QA responsibilities.
- `assets/templates/dispatch-packet.md` records whether spec compliance, code quality, QA/evidence, and coordinator review are required.
- `references/architecture-health.md` defines structural scan triggers, scope levels, findings, risks, decisions, and follow-up slices.
- `references/quality-gates.md` decides when review is required by risk.
- `references/domain-quality-gates.md` selects security/privacy, performance/cost, accessibility, resilience/recovery, UI/browser, API/state, data/migration, model/tool routing, and release/operations gates by domain risk.
- `references/evidence-taxonomy.md` decides whether a reviewed result is verified or accepted.
- `.gse/project-profile.md` can add project-specific review standards, owners, or required commands.
