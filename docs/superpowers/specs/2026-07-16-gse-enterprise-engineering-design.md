# GSE Enterprise Engineering Architecture Design

Status: Proposed
Date: 2026-07-16
Target baseline: GSE 1.0.0

## 1. Purpose

This document defines the recommended next-generation architecture for GSE as a self-contained engineering operating system for AI coding Agents. GSE must be able to guide one Agent or a project-local group of Agents from an initial requirement to a verifiable software delivery across frontend, backend, full-stack, CLI, desktop/mobile, data, AI/Agent, and infrastructure projects.

GSE will natively provide the useful semantics associated with lifecycle orchestration, specification management, disciplined execution, context governance, and project-local Agent coordination. It may learn from established tools and patterns, but it must not require Comet, OpenSpec, Superpowers, or another workflow product at runtime.

The governing principle is:

```text
Constrain outcomes, permissions, safety, state consistency, and evidence.
Do not prescribe implementation mechanics when the Agent can choose them safely.
```

## 2. Product Boundary

### 2.1 GSE is

- A thin host-facing Skill and natural-language interface.
- A deterministic local Core and CLI.
- A portable project-local engineering state model under `.gse/`.
- A lifecycle, specification, verification, context, and Agent-management system.
- A policy engine that scales rigor by complexity, risk, and coordination needs.
- A host-adaptive workflow that runs without a required server or cloud service.

### 2.2 GSE is not

- A cross-host Agent communication hub or replacement for Agent Hub.
- A mandatory background service, centralized database, or hosted control plane.
- A Jira, Linear, GitHub, CI, deployment platform, or source-control replacement.
- A fixed chain of persona prompts that every task must execute.
- A compatibility runtime for Comet, OpenSpec, or Superpowers.
- An automatic production deployment system.

GSE Agent management is strictly project-internal. Cross-host coordination, native-host message protocols, and shared orchestration state belong to Agent Hub or the host itself. GSE can be used by an Agent inside such a host, but neither system depends on the other.

## 3. Delivery Boundary

The default GSE completion boundary is **verifiable delivery**:

- the requested behavior is implemented;
- applicable tests, lint, type checks, and builds pass;
- real browser, API, CLI, runtime, migration, security, performance, accessibility, or data checks run when the affected surface requires them;
- evidence is fresh and tied to the current revision;
- residual risks and deferred scope are explicit;
- the result is ready for submission, handoff, or a separately authorized release process.

Deployment, publication, production migration, marketplace submission, and external communication remain outside the default boundary. They require an explicit user request, required authority, and a separate release policy.

## 4. Architectural Shape

GSE remains one installable package:

```text
GSE Package
├── Skill Router
├── Core Engine
├── Embedded CLI
├── Capability Modules
├── Host Adapters
└── Schemas and Templates
```

### 4.1 Interaction layer

The interaction layer provides `/gse ...`, natural-language routing, host Skill metadata, concise status, and decision prompts. It does not duplicate policy or own durable state.

### 4.2 Orchestration layer

The orchestration layer owns:

- lifecycle state;
- automatic profile classification;
- risk and permission policy;
- current Change selection;
- gate evaluation;
- user-decision escalation;
- recovery routing;
- context-pack selection;
- Agent task coordination.

### 4.3 Execution modules

Execution modules provide bounded capabilities:

- Goal and discovery;
- specification and Change management;
- architecture and planning;
- implementation discipline;
- verification and evidence;
- context orchestration;
- Agent coordination;
- domain gates;
- learning and drift control.

Modules expose contracts to Core. They do not define a mandatory sequence of tools, Skills, roles, or coding techniques.

### 4.4 Persistence layer

Use formats by responsibility:

- JSON for state, profiles, policies, DAGs, leases, capability registries, and manifests;
- Markdown with YAML frontmatter for briefs, specifications, designs, reviews, decisions, and human handoff;
- JSONL for evidence events, audit events, task transitions, and immutable history.

`.gse/` remains the portable source of truth. Host directories contain only thin adapters and verified host-specific metadata.

## 5. Core Contract

Every Core operation returns an envelope conforming to a versioned JSON Schema. The minimum contract is:

```json
{
  "schemaVersion": 1,
  "operationId": "op-01J...",
  "status": "proceed",
  "stage": "build",
  "reasonCode": "EVIDENCE_STALE",
  "message": "Browser evidence predates the latest UI change.",
  "changeId": "checkout-accessibility",
  "taskId": "verify-responsive-layout",
  "stateRevision": 17,
  "requiredActions": ["rerun browser verification"],
  "artifactRefs": [".gse/changes/checkout-accessibility/review.md"],
  "evidenceRefs": [],
  "diagnostics": [],
  "safeToRetry": true
}
```

`status` is one of `proceed`, `repair`, `ask_user`, `blocked`, or `complete`. The 1.0 `block` decision remains an accepted input alias during migration and is normalized to `blocked` in new output. Validation errors return a valid envelope with diagnostics. A process crash produces no success envelope; the next operation detects the incomplete transaction through the journal. Partial writes return `repair` only after recovery has established which atomic steps committed.

Core is responsible for deterministic facts and invariants. The host Agent is responsible for judgment inside the allowed boundary.

### 5.1 Core-enforced invariants

These are architecture-wide invariants activated by the increment that introduces their governed capability. The Section 20 foundation enforces applicable state, evidence, capability-claim, secret-handling, and mutation invariants. Later increments must activate the remaining invariants before advertising the corresponding capability.

1. Project rules and explicit user instructions override GSE defaults.
2. Hard-risk work cannot be classified below Enterprise.
3. Destructive, external, security-sensitive, costly, or architecture-changing actions require the configured authority.
4. State cannot advance when required artifacts or evidence are missing, contradictory, stale, or tied to an older revision.
5. A delegated task cannot be accepted without artifacts and claim-matched verification.
6. Concurrent writers cannot own overlapping write surfaces without isolation and an explicit merge strategy.
7. Capability claims must use verified host or project evidence.
8. Close cannot silently convert `result` into `verified` or `verified` into `accepted`.
9. GSE-owned structured records must use allowlisted fields, exclude raw command output and known credential fields, and apply configured and recognized secret-pattern redaction before persistence. Suspected secret content blocks the write. Unknown secrets already embedded in user-owned source artifacts are outside this guarantee and remain an explicit limitation.
10. A serious domain blocker cannot be downgraded by user profile preference.

Everything else should be a selected policy or guidance, not a universal hard gate.

## 6. Lifecycle Model

The external lifecycle is:

```text
Frame → Specify → Build → Verify → Close
```

Goal, Evidence, and Learn are cross-cutting concerns rather than sequential stages.

For compatibility with GSE 1.0, existing stage names and command outputs remain accepted throughout the migration. Core applies this mapping:

| GSE 1.0 stage | Five-stage lifecycle |
|---|---|
| `intake`, `opportunity` | `frame` |
| `requirements`, `design`, `architecture`, `planning` | `specify` |
| `implementation` | `build` |
| `verification` | `verify` |
| `learning` | cross-cutting `learn` concern |

The 1.0 `release` stage is not folded into Close. It remains a separately authorized post-Close flow because deployment, publication, and production migration are outside the default delivery boundary. Existing `discover`, `repair`, `package`, `release`, and `public-release` commands remain supported while their implementations migrate to the shared Core contract.

### 6.1 Frame

Frame establishes the requested outcome, current repository state, affected users, constraints, non-goals, delivery boundary, material unknowns, and initial risk classification.

A new product or major direction also establishes user pain, alternatives, differentiation, and a success signal. An existing project resumes at the first unmet gate instead of restarting the lifecycle.

Frame exits when the system can state what must change, why it matters, what is excluded, and which decisions materially affect cost, safety, architecture, or product direction.

### 6.2 Specify

Specify converts accepted intent into testable contracts. Depending on the profile, it creates or links:

- brief;
- behavioral specification;
- design and architecture decisions;
- data, API, security, privacy, and recovery contracts;
- ordered tasks or a dependency DAG;
- acceptance criteria;
- required evidence classes;
- residual risk and rollback expectations.

The OpenSpec-like capability is native GSE Change management, not an external dependency. Discovery output, selected direction, promoted Change, implementation, verification, and acceptance remain distinct states.

### 6.3 Build

Build executes bounded work against the accepted contracts. GSE constrains scope, permissions, ownership, state transitions, and required outcomes. The Agent chooses implementation techniques, coding order, tools, Skills, models, roles, and safe parallelism.

Build prefers existing project patterns, then official framework or SDK implementations, then mature compatible open-source solutions, then established architecture patterns. Custom implementation is the final option when those sources are inadequate.

A material dependency or architecture choice requires user approval when it changes long-term maintenance, licensing, supply-chain exposure, cost, public contracts, security posture, or replacement difficulty.

### 6.4 Verify

Verify proves each acceptance claim at the evidence level required by its affected surface. It includes focused checks and relevant integration or real-runtime checks. Generated files, a passing syntax check, or an Agent assertion are not sufficient proof of user-visible behavior.

Failed verification routes back to the responsible stage and task. Reports cannot be edited to hide a failed gate.

### 6.5 Close

Close reconciles specification, implementation, evidence, state, risks, and learning. A Change can close only when:

- all blocking acceptance criteria pass;
- required evidence is current;
- state and evidence agree;
- serious findings are resolved or explicitly accepted by authorized policy;
- residual risks and deferred scope are recorded;
- reusable lessons are captured or intentionally declined;
- the default verifiable-delivery boundary is satisfied.

Close archives a Change without implying deployment, publication, or external acceptance.

## 7. Profile and Risk Classification

GSE keeps Lite, Standard, and Enterprise profiles but classifies them across three independent dimensions:

```text
Profile = f(Complexity, Risk, Coordination)
```

### 7.1 Complexity

Signals include changed modules, contract breadth, state-machine depth, architecture impact, expected duration, and integration count.

### 7.2 Risk

Signals include failure impact, reversibility, sensitive data, security boundaries, money, compliance, public contracts, migrations, production operations, and user harm.

### 7.3 Coordination

Signals include multiple active Changes, multiple writers, multiple repositories, handoffs, multiple sessions, worktree isolation, and independent verification requirements.

The classifier returns the selected profile, contributing signals, applicable policies, mandatory gates, confidence, and the versioned trigger IDs that produced the result. The implementation maintains a decision table whose rows define the signal, required input, profile floor, overrideability, unknown-input behavior, and resulting policies. Unknown status for a possible hard-risk trigger yields Enterprise or `ask_user`; it never silently chooses Lite or Standard. Users may raise rigor. They may lower a classification only when every contributing trigger is explicitly marked soft and downgradeable.

Hard Enterprise triggers include:

- authentication, authorization, secrets, or trust boundaries;
- payments, money, or financial records;
- sensitive or regulated data;
- irreversible or production data migrations;
- public APIs, schemas, protocols, or compatibility contracts;
- production release or deployment;
- compliance or legal obligations;
- high-blast-radius infrastructure changes.

## 8. Progressive Context Loading

Context selection is computed as:

```text
Context Pack = Stage × Profile × Risk Tags × Role
```

The system loads the smallest pack that can safely complete the current task.

### 8.1 Context layers

- **L0 Project Kernel:** repository rules, project profile, commands, architecture index, current state, and safety boundaries.
- **L1 Change Context:** accepted brief, specification, design decisions, contracts, risks, and current Change state.
- **L2 Role Context:** only the policies and reference material required for the current capability or role.
- **L3 Task Context:** objective, acceptance, dependencies, allowed files, selected code excerpts, verification, and stop conditions.
- **L4 Evidence Context:** only evidence and findings needed to decide the current gate.

L0 is compact and stable. L1-L4 are loaded on demand and discarded or checkpointed when stale.

### 8.2 Context health

The existing green/yellow/orange/red health policy remains, with bounded context packs, tool-output limits, result capsules, checkpoints, and rollover advice. Core may prepare a handoff and recommend a new task, but it must not claim it compacted a live host session or created a native host task unless the adapter proves that capability.

### 8.3 Retention rules

- Durable intent belongs in the canonical goal source.
- Active work belongs in the current Change and task state.
- Historical proof belongs in JSONL evidence and archives.
- Conversation history is never the only source of truth.
- Raw logs and full worker transcripts are not copied into coordinator context.
- Retrieval stops when the bounded pack is sufficient; context accumulation is not a success metric.

## 9. Native Change and Specification System

GSE supports multiple active Changes in one project. Each Change has an independent lifecycle, profile, risk set, dependency graph, evidence requirements, and close decision.

Recommended layout:

```text
.gse/
  state.json
  project-profile.md
  policies/
  changes/
    <change-id>/
      change.json
      brief.md
      spec.md
      design.md
      tasks.json
      review.md
      evidence.jsonl
  agents/
    registry.json
    leases.jsonl
  evidence/
    index.jsonl
  audit/
    events.jsonl
  archive/
```

Lite work may remain inline when a Change folder would add no clarity. Standard and Enterprise work use durable Change artifacts.

### 9.1 Change states

```text
draft → framed → specified → building → verifying → verified → closed
```

Exception states:

```text
needs_decision | blocked | failed | superseded | cancelled
```

State transitions are computed from artifacts and evidence. A stored state is a cache, not authority when repository evidence contradicts it.

### 9.2 Mutation and concurrency protocol

Every mutating Core operation must:

1. acquire a project-local lock with an operation ID and expiry;
2. read and validate the expected state revision;
3. persist a transaction manifest containing the complete write set, expected revisions, before and after digests, and staged paths;
4. append an intent event with an idempotency key;
5. stage every JSON replacement and JSONL append under the transaction ID;
6. publish one durable commit marker as the transaction authority point;
7. expose the new state revision and committed events;
8. release the lock.

The implementation defines lock acquisition, renewal, expiry, stale-owner recovery, and retry limits using a monotonic process clock where available and persisted wall-clock timestamps for audit. A revision mismatch returns `repair` or a safe retry instead of overwriting another writer. Recovery treats the commit marker as authoritative: it must roll forward or roll back every write in the manifest as one unit, and no partially committed transaction may advance a gate. JSONL readers accept a valid committed prefix, quarantine a corrupt or truncated tail, and never treat an uncommitted staged event as durable. Replaying the same transaction, operation, or event ID must be idempotent. Fault-injection tests cover process termination between every durable step.

## 10. Project-Local Agent Management

Agent management is capability-driven, not persona-driven. Roles are optional labels for responsibilities; Core coordinates tasks and evidence.

### 10.1 Task model

Each task declares:

- objective;
- acceptance criteria;
- dependencies;
- read and write surfaces;
- required context pack;
- selected policies and domain gates;
- verification contract;
- stop conditions;
- lease owner and expiry;
- result and evidence references.

Task states are:

```text
pending → ready → leased → running → provisional → verifying → accepted → closed
```

Exception states are:

```text
needs_context | blocked | failed | cancelled | superseded
```

### 10.2 DAG and scheduling

Core derives runnable tasks from dependency and ownership constraints. The host decides whether to use a subagent, background task, worktree, sequential execution, or the main Agent. GSE never fabricates dispatch.

Parallel execution is allowed when:

- dependencies permit it;
- write surfaces do not overlap, or each writer has isolation;
- integration ownership is explicit;
- verification remains independent for high-risk changes;
- context health leaves sufficient coordinator reserve.

### 10.3 Leases and ownership

A lease is time-bounded and tied to a task, Agent identity, host session, state revision, worktree or branch when used, and allowed write surface. Core defines acquisition, renewal cadence, maximum duration, expiry, release, and stale-owner recovery. Lease decisions use the same project mutation lock and revision checks as other state changes. Expired or abandoned leases return to recovery instead of silently granting duplicate ownership; a replacement writer must acquire a new lease at a later revision.

Read-only locators, researchers, reviewers, and verifiers do not need write leases unless explicitly assigned an evidence artifact.

### 10.4 Result acceptance

Worker output is always provisional. The coordinator or an independent verifier accepts it only after checking the declared artifacts, diff, tests, and required evidence. High-risk tasks require verifier independence from the implementing Agent when the host can provide it; otherwise the limitation is explicit and the policy chooses additional deterministic checks or user review.

## 11. Evidence and Audit Model

Evidence levels remain:

```text
result → verified → accepted
```

- `result`: an artifact exists or an operation returned output.
- `verified`: current, claim-matched checks prove behavior in the relevant environment.
- `accepted`: an authorized owner, CI policy, review policy, release gate, or product acceptance gate accepts the verified result.

Every evidence record contains:

- Change and task identifiers;
- claim and evidence class;
- command, tool, or review method;
- timestamp;
- source revision, dirty-worktree digest, or artifact digest;
- explicit input paths and generated artifacts;
- relevant configuration keys and contract revision;
- environment fingerprint and host capability basis;
- invalidation scope;
- outcome;
- limitations;
- producing Agent or actor;
- related files or artifacts.

Evidence is current only when every declared dependency still matches. A source path or generated artifact digest change, relevant configuration change, contract revision change, environment-fingerprint mismatch, or capability-basis change invalidates the evidence classes listed in its invalidation scope. Evidence without sufficient dependency metadata is downgraded rather than assumed fresh. This makes staleness computable for committed revisions, dirty worktrees, generated files, and environment-sensitive checks.

The audit log records lifecycle transitions, classification changes, policy overrides, user decisions, leases, evidence creation, gate results, and recovery actions. It must exclude secrets and avoid unbounded command output.

## 12. Policies, Guidance, and User Decisions

GSE separates control into three levels:

### 12.1 Invariants

Deterministic, non-optional constraints enforced by Core, limited to safety, authority, state integrity, evidence integrity, and concurrency integrity.

### 12.2 Policies

Rules selected dynamically by profile, risk tags, project conventions, and host capabilities. Examples include independent review, browser verification, migration rehearsal, dependency audit, accessibility checks, or rollback proof.

Policies can define whether a failed or downgraded check blocks Close. Hard-risk policies cannot be overridden by lowering the profile.

### 12.3 Guidance

Progressively loaded recommendations for implementation technique, architecture, design, testing, and tool selection. Guidance helps Agents but does not create artificial stage gates.

GSE asks the user only when a decision materially changes product direction, architecture, security, privacy, compatibility, long-term dependency burden, cost, publication, destructive action, or required permissions. Once those decisions are resolved, the Agent continues autonomously until a new material decision or genuine blocker appears.

## 13. Source-Driven and Open-Source-First Development

Before custom implementation, the Agent evaluates sources in this order:

```text
Existing project implementation
→ official SDK, framework, template, or platform pattern
→ mature compatible open-source implementation
→ established architecture pattern
→ custom implementation
```

Evaluation criteria include:

- functional and architectural fit;
- license and attribution obligations;
- maintenance activity and release health;
- known vulnerabilities and security posture;
- dependency and bundle weight;
- supply-chain exposure;
- API stability and upgrade path;
- operational cost;
- replacement or exit strategy.

GSE records the chosen source class and material decision, but does not require a long comparison artifact for routine, low-risk library use already established by the project.

## 14. Domain Quality Gate Taxonomy

Core selects implemented domain gates from changed surfaces and risk tags. Gates are additive and evidence-driven, not a fixed checklist for every task. A gate family may report `supported` only when its policy schema, evaluator, evidence contract, and tests exist; otherwise it is `planned` or `unavailable` and cannot support a completion claim.

The planned taxonomy includes:

- frontend and UI;
- API and backend;
- database and migration;
- authentication and security;
- CLI;
- desktop and mobile;
- data and ML;
- AI and Agent behavior;
- infrastructure and operations;
- packaging and distribution;
- performance and reliability;
- accessibility and internationalization.

### 14.1 Frontend quality system

Frontend work starts with the existing project design system, product patterns, and content model. When no baseline exists, Specify records a small, relevant design direction rather than allowing generic shell generation.

Applicable evidence classes are:

```text
verified-ui-functional
verified-ui-layout
verified-ui-responsive
verified-ui-visual-review
verified-ui-accessibility
verified-ui-i18n
```

Verification covers, as applicable:

- primary user flow and meaningful failure states;
- loading, empty, error, success, disabled, and long-content states;
- information hierarchy and density;
- multiple viewport sizes;
- overlap, clipping, overflow, and unexpected scrolling;
- keyboard navigation and focus behavior;
- semantic structure, contrast, labels, and accessible names;
- UTF-8 rendering, multilingual strings, text expansion, and pseudo-localization;
- screenshots or browser evidence matched to the claimed visual result.

High-impact UI changes require an independent visual review when host capability exists. Serious overlap, overflow, mojibake, inaccessible core actions, missing critical states, severe hierarchy confusion, or severe responsive/accessibility failures block Close.

## 15. Host Adapter Contract

The first-class adapter targets are Claude Code and Codex. Hermes/AION is a planned later target. An adapter advertises verified capabilities, requests a host-owned action, and records invocation evidence. It may expose these request surfaces:

```text
capabilities()
requestCommand()
requestPreview()
requestBrowserInspection()
requestAgentDispatch()
requestIsolation()
requestDecision()
reportProgress()
```

The host Agent owns filesystem access, command execution, subagent dispatch, worktree creation, and permission prompts. Adapters must not implement cross-host messaging, durable worker scheduling, a shared orchestration database, or generic command/filesystem ownership. They translate between Core requests and verified host mechanisms, then return artifacts and evidence.

An adapter declares each capability as `verified`, `documented`, `unknown`, `unavailable`, or `external-required`. Core degrades safely:

- no subagents: execute tasks sequentially;
- no worktrees: limit writers to non-overlapping surfaces or one writer;
- no browser: downgrade UI evidence honestly and block claims whose policy requires browser proof;
- no LSP: use bounded search and project-native commands;
- no structured output: validate parsed fallback output before changing state;
- no background work: execute synchronously;
- low context: reduce pack size and checkpoint earlier.

Portable GSE scripts cannot imply native host support. Runtime claims require direct adapter or invocation evidence.

## 16. Recovery Model

Recovery is deterministic and conservative. Conflict precedence is explicit:

1. explicit user instructions and project rules govern authority and intended boundaries;
2. the accepted Change contract governs expected behavior;
3. repository artifacts establish implementation state;
4. fresh runtime evidence establishes observed behavior.

A lower layer cannot silently rewrite a higher layer. Conflicts return `ask_user`, `repair`, or `blocked`; observed behavior never modifies accepted intent by itself.

Recovery handles:

- invalid or contradictory state;
- stale evidence;
- abandoned leases;
- failed tasks;
- partial writes;
- merge conflicts;
- unavailable capabilities;
- context exhaustion;
- failed verification;
- superseded Changes.

Core returns a repair plan with reversible actions, required authority, and safe retry status. It does not guess missing facts, overwrite user changes, bypass hooks or gates, delete worktrees, rewrite history, or mark failed work complete.

When metadata and implementation artifacts disagree, Core applies the precedence above and records the discrepancy. Metadata is repaired only through an explicit, revision-checked, auditable transition; runtime evidence can confirm observed behavior but cannot override the accepted contract.

## 17. Installation and Runtime Model

GSE is distributed as one package containing the Skill, Core, CLI, modules, schemas, templates, and adapters. It runs locally with Node and needs no service deployment.

Representative entrypoints are:

```text
gse init
gse status
gse frame
gse specify
gse build
gse verify
gse close
gse doctor
```

The Skill maps natural-language requests to the same Core operations. The CLI and Skill must not implement separate state machines.

## 18. Compatibility and Migration from GSE 1.0

This design evolves the existing 1.0 capabilities:

- the existing detailed stages become internal sub-gates and capability packs under the five external stages;
- current change packs become the basis of native Change records;
- current task levels become the profile system, extended with independent complexity, risk, and coordination signals;
- current context health, checkpoints, and result capsules become Core context services;
- current roles and file ownership become the task DAG, lease, and result-acceptance model;
- current evidence levels and close audit become revision-aware evidence and gate contracts;
- current host capability registries become adapter capability negotiation;
- existing Markdown artifacts remain readable while new JSON and JSONL indexes provide deterministic state.

Migration is additive, versioned, and inspectable. Existing Markdown remains authoritative for human intent during the transition; generated JSON indexes are derived machine state until a Change explicitly adopts the new schema. The migration contract defines schema versions, field mappings, source precedence, duplicate/conflict reporting, rollback metadata, and mixed-format behavior. GSE reads 1.0 artifacts, derives a proposed state, reports every conflict, and writes upgraded indexes only with explicit execution under the mutation protocol. Dry-run and rollback tests must prove that source Markdown is byte-preserved. No compatibility layer is required for external workflow products.

## 19. Testing Strategy

### 19.1 Core contract tests

Test classification, hard-risk floors, lifecycle transitions, stale-evidence detection, contradictory-state repair, policy selection, result-envelope compatibility, deterministic replay, redaction, and mutation revision checks.

### 19.2 Module tests

Test Change creation and promotion, context-pack construction, evidence recording, gate evaluation, dependency evaluation, recovery plans, and adapter degradation independently.

### 19.3 Fault-injection and negative tests

Test lock races, stale and abandoned leases, process termination between transaction steps, partial atomic writes, corrupt JSON and truncated JSONL tails, duplicate event replay, migration rollback, dirty-worktree evidence invalidation, secret redaction, adapter capability overclaiming, verification produced against an older revision, and an observed behavior that conflicts with the accepted Change contract.

### 19.4 End-to-end fixtures

Maintain representative fixtures for:

- Lite documentation or local code change;
- Standard full-stack feature;
- Enterprise authentication or sensitive-data change;
- frontend feature with browser and accessibility evidence;
- migration with rollback requirements;
- multi-Agent isolated parallel work;
- host without subagents or browser support;
- context-pressure rollover;
- contradictory state and stale evidence;
- multiple active Changes with dependencies.

Each fixture proves behavior and claim boundaries, not just scaffold shape.

### 19.5 Dogfood validation

GSE development uses the same lifecycle, profile, context, evidence, and close rules. A release-sensitive change runs package, install, CLI, fixture, documentation, and adapter audits appropriate to its claims.

## 20. First Milestone Scope

The first implementation milestone establishes a compatible foundation without rewriting the full 1.0 system. It includes:

- versioned Core schemas and the result envelope;
- a versioned profile trigger table with hard-risk floors and compatibility mapping from current task levels;
- the five-stage compatibility facade over existing 1.0 stages and commands;
- one active Change represented through derived, revisioned machine state;
- revision-aware evidence dependencies and deterministic Close consistency checks;
- dry-run 1.0 migration inspection with no source-artifact rewriting;
- mutation locking, revision checks, atomic JSON writes, idempotent JSONL events, and recovery tests;
- focused Core and compatibility fixtures.

This milestone does not claim the complete architecture. It must preserve the current 1.0 workflow while establishing contracts that later increments can extend.

## 21. Subsequent Architecture Increments

After the foundation is accepted, separate releases add:

1. multiple active Changes and cross-Change dependency handling;
2. task DAGs, write ownership, leases, and provisional result acceptance;
3. context-pack service integration with the existing context-health system;
4. Claude Code and Codex executable adapters with honest capability negotiation;
5. implemented domain-policy modules, beginning with frontend quality gates;
6. expanded end-to-end fixtures, GSE dogfood migration, and release hardening.

Each increment has its own accepted specification, migration boundary, and claim-matched tests.

## 22. Explicit Non-Goals for the Architecture Program

- Cloud dashboard or required service.
- Central database or organization-wide control plane.
- Cross-project or cross-host Agent scheduler.
- Automatic production deployment or publication.
- Organization RBAC, billing, or compliance certification product.
- Replacement for issue trackers, source control, CI, or deployment platforms.
- First-class support for every Agent host.
- Automatic ingestion of arbitrary external workflow formats.
- Long-term compatibility runtime for Comet, OpenSpec, or Superpowers.
- Mandatory use of subagents, worktrees, browser automation, LSP, MCP, or CI.

## 23. Acceptance Criteria for the Architecture

Every criterion below must map to one or more named fixtures and machine-checkable assertions. The fixture manifest defines expected result envelopes, maximum context-pack files and estimated tokens, required state revisions, invariant checks, evidence classes, and blocker reason codes. Terms such as `material requirement` and `serious UI failure` are represented by enumerated fixtures and policy codes rather than reviewer interpretation alone.

The design is successfully implemented when:

1. The `fresh-project-progressive-load` fixture initializes or adopts GSE, identifies the expected first unmet gate, and stays within the fixture's maximum context-pack file and token limits.
2. The representative `standard-full-stack-delivery` and `enterprise-sensitive-change` fixtures reach the expected Frame, Specify, Build, Verify, and Close envelopes at verifiable delivery.
3. The `parallel-changes` fixture completes interleaved transactions with monotonic revisions, no uncommitted event visibility, no lost update, and no violated ownership invariant.
4. Multiple Agents can coordinate through tasks, ownership, leases, bounded context, provisional results, and independent verification where available.
5. Hard-risk work cannot bypass Enterprise gates by lowering the profile.
6. State, artifacts, and evidence cannot disagree while Close reports success.
7. The `frontend-blockers` fixture maps overlap, overflow, mojibake, inaccessible core action, missing critical state, hierarchy failure, responsive failure, and accessibility failure to enumerated blocker codes and prevents Close.
8. Missing host capabilities degrade honestly without making portable GSE unusable.
9. Existing GSE 1.0 projects can be inspected and migrated without destructive rewriting.
10. GSE remains one locally installable Skill + Core/CLI package with no required server.

## 24. Implementation Sequencing Constraint

This architecture is too broad for one undifferentiated implementation slice. Each increment in Section 21 must be delivered as an independently accepted vertical slice while preserving one Core contract. The first implementation plan covers only the Section 20 foundation milestone; later increments require their own approved specifications and plans.

Each increment must leave existing GSE 1.0 behavior usable or provide an explicit migration path. No increment may claim the full architecture complete before the end-to-end acceptance criteria pass.
