# Release Workflow

Use this when a GSE slice affects shipping, installation, upgrade, runtime compatibility, user-visible behavior, migrations, rollback, changelog policy, or long-running project readiness.

Release workflow is a gate, not a deployment tool. It defines what must be known before claiming a release is ready.

## Trigger Conditions

Run this workflow when any of these are true:

- A change is intended for a versioned release, public handoff, package update, installer update, or user-facing delivery.
- A change affects install, bootstrap, update, compatibility, migration, rollback, data retention, or runtime configuration.
- A change modifies product identity, permissions, model/provider routing, worker behavior, state persistence, evidence gates, or generated project scaffold files.
- A bug fix touches a main path where regression risk matters.
- Architecture health scan reports migration, release, rollback, dependency, security, or ownership risk.
- The project requires changelog, release notes, approvals, or deployment evidence.

For tiny internal edits with no release surface, record why release workflow is not applicable.

## Release Levels

Pick the smallest release level that matches the blast radius.

| Level | Use when | Minimum gate |
|---|---|---|
| Patch | Bug fix, doc correction, template wording, low-risk scaffold update | Focused verification, known risk, release note if user-visible |
| Minor | New capability, new template, new script behavior, new adapter route, non-breaking workflow change | Focused verification, backward compatibility check, rollback or revert path, release notes |
| Major | Breaking workflow, migration, removed behavior, changed source of truth, broad architecture change | Migration plan, rollback plan, compatibility notes, architecture health scan, release acceptance evidence |
| Incident hotfix | Urgent fix for broken main path, data risk, security/privacy issue, release blocker | Minimal safe fix, reproduction or failure evidence, focused verification, incident follow-up |

## Minimum Release Checklist

Before calling a release ready, confirm:

- Outcome and scope match the accepted goal or spec.
- Version or release label is known, or the project explicitly does not use version labels.
- Changelog or release notes explain user-visible changes, breaking changes, migration notes, and known risks.
- Focused verification proves the changed behavior, not only file existence.
- Compatibility impact is checked against supported hosts, runtimes, package managers, project modes, and important configuration paths.
- Migration and rollback expectations are documented for any state, schema, config, scaffold, or runtime change.
- Security, privacy, permissions, secrets, and raw tool/provider traces are reviewed when relevant.
- Observability, error diagnosis, or incident path is adequate for risky changes.
- Evidence status is classified with references/evidence-taxonomy.md: result, verified, or accepted.
- Follow-up slices are recorded instead of hidden in final prose.

## Migration And Rollback

Capture migration and rollback at the same level of detail as the risk.

For low-risk changes:

- State whether revert is enough.
- Name the files or artifacts that would be reverted.

For stateful or compatibility-impacting changes:

- Define old state, new state, and compatibility window.
- Define data backup, restore, or fallback behavior.
- Define how to detect failed migration or partial rollout.
- Define whether downgrade is supported.

For release-blocking uncertainty, do not claim accepted. Record a decision needed or follow-up slice.

## Changelog And Release Notes Policy

Use the project convention first. If none exists, keep release notes short and structured:

```text
Release label:
Date:
Type: patch | minor | major | incident hotfix
Highlights:
Changed:
Fixed:
Migration or rollback:
Known risks:
Verification:
Follow-up slices:
```

Rules:

- Mention user-visible behavior separately from internal implementation.
- Mark breaking changes clearly.
- Do not include secrets, raw provider payloads, private reasoning, or noisy command logs.
- Link to evidence files or CI/test results instead of pasting long output.
- If the release is internal-only, say so and explain the affected operators or future agents.

## Release Evidence Record

Use `assets/templates/update-release-acceptance-record.md` when a project needs to preserve local decisions, changed files, rollback notes, owner gate, accepted-by status, and residual risk in one compact record.

For quick release notes, use this concise format in evidence logs or release notes:

```text
Release scope:
Release level:
Readiness: not ready | result | verified | accepted
Verification evidence:
Compatibility evidence:
Migration or rollback:
Known risks:
Decisions needed:
Follow-up slices:
```

Readiness meanings:

- not ready: required release evidence is missing or contradicted.
- result: release artifacts or notes exist, but behavior is not verified.
- verified: focused checks prove release-relevant behavior in the current environment.
- accepted: the required owner, CI, smoke, or production-like evidence for this release level has passed.

Do not mark `accepted` only because local validation passed. Use `accepted` only when the required owner, release policy, CI gate, smoke gate, archive gate, or explicitly named acceptance policy accepts the verified result.

## Integration

- Use references/quality-gates.md for the base release gate list.
- Use references/public-release.md before public GitHub, marketplace, catalog, registry, or external package handoff.
- Use references/architecture-health.md when migration, rollback, dependency, security, performance, resilience, compatibility, or source-of-truth risk exists.
- Use references/review.md for spec compliance, code quality, security/privacy, regression, and evidence review before release.
- Use references/project-profile.md for project-specific release commands, versioning, deployment, rollback, and approval rules.
- Use references/evidence-taxonomy.md to avoid overstating readiness.
- Use references/recovery.md when release work is interrupted, rollback is possible, verification fails, or future-agent continuation is needed.
- Use references/forward-test.md for non-trivial GSE release, scaffold, adapter, recovery, or packaging changes.
- Use `assets/templates/update-release-acceptance-record.md` for project-local update and release acceptance records.
