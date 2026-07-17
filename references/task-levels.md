# Task Levels

Classify before choosing process weight.

## Level 1 - Lite

Use for small bugs, small UI/copy changes, scripts, docs, and narrow refactors.

Required artifacts:

- Inline `Outcome / Scope / Acceptance / Evidence / Next action`
- Focused verification command or manual evidence
- Learning only when reusable

No change folder required.

Gate profile:

- Run the narrowest focused test, smoke, structural check, or manual evidence that proves the changed behavior.
- Do not run build/typecheck/browser/full close gates by default unless the changed file or failure mode specifically requires them.
- Keep evidence inline or in the existing slice log; do not create long process artifacts for tiny state-only changes.

## Level 2 - Standard

Use for user-visible features, API changes, state-machine branches, cross-file behavior, or work expected to take more than one focused slice.

Required artifacts:

- Goal-map binding or project issue link
- `.gse/changes/<change-id>/brief.md`
- Acceptance and evidence log
- Focused tests or smoke verification

Use formal change packs when useful.

Gate profile:

- Run focused tests for changed behavior and one integration/API/UI smoke when the user-visible path needs it.
- Run build/typecheck before commit when the slice touches shared TypeScript contracts, Next routing/build-time code, generated package shape, or release/install paths.
- Prefer combining several tiny state-only changes into one user-visible product chain instead of committing each micro-state transition separately.

## Level 3 - Enterprise

Use for long-running product work, security, payments, data migrations, public contracts, release readiness, multi-agent coordination, or architecture changes.

Required artifacts:

- Goal-map node
- Spec or RFC
- Design notes, state machine, or risk matrix when relevant
- Quality gates and rollback plan
- Review and evidence
- Learning review after completion

Use change packs, CI gates, browser automation, and ADRs when relevant and verified. Use real subagents only for bounded, independent work with explicit ownership and clear parallel benefit; Enterprise level and multiple role responsibilities do not by themselves require dispatch.

Gate profile:

- Run focused verification plus the relevant hard gate for the risk: build, browser smoke, API smoke, install/distribution audit, security check, migration check, or close gate.
- Use full validation only for release, public contract, scaffold/skill, install, cross-host, or high-blast-radius changes.
- Keep evidence concise even when gates are heavy; link or summarize outputs instead of pasting logs.

## Core Profile Compatibility v1

- Level 1 and `lite` map to Lite.
- Level 2 and `standard` map to Standard.
- Level 3 and `enterprise` map to Enterprise.
- `assets/policies/profile-triggers.v1.json` is the machine-readable decision table.
- A user may raise rigor. A lower preference is ignored when a contributing trigger is hard or non-downgradeable.
- Unknown status for a possible hard-risk input returns `ask_user`; it never silently selects Lite or Standard.

## Upgrade Triggers

Upgrade one level when:

- Scope touches 3+ modules.
- A public API, data model, security boundary, or release process changes.
- Failure would block users or corrupt data.
- The same issue recurred.
- The task needs multiple agents or multiple sessions.

## Slice Sizing

Prefer a slice that proves one user-visible chain or one production capability boundary.

- Too small: only flips an internal status with no visible capability, no contract change, and no risk reduction.
- Healthy: covers a coherent path such as `bundle ShotSpec -> shot acceptance -> QA seed`, with focused tests proving the path.
- Too large: mixes unrelated product flows, broad refactors, and release/process changes that cannot be verified in one evidence pass.

For long-running productization, merge adjacent tiny state-machine steps when they are only meaningful together, but keep the acceptance proof focused.
