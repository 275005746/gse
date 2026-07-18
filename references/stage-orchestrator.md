# Stage Orchestrator

Use this as the first control layer for meaningful project work. It decides where the project is now, which small context pack is needed, what must be produced, and whether the workflow may advance.

Core loop:

```text
inspect evidence -> select current stage -> load stage pack -> execute bounded work -> run evidence gate -> advance or loop back
```

The orchestrator controls continuity. Domain skills, tools, and workers remain optional stage executors.

## Stage Decision

Determine the stage from repository evidence, not the user's wording alone.

Inspect in this order:

1. Project rules and safety constraints.
2. Existing roadmap, PRD, requirements, design, architecture, plan, code, tests, evidence, release, and learning artifacts.
3. `.gse/state.json`, `.gse/current-slice.md`, and active change folders when present.
4. The current request and conversation history.

State is a hint, not proof. Conversation history is a hint, not proof. The deterministic detector is advisory only: it must never overwrite an approved persisted phase, an approved plan, or the active task/slice state. When persisted approved state conflicts with file heuristics, return both values, mark the conflict, and route using the approved state; record the heuristic as an advisory for review. If no approved stage exists, the detector may provide a conservative suggestion, but it still does not authorize lifecycle advancement.

For an existing project, do not restart the lifecycle. Find the first unmet gate that blocks the requested outcome. Preserve valid project artifacts and continue from that stage. An earlier gap may cause `loop_back`; it does not authorize rewriting unrelated project history.

Run the deterministic advisor when useful:

```text
node <skill>/scripts/detect-project-stage.mjs --target <project-root> --intent "<current request>" --json
```

The advisor is evidence discovery, not final judgment. Inspect its basis before acting. Any override must name the stronger repository evidence.

## Stage Model

| Stage | Enter when | Minimum stage artifact | Gate to advance |
|---|---|---|---|
| `intake` | Goal, user, constraints, or project state is unclear | Project/change brief | Outcome, target user, constraints, non-goals, and entry decision are explicit |
| `opportunity` | A product or major capability has not proved why it should exist | Opportunity brief | User pain, alternatives, differentiation, success metric, and go/no-go are evidenced |
| `requirements` | Scope, workflow, edge cases, or acceptance is missing | Requirements/spec | Core workflows have testable acceptance criteria and non-goals |
| `design` | UX, UI, information architecture, visual direction, or visible states are unresolved | Flow/state map and design direction | References, hierarchy, responsive rules, and visible states are reviewed |
| `architecture` | Boundaries, APIs, data, security, recovery, or major tradeoffs are unresolved | Architecture/contracts or ADR | Contracts and risks are testable and recovery is defined |
| `planning` | Accepted intent cannot yet be executed as bounded slices | Ordered task plan | Tasks have dependencies, Definition of Done, ownership, and evidence |
| `implementation` | Required upstream gates pass and a bounded slice is ready | Code or working artifact | Focused checks pass and the implementation matches accepted artifacts |
| `verification` | Implementation exists but product claims are not proved | Verification report | Acceptance criteria pass at the evidence level required by each claim |
| `release` | A verified result needs packaging, migration, deployment, or publication | Release artifact and notes | Intended users can use it; smoke, risk, and rollback evidence exist |
| `learning` | Delivery, feedback, or failure should improve the next cycle | Learning or operations record | Reusable lessons are promoted to a bounded rule, gate, test, or next slice |

`learning` can be entered after any failed or completed stage. It does not replace the stage that owns a failed gate.

## Progressive Disclosure

Load only the current-stage references first. Do not load every GSE reference, every installed Skill, or every project document at startup.

Start with:

- this file;
- the project rules and current evidence named by the stage decision;
- the two to five references or Skills required by the current gate.

Load another reference only when a named risk, tool, changed surface, or failed gate requires it. After the stage passes, discard stale detail and load the next stage pack.

## Required Decision Output

Keep the routing decision compact and machine-scannable:

```yaml
current_stage: intake | opportunity | requirements | design | architecture | planning | implementation | verification | release | learning
stage_basis:
  - repository evidence used for the decision
missing_artifacts:
  - artifact or proof blocking advancement
required_references:
  - current-stage reference or Skill only
role_route:
  - accountable role
evidence_gate: pass condition for this stage
next_stage: next lifecycle stage when the gate passes
decision: proceed | loop_back | ask_user | block | complete
```

Use `ask_user` only when an unanswered choice materially changes product direction, safety, cost, publication, destructive action, or permissions. Otherwise state a conservative assumption and proceed.

## Product Quality Gates

### Opportunity Gate

Do not build a product shell merely because the implementation is easy.

Before a new product or major product direction enters requirements, establish:

- target user and concrete situation;
- painful or costly job to be done;
- current alternative or comparable product;
- meaningful differentiation;
- success signal and realistic scope;
- explicit go/no-go or narrower experiment.

Current market claims need current sources. Assumptions must be labeled. A landing page, generated copy, feature list, or working form does not prove product value.

### Design Gate

Before visible UI implementation or completion:

- select one to five design inputs appropriate to the product and state the adapted pattern: layout, spacing, typography, information density, motion, or interaction;
- define information hierarchy and the primary user path;
- cover empty, loading, error, success, disabled, long-content, and responsive states when relevant;
- adapt design inputs to the project's design system instead of copying surface style;
- define browser and screenshot evidence required for the visible claim.

Generic gradients, decorative cards, and a familiar dashboard frame are not design evidence. If no project-specific design input exists, use a small relevant input pool and record the chosen direction before coding.

### Product Completion Gate

A demo shell is not complete merely because files exist or a page opens.

Product completion requires:

- the intended user can finish the core task end to end;
- important states and failure paths behave coherently;
- implementation matches requirements, design, and contracts;
- tests, browser/runtime checks, and screenshots match the claims being made;
- security, accessibility, performance, release, or data gates run when their risks apply;
- residual risks and intentionally deferred scope are explicit.

If the evidence proves only a component, fixture, static page, or local smoke, report that narrower result. Do not call it a finished product.

## Role And Skill Routing

| Stage | Accountable roles | Typical optional Skills/tools |
|---|---|---|
| `intake` | Coordinator, Planner | `interview-me`, repository/memory inspection |
| `opportunity` | Product Analyst, Planner | product evidence, market evidence, current-source research |
| `requirements` | Product Analyst, Planner | GSE spec workflow |
| `design` | Product Analyst, Builder, QA | design notes, UI tools, Figma, browser tools |
| `architecture` | Architect, Reviewer | API/interface, ADR, security, data, performance skills |
| `planning` | Planner, Architect | planning/task-breakdown, change protocol |
| `implementation` | Code Locator, Builder, Verifier | TDD, incremental implementation, LSP, project tools |
| `verification` | Verifier, Reviewer, QA | code review, browser QA, API smoke, verification-before-completion |
| `release` | Release, Docs/Evidence | CI/CD, shipping, deployment, migration tools |
| `learning` | Coordinator, Docs/Evidence | learning records, postmortem, analytics/operations tools |

Use real workers only when dispatch capability exists and file ownership is clear. Otherwise execute the roles sequentially in one Agent. A worker result is provisional until the stage evidence gate accepts it.

## Gate Decisions

- `proceed`: work inside the current stage; advancement has not yet been claimed.
- `loop_back`: implementation or a later artifact exists, but an earlier required gate is missing or failed.
- `ask_user`: a material product, safety, permission, or external-action decision is unresolved.
- `block`: required evidence or authority is unavailable and safe progress cannot continue.
- `complete`: the requested delivery boundary and every applicable evidence gate passed.

On gate failure, return to the responsible stage. Do not patch the verification report to hide failure, and do not continue forward with a provisional worker result.

## Common Failure Corrections

| Failure | Correction |
|---|---|
| Agent codes from a vague product idea | Return to `intake` or `opportunity` |
| Existing project is replanned from zero | Reinspect existing evidence and select the first unmet gate |
| All references are loaded at startup | Keep only the current-stage pack and named risk references |
| UI looks generic but functions | Return to `design`; select design inputs and rerun visual/browser review |
| Code and change files exist, so work is called complete | Enter `verification` and prove acceptance criteria at claim-matched evidence levels |
| Worker says done without artifacts | Keep status provisional and run the evidence gate |
| Verification fails | `loop_back` to the stage responsible for the failed criterion |
