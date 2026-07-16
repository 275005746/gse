# Evidence Taxonomy

Use this to decide whether work is only produced, actually verified, or accepted.

GSE uses three evidence gates:

```text
result -> verified -> accepted
```

Do not skip gates. Do not claim a higher gate when the evidence only proves a lower gate.

## Evidence Status vs Evidence Level

Evidence status answers whether the work is result, verified, or accepted.

Evidence level answers what kind of proof produced that status.

Keep both dimensions visible for non-trivial work:

```text
status: result | verified | accepted | blocked | not ready
evidenceLevel: result | verified-unit | verified-component | verified-api | verified-browser | verified-ci | accepted-owner | accepted-release | external-required
requiredEvidenceLevel: optional expected level for the claim
```

Use the narrowest honest level:

| Evidence level | Meaning | Typical proof |
|---|---|---|
| `result` | Artifact exists or command produced an output, but behavior is not verified. | file exists, generated report, dry-run output |
| `verified-unit` | Unit or script-level behavior is verified. | focused unit test, parser test, structure audit |
| `verified-component` | Component-level or local integration behavior is verified without a real browser/runtime path. | component test, fixture integration, store/API mock |
| `verified-api` | API/state contract is verified through an API, route, database, or state-machine check. | API smoke, state contract test, persistence fixture |
| `verified-browser` | User-visible browser behavior is verified in a real browser automation or equivalent rendered UI smoke. | Playwright/browser smoke, screenshot-backed UI check |
| `verified-ci` | CI or release pipeline executed and passed in the target environment. | public CI run, release workflow run, build pipeline evidence |
| `accepted-owner` | Owner/reviewer accepts a verified result. | explicit owner acceptance, review approval, accepted project record |
| `accepted-release` | Release/publication gate accepts the verified result. | release record, package publication record, marketplace approval |
| `external-required` | Required evidence depends on an external owner, host, marketplace, registry, or runtime not available in the current local run. | native slash-command host proof, marketplace approval, public release gate |

Examples:

- A UI component test can be `status: verified` with `evidenceLevel: verified-component`, but it must not be described as browser proof.
- A Playwright smoke can be `status: verified` with `evidenceLevel: verified-browser`.
- A public CI record can be `status: verified` or `accepted` with `evidenceLevel: verified-ci`, depending on the project acceptance policy.
- A pending native slash-command claim should stay `evidenceLevel: external-required` until a real host invocation record exists.

## Gate 1: Result

`result` means the requested artifact or change exists.

Enough evidence:

- File, script, template, reference, commit, report, screenshot, or generated output exists.
- The change is scoped to the requested slice.
- The agent can point to the exact path or output.

Not enough for `result`:

- A plan to create the artifact.
- A final answer describing what would be changed.
- A command that was intended to write a file but did not confirm the file exists.

Example:

- `scripts/audit-gse.mjs` exists: result.
- `.gse/project-profile.md` was written in a temp fixture: result.

## Gate 2: Verified

`verified` means the result was checked against acceptance criteria with evidence appropriate to the risk.

Enough evidence:

- Focused test, smoke, structure check, build, typecheck, lint, browser check, API check, or manual inspection directly covers the acceptance criteria.
- The command output or inspected artifact proves the expected behavior.
- Known residual risk is recorded.

Not enough for `verified`:

- The file exists but was not inspected.
- A broad test passed but does not cover the changed behavior.
- A command ran without checking the relevant output.
- A tool is merely configured or documented but not run.
- The agent says it looks right without evidence.

Example:

- `audit-gse.mjs` reports `GSE-C04` as `strong (2/2, score 1)` after adding `router.md`: verified for the router structural criterion.
- A project profile lists Playwright as `documented` because config exists: not verified tool availability.

## Gate 3: Accepted

`accepted` means the verified result has been accepted by the required authority.

Enough evidence:

- The user explicitly accepts the result.
- A required reviewer or gate approves it.
- A release, archive, or project process marks it accepted.
- A pre-defined acceptance policy says verified evidence is sufficient for this task level.

Not enough for `accepted`:

- The agent is satisfied.
- The result passed a local smoke but no acceptance policy says that is enough.
- The user has not reviewed a user-facing, policy, release, or irreversible change when review is required.

Example:

- A focused smoke passes for an internal script: can be accepted by policy if the task is Lite or Standard and no human approval is required.
- A release plan or public workflow change usually needs explicit human acceptance or release-gate acceptance.

## Required Evidence Record

Every non-trivial GSE slice should record:

```text
Outcome:
Scope:
Acceptance:
Result evidence:
Verification evidence:
Evidence level:
Required evidence level:
Accepted by:
Residual risk:
Next action:
```

Use `accepted by: policy` only when the applicable policy is named, such as `Lite focused smoke policy`.

For project-local GSE updates, scaffold changes, host adapter changes, and release-readiness work, use `assets/templates/update-release-acceptance-record.md` so local decisions preserved, changed files, rollback notes, owner gate, accepted-by status, residual risks, and next action are not lost.

## Status Rules

- `planned`: desired but no result yet.
- `result`: artifact/change exists but has not been verified.
- `verified`: acceptance criteria are directly covered by evidence.
- `accepted`: verified result has user, reviewer, release, archive, or policy acceptance.
- `blocked`: meaningful progress cannot continue and the blocker satisfies the project's blocked rule.

## Tool Status Is Separate

Do not confuse evidence gates with tool availability status.

- `documented`: a file says a tool or command exists.
- `verified`: the tool or command was actually run or checked.
- `unknown`: no trustworthy evidence yet.
- `unavailable`: expected tool is missing or failing.

These tool statuses can support the evidence taxonomy, but they do not replace result/verified/accepted gates.

## Common Mistakes

- Treating generated files as verified behavior.
- Treating config presence as a working tool.
- Treating a broad green test as evidence for a narrow change without coverage proof.
- Treating an internal smoke as user acceptance for visible product behavior.
- Updating goal status to complete when the evidence only proves one slice.
