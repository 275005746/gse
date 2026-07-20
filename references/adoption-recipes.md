# Adoption Recipes

Use this when applying GSE to a project or updating an existing GSE installation.

These recipes are host-neutral. They do not certify arbitrary repositories, install external tools, publish GSE, or verify host runtime capabilities. Treat project and host capabilities as `unknown` until checked in that project/session.

## Recipe 1: Fresh Project Install

Use when a project has no `.gse/` folder yet.

Steps:

1. Read project rules first: `AGENTS.md`, `CLAUDE.md`, README, or equivalent.
2. Choose mode from `references/task-levels.md` and `references/project-bootstrap.md`: `lite`, `standard`, or `enterprise`.
3. Run:

```text
node <gse-skill>/scripts/init-project.mjs --target <project-root> --mode <mode>
```

4. Inspect generated `.gse/state.json`, `.gse/project-profile.md`, `.gse/goal-map.md`, `.gse/quality-gates.md`, `.gse/tooling.md`, and `.gse/evidence/index.jsonl`.
5. Record project-specific commands, standards, permissions, and owners in `.gse/project-profile.md`.
6. Run the smallest project verification that proves the install is usable, such as checking files exist and reading `.gse/README.md`.
   Prefer the target doctor when available:

```text
node <gse-skill>/scripts/audit-target-project.mjs --target <project-root>
```

7. Record residual risk: commands, CI, browser, MCP, LSP, subagents, models, and release paths remain `unknown` until executed.

Evidence status: `result` when files exist; `verified` only after focused project inspection or smoke proves the generated workflow is usable.

## Recipe 2: Existing Repo Adoption

Use when a repository already has rules, scripts, CI, host folders, or partial `.gse/` files.

Steps:

1. Read project rules and existing workflow docs before generating anything.
2. Run discovery without writing:

```text
node <gse-skill>/scripts/discover-project-profile.mjs --target <project-root> --json
```

3. Preview through the public command without writing:

```text
node <gse-skill>/scripts/gse.mjs adopt --target <project-root> --mode <mode> --json
```

The preview runs the target audit, reports missing and preserved GSE artifacts, and identifies existing project files that will remain untouched.

4. Run document triage before writing anything:

- identify the canonical product goal source or confirm that it is missing;
- keep project roadmap/architecture/PRD/vision/product-plan docs untouched;
- keep `.gse/goal-map.md` short and projection-only;
- route long history to `.gse/evidence/` and reusable lessons to `.gse/learnings.md` or `.learnings/`.

5. Treat discovered scripts/configs as `documented`, not `verified`, until the commands actually run.
6. If `.gse/project-profile.md` already exists, do not overwrite it without explicit `--force` and a reason. Do not overwrite existing project workflow files just because GSE has defaults.
7. If writing is approved, run the public adoption command:

```text
node <gse-skill>/scripts/gse.mjs adopt --target <project-root> --mode <mode> --execute --json
```

Use `--force` only as a separate, explicit overwrite authorization. `--execute` alone creates missing artifacts and preserves existing project rules and `.gse/` content.

8. Preserve project-specific standards, host adapters, existing evidence logs, and owner decisions.
9. Record whether adoption is `result`, `verified`, or `accepted` using `references/evidence-taxonomy.md`.

Evidence status: `verified` for controlled fixture behavior when `scripts/audit-adoption.mjs` passes; real repos need project-specific evidence.

## Recipe 3: Update Existing GSE

Use when a project already follows GSE and the skill or project-local `.gse/` files need an update.

Steps:

1. Read `.gse/project-profile.md`, `.gse/goal-map.md`, `.gse/current-slice.md` if present, and host adapter notes.
   Prefer `.gse/state.json` and `.gse/evidence/index.jsonl` when present because they are the machine-readable continuation state.
2. If the project already has canonical product docs, treat `.gse/goal-map.md` as a projection and do not expand it into a second roadmap.
3. Identify whether the update affects templates, scripts, host adapters, quality gates, release/recovery, or project rules.
4. Preserve local project decisions. Do not replace project `.gse/` files with skill defaults unless the project owner approves.
5. Run skill validation after updating the skill package:

```text
node <gse-skill>/scripts/validate-gse.mjs --root <gse-skill>
```

6. Run project-local validation or smoke for the affected workflow.
   For read-only workflow drift checks, run:

```text
node <gse-skill>/scripts/audit-target-project.mjs --target <project-root>
```

If the project predates `.gse/state.json` and `.gse/evidence/index.jsonl`, add only the missing machine-readable continuation files:

```text
node <gse-skill>/scripts/update-project-state.mjs --target <project-root>
```

7. Record changed files, migration/rollback notes, evidence status, residual risks, and next action in the project evidence log.

Evidence status: `verified` only when the project-local update path and affected workflow have focused evidence.

## Recipe 4: Host Adapter Adoption

Use when a project needs Codex, Claude Code, Hermes/AION-style runtime, WorkBuddy, Copilot/Gemini-style, or custom host pointers.

Steps:

1. Read `references/compatibility.md` and `references/host-adapters.md`.
2. Generate short command/pointer adapters only when the host has a real adapter location:

```text
node <gse-skill>/scripts/generate-command-adapter.mjs --target <project-root> --host claude|codex|hermes|workbuddy|copilot|gemini|generic|all
```

`scripts/generate-host-adapter.mjs` is a legacy fixture helper for the older Codex/Claude markdown adapter smoke. Prefer `generate-command-adapter.mjs` for new project adoption.

3. Keep `.gse/` as the source of truth. Do not copy goal maps, quality gates, or evidence into host folders.
4. Mark host capabilities as `verified`, `documented`, `unknown`, or `unavailable` based on current evidence.
5. Run `scripts/audit-host-adapters.mjs` for GSE fixture coverage, then run project-specific inspection for the target project.

Evidence status: fixture generation can be `verified`; actual host runtime tools remain project/session-specific.

## Recipe 5: CLI Or Package Project Adoption

Use when a project is primarily a command-line tool, reusable package, SDK, plugin, or library rather than a web app.

Steps:

1. Read package docs and project rules before changing workflow files: `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, package manifest, and release notes if present.
2. Run discovery first:

```text
node <gse-skill>/scripts/discover-project-profile.mjs --target <project-root> --json
```

3. Treat `bin` entries, package scripts, publish commands, signing, registry, and shell integration as `documented` or `unknown` until a focused smoke proves them.
4. Preserve package metadata, release notes, compatibility policy, and existing publish/rollback instructions.
5. Prefer a small command smoke before broader tests, such as `npm run smoke`, `node ./bin/<name> --help`, `npm pack --dry-run`, or the project equivalent.
6. Record exit-code behavior, changed files, package artifacts intentionally ignored, residual release risk, and next action.

Evidence status: fixture coverage can be `verified`; real package install, registry access, publish permissions, global install, and shell completion require project-specific evidence.

## Adoption Record

Use this compact record in `.gse/evidence/` or the project evidence log:

```text
Adoption recipe:
Project path:
Mode or host:
Project rules read:
Commands run:
Files created or changed:
Preserved project-specific rules:
Host/tool statuses:
Validation evidence:
Evidence status: result | verified | accepted | not ready
Residual risk:
Next action:
```

For real target-project evidence, use `assets/templates/target-adoption-evidence.md`. Keep discovered scripts and configs as `documented` until executed, and keep `Accepted by: not accepted` unless a real acceptance gate ran.

Use `assets/templates/acceptance-execution-packet.md` before writing project-local `.gse/` artifacts or claiming owner-approved adoption acceptance.

## Verification Commands

Use only the commands that match the recipe and risk:

```text
node <gse-skill>/scripts/audit-project.mjs --root <gse-skill>
node <gse-skill>/scripts/audit-adoption.mjs --root <gse-skill>
node <gse-skill>/scripts/audit-command-adapters.mjs --root <gse-skill>
node <gse-skill>/scripts/audit-host-adapters.mjs --root <gse-skill>
node <gse-skill>/scripts/audit-fixtures.mjs --root <gse-skill>
node <gse-skill>/scripts/audit-target-project.mjs --target <project-root>
node <gse-skill>/scripts/validate-gse.mjs --root <gse-skill>
```

These commands verify GSE fixtures and skill readiness. They do not certify arbitrary production repositories. Real adoption still needs project-specific inspection, focused smokes, and evidence.
