# GSE Commands

Use this when the user writes `/gse ...`, `gse: ...`, or asks for command-style GSE usage.

These are host-neutral command semantics. They define what an agent should do. They do not prove that the current host has native slash-command support. If the host supports custom slash commands, host adapters may map these commands to native entries. If not, treat the text command as an instruction and execute the matching route.

Portable adapter helper:

```text
node <gse-skill>/scripts/generate-command-adapter.mjs --target <project-root> --host claude|codex|hermes|workbuddy|copilot|gemini|generic|all
```

Portable execution helper:

```text
node <gse-skill>/scripts/gse.mjs continue --target <project-root>
node <gse-skill>/scripts/run-gse-command.mjs --target <project-root> --command "/gse continue --brief"
node <gse-skill>/scripts/run-gse-command.mjs --target <project-root> --command "/gse continue --doctor"
node <gse-skill>/scripts/run-gse-command.mjs --target <project-root> --command "/gse stage continue the existing project"
node <gse-skill>/scripts/run-gse-command.mjs --target <project-root> --command "/gse context" --json
node <gse-skill>/scripts/run-gse-command.mjs --target <project-root> --command "/gse context --checkpoint" --execute --json
node <gse-skill>/scripts/run-gse-command.mjs --target <project-root> --command "/gse discover build a paid creator tool" --execute --json
node <gse-skill>/scripts/run-gse-command.mjs --target <project-root> --command "/gse discover --session <session-id> --select minimal-proof --promote" --json
node <gse-skill>/scripts/run-gse-command.mjs --target <project-root> --command "/gse discover --session <session-id> --select minimal-proof --promote" --execute --json
node <gse-skill>/scripts/run-gse-command.mjs --target <gse-skill> --command "/gse owner-actions" --json --compact
node <gse-skill>/scripts/run-gse-command.mjs --target <gse-skill> --command "/gse probe --public-repo-url __PUBLIC_REPO_URL__" --json
node <gse-skill>/scripts/run-gse-command.mjs --target <gse-skill> --command "/gse package" --json
node <gse-skill>/scripts/run-gse-command.mjs --target <gse-skill> --command "/gse install --source __PACKAGE_DIR__ --install-target __INSTALL_SKILL_DIR__" --json
node <gse-skill>/scripts/run-gse-command.mjs --target <gse-skill> --command "/gse public-release" --json
node <gse-skill>/scripts/run-gse-command.mjs --target <project-root> --command "/gse learn --summary __LESSON__" --execute --json
node <gse-skill>/scripts/run-gse-command.mjs --target <project-root> --command "/gse repair" --json
```

Validation profile helper:

```text
node <gse-skill>/scripts/run-validation-profile.mjs --target <project-root> --profile lite|standard|enterprise|release
```

Portable command execution audit:

```text
node <gse-skill>/scripts/audit-command-execution.mjs --root <gse-skill> --profile lite|full
```

The Claude adapter writes `.claude/commands/gse.md`, matching Claude Code's documented project command shape. The Codex adapter writes a pointer file because project-level native `/gse` command files are not verified for Codex in this package. Hermes, WorkBuddy, Copilot, Gemini, and generic adapters write portable pointer files only; they do not prove host runtime invocation.

## Command Map

| Command | Purpose | Primary Route | Required Inputs | Typical Verification |
|---|---|---|---|---|
| `/gse help` | Show available GSE commands and the current project entry files | Command help | `SKILL.md`, `references/commands.md` | none or file inspection |
| `/gse init` | Initialize `.gse/` in a new project | Project bootstrap | project rules, `project-bootstrap.md` | scaffold file check |
| `/gse adopt` | Adopt GSE in an existing project without overwriting local rules | Project adoption | project rules, `adoption-recipes.md`, `project-profile.md` | discovery or adoption smoke |
| `/gse continue` | Continue the current project through a hard preflight and compact state packet; use `--brief` for normal takeover and `--doctor`/`--full` for deep diagnostics | Execute workflow | project rules, `.gse/state.json`, evidence index, `.gse/project-profile.md`, canonical product goal source, `.gse/goal-map.md` execution projection, quality gates | continue preflight plus focused test/smoke for the slice |
| `/gse context` | Inspect host context pressure, goal payload size, and tool-output pressure; optionally generate a bounded checkpoint | Context orchestration | target root and optional Codex rollout path/id | context orchestrator fixture audit; host rollout evidence remains host-specific |
| `/gse stage [intent]` | Detect the current lifecycle stage, first unmet gate, bounded reference pack, role route, and next stage | Stage orchestration | current request, project rules, repository artifacts, optional `.gse` state | stage orchestrator fixture audit plus direct evidence inspection |
| `/gse discover [intent]` | Interpret a natural-language goal, expose constraints and unknowns, compare viable paths, request a choice, and explicitly promote the selected path into Goal/Spec | Goal discovery | intent, project rules, optional canonical goal source and goal map | goal discovery audit plus command execution smoke |
| `/gse status` | Show current project state; for the GSE skill, show final-form progress and pending public/host claim evidence | Status workflow | `.gse/state.json`; for GSE skill, final readiness audits | state/report inspection |
| `/gse doctor` | Diagnose public/host claim evidence for the GSE skill, or target-project GSE readiness for normal projects | Final acceptance or project doctor | final readiness matrix, `.gse/state.json`, project profile | public acceptance doctor or target project doctor |
| `/gse repair` | Diagnose or repair stale state, broken evidence JSONL, and overlong residual risks | State/evidence repair workflow | `.gse/state.json`, `.gse/evidence/index.jsonl`, latest evidence files | state repair audit; optional execute-gated residual risk compaction |
| `/gse acceptance` | Alias for `/gse doctor` when the user wants final acceptance boundaries | Final acceptance doctor | final readiness matrix and owner/external evidence records | public acceptance doctor |
| `/gse owner-actions` | Show the remaining owner/external actions required before the GSE skill can claim public acceptance | Owner/external action packet | final readiness matrix and public acceptance doctor | owner action command smoke |
| `/gse probe` | Probe supplied owner/external evidence locations before accepted records are written | Public external gate probe | public repo/security/CI/registry/marketplace/host evidence inputs | public external gate probe audit |
| `/gse release` | Dry-run or generate the GSE release bundle for open-source/package handoff | Release bundle workflow | release metadata, package snapshot, acceptance handoff, owner/external kit | release bundle audit |
| `/gse package` | Dry-run or generate a local installable GSE package | Package workflow | package label and output directory | package manifest or distribution audit |
| `/gse install` | Dry-run or install GSE from a local package path or URL-shaped package source | Install workflow | package source and install target | install dry-run or installed CLI smoke |
| `/gse public-release` | Dry-run or generate the ordered public release checklist for owner execution | Public release checklist workflow | release status manifest and pending owner/external gates | public release checklist audit |
| `/gse maintenance` | Audit recurring maintenance coverage for gap detection, drift, security, forward-test, target drills, public acceptance, and installed sync | Maintenance workflow | `maintenance-cadence.md`, validation profile, current final-form state | maintenance cadence audit |
| `/gse change` | Create or normalize a GSE change spec pack | Spec workflow | change id, task level, goal map | change folder structure check |
| `/gse slice` | Define or normalize outcome, scope, acceptance, evidence, risk, and next action | Spec workflow | `goal-map.md`, `spec-workflow.md`, `quality-gates.md` | structural check |
| `/gse verify` | Run the smallest verification that proves the current slice | Verification gate | `quality-gates.md`, project profile, evidence taxonomy | focused test/API/browser smoke |
| `/gse learn` | Record a reusable lesson in `.gse/learnings.md`; with `--promote`, classify repeated lessons into promotion candidates | Learning workflow | summary, trigger, source, optional impact, optional `--promote` | learning command and promotion audits |
| `/gse audit` | Check workflow drift, stale claims, missing evidence, or too-heavy process | Audit workflow | `benchmark-audit.md`, `drift-audit.md`, project profile | audit script or checklist |
| `/gse close` | Check whether the current slice is ready to close | Close readiness check | `.gse/state.json`, evidence index, quality gates, role fallback packets, git status | close gate audit |

## Aliases

- `gse help` -> `/gse help`
- `gse init` -> `/gse init`
- `gse adopt` -> `/gse adopt`
- `gse continue` -> `/gse continue`
- `gse next` -> `/gse continue`
- `gse context` -> `/gse context`
- `gse stage` -> `/gse stage`
- `gse discover` -> `/gse discover`
- `gse status` -> `/gse status`
- `gse doctor` -> `/gse doctor`
- `gse repair` -> `/gse repair`
- `gse acceptance` -> `/gse acceptance`
- `gse owner-actions` -> `/gse owner-actions`
- `gse owner` -> `/gse owner-actions`
- `gse probe` -> `/gse probe`
- `gse release` -> `/gse release`
- `gse package` -> `/gse package`
- `gse install` -> `/gse install`
- `gse public-release` -> `/gse public-release`
- `gse maintenance` -> `/gse maintenance`
- `gse change` -> `/gse change`
- `gse spec` -> `/gse change`
- `gse slice` -> `/gse slice`
- `gse verify` -> `/gse verify`
- `gse learn` -> `/gse learn`
- `gse audit` -> `/gse audit`
- `gse close` -> `/gse close`

## Usage Examples

```text
/gse discover Build a paid creator cover generator in two weeks
```

Expected behavior:

1. Return an `awaiting-choice` packet containing the interpreted goal, explicit or inferred constraints, unresolved questions, and exactly three viable paths.
2. Compare every path by scope, cost, benefit, risks, assumptions, acceptance, and evidence plan.
3. Recommend a path while preserving the user's authority to choose.
4. Stay read-only by default. Add runner-level `--execute` to persist `.gse/discovery/<session-id>.json`.
5. Select with `/gse discover --session <session-id> --select <path-id>`; add `--promote` for an exact Goal/Spec preview.
6. Write only with `--promote` plus runner-level `--execute`. Promotion creates a lifecycle-compatible `.gse/changes/<change-id>/` pack and appends one `.gse/goal-map.md` projection node.
   This is the logical `--promote --execute` write gate even when `--execute` is passed to the runner outside the quoted command text.
7. Preserve the distinction between discovery output, selected path, and promoted Goal/Spec. None of these states prove implementation or acceptance.

Focused helpers:

```text
node <gse-skill>/scripts/generate-goal-discovery-packet.mjs --target <project-root> --intent "<goal>" --json
node <gse-skill>/scripts/promote-goal-discovery.mjs --target <project-root> --session <session-id> --select <path-id> --promote --json
node <gse-skill>/scripts/audit-goal-discovery.mjs --root <gse-skill> --json
```

```text
/gse continue AION
```

Expected behavior:

1. Enter the project root.
2. Run the hard preflight: `.gse/state.json`, `.gse/evidence/index.jsonl`, `.gse/project-profile.md`, canonical product goal source, `.gse/goal-map.md` execution projection, `.gse/quality-gates.md`, current slice, residual risks, and owner/external gates when the target exposes them.
3. Return a compact state packet with project identity, phase, current slice, next action, top risks, blocked gates, gate taxonomy, tool statuses, latest evidence, active project guards, next checks, and `completionPlan`.
4. Return `compactState.noGoalMode` for ordinary chat sessions that are not running Codex Goal Mode or another host scheduler. This packet chooses `repair-preflight`, `collect-claim-evidence`, `continue-current-slice`, or `open-next-slice`, exposes the selected next-slice action packet when available, and lists first steps plus close commands.
5. Fail before implementation when local state or evidence index is broken.
6. Keep owner/external evidence visible as public/release/host-specific claim requirements without converting it into GSE core workflow debt.
7. Use `completionPlan.requiredSteps`, `completionPlan.requiredCloseCommands`, and active `completionPlan.conditionalCloseCommands` as the exact close checklist before claiming a slice is done.
8. Use `gateTaxonomy` to distinguish default core blockers from release gates and host-adapter claim gates. Release and host-adapter gates block only the specific claim unless project policy promotes them.
9. For a deliberate product support slice, set `currentSlice.supportSliceBoundary` to a narrow scope or exit criterion; `/gse continue` surfaces it and keeps `CP23` as a soft outcome-steering check.
10. Execute, verify, record evidence, update `.gse/state.json` and `.gse/evidence/index.jsonl`, and close only when accepted by the applicable gate.

Portable helpers:

```text
node <gse-skill>/scripts/generate-continue-packet.mjs --target <project-root>
node <gse-skill>/scripts/generate-continue-packet.mjs --target <project-root> --brief
node <gse-skill>/scripts/generate-continue-packet.mjs --target <project-root> --doctor
```

```text
/gse context --checkpoint
```

Expected behavior:

1. Resolve an explicit Codex rollout, session id, or the newest rollout whose cwd matches the target.
2. Classify health as green, yellow, orange, or red from usage plus compaction count.
3. Report `.gse/goal-map.md` payload risk and keep the active goal at 8-12 lines.
4. Use summary-first tool commands and cap chat-path tool output at 1,500 estimated tokens.
5. Keep worker context packs at 8,000 estimated tokens and result capsules at 800.
6. Reject context-pack includes outside the target root.
7. At orange/red, stop scope expansion and produce a rollover checkpoint; write only with runner-level `--execute`.
8. Do not claim that the command creates a host task or dispatches a real subagent.

Portable context helpers:

```text
node <gse-skill>/scripts/audit-context-health.mjs --target <project-root> --json
node <gse-skill>/scripts/generate-context-checkpoint.mjs --target <project-root> --json
node <gse-skill>/scripts/audit-context-orchestrator.mjs --root <gse-skill> --json
node <gse-skill>/scripts/audit-document-hygiene.mjs --target <project-root> --json
node <gse-skill>/scripts/compact-canonical-goal-source.mjs --target <project-root> --dry-run --json
```

Project guard helper:

```text
node <gse-skill>/scripts/audit-project-guards.mjs --target <project-root> --json
```

For existing projects that have `.gse/` but do not yet have machine-readable continuation files:

```text
node <gse-skill>/scripts/update-project-state.mjs --target <project-root>
```

```text
/gse init --mode standard
```

Expected behavior:

1. Inspect existing project rules first.
2. Create `.gse/` if missing.
3. Preserve existing project-specific rules.
4. Run a scaffold or structure check.

```text
/gse change add-user-login --level standard
```

Expected behavior:

1. Create `.gse/changes/add-user-login/`.
2. Add `brief.md`, `spec.md`, `design.md`, `tasks.md`, `evidence.md`, `review.md`, and `execution-quality-pack.md`.
3. Keep external workflow tools optional: use GSE markdown packs as the portable default.
4. Do not overwrite existing change files unless explicitly forced.

Portable helper:

```text
node <gse-skill>/scripts/init-change.mjs --target <project-root> --change-id add-user-login --level standard
```

```text
/gse verify --profile lite
```

Expected behavior:

1. Select a validation profile from `lite`, `standard`, `enterprise`, or `release`.
2. Run `scripts/run-validation-profile.mjs` with that profile.
3. Keep release/distribution-heavy checks out of `lite` and `standard` unless the selected profile requires them.
4. Report skipped heavy gates as a deliberate profile boundary, not as hidden success.
5. Use the lite command execution audit for routine command coverage; reserve the full command execution audit for release-grade confidence.

```text
/gse audit
```

Expected behavior:

1. Check whether project rules, `.gse/`, goal map, quality gates, tooling, and evidence are aligned.
2. Report gaps as `missing`, `weak`, `verified`, or `accepted`.
3. Do not fix unrelated project code unless explicitly asked.

```text
/gse learn --summary "Prefer UTF-8 safe readers for Chinese docs before judging mojibake" --trigger "encoding review" --source "project slice"
/gse learn --promote
```

Expected behavior:

1. Dry-run the learning entry by default and show the target `.gse/learnings.md` path.
2. Require `--summary`; accept optional `--trigger`, `--source`, `--impact`, and `--promotion`.
3. Append the entry only when `--execute` is supplied.
4. Skip duplicate summaries instead of appending repeated lessons.
5. Keep raw chain-of-thought, long logs, and temporary attempts out of learnings.
6. With `--promote`, run learning promotion analysis. Add `--execute` only to write candidate-only `.gse/learning-promotions.md`; do not mutate guards, gates, templates, scripts, or skill files automatically.

```text
/gse status
```

Expected behavior:

1. For normal projects, read `.gse/state.json` and show phase, current slice, next action, and declared project files.
2. For the GSE skill package itself, run the final-form progress report in dry-run mode and show local engineering readiness, full final-form readiness, pending owner/external release evidence, and `publicAccepted`.
3. Do not treat status output as completion evidence unless the relevant gate audit is also recorded.

```text
/gse doctor
```

Expected behavior:

1. For the GSE skill package, run the public acceptance doctor and list pending owner/external claim evidence with concrete record commands.
2. For normal target projects, run the target project doctor and report `.gse/` readiness, canonical product goal source visibility, goal-map projection boundary, evidence state, and host adapter drift.
3. Keep owner-required and external-required gates explicit. Do not convert local mechanics into public acceptance.

```text
/gse repair
```

Expected behavior:

1. Read `.gse/state.json` and `.gse/evidence/index.jsonl`.
2. Return concrete repair actions for invalid state JSON, invalid evidence JSONL, missing latest evidence files, stale state/evidence next actions, and overlong residual risks.
3. Stay read-only by default.
4. Automatic writes are limited to reversible residual-risk compaction with a backup, and require `--execute`.
5. Do not guess or overwrite broken JSON/JSONL; report the file and line/error so the owner or agent can repair deliberately.

```text
/gse owner-actions
```

Expected behavior:

1. For the GSE skill package itself, return a compact owner/external action list from the public acceptance doctor.
2. Include the pending gate count, responsible party, required evidence, record command, and dry-run preflight command for each gate.
3. Prefer `--json --compact` when handing the action list to a project owner or maintainer; compact mode returns only the owner action packet without local runner diagnostics.
4. Keep the output as a collection checklist. It does not publish, approve, configure, or accept anything by itself.
5. For normal projects, use `/gse doctor` instead; `/gse owner-actions` is only for the GSE skill's public/host final-form gates.

```text
/gse probe --public-repo-url __PUBLIC_REPO_URL__
```

Expected behavior:

1. For the GSE skill package itself, run `scripts/probe-public-external-gates.mjs`.
2. Accept only explicit evidence input flags such as `--public-repo-url`, `--security-contact-url`, `--public-ci-run-url`, `--registry-package-url`, `--marketplace-url`, `--native-host-evidence`, and `--other-host-evidence`.
3. Return `waiting-for-input` when no evidence inputs are supplied.
4. Reject placeholder, example, local, or missing evidence before accepted records are written.
5. Keep the output as a preflight. It does not publish, approve, configure, or accept anything by itself.

```text
/gse release
```

Expected behavior:

1. For the GSE skill package itself, dry-run `scripts/generate-release-bundle.mjs`.
2. Report release bundle readiness, validation summary, and public acceptance boundary without writing the canonical bundle.
3. Accept optional `--label` and `--out` values for release-bundle naming and output routing.
4. Only write a bundle when the command is run with `--execute`.
5. Keep the output as release handoff preparation. It does not publish a package, approve a marketplace listing, configure a repository, or mark public acceptance complete.

```text
/gse package
```

Expected behavior:

1. For the GSE skill package itself, dry-run `scripts/package-gse.mjs`.
2. Report package readiness, intended output, file count, and manifest path without writing package files.
3. Accept optional `--label` and `--out` values for package naming and output routing.
4. Only write a package when the command is run with `--execute`.
5. Keep the output as local packaging evidence. It does not publish to a registry or mark public acceptance complete.

```text
/gse install --source __PACKAGE_DIR__ --install-target __INSTALL_SKILL_DIR__
```

Expected behavior:

1. For the GSE skill package itself, dry-run `scripts/install-gse.mjs`.
2. Accept `--source <package-dir>` or `--source-url <file-or-http-package-url>`.
3. Use `--install-target <install-skill-dir>` for the destination so it does not conflict with the command runner's own `--target <gse-root>`.
4. Only write the install target when the command is run with `--execute`.
5. Keep the output as local or URL-shaped installability evidence. It does not publish to a registry, approve a marketplace listing, or prove global host installation.

```text
/gse public-release
```

Expected behavior:

1. For the GSE skill package itself, dry-run `scripts/generate-public-release-checklist.mjs`.
2. Show the ordered public release checklist covering repository settings, security contact, public CI, registry publication, marketplace listing, native slash-command evidence, other host runtime evidence, and final verification.
3. Accept optional `--out` and `--manifest` values for checklist output routing.
4. Only write a checklist when the command is run with `--execute`.
5. Keep the output as an owner execution runway. It does not publish, approve, configure, or accept anything by itself.

## Host Adapter Rules

- Do not claim native slash-command support unless the current host exposes it and it was verified.
- Do not treat generated pointer files as runtime proof; run the host or a host-specific smoke before claiming the command executes natively.
- Record real UI, slash-command, command-palette, plugin, or background-thread invocation with `scripts/record-host-invocation.mjs` or `assets/templates/host-ui-invocation-record.md`; validate a completed record with `scripts/audit-host-ui-invocation.mjs --record <file>` and aggregate persistent host records with `scripts/audit-host-runtime-invocations.mjs`.
- For Codex, Claude Code, Hermes/AION-style runtimes, WorkBuddy, or future hosts, map native command files back to this reference instead of duplicating all policy.
- If a host has no slash-command mechanism, the text command still works as a natural-language trigger for the skill.
- Keep command output short and route to the relevant reference file instead of loading every GSE document.

## Completion Rules

- `/gse continue`, `/gse verify`, and `/gse close` must preserve the result -> verified -> accepted distinction.
- `/gse discover` must preserve the distinction between discovery output, selected path, and promoted Goal/Spec.
- `/gse close` is read-only in the portable command runner. It checks state, evidence, role dispatch honesty, worktree ownership, staged generated artifacts, and `.gse` git state. It cannot mark a slice complete, archive a change, or write evidence by itself.
- Portable close check:

```text
node <gse-skill>/scripts/audit-close-gate.mjs --target <project-root>
```

- To archive a named change pack after evidence exists, use the explicit change lifecycle script:

```text
node <gse-skill>/scripts/close-change.mjs --target <project-root> --change-id <change-id> --status result|verified|accepted --json
```

- `/gse maintenance` verifies recurring upkeep coverage and command wiring; it does not replace real external host, CI, marketplace, or owner evidence.
- `/gse audit` cannot certify arbitrary repositories unless project-specific checks ran.
- `/gse init` and `/gse adopt` cannot overwrite existing project workflow files without explicit owner approval or `--force` with a recorded reason.
