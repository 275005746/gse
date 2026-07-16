# Change Brief

Change ID: gse-169-context-orchestrator

## Outcome

Add budget-aware context health, rollover routing, and bounded worker handoffs to GSE.

## Scope

Codex rollout audit, fixed budgets, `/gse context`, `/gse continue` health routing, context-pack containment, result capsule, docs, fixtures, and Lite validation.

## Non-goals

Host compaction, native task creation, or claims of real subagent execution.

## Acceptance

Context thresholds and compaction escalation are deterministic; orange/red route to rollover; context packs stay within target and budget; focused and Lite validation pass.

## Evidence Plan

Context orchestrator audit, continue preflight, real rollout audit, command/matrix audits, Lite validation, encoding, syntax, and diff checks.

## Risks

Host rollout schema can change, host evidence can be unavailable, and GSE cannot stop active-goal reinjection.

## Next Action

Commit, push, and open a pull request.
