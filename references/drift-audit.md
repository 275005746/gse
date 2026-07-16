# Drift Audit

Use this when project reality may have diverged from `.gse/`, project docs, generated scaffolds, host adapters, tool assumptions, model routing, or recorded evidence.

Drift audit keeps long-running agent work from following stale instructions. It is a focused consistency check, not a broad rewrite.

## Trigger Conditions

Run a drift audit when any of these are true:

- A command fails because package manager, runtime, service port, CI, browser, MCP, LSP, model, or host capability assumptions were stale.
- The user says a tool, standard, permission, or host capability exists but GSE cannot see it.
- `.gse/project-profile.md`, `.gse/tooling.md`, `.gse/goal-map.md`, `.gse/quality-gates.md`, or evidence records disagree with current project files.
- Generated scaffolds or host adapters were copied earlier and may no longer point to `.gse/` as the source of truth.
- A model/provider/tool route was previously documented but not recently verified.
- Release, recovery, incident, or repeated failure evidence suggests stale rules or stale assumptions.
- A future agent would likely choose the wrong workflow because old docs are more visible than current facts.

Do not run a broad drift audit for a tiny local edit unless the edit exposes stale project facts.

## Drift Categories

| Category | Examples | Default remediation |
|---|---|---|
| stale docs | README, AGENTS.md, architecture docs, ADRs, comments, old handoffs | Update or mark outdated; link to current source of truth |
| stale generated scaffolds | `.gse/` templates, copied host folders, generated commands, stale examples | Regenerate or patch the smallest affected artifact |
| stale host adapters | `.codex/`, `.claude/`, `.agents/`, MCP, hooks, subagent notes, runtime bridges | Point back to `.gse/`; update verified/unknown capability status |
| stale tool assumptions | package manager, scripts, ports, CI, browser, LSP, MCP, deployment, observability | Re-read project config; mark verified, documented, unknown, or unavailable |
| stale model assumptions | provider/model ids, capability fit, cost, latency, privacy, fallback, hosted tools | Reclassify with model-routing evidence; avoid claiming support without proof |
| stale project profile facts | identity, commands, standards, release rules, permissions, known gotchas | Refresh `.gse/project-profile.md` from current files only |
| stale evidence or goal-map state | completed work not reflected, obsolete next action, old risk still listed, missing residual risk | Update `.gse/evidence/`, `.gse/goal-map.md`, or `.gse/current-slice.md` concisely |

## Minimum Audit Record

Use this format in evidence logs or handoff notes:

```text
Drift scope:
Drift category:
Current source checked:
Stale or conflicting record:
Finding:
Remediation:
Evidence:
Follow-up slices:
```

Findings must come from current files, command output, local tool help, trusted project docs, or focused experiments. If the evidence is indirect, record a risk instead of a finding.

## Evidence Requirements

A drift audit should prove at least one of these:

- The recorded assumption still matches current project reality.
- The recorded assumption is stale and has been corrected or marked outdated.
- The current evidence is insufficient, so the status is `unknown` or a follow-up slice is required.
- The project has conflicting sources of truth and an owner decision is needed.

Use `verified`, `documented`, `unknown`, and `unavailable` consistently with references/tool-adapters.md. Do not promote `documented` or `unknown` to `verified` without current evidence.

## Remediation Paths

Choose the smallest durable remediation:

- Refresh `.gse/project-profile.md` when project commands, tools, standards, permissions, release rules, or known gotchas changed.
- Refresh `.gse/goal-map.md` or `.gse/current-slice.md` when next action, risks, or landed evidence are stale.
- Refresh host adapter notes when host-specific folders duplicate policy or claim unavailable capabilities.
- Refresh tool/model routing notes when provider, model, MCP, LSP, browser, CI, or deployment assumptions changed.
- Add a learning entry only when the drift pattern is reusable beyond the current slice.
- Add or update a script/template/gate when the same drift appears repeatedly.
- Run `scripts/audit-learning-drift.mjs --root <gse-skill> --target <project-root> --json` when `.gse/learning-promotions.md` or `/gse continue` shows promoted learning candidates. The audit surfaces candidates that are documented but not yet covered by a guard, quality gate, continue/close check, or focused script.

Never update stale docs by inventing support. Prefer `unknown` plus a focused verification action.

## Integration

- Use references/project-profile.md when drift affects project-specific standards, commands, tools, permissions, release rules, or known gotchas.
- Use references/host-adapters.md when drift affects Codex, Claude Code, Hermes/AION-style runtime, WorkBuddy, MCP, hooks, skills, subagents, or host-specific folders.
- Use references/tool-adapters.md when drift affects tool status, LSP/index, browser, CI, MCP, package manager, or command assumptions.
- Use references/model-routing.md when drift affects provider/model capability, cost, latency, privacy, fallback, or hosted tool behavior.
- Use references/learning-system.md when a drift pattern should be promoted into a lesson, checklist, gate, script, or skill update.
- Use references/recovery.md when drift is discovered during interrupted, failed, or handed-off work.
