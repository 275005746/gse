# Goal Map

Goal maps keep long-running agent work from drifting.

## Source Boundary

Do not turn `.gse/goal-map.md` into a second product roadmap when the project already has a roadmap, architecture, PRD, vision, product plan, or existing goal document.

When adopting an existing project, triage the project docs before writing anything:

- Find the project's canonical product goal source first: roadmap, architecture, PRD, vision, product plan, or goal doc.
- `.gse/goal-map.md` stays an execution projection only: current focus, slice ledger, evidence pointers, risks, and next actions.
- `.gse/state.json` stores machine-readable continuation state and the current slice.
- `.gse/evidence/` stores proof, smoke output, and short execution records.
- `.gse/learnings.md` or `.learnings/` stores reusable lessons and guard candidates.
- If no canonical product goal source exists yet, use `.gse/goal-map.md` as a temporary working projection and create the missing source only when the project needs durable product intent.
- Conflict rule: canonical product goal source wins. Correct `.gse/goal-map.md` when its projection drifts.

Never copy execution history, evidence logs, or learning notes into the canonical product goal source. If that material starts to dominate the goal map, move it into `.gse/evidence/`, `.gse/state.json`, or a learning file and compact the projection.

When adopting an existing project, first look for similar goal artifacts instead of requiring a fixed filename. Good signals include file names or headings containing roadmap, architecture, PRD, vision, product plan, goal map, north star, strategy, 目标, 路线, 架构, 产品, 规划, 愿景, or 蓝图.

## Minimal Goal Node

```yaml
id: short-id
title: Human-readable goal
outcome: User or business outcome
status: planned | in_progress | verified | accepted | blocked
priority: P0 | P1 | P2 | P3
dependencies: []
acceptance: []
evidence: []
risks: []
next_slice: Short next action
last_updated: YYYY-MM-DD
```

## Update Rules

- Keep the goal map short enough to guide the next session.
- Put long logs under `.gse/evidence/` or project-specific evidence logs.
- Update status only when evidence supports the change.
- Show the next three slices for large projects.

## Drift Checks

Run a goal-map review when:

- The same topic repeats without progress.
- A module is marked done but lacks evidence.
- The project has many commits but no visible product progress.
- Agent sessions keep rediscovering the same context.

