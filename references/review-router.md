# Review Router

Use this pack to select review axes for a slice without forcing every review on every project.

## Routing Rules

| Changed surface | Required review axes |
|---|---|
| Docs-only or state-only | spec compliance, evidence |
| Frontend/UI/browser | spec compliance, code quality, UI/browser evidence, accessibility when relevant |
| Backend/API/state | spec compliance, code quality, API/state, regression/missing-test |
| Data/migration | spec compliance, data/migration, recovery/rollback, evidence |
| Worker/queue/runtime | spec compliance, resilience/recovery, performance/cost when relevant |
| CI/CD/deploy/release | spec compliance, release/operations, rollback/evidence |
| Security/privacy/auth/secrets | security/privacy plus the changed surface review |
| Mixed slice | each touched surface gets its smallest relevant review axis |

## Minimum Gate

Review must answer:

1. Did the slice satisfy scope and acceptance?
2. Would the selected evidence fail if the changed behavior broke?
3. Are claim boundaries honest for unit, component, API, browser, CI, release, and external evidence?

## Evidence Boundary

Review output is not a substitute for runtime evidence. A review can approve the evidence story, but it cannot upgrade a claim beyond the strongest executed proof.

