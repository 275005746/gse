# Quality Gates

Pick gates by task risk.

## Universal Gate

- Outcome matches request.
- Scope did not expand silently.
- Acceptance has evidence.
- Evidence status uses `evidence-taxonomy.md`: result, verified, or accepted.
- Evidence level uses `evidence-taxonomy.md`: `result`, `verified-unit`, `verified-component`, `verified-api`, `verified-browser`, `verified-ci`, `accepted-owner`, `accepted-release`, or `external-required`.
- Do not claim `verified` or `accepted` when evidence only proves `result`.
- Do not describe `verified-component` or `verified-api` as `verified-browser`; record a downgrade when browser proof was required but only component/API proof ran.
- Dirty worktree contains only intended files; use `references/file-ownership.md` when ownership or pre-existing changes are unclear.
- Close checks must surface role-dispatch honesty, staged/unstaged/untracked worktree state, and staged generated/test artifacts before a slice is called complete.
- Final answer states evidence and remaining risk.
- Use `references/recovery.md` when work is interrupted, verification fails, rollback/resume decisions are needed, or another agent/session must continue.
- Check `.gse/project-guards.md` through `/gse continue` or `scripts/audit-project-guards.mjs` when recurring lessons may affect the slice.
- Check `.gse/host-capabilities.md` through `/gse continue` or `scripts/audit-host-capabilities.mjs` before claiming native slash-command, browser, MCP, LSP, subagent, or CI support.
- Check learning drift through `/gse continue` or `scripts/audit-learning-drift.mjs` before closing repeated-failure lessons as enforced.
- Use `references/review.md` when task risk requires spec compliance, code quality, architecture drift, security/privacy, regression, or evidence review.
- Use `references/domain-quality-gates.md` when task risk involves security/privacy, performance/cost, accessibility, resilience/recovery, UI/browser, API/state, data/migration, model/tool routing, or release/operations concerns.
- Use `references/architecture-health.md` when the task touches structural boundaries, coupling, source-of-truth drift, ownership, dependency/security risk, performance/resilience, migration, or release impact.
- Use `references/forward-test.md` for non-trivial GSE skill, scaffold, router, role, adapter, release, recovery, or packaging changes.

## Code Gates

- Focused tests for changed behavior.
- Typecheck/lint/build when relevant.
- Regression test for bug fixes when feasible.
- No unrelated refactors.

## Gate Profiles

Use the lightest gate profile that proves the claim.

### Lite Gate

Use for docs, scripts, copy, narrow state labels, and low-risk local helpers.

- Required: one focused command, structural check, or explicit manual evidence.
- Optional: encoding check when docs changed.
- Avoid by default: full build, browser smoke, distribution audit, or close gate unless the change touches those surfaces.

### Standard Gate

Use for user-visible product slices, shared state contracts, API behavior, persistence, or cross-file workflows.

- Required: focused tests for changed behavior.
- Add one relevant integration smoke when the slice affects a visible or persisted path.
- Build/typecheck is required when touching Next build-time code, shared TypeScript contracts, generated package shape, or release/install behavior.

### Enterprise Gate

Use for public release, install/update, security, migrations, cross-host support, skill/scaffold changes, or high-blast-radius architecture.

- Required: focused tests plus the hard gate matching the claim.
- Examples: distribution audit for install claims, release bundle audit for release handoff claims, browser smoke for UI reliability claims, security scan for permission/secrets claims.
- For GSE distribution checks, use `--profile smoke` for routine package/install/CLI/integrity evidence and `--profile full` for release, handoff, or installed-copy validation claims.
- Full validation belongs here, not on every small product slice.

Gate selection should be stated in evidence when a task could reasonably look heavier than the chosen profile.

Portable validation profile runner:

```text
node <gse-skill>/scripts/run-validation-profile.mjs --target <project-root> --profile lite|standard|enterprise|release
```

The consolidated validator also accepts the same profile routing for CI and daily work:

```text
node <gse-skill>/scripts/validate-gse.mjs --root <gse-skill> --profile lite|standard|enterprise|release|full --json
```

Use the profile runner when a host, user, or future agent needs a stable command instead of hand-selecting individual audit scripts. Use `validate-gse --profile lite` for routine CI and small GSE capability slices; use `--profile full` or omit `--profile` only when the claim requires the historical consolidated release/distribution validator. Both profile entrypoints report runtime duration and slowest checks so a timeout can be reduced to the heavy command that caused it.

## UI Gates

Use the `design` and `verification` contracts in `references/stage-orchestrator.md` before calling visible product work complete.

- Component test or browser smoke for visible behavior.
- Screenshot or visual inspection for layout-sensitive work.
- Use `verified-component` for component-only UI proof and `verified-browser` for browser/screenshot-backed UI proof.
- Loading, empty, error, success, retry, and cancelled states covered when relevant.

## Agent/Product Gates

Use `references/stage-orchestrator.md` to enforce opportunity, design, product-completion, and stage-transition gates.

- State machine transitions are explicit.
- Stop/retry/recovery behavior is defined.
- Tool/process traces do not reveal hidden reasoning, secrets, or raw provider payloads.
- Short/simple chats avoid heavy workflow paths.

## Release Gates

Use `references/release.md` when a task affects shipping, install, upgrade, runtime compatibility, migration, rollback, changelog/release notes, or release acceptance.

- Build/install smoke.
- Migration and rollback notes.
- Changelog or release note.
- Known risk list.
- Observability or incident path for risky changes.

## Domain Gates

Use `references/domain-quality-gates.md` to select only the domain gates that match the risk. Do not force all gates onto Lite tasks.

- Security/privacy: secrets, auth, permissions, user data, provider payloads, logs, browser traces, or tool permissions.
- Performance/cost: latency, heavy context loading, loops, model/tool routing, workers, queues, or large files.
- Accessibility: keyboard flow, focus, forms, semantics, contrast, responsive UI, or user-facing navigation.
- Resilience/recovery: retry, cancellation, timeout, idempotency, duplicate prevention, fallback, or state recovery.
- UI/browser: loading, empty, error, success, streaming, routing, layout, screenshot, or browser smoke needs.
- API/state: contracts, persistence, sessions, caches, state machines, concurrency, or idempotency.
- Data/migration: schema, storage, generated artifacts, import/export, compatibility, rollback, or downgrade risk.
- Model/tool routing: provider behavior, fallback, MCP, browser, subagent, tool status, permissions, or cost route.
