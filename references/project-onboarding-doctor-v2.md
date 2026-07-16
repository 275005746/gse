# Project Onboarding Doctor v2

Use this pack when applying GSE to an existing project, recovering a stale `.gse` workspace, or continuing a project whose stack, commands, canonical docs, host capabilities, or quality gates are unclear.

## Discovery Order

1. Current user instruction and `AGENTS.md` or host-specific rules.
2. Existing canonical product goal source: roadmap, architecture, PRD, vision, ADR, or project plan.
3. `.gse/state.json`, `.gse/project-profile.md`, `.gse/goal-map.md`, quality gates, evidence index, and host capability records.
4. Package/build/test/CI/deploy files.
5. Only then infer stack profile and delivery packs.

## Minimum Gate

- Identify the project type: frontend app, backend/API, full-stack app, worker/queue, DB migration project, library/CLI, docs-only, or mixed.
- Identify canonical product goal source without creating a duplicate roadmap.
- Mark tool status as documented, verified, unknown, unavailable, or external-required.
- Recommend the next smallest delivery pack and verification set.

## Evidence Boundary

Onboarding doctor evidence proves routing readiness only. It does not prove feature completion, browser behavior, CI success, deployment, or target-session adoption.

## Output Shape

```text
Project type:
Canonical goal source:
Changed surface:
Recommended delivery pack:
Minimum verification:
Unknown tools:
Do not claim:
Next action:
```

