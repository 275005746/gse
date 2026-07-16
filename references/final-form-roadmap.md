# GSE Final Form Roadmap

This roadmap defines the final product shape for GSE itself. It is the canonical continuation plan for GSE development after local v1 capability has been proven.

The goal is not another patch cycle. Final form means a capable agent can enter a new or existing project, run a short GSE entry command, understand the project, select the next slice, execute with the right level of rigor, prove the result, and carry lessons forward without a long hand-written prompt.

## Completion Definition

GSE reaches final form when a new agent can enter any supported project and use `/gse continue` to obtain:

- the project identity, current goal, active slice, and next action,
- the required spec, quality gates, and evidence level,
- the available tools, missing tools, role boundaries, and fallback path,
- pending owner/external release evidence, plus any optional adapter claims that are not being made,
- the learning rules that should affect the current run,
- the exact checks needed before completion can be claimed.

Broken state, stale evidence, unsupported tool claims, noisy risk lists, and missing host/runtime evidence must be surfaced before implementation begins.

## Final Form Priorities

| Priority | Area | Outcome | Acceptance |
|---|---|---|---|
| P0 | Short entry takeover | `/gse continue` replaces long goal prompts for mature projects | A project with `.gse/` returns current slice, next action, claim-boundary evidence, and required checks through the portable runner; host-native command evidence is recorded only when a specific host adapter claims it |
| P1 | State system | Project state is readable, compact, repairable, and not a risk dump | State separates current summary, active slice, top risks, blocked gates, next checks, and archived risk history |
| P2 | Evidence gate | Claims cannot outrun evidence | Evidence index validity is a preflight gate; bad JSONL, stale records, and downgraded UI/browser proof are labeled before close |
| P3 | Spec and change lifecycle | GSE provides native change control | Change packs move through proposed, active, implemented, verified, accepted, and archived states with goal-map links |
| P4 | Roles and subagents | GSE provides native role and execution discipline without requiring a specific subagent host | Planner, locator, implementer, verifier, reviewer, doc/evidence, and release roles have dispatch packets and fallback checklists; process skills do not prove real host dispatch |
| P5 | Tool and quality gates | Tool use is fast, explicit, and project-aware | LSP/index, browser, Playwright, MCP, CI, package manager, Windows shell, sparse checkout, UTF-8, and project custom gates are preflighted when relevant |
| P6 | Learning automation | Repeated failures become guards | Lessons dedupe, classify severity, and promote into project quality gates, templates, scripts, or skill updates |
| P7 | Project init and adapters | New projects get the right scaffold without heavy prerequisites | Lite, Standard, and Enterprise scaffolds create `.gse/` plus optional host pointers for `.codex`, `.claude`, `.mcp`, and similar folders |
| P8 | Release and distribution | GSE is installable, auditable, and maintainable as an open-source skill product | npm/package install, GitHub release, public CI, security contact, repository settings, registry/marketplace records, bilingual docs, checksums/signing, and update paths are verified or honestly gated |
| P9 | Gap audits and drills | GSE keeps workflow gaps visible and testable | Regular audits check GSE behavior against its own capability matrix and configured real-project drills |
| P10 | Final acceptance | Final claims are backed by real evidence at the right claim level | AION doctor, MuseFlow doctor, new-project bootstrap, `/gse continue`, evidence repair, state compaction, role dispatch, learning promotion, package publication, public CI, and portable command execution pass; host-native invocation is optional per host adapter and must be recorded before that adapter claims it |

## First Execution Wave

1. Done: make `/gse continue` run a hard preflight: state JSON, evidence index, project profile, quality gates, canonical product goal source, `.gse/goal-map.md` execution projection, stale risks, and pending owner/external release evidence when the target exposes it.
2. Done: split `.gse/state.json` into a compact default view and an archived risk/decision history so active sessions do not inherit unreadable residual risk blocks.
3. Done for continuation: promote evidence index validity from target-project doctor finding to blocking preflight for `/gse continue`; close-gate evidence index validation already remains in place.
4. Done: add explicit evidence levels for UI/browser/API/CI/owner/release/external proof: `verified-unit`, `verified-component`, `verified-api`, `verified-browser`, `verified-ci`, `accepted-owner`, `accepted-release`, and `external-required`.
5. Done: convert reusable lessons from AION and MuseFlow into guards: Windows shell syntax, sparse checkout staging, UTF-8-safe Chinese docs, stale evidence, browser-smoke downgrade labeling, no fake subagent dispatch, and non-interrupting cross-thread sync.

## Final Form Execution Plan

This plan turns the completion definition into ordered implementation waves. It is the working plan for GSE itself, not a project roadmap for projects that use GSE.

### Wave 1 - Short Entry And State Control

Outcome: mature projects can resume from a short `/gse continue` entry instead of a long hand-written prompt.

Status: verified; the hard preflight, compact state packet, completion plan, project guards, explicit evidence levels, role fallback readiness, and state/evidence repair path are verified. Native host slash-command evidence is an optional adapter claim, not a GSE core completion gate.

Completed slices:

- Done: `completionPlan` gives future agents exact required close steps, required close commands, and active conditional commands for encoding, installed-sync, maintenance snapshot, release bundle, and session sync.
- Done: completionPlan drill audit verifies clean worktrees have no false active conditionals and dirty docs/scripts/references/acceptance/evidence changes activate the expected close checks.
- Done: state repair path provides `/gse repair`, `CP14`, and concrete repair actions for stale state, bad JSONL, missing evidence files, next-action drift, and overlong residual risks.
- Done: `gateTaxonomy` separates core workflow blockers from release gates and host-adapter claim gates in `/gse continue` compact state.
- Done: generated/noisy artifacts stay visible in `/gse continue` as ignored paths but no longer count as actionable changes or trigger conditional close commands by themselves.
- Done: active residual risks and archived risk history are counted separately so `/gse continue` does not make historical risk archive entries look like current blockers.
- Done: the human-facing `/gse continue` prompt is a short action packet with project, root, slice, next action, close summary, risk summary, gate boundary, and do-step instead of long explanatory prose.
- Done: product-visible progress drift is surfaced through `compactState.productProgressDrift`, `CP22`, and a first-ranked `product-visible-recovery` next-slice candidate when repeated internal/component-level provenance or boundary slices risk replacing visible product workflow progress.
- Done: product outcome gating is surfaced through `compactState.productOutcomeGate`, `CP23`, and a first-ranked `product-visible-recovery` candidate when a product project repeatedly opens support/internal slices without a named user-visible delta; a deliberate support slice can declare a narrow `supportSliceBoundary`; GSE self-development is classified as `skill` and is not forced through this product gate.

Acceptance:

- `/gse continue` shows current slice, next action, top risks, claim-boundary evidence, required checks, relevant guard rules, evidence status, and completion plan.
- Bad evidence and stale state fail before implementation or return a repair action.
- Default output stays compact; historical risk detail stays archived.

### Wave 2 - Spec, Role, And Execution Discipline

Outcome: GSE provides native change control and role-based execution discipline without requiring external workflow tools.

Status: locally verified for portable execution discipline; role fallback packet outputs, no-fake-dispatch close checks, file-ownership/staged-artifact close checks, and host capability record audits are verified. Real-host dispatch evidence remains host-specific future evidence.

Boundary: GSE change control, execution discipline, and review quality are portable workflow behavior. They do not prove native slash commands, subagent dispatch, browser tooling, MCP, LSP, CI, or host UI integration by themselves. Those capabilities are optional host adapters and must be recorded as host evidence before they are claimed.

Required slices:

- Change lifecycle hardening: every active change can be opened, verified, closed, archived, and linked back to the goal map.
- Done: role packet execution fallback: planner, locator, implementer, verifier, reviewer, doc/evidence, and release roles have auditable packet outputs for sequential fallback.
- Done: no-fake-dispatch guard: close gate blocks real-subagent claims unless the current host/tool status is verified.
- Done: file ownership and dirty-worktree guard: close gate reports staged, unstaged, untracked, mixed, conflict, and generated/test artifact paths before close.

Acceptance:

- A real target project can run a change pack from open to archive.
- Role packets work both with real subagents and sequential fallback.
- Close gate rejects missing evidence, missing review, fake dispatch, and unrelated staged files when the project can expose that data.

### Wave 3 - Learning To Guard Promotion

Outcome: repeated user corrections and project failures become reusable engineering controls.

Status: locally verified; learning capture, duplicate occurrence counting, deterministic promotion analysis, candidate-only promotion reports, `/gse continue` CP15 visibility, and learning drift detection for promoted-but-unenforced candidates are verified.

Completed slices:

- Done: learning classifier categorizes lessons by shell, encoding, evidence, browser, git, host-tool, project-rule, and release.
- Done: duplicate learning capture increments `Occurrences` without appending noisy duplicate entries.
- Done: promotion paths follow note -> checklist/template -> guard/quality gate -> script/skill.
- Done: `/gse learn --promote` is read-only by default, `/gse learn --promote --execute` writes candidate-only `.gse/learning-promotions.md`, and `/gse continue` surfaces CP15 learning promotion status.

Completed slices:

- Done: drift audit detects when promoted learning candidates are not covered by project guards, quality gates, `/gse continue`, `/gse close`, or focused audit scripts.

Acceptance:

- A lesson can be recorded once, deduped, and promoted into a project guard with evidence.
- `/gse continue` and `/gse close` both surface promoted high-severity guards.
- AION/MuseFlow lessons are used as examples but no AION/MuseFlow-specific behavior is hardcoded.

### Wave 4 - Tool And Host Runtime Adapters

Outcome: GSE stays portable while using available tools aggressively.

Completed slices:

- Done: host capability audit records track native slash-command, browser, MCP, LSP, subagent, and CI status as `verified`, `documented`, `unknown`, `unavailable`, or `external-required`, with `/gse continue` `CP16` visibility and overclaim checks.
- Done: target-project hardening drills run GSE doctor, `/gse continue`, close gate, host capability, and learning drift checks against configured real projects without mutating target worktrees.
- Done: optional tool fallback policy audit verifies markdown fallback and claim boundaries across tool adapters, router, model routing, host adapters, project profile, generated command adapters, continue packet wiring, and validation profiles.

Required slices:

- Native slash-command evidence: record real host-native `/gse continue` invocation only when a host adapter claims native support.
- Done: Browser/UI evidence policy: `scripts/audit-ui-browser-evidence-policy.mjs` verifies that `verified-component`, `verified-api`, `verified-browser`, screenshot/visual inspection rules, continue/close downgrade surfacing, and validation wiring stay aligned.

Acceptance:

- GSE never claims native host support from portable command evidence alone.
- Browser/UI verification downgrade is labeled before close.
- Host adapter docs point back to `.gse/` and do not duplicate canonical rules.

### Wave 5 - Distribution, Public Trust, And Maintenance

Outcome: GSE can be installed, audited, updated, and maintained as an open-source skill product.

Required slices:

- Public release evidence: repository settings, CI, security contact, registry/package channel, marketplace/catalog, release bundle, checksum/signing, and update path records.
- Done: Installed skill sync: `scripts/audit-installed-sync.mjs` verifies fresh package output, package metadata/version preservation, source-root privacy, installed-copy hash parity, and installed-copy `/gse maintenance` smoke when `--installed-root` is supplied.
- Done: Session sync records: `scripts/record-session-sync.mjs` and `scripts/audit-session-sync.mjs` make installed-copy refresh and active-session sync attempts auditable without treating notification as adoption.
- Public docs hardening: keep README and bilingual docs concise, search-friendly, and free of defensive caveat bloat.
- Done: Maintenance cadence: `references/maintenance-cadence.md`, `/gse maintenance`, and `scripts/audit-maintenance-cadence.mjs` verify gap audit, drift audit, dependency/security review, forward-test, target drill, public acceptance, and installed-skill sync coverage.
- Done: Maintenance snapshot failure isolation: failed canonical `latest-maintenance-snapshot.json` writes are redirected to `latest-maintenance-snapshot.failed.json` so release-bundle and maintenance freshness loops keep the last passing canonical snapshot.

Acceptance:

- `validate-gse` passes the appropriate profile for the release stage.
- Public acceptance rows are accepted only with real owner/external evidence.
- A clean consumer project can install GSE, run `gse status`, initialize `.gse/`, and execute `/gse continue` through the portable runner.

## Current Final-Form Gap List

These items should drive future slices only when the claim is being made:

- Current local capability work is verified; keep this list focused on remaining external or host-gated claims.
- host-native slash-command evidence is optional per host adapter and is not part of the default core completion gate.
- no AION/MuseFlow-specific behavior is hardcoded; they remain drill targets, not special-case logic.
- Public acceptance still depends on owner/external records for repository settings, security contact, CI, registry/marketplace publication, and host-runtime invocation.
- Native slash-command support remains a per-host optional adapter claim and is not part of the GSE core completion gate.
- Any future host adapter claim must carry a real host invocation record before it can be promoted from `external-required` or `not-claimed`.

## Boundary

- GSE workflow artifacts define requirements, change control, execution discipline, and review quality. They do not provide native slash commands, subagent dispatch, browser tooling, MCP, LSP, CI, or host UI integration by themselves.
- Portable workflow artifacts do not satisfy host-native slash-command, subagent, browser, MCP, LSP, CI, or host UI evidence rows.

## Goal Mode Operating Contract

Use this when continuing GSE itself in a goal-mode session:

```text
Goal: implement GSE final form as a portable, installable, evidence-driven engineering skill for long-running agent-assisted software projects.

Workspace:
<path-to-gse-repo>

Start:
1. Read the installed GSE `SKILL.md`.
2. Read .gse/gse-design-master-plan.md, .gse/goal-map.md, .gse/current-slice.md, .gse/state.json, and references/final-form-roadmap.md.
3. Continue from the current slice and the highest-priority unfinished Final Form roadmap item.
4. Keep GSE generic. Do not add AION-only or MuseFlow-only behavior; use them as drills and evidence targets.

Loop:
Goal -> Spec -> Execute -> Evidence -> Learn.

Slice rule:
Do one verifiable slice at a time. Each slice must state outcome, scope, acceptance, evidence, risk, and next action. Prefer executable scripts, templates, and gates over prose-only rules.

Verification:
Run the smallest focused audit that proves the slice. For docs-only final-form routing changes, run audit-final-form-roadmap, roadmap consistency, JSON/UTF-8 sanity, and a smoke validation profile. For release or package claims, run the matching release/package audit.

Evidence:
Append evidence to .gse/evidence/YYYY-MM-DD.md and .gse/evidence/index.jsonl. Do not claim public, native host, marketplace, registry, CI, or owner acceptance without matching accepted records.

Completion:
A slice is complete only after focused validation passes, evidence is recorded, state/current-slice/goal-map are updated, and the changes are committed.
```

## Claim Boundary

This roadmap is a contract for final-form development, not proof for every optional adapter claim. The live claim boundary remains `references/final-readiness.md` plus `scripts/audit-final-readiness.mjs`.
