#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

import { executeTransaction } from './core/persistence/transaction.mjs'
import { ALLOWED_FIELDS_BY_RECORD_TYPE } from './core/persistence/record-allowlists.mjs'
import { inspectGseV1Project } from './core/migration-v1.mjs'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const target = path.resolve(readArg('--target', process.cwd()))
const force = args.includes('--force')
const requestedMode = readArg('--mode', 'auto')
const hostAdaptersArg = readArg('--host-adapters', 'auto')
const validModes = new Set(['auto', 'lite', 'standard', 'enterprise'])
const validHostAdapters = new Set(['auto', 'all', 'none'])

if (!validModes.has(requestedMode)) {
  console.error(`Invalid --mode "${requestedMode}". Expected one of: auto, lite, standard, enterprise.`)
  process.exit(1)
}

if (!validHostAdapters.has(hostAdaptersArg) && !hostAdaptersArg.split(',').every((item) => ['codex', 'claude'].includes(item.trim()))) {
  console.error(`Invalid --host-adapters "${hostAdaptersArg}". Expected auto, all, none, codex, claude, or codex,claude.`)
  process.exit(1)
}

const gseDir = path.join(target, '.gse')
const date = new Date().toISOString().slice(0, 10)
const existingStatePath = path.join(gseDir, 'state.json')
const bootstrappedState = !fs.existsSync(existingStatePath)

if (!bootstrappedState) {
  const compatibility = inspectGseV1Project(target)
  if (compatibility.reasonCode !== 'PROJECT_STATE_V1_CANONICAL') {
    console.log(JSON.stringify({
      target,
      gseDir,
      force,
      requestedMode,
      status: compatibility.status,
      reasonCode: compatibility.reasonCode,
      message: compatibility.reasonCode === 'MIGRATION_INSPECTION_READY'
        ? 'Existing project state requires an explicit reviewed Core v1 migration before scaffold initialization can continue.'
        : compatibility.message,
      proposedWrites: compatibility.proposedWrites ?? [],
      sourceDigests: compatibility.sourceDigests ?? {},
      results: [],
    }, null, 2))
    process.exitCode = 1
  }
}

if (process.exitCode === 1) {
  process.exit()
}

function exists(relativePath) {
  return fs.existsSync(path.join(target, relativePath))
}

function safeJson(relativePath) {
  const fullPath = path.join(target, relativePath)
  if (!fs.existsSync(fullPath)) return null
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8').replace(/^\uFEFF/, ''))
  } catch {
    return null
  }
}

function listTopLevelDirs() {
  if (!fs.existsSync(target)) return []
  return fs
    .readdirSync(target, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
}

function detectMode() {
  const pkg = safeJson('package.json')
  const scripts = pkg?.scripts ?? {}
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) }
  const topLevelDirs = listTopLevelDirs()
  const reasons = []

  const enterpriseSignals = [
    ['release workflow', exists('release.md') || exists('CHANGELOG.md') || Boolean(scripts.release || scripts.deploy || scripts['release:dry-run'])],
    ['multiple app/package directories', topLevelDirs.filter((name) => ['apps', 'packages', 'services', 'workers'].includes(name)).length >= 2],
  ].filter(([, ok]) => ok)
  const supportingSignals = [
    ['.mcp.json', exists('.mcp.json')],
    ['.claude/', exists('.claude')],
    ['.codex/', exists('.codex')],
    ['.agents/', exists('.agents')],
    ['hooks/', exists('hooks') || exists('.gse/hooks')],
    ['plugins/', exists('plugins') || exists('.gse/plugins')],
  ].filter(([, ok]) => ok)

  if (enterpriseSignals.length > 0) {
    reasons.push(...enterpriseSignals.map(([label]) => label))
    return { mode: 'enterprise', reasons }
  }
  if (supportingSignals.length >= 3) {
    reasons.push(...supportingSignals.map(([label]) => label))
    return { mode: 'enterprise', reasons }
  }
  if (supportingSignals.length > 0) reasons.push(...supportingSignals.map(([label]) => label))

  const standardSignals = [
    ['package.json', Boolean(pkg)],
    ['project rules', exists('AGENTS.md') || exists('CLAUDE.md') || exists('README.md')],
    ['CI workflow', exists('.github/workflows') || exists('.gitlab-ci.yml')],
    ['browser/test config', exists('playwright.config.ts') || exists('playwright.config.js') || exists('vitest.config.ts') || exists('jest.config.js')],
    ['TypeScript', exists('tsconfig.json') || Boolean(deps.typescript)],
    ['test/build scripts', Boolean(scripts.test || scripts.build || scripts.typecheck || scripts.lint)],
    ['docs directory', exists('docs')],
  ].filter(([, ok]) => ok)

  if (standardSignals.length >= 2) {
    reasons.push(...standardSignals.map(([label]) => label))
    return { mode: 'standard', reasons }
  }

  if (standardSignals.length === 1) reasons.push(...standardSignals.map(([label]) => label))
  if (reasons.length === 0) reasons.push('empty or minimal project')
  return { mode: 'lite', reasons }
}

const autoSelection = requestedMode === 'auto' ? detectMode() : { mode: requestedMode, reasons: ['explicit --mode ' + requestedMode] }
const mode = autoSelection.mode

function renderJson(value) {
  return JSON.stringify(value, null, 2) + '\n'
}

const pendingCanonicalWrites = []

function writeIfMissing(relativePath, content) {
  const filePath = path.join(gseDir, relativePath)
  const canonical = relativePath === 'state.json' || relativePath === 'evidence/index.jsonl'
  const replaceBootstrapState = relativePath === 'state.json' && bootstrappedState
  if (
    fs.existsSync(filePath)
    && !replaceBootstrapState
    && (!force || relativePath === 'state.json')
  ) {
    return { relativePath, status: 'skipped' }
  }
  if (canonical) {
    pendingCanonicalWrites.push({
      kind: relativePath === 'state.json' ? 'json-replace' : 'jsonl-append',
      path: `.gse/${relativePath}`,
      ...(relativePath === 'state.json' ? { value: JSON.parse(content) } : { event: { ...JSON.parse(content), eventId: `adoption-${date}-${mode}`, recordType: 'adoption' } }),
    })
    return { relativePath, status: fs.existsSync(filePath) ? (force ? 'written-or-overwritten' : 'written') : 'written' }
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content.trimStart().replace(/\n/g, '\r\n'), 'utf8')
  return { relativePath, status: fs.existsSync(filePath) ? (force ? 'written-or-overwritten' : 'written') : 'failed' }
}

function writeProjectFileIfMissing(relativePath, content) {
  const filePath = path.join(target, relativePath)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  if (!force && fs.existsSync(filePath)) return { relativePath, status: 'skipped' }
  fs.writeFileSync(filePath, content.trimStart().replace(/\n/g, '\r\n'), 'utf8')
  return { relativePath, status: 'written' }
}

const hostAdapterConfigs = {
  codex: {
    path: '.codex/gse-adapter.md',
    title: 'Codex Adapter',
    bullets: [
      'Start meaningful work from `.gse/project-profile.md`, `.gse/goal-map.md`, and `.gse/quality-gates.md`.',
      'Use `.gse/goals/` for module-level goal details when the root goal map becomes too large.',
      'Record current-session evidence before marking subagents, MCP, browser, LSP, or model routing as verified.',
    ],
  },
  claude: {
    path: '.claude/gse-adapter.md',
    title: 'Claude Code Adapter',
    bullets: [
      'Commands, agents, hooks, and skills should point back to `.gse/` for goals, evidence, quality gates, and learning rules.',
      'Keep host-specific prompts short; keep reusable workflow policy in `.gse/`.',
      'Use `.gse/goals/` for module-level goal details when the root goal map becomes too large.',
    ],
  },
}

function selectedHostAdapters() {
  if (mode !== 'enterprise') return []
  if (hostAdaptersArg === 'none') return []
  if (hostAdaptersArg === 'all') return Object.keys(hostAdapterConfigs)
  if (hostAdaptersArg !== 'auto') return hostAdaptersArg.split(',').map((item) => item.trim()).filter(Boolean)
  return Object.keys(hostAdapterConfigs).filter((host) => exists(host === 'codex' ? '.codex' : '.claude'))
}

function renderHostAdapter(config) {
  return `# ${config.title}

Source of truth: \`.gse/\`.

${config.bullets.map((item) => '- ' + item).join('\n')}

Capability status vocabulary: \`verified\`, \`documented\`, \`unknown\`, \`unavailable\`.
`
}

fs.mkdirSync(gseDir, { recursive: true })
fs.mkdirSync(path.join(gseDir, 'changes'), { recursive: true })
fs.mkdirSync(path.join(gseDir, 'evidence'), { recursive: true })
fs.mkdirSync(path.join(gseDir, 'templates'), { recursive: true })
fs.mkdirSync(path.join(gseDir, 'goals'), { recursive: true })

if (bootstrappedState) {
  fs.writeFileSync(existingStatePath, JSON.stringify({ schemaVersion: 1, stateRevision: 0, activeChangeId: null }) + '\n', 'utf8')
}

if (mode === 'standard' || mode === 'enterprise') {
  for (const dir of ['agents', 'skills', 'lsp']) {
    fs.mkdirSync(path.join(gseDir, dir), { recursive: true })
  }
}

if (mode === 'enterprise') {
  for (const dir of ['hooks', 'mcp', 'plugins']) {
    fs.mkdirSync(path.join(gseDir, dir), { recursive: true })
  }
}

const results = [
  writeIfMissing(
    'state.json',
    renderJson({
      schemaVersion: 1,
      activeChangeId: null,
      projectName: path.basename(target),
      mode,
      canonicalGoalSource: '',
      canonicalPlan: '',
      phase: 'adopt',
      currentSlice: {
        id: '',
        outcome: '',
        status: 'planned',
        nextAction: 'Record the canonical product goal source and choose the next verifiable slice in .gse/goal-map.md.',
      },
      toolStatuses: {
        browser: 'unknown',
        lsp: 'unknown',
        mcp: 'unknown',
        subagents: 'unknown',
        ci: 'unknown',
      },
      lastEvidence: `.gse/evidence/${date}.md`,
      residualRisks: [
        'Project commands and host tools are unknown until verified in this repository.',
      ],
    }),
  ),
  writeIfMissing(
    'evidence/index.jsonl',
    JSON.stringify({
      date,
      recordType: 'adoption',
      status: 'result',
      evidenceLevel: 'result',
      requiredEvidenceLevel: 'verified-unit',
      summary: `Initialized GSE ${mode} scaffold.`,
      evidenceFile: `.gse/evidence/${date}.md`,
      commands: [`node <gse-skill>/scripts/init-project.mjs --target <project-root> --mode ${requestedMode}`],
      nextAction: 'Record project-specific profile, canonical product goal source, quality gates, and first verified slice.',
    }) + '\n',
  ),
  writeIfMissing(
    `evidence/${date}.md`,
    `# GSE Adoption Evidence

- Date: ${date}
- Status: result
- Evidence level: result
- Summary: Initialized GSE ${mode} scaffold.
- Command: \`node <gse-skill>/scripts/init-project.mjs --target <project-root> --mode ${requestedMode}\`

Next action: Record project-specific profile, canonical product goal source, quality gates, and first verified slice.
`,
  ),
  writeIfMissing(
    'README.md',
    `# GSE Workflow

This project uses GSE: Goal-Spec-Evidence Engineering.

Start meaningful work by reading:

1. Project agent rules, such as AGENTS.md or CLAUDE.md.
2. .gse/state.json.
3. .gse/project-profile.md.
4. .gse/goal-map.md.
5. .gse/quality-gates.md.
6. .gse/project-guards.md.
7. The relevant change folder under .gse/changes/ when one exists.

Core loop:

\`\`\`text
Goal -> Spec -> Execute -> Evidence -> Learn
\`\`\`

Keep the workflow as light as the task allows and as rigorous as the risk requires.

Bootstrap mode: ${mode}
Mode selection: ${requestedMode === 'auto' ? 'auto' : 'manual'}
Selection reasons: ${autoSelection.reasons.join(', ')}
`,
  ),
  writeIfMissing(
    'project-profile.md',
    `# Project Profile

Keep this file short and factual. Project-specific rules override generic GSE defaults.

## Identity

- Product/system name:
- Repository type:
- Main languages/frameworks:

## Development Commands

- Install:
- Dev server:
- Focused test:
- Typecheck/lint/build:
- Encoding or generated-file checks:

## Standards

- Coding standards:
- Formatting:
- Testing expectations:
- Documentation expectations:

## Canonical Product Goal Source

- Source: Fill with the existing project roadmap, architecture, PRD, vision, product plan, or goal document when one exists.
- Rule: If this conflicts with \`.gse/goal-map.md\`, this source wins and \`.gse/goal-map.md\` must be corrected.

## Tool Connections

| Tool | Purpose | Command/config | Status |
|---|---|---|---|
| rg | Search files/text | rg / rg --files | recommended |
| LSP/index | Symbol navigation | - | unknown |
| Browser/Playwright | UI smoke | - | unknown |
| MCP | External tools/data | - | unknown |
| CI | Automated gates | - | unknown |
| Deploy | Release path | - | unknown |

## Agent Host Adapters

- Codex:
- Claude Code:
- Hermes/AION-style runtime:
- WorkBuddy/other:

## Security And Permissions

- Secrets handling:
- Write-capable tools:
- Destructive commands:
- External services:

## Release And Rollback

- Release command/process:
- Rollback:
- Smoke checks:

## Known Gotchas

- Add recurring project-specific issues here.
`,
  ),
  writeIfMissing(
    'goal-map.md',
    `# Goal Map

Updated: ${date}

## North Star

Canonical product goal source: fill this from \`.gse/project-profile.md\` or the project's existing roadmap, architecture, PRD, vision, product plan, or goal document.

This file is a GSE execution projection, not a second product roadmap. If it conflicts with the canonical product goal source, canonical product goal source wins.

Describe the durable project outcome summary here, copied or summarized from the canonical product source.

## Current Focus

- Priority: P0
- Active slice: Define the next verifiable slice.
- Next action: Fill this in before implementation starts.

## Goal Nodes

| ID | Goal | Status | Priority | Evidence | Next Slice |
|---|---|---|---|---|---|
| G-001 | Establish project workflow | planned | P1 | - | Initialize GSE and bind first real task |

## Risks

- Add project-specific risks here.
`,
  ),
  writeIfMissing(
    'quality-gates.md',
    `# Quality Gates

## Universal

- Outcome, scope, acceptance, evidence, and next action are explicit.
- Verification matches the task risk.
- No unrelated files are staged or committed.

## Code

- Run focused tests for changed behavior.
- Run typecheck, lint, or build when relevant.

## UI

- Use browser, Playwright, component tests, or screenshots for visible behavior.

## Release

- Record migration, rollback, and known risks for release-impacting work.

## Learning

- Capture reusable lessons and promote recurring issues into gates.
`,
  ),
  writeIfMissing(
    'project-guards.md',
    `# Project Guards

Project guards are reusable preflight rules promoted from repeated project lessons.

GSE reads this file during \`/gse continue\` and surfaces active guards before implementation. Keep it short, project-local, and evidence-bound.

| ID | Guard | Severity | Trigger | Check | Status |
|---|---|---|---|---|---|
| WIN-SHELL | Use shell syntax that matches the active host. On Windows, prefer \`cmd /c\` for npm, pnpm, npx, and similar commands when PowerShell shims or operators are unreliable. | high | Windows shell or package-manager command | Confirm command syntax is valid for the current shell before running or documenting it. | active |
| SPARSE-GIT | Check sparse checkout before staging generated workflow folders. | high | \`.gse/\`, host adapter, or generated scaffold changes | If sparse checkout is active and the path is outside the cone, use sparse-aware staging or record the limitation. | active |
| UTF8-DOC | Use UTF-8-safe readers for Chinese or multilingual docs before judging mojibake. | high | Chinese docs, encoding complaints, generated docs | Read with Node UTF-8 or another UTF-8-safe viewer; run the project encoding check when docs changed. | active |
| EVIDENCE-STALE | Treat stale, broken, or schema-weak evidence as a preflight problem. | high | \`.gse/evidence/index.jsonl\`, state, close gate | Validate JSONL and make sure latest evidence matches the current slice before closing. | active |
| UI-EVIDENCE | Label UI/browser verification downgrades explicitly. | medium | UI, browser, screenshot, component test, visual behavior | Mark evidence as unit, component, API, browser, CI, owner, release, or external instead of hiding downgrade under a generic verified label. | active |
| SUBAGENT-HONEST | Do not claim subagent dispatch unless the current host exposes real dispatch evidence. | high | multi-agent, subagent, role dispatch, parallel work | If no real dispatch tool exists, run roles sequentially or use file/tool parallelism and say so. | active |
| SYNC-NO-INTERRUPT | Do not interrupt running project sessions with cross-thread GSE sync messages. | high | GSE upgrade sync, delegation, background thread message | Prefer evidence records or owner action notes; only send a short cross-thread sync when the target session is idle or the owner explicitly asks. | active |
`,
  ),
  writeIfMissing(
    'tooling.md',
    `# Tooling

Minimum tools: git, shell, and project test/build commands.

Recommended tools:

- rg / rg --files for fast search.
- LSP or code index for large projects.
- Browser or Playwright for UI verification.
- GSE change packs for capability specs.
- GSE lifecycle state for change coordination.
- Learning files for durable lessons.

Do not claim a tool was used when it was not available.
`,
  ),
  writeIfMissing(
    'host-capabilities.md',
    `# Host Capabilities

Record current project and host capability facts here. A generated adapter, portable command, or another host's evidence is not proof for this host.

Status vocabulary: \`verified\`, \`documented\`, \`unknown\`, \`unavailable\`, \`external-required\`.

| Capability | Host/Tool | Status | Evidence | Claim Boundary | Last Checked |
|---|---|---|---|---|---|
| native-slash-command | current host | external-required | - | Native slash-command support requires real host runtime invocation evidence, not portable \`/gse\` runner output. | - |
| browser | browser or Playwright | unknown | - | Browser proof requires a real browser/component/screenshot command for this project. | - |
| mcp | MCP servers | unknown | - | MCP status is host and project specific. | - |
| lsp | LSP or code index | unknown | - | LSP/index status is current-session specific unless project docs prove it. | - |
| subagent | host dispatch | unknown | - | Real subagent dispatch requires verified host/tool evidence; sequential role fallback is not real dispatch. | - |
| ci | project CI | unknown | - | CI is verified only after a workflow/config or run is checked for this project. | - |
| continuation-mode | current host | unknown | - | Use autonomous only with explicit runtime capability or verified persistent native Goal lifecycle evidence; otherwise use turn-controlled. | - |
| native-goal-lifecycle | current host | unknown | - | Generated adapters and portable packets do not prove native Goal lifecycle support. | - |
| native-context-rollover | current host | unknown | - | Native compaction or resume requires host-specific evidence; portable checkpoints remain available as fallback. | - |
| native-cancellation | current host | unknown | - | Cancellation claims require live host status or persistent host evidence. | - |
`,
  ),
  writeIfMissing(
    'learnings.md',
    `# Learnings

Record only reusable lessons.

## Template

### YYYY-MM-DD - Short title

- Trigger:
- Lesson:
- Prevention:
- Promotion target:
`,
  ),
  writeIfMissing(
    'templates/change-brief.md',
    `# Change Brief

## Outcome

## Scope

## Non-goals

## Acceptance

## Evidence Plan

## Risks

## Next Action
`,
  ),
  writeIfMissing(
    'templates/evidence.md',
    `# Evidence

## Status

- Evidence status:
- Evidence level:
- Required evidence level:

## Commands

## Results

## Files Changed

## Residual Risk

## Follow-up
`,
  ),
  writeIfMissing(
    'templates/spec.md',
    `# Spec

## User Outcome

## Behavior

## State / Data Flow

## Error and Recovery

## Permissions and Privacy

## Acceptance Criteria

## Non-goals
`,
  ),
  writeIfMissing(
    'templates/design.md',
    `# Design

## Approach

## State / Data Flow

## Interfaces And Contracts

## Permissions And Privacy

## Error And Recovery

## Alternatives Considered

## Rollback

## Open Questions
`,
  ),
  writeIfMissing(
    'templates/tasks.md',
    `# Tasks

## Slice Plan

- [ ] Define outcome, scope, acceptance, evidence, risk, and next action.
- [ ] Locate existing patterns and ownership boundaries.
- [ ] Implement the smallest verifiable change.
- [ ] Run focused verification.
- [ ] Record evidence and residual risk.
- [ ] Update state, goal map, and handoff notes when relevant.

## Non-Goals

## Dependencies

## Stop Conditions
`,
  ),
  writeIfMissing(
    'templates/review.md',
    `# Review

## Spec Compliance

## Code Quality

## Architecture / Ownership

## Security / Privacy

## Regression Risk

## Evidence Review

## Findings

## Closure
`,
  ),
  writeIfMissing(
    'templates/execution-quality-pack.md',
    `# Execution Quality Pack

## Task Profile

- Level: lite | standard | enterprise
- Change type:
- User-visible impact:
- Data/security/release impact:

## Required Skills Or Roles

| Role / Skill | Purpose | Required | Evidence |
|---|---|---|---|
| Coordinator | Scope, final judgment, integration | yes | plan/state/evidence |
| Code Locator | Files, symbols, existing tests | when code changes | search/LSP notes |
| Builder | Bounded implementation | when files change | diff + focused check |
| QA / Verification | Focused proof | yes | command/browser/API smoke |
| Reviewer | Spec, quality, architecture, security | risk-based | review notes |

## Tool Routing

## Quality Gates Selected

## Evidence Plan

## Review And Closure
`,
  ),
  writeIfMissing(
    'goals/README.md',
    `# Goal Details

Use this folder for module-level or stream-level goal details when \`.gse/goal-map.md\` becomes too large.

Keep \`.gse/goal-map.md\` as the short index:

- North Star
- Current focus
- Top goal nodes
- Risks
- Next slices

Put detailed module goals here, for example:

- \`frontend.md\`
- \`backend.md\`
- \`memory.md\`
- \`worker.md\`
- \`release.md\`
`,
  ),
]

if (mode === 'standard' || mode === 'enterprise') {
  results.push(
    writeIfMissing(
      'agent-workspace.md',
      `# Agent Workspace

This project keeps portable agent workflow files under .gse/.

Host-specific folders such as .codex/, .claude/, .agents/, or runtime-specific directories may point back here, but .gse/ is the source of truth.

Repository entrypoint: AGENTS.md when present.

## Local Map

- Goal map: .gse/goal-map.md
- Quality gates: .gse/quality-gates.md
- Agent roles: .gse/agents/roles.md
- Dispatch rules: .gse/agents/dispatch.md
- Role fallback packets: .gse/agents/role-fallback-packets.md
- Project skills: .gse/skills/README.md
- Project plugins: .gse/plugins/README.md
- Project hooks: .gse/hooks/README.md
- MCP notes: .gse/mcp/README.md
- LSP/index notes: .gse/lsp/README.md

## Adapter Rule

Do not duplicate the whole workflow into a host-specific folder. Add a short pointer from that host folder back to .gse/ when needed.
`,
    ),
    writeIfMissing(
      'agents/roles.md',
      `# Agent Roles

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
`,
    ),
    writeIfMissing(
      'agents/dispatch.md',
      `# Agent Dispatch

Use real subagent tools only when the host exposes them.

## Dispatch Packet

- Role:
- Real delegation used: yes | no
- Objective:
- Allowed files:
- Forbidden actions:
- Role output evidence:
- Expected output:
- Verification:

## Rules

- Do not delegate final judgment.
- Avoid parallel writes to the same file.
- Say explicitly when subagent tools are unavailable and execute roles sequentially.
- Keep prompts free of expected answers when using agents for validation.
`,
    ),
    writeIfMissing(
      'agents/role-fallback-packets.md',
      `# Role Fallback Packets

These packets make role-separated work auditable even when real subagent tools are unavailable.

| Role | Mode | Real delegation used | Tool status | Fallback output | Evidence | Stop condition | Write access |
|---|---|---|---|---|---|---|---|
| Planner | sequential-role | no | unknown | Slice plan with outcome, scope, acceptance, evidence, risk, and next action | .gse/current-slice.md or planning note | Goal, roadmap, or acceptance source is contradictory | docs/state only |
| Locator | sequential-role | no | unknown | File, symbol, command, and existing-test map | search output or locator notes | Required files cannot be found or ownership is unclear | read-only |
| Implementer | sequential-role | no | unknown | Bounded diff in assigned files | git diff and changed-file list | Target files have unsafe unrelated dirty changes | assigned files only |
| Verifier | sequential-role | no | unknown | Focused command results and evidence level | command output summary and evidence record | Required focused check cannot run or fails without a repair path | evidence/test output only |
| Reviewer | sequential-role | no | unknown | Spec compliance and quality findings | review notes or explicit no-findings statement | Diff exceeds scope or missing tests are material | read-only |
| Docs/Evidence | sequential-role | no | unknown | Slice evidence, state, goal-map, and roadmap updates | .gse/evidence/index.jsonl and .gse/evidence/YYYY-MM-DD.md | Evidence cannot be recorded or JSONL is invalid | docs/evidence only |
| Release | sequential-role | no | unknown | Release, owner, external, CI, package, and host-runtime boundary check | final-readiness or public-acceptance audit summary | Local evidence is being used to claim owner/external support | docs/release only |
`,
    ),
    writeIfMissing(
      'skills/README.md',
      `# Project Skills

Record project-local skills and reusable workflows here. Status describes repository evidence, not assumed host availability.

## Inventory

| Skill | Host | Purpose | Source | Status | Fallback | Claim Boundary |
|---|---|---|---|---|---|---|
| Project workflow | portable | Project-local engineering workflow | .gse/ and project rules | documented | Read project rules and use repository commands | Documentation does not prove native host discovery |

## Rules

- Prefer portable instructions under .gse/ when a workflow is useful across hosts.
- Keep host-specific skills small and point back to .gse/ for project policy.
- Do not claim a skill exists unless it is installed or documented here.
- Use only verified, documented, unknown, unavailable, or external-required for status.
`,
    ),
    writeIfMissing(
      'lsp/README.md',
      `# LSP And Indexing

Record code navigation tools for this project. Search fallback is portable; LSP availability is host-specific.

## Commands

## Inventory

| Capability | Host/Tool | Purpose | Status | Evidence | Fallback | Claim Boundary |
|---|---|---|---|---|---|---|
| File search | ripgrep | Find files and text across the repository | documented | Project workflow recommends rg first | PowerShell Get-ChildItem and Select-String | Documentation does not prove rg is installed on every host |
| Symbol navigation | LSP or code index | Navigate definitions, references, and symbols | unknown | - | Use rg, focused file reads, and existing tests | No LSP/index runtime is verified by the scaffold |

- Search files: rg --files
- Search text: rg "pattern"
- LSP/index command:

## Notes

- Prefer symbol navigation for large projects when available.
- Fall back to rg and existing tests when LSP is unavailable.
- Use only verified, documented, unknown, unavailable, or external-required for status.
`,
    ),
  )
}

if (mode === 'enterprise') {
  results.push(
    writeIfMissing(
      'hooks/README.md',
      `# Hooks

Record host-specific automation hooks here. Hooks stay opt-in and must be proved in the target host.

## Hook Inventory

| Hook | Host | Trigger | Command | Risk | Status | Evidence | Fallback | Claim Boundary |
|---|---|---|---|---|---|---|---|---|
| Project validation hook | current repository | pre-commit or pre-push | project validation command | Validation can block local workflow | unknown | - | Run validation manually or in CI | No local hook is enabled by this scaffold |

## Rules

- Hooks must be explicit, reversible, and safe for the project.
- Keep secrets out of hook files.
- Document any destructive or networked behavior before enabling it.
- Use only verified, documented, unknown, unavailable, or external-required for status.
`,
    ),
    writeIfMissing(
      'mcp/README.md',
      `# MCP

Record MCP servers, permissions, and setup notes here. MCP availability is session- and host-specific.

## Servers

| Server | Purpose | Permissions | Setup | Owner | Status | Evidence | Fallback | Claim Boundary |
|---|---|---|---|---|---|---|---|---|
| Project MCP servers | Optional project integrations | server-specific | Configure outside committed secrets | project owner | unknown | - | Use filesystem, shell, local docs, and repository scripts | No MCP server is required or verified by the scaffold |

## Rules

- Keep real secrets out of source control.
- Document write-capable tools and approval expectations.
- Use only verified, documented, unknown, unavailable, or external-required for status.
`,
    ),
    writeIfMissing(
      'plugins/README.md',
      `# Plugins

Record optional host plugins and runtime adapters here. Plugins are never inferred from pointer files alone.

## Inventory

| Plugin | Host | Purpose | Required | Status | Evidence | Fallback | Claim Boundary |
|---|---|---|---|---|---|---|---|
| Host runtime plugins | project hosts | Optional runtime acceleration | no | unknown | - | Use project rules, .gse/, and portable commands | No plugin is claimed until installation and invocation are recorded |

## Rules

- Plugins are optional accelerators unless the project explicitly requires them.
- Provide a markdown fallback when a plugin is unavailable.
- Use only verified, documented, unknown, unavailable, or external-required for status.
`,
    ),
    writeIfMissing(
      'release.md',
      `# Release

## Checklist

- Version or deployment target:
- Migration:
- Rollback:
- Smoke test:
- Known risks:
`,
    ),
    writeIfMissing(
      'incident-review.md',
      `# Incident Review

## Summary

## Impact

## Timeline

## Root Cause

## Fix

## Prevention
`,
    ),
    writeIfMissing(
      'audit.md',
      `# GSE Audit

## Coverage

- Goal map:
- Specs:
- Evidence:
- Quality gates:
- Tooling:
- Learning loop:

## Gaps

## Next Improvements
`,
    ),
  )
}

for (const host of selectedHostAdapters()) {
  const config = hostAdapterConfigs[host]
  results.push(writeProjectFileIfMissing(config.path, renderHostAdapter(config)))
}

if (pendingCanonicalWrites.length > 0) {
  const state = safeJson('.gse/state.json') ?? { schemaVersion: 1, stateRevision: 0, activeChangeId: null }
  const transaction = await executeTransaction({
    target,
    operationId: `init-project-${date}`,
    expectedRevision: state.stateRevision,
    writes: pendingCanonicalWrites.filter((write) => write.kind !== 'jsonl-append'),
    events: pendingCanonicalWrites.filter((write) => write.kind === 'jsonl-append').map((write) => ({ path: write.path, event: write.event })),
    allowedFieldsByRecordType: ALLOWED_FIELDS_BY_RECORD_TYPE,
  })
  if (transaction.status !== 'complete') throw new Error(transaction.message)
}

console.log(JSON.stringify({ target, gseDir, force, requestedMode, mode, selectionReasons: autoSelection.reasons, hostAdapters: selectedHostAdapters(), results }, null, 2))
