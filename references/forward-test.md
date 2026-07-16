# Forward Test Protocol

Use this when changing GSE itself, changing reusable project scaffolds, or changing workflow rules that future agents must follow.

Forward testing asks: can a future agent, fresh session, or fixture project use this change without relying on the author's memory?

## Test Levels

| Level | Meaning | Evidence gate | Use when |
|---|---|---|---|
| Structural smoke | Files, routing, audit criteria, and key text exist | verified for structure | Small reference/template/script changes |
| Fixture forward test | A temp project or example repo uses the GSE path end to end | verified for workflow behavior | Bootstrap/profile/templates/adapters change |
| Fresh-session forward test | A separate agent/session follows GSE with minimal context | accepted candidate | Non-trivial skill behavior, routing, multi-agent, release, recovery, or public-facing workflow changes |

Do not call structural smoke a true forward-test acceptance. It proves the artifact is wired; it does not prove future-agent usability.

## When Required

Forward testing is required for:

- New or changed scripts under `scripts/` that future projects will run.
- Project scaffold changes under `scripts/init-project.mjs` or `assets/templates/` that affect downstream projects.
- Router, quality gate, evidence, role, ownership, host adapter, release, recovery, or packaging rules.
- Any change that claims a GSE capability is accepted rather than merely present or structurally verified.

Forward testing is optional for:

- Narrow wording edits that do not change behavior.
- Evidence log updates.
- Internal goal-map/current-slice status updates.
- Small typo fixes in already tested references.

Forward testing is unnecessary for:

- Purely transient notes.
- Local-only command output not used as reusable workflow evidence.
- Work explicitly marked as draft or design judgment.

## Core Scenarios

Pick the smallest scenario that covers the changed behavior.

### Fresh Project Bootstrap

Use when bootstrap, templates, project profile, quality gates, or scaffold layout changes.

Smoke:

1. Create a temp project directory.
2. Run `node <gse>/scripts/init-project.mjs --target <temp> --mode lite|standard|enterprise` as appropriate.
3. Verify expected `.gse/` files exist.
4. Verify rerun safety without `--force` when relevant.
5. Record generated-file and cleanup policy.

### Existing Repo Adoption

Use when project-profile, discovery, dirty-worktree, tool adapters, or quality gates change.

Smoke:

1. Use a fixture or temp repo with representative files such as `package.json`, `AGENTS.md`, CI config, browser config, and `.env.example`.
2. Run discovery or manual project-profile steps.
3. Verify tool statuses stay `documented`, `verified`, `unknown`, or `unavailable` without inventing support.
4. Verify dirty or pre-existing files are not overwritten.

### Host Adapter Usage

Use when `.codex/`, `.claude/`, `.agents/`, Hermes/AION-style runtime, WorkBuddy, MCP, hook, skill, or plugin adapter rules change.

Smoke:

1. Create or inspect a host adapter note using `assets/templates/host-adapter.md`.
2. Confirm it points back to `.gse/` as source of truth.
3. Mark host-specific capabilities with tool status evidence.
4. Confirm no unsupported subagent, MCP, hook, or browser capability is claimed as verified.

### Subagent Or Role Fallback

Use when agent roles, dispatch packets, ownership, review, or multi-agent rules change.

Smoke:

1. Fill `assets/templates/dispatch-packet.md` for one locator, builder, reviewer, QA, or docs role.
2. Include role, objective, required context, allowed files, forbidden files, expected output, verification, and stop conditions.
3. State whether execution is real-subagent, sequential-role, or handoff-session.
4. Verify fallback says no real delegation occurred when subagent tools are unavailable.
5. Verify final evidence distinguishes result, verified, and accepted.

## Evidence Requirements

Every forward-test record should include:

```text
Forward-test level:
Scenario:
Changed behavior:
Commands or inspection:
Result evidence:
Verification evidence:
Accepted by:
Residual risk:
Next action:
```

Use `accepted by: policy` only when the applicable policy is named. Use `accepted by: fresh-session` only when a separate agent/session actually ran the path.

Use `assets/templates/acceptance-execution-packet.md` when a fresh-session or owner-approved project write needs an explicit execution boundary before acceptance can be claimed.

## Acceptance Rules

- Structural smoke can make a slice `verified` for file/routing coverage.
- Fixture forward test can make a workflow `verified` for the tested scenario.
- Fresh-session forward test can support `accepted` when the fresh agent completes the intended path with only the documented GSE inputs.
- If only structural smoke ran, record the remaining need for fixture or fresh-session testing as residual risk.
- If a host tool is unavailable, the fallback path can be verified, but the unavailable tool capability is not verified.

## Failure Handling

If a forward test fails:

1. Record the exact missing context, broken route, command failure, or ambiguity.
2. Fix the smallest reusable artifact: script, template, reference, router, or gate.
3. Re-run the same scenario.
4. Add a learning entry only when the failure is reusable beyond the current slice.

## Integration Points

- `references/evidence-taxonomy.md` decides result, verified, and accepted status.
- `references/benchmark-audit.md` records when a GSE change needs forward-test coverage.
- `references/quality-gates.md` applies forward-test requirements before completion.
- `scripts/audit-project.mjs` verifies bootstrap scaffold generation and rerun safety in temporary project directories.
- `scripts/audit-fixtures.mjs` provides a lightweight fixture audit for project-profile discovery and host-adapter/drift scenarios.
- `.gse/evidence/YYYY-MM-DD.md` records scenario, commands, results, residual risk, and next action.
