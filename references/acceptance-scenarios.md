# Acceptance Scenario Generator

Use this pack to turn a slice into concise acceptance scenarios that future agents can execute or verify.

## Scenario Selection

Generate only scenarios that match the changed surface:

- Frontend: visible state, interaction, route, layout, loading/empty/error/success, or accessibility behavior.
- Backend/API: request, validation, auth/session, response contract, persistence, error mapping, idempotency.
- Data/migration: fixture data before/after, rollback or compatibility expectation.
- Worker/queue: event input, retry/cancel/idempotency, final state or emitted artifact.
- CI/CD/deploy: build/package/workflow/deploy/rollback signal.
- Docs-only: source-of-truth boundary and rendered/linked artifact check.

## Format

Keep scenarios short:

```text
Scenario: <surface + behavior>
Given <precondition>
When <action or command>
Then <observable result>
Evidence: <command, file inspection, browser/API smoke, CI/deploy record, or external-required note>
Evidence level: <result|verified-unit|verified-component|verified-api|verified-browser|verified-ci|accepted-release|external-required>
```

## Rules

- Prefer one to three scenarios per slice.
- Do not invent unavailable tools.
- Do not require browser, CI, deploy, or database gates unless the slice claim needs them.
- If evidence is weaker than the intended claim, downgrade the claim or mark stronger proof as next action.

