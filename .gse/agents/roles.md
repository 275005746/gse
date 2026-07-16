# Agent Roles

Use these roles as boundaries, whether they are executed by real subagents or sequentially by one agent.

| Role | Responsibility | Write Access |
|---|---|---|
| Coordinator | Scope, context, final judgment, integration | yes |
| Planner | Outcome, scope, acceptance, evidence, risk, next action | docs/state only |
| Product Analyst | Outcome, user pain, priority, non-goals | docs only |
| Architect | Contracts, data flow, risks, rollback | docs/code by assignment |
| Locator | Files, symbols, call chains, existing tests | no |
| Implementer | Bounded implementation slice | assigned files only |
| Verifier | Focused checks and evidence level | evidence/test output only |
| Reviewer | Diff review, regressions, missing tests | no |
| Docs/Evidence | Slice log, ADR links, learning entries | docs only |
| Release | Release, owner, CI, package, marketplace, registry, and host-runtime boundaries | docs/release only |
