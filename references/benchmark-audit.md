# GSE Gap Audit

Use this when improving GSE itself: changing the GSE skill, its scripts, templates, references, project scaffold, or development goals.

## Purpose

GSE development must proactively find workflow gaps. Do not wait for missing requirements to appear during manual testing.

Run this audit against GSE-owned files, local project evidence, tool help for commands being invoked, and focused experiments. Label design judgments separately from verified facts.

Before implementing a GSE core capability change, check `references/capability-execution-matrix.md`. If the capability is missing or stale, update the Capability Execution Matrix first, then implement. Validate the routing with:

```text
node scripts/audit-capability-execution-matrix.mjs --root . --json
```

## Audit Inputs

Use only inputs that are inside the current project or directly needed to verify a command:

- Local GSE files under `.gse/`, `references/`, `scripts/`, `assets/`, and package metadata.
- Project rules only when GSE is being tested inside a real project: `AGENTS.md`, project profile, ADRs, issue tracker docs, CI config, and test scripts.
- Tool help or official docs only when the change depends on that tool behavior.
- Focused fixture runs and real target-project drills when they are explicitly part of the evidence plan.


## GSE Development Audit Matrix

Score each area as `missing`, `thin`, `usable`, or `strong`.

| Area | Questions |
|---|---|
| Setup | Can a new agent install or initialize GSE without guessing? |
| Router | Is there a clear map from user intent to GSE references, scripts, and modes? |
| Capability Execution Matrix | Is each core capability bound to GSE behavior, implementation routes, current gap, next slice, evidence level, focused verification, and claim boundary? |
| Goal Map | Are GSE's north star, current priority, risks, and next slice visible? |
| Domain Model | Is shared language captured, challenged, and updated? |
| Specs | Are GSE change outcome, scope, non-goals, contracts, and acceptance explicit? |
| Task Slicing | Are tasks vertical, independently verifiable, and sized by risk? |
| Tool Acceleration | Are search, LSP/index, browser, API, MCP, and CI tools recorded with fallbacks? |
| Multi-Agent | Are roles, dispatch packets, file ownership, review gates, and no-fake-delegation rules clear? |
| Implementation | Does GSE development preserve local patterns and avoid unrelated expansion? |
| Testing | Are focused tests, smoke, regression, and UI verification rules present? |
| Review | Are spec compliance and code quality reviewed separately? |
| Evidence | Is GSE change evidence recorded with commands and residual risk? |
| Release | Are migration, rollout, rollback, smoke, and known-risk steps defined? |
| Incident | Is there a path for failures, postmortems, and prevention gates? |
| Learning | Are reusable lessons promoted into rules, gates, or templates? |
| Context Hygiene | Are handoff, compaction, stale-context, and token-budget rules defined? |
| Adapter Drift | Are host-specific GSE adapters prevented from diverging from the portable source of truth? |
| Security | Are secrets, permissions, destructive tools, and external services bounded? |
| Observability | Are traces, cost, retries, failures, and long-running state captured when relevant? |

## Required Output

```text
Outcome:
Audit inputs:
Strong areas:
Gaps:
Design goal updates:
Next action:
Evidence:
```

## Design Goal Update Rules

- Add a goal only when it prevents a real failure mode or improves repeatable quality.
- Prefer a small artifact or script over a large prose rule.
- Keep hard prerequisites minimal; record optional adapters separately.
- Turn recurring user corrections into audits, gates, or templates.
- For non-trivial GSE changes, use `references/forward-test.md` to decide whether structural smoke, fixture forward test, or fresh-session forward test is required.

## Current Known GSE Gaps

- Remaining final-form gaps are owner/external evidence gates: public repository settings, public CI run, public security contact, registry publication, marketplace approval, native slash-command evidence, and other host runtime invocation.
- Local future-hardening candidates should come from fresh GSE audit evidence, not from a historical comparison list.
