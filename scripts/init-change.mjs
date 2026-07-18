#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { executeTransaction } from './core/persistence/transaction.mjs'
import { ALLOWED_FIELDS_BY_RECORD_TYPE } from './core/persistence/record-allowlists.mjs'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const jsonOnly = args.includes('--json')
const selfTest = args.includes('--self-test') || !args.includes('--target')
const targetArg = readArg('--target')
const force = args.includes('--force')
const changeIdArg = readArg('--change-id', 'sample-change')
const level = readArg('--level', 'standard')
const validLevels = new Set(['lite', 'standard', 'enterprise'])

if (!validLevels.has(level)) {
  console.error(`Invalid --level "${level}". Expected lite, standard, or enterprise.`)
  process.exit(1)
}

function slug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'change'
}

function createFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-init-change-'))
  fs.mkdirSync(path.join(dir, '.gse'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.gse', 'goal-map.md'), '# Goal Map\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'quality-gates.md'), '# Quality Gates\n', 'utf8')
  return dir
}

function renderBrief(changeId) {
  return `# Change Brief

Change ID: ${changeId}

## Outcome

## Scope

## Non-goals

## Acceptance

## Evidence Plan

## Risks

## Next Action
`
}

function renderSpec(changeId) {
  return `# Spec

Change ID: ${changeId}

## User Outcome

## Behavior

## State / Data Flow

## Error and Recovery

## Permissions and Privacy

## Acceptance Criteria

## Non-goals
`
}

function renderDesign(changeId) {
  return `# Design

Change ID: ${changeId}

## Approach

## State / Data Flow

## Interfaces And Contracts

## Permissions And Privacy

## Error And Recovery

## Alternatives Considered

## Rollback

## Open Questions
`
}

function renderTasks(changeId) {
  return `# Tasks

Change ID: ${changeId}

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
`
}

function renderEvidence(changeId) {
  return `# Evidence

Change ID: ${changeId}

## Commands

## Results

## Files Changed

## Evidence Status

result | verified | accepted | not ready

## Residual Risk

## Follow-up
`
}

function renderReview(changeId) {
  return `# Review

Change ID: ${changeId}

## Spec Compliance

## Code Quality

## Architecture / Ownership

## Security / Privacy

## Regression Risk

## Evidence Review

## Findings

## Closure
`
}

function renderExecutionPack(changeId) {
  return `# Execution Quality Pack

Change ID: ${changeId}

## Task Profile

- Level: ${level}
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

| Tool | Use When | Status | Fallback |
|---|---|---|---|
| rg / rg --files | Code and doc location | recommended | shell listing |
| LSP / index | Large or typed codebase | unknown | rg + existing tests |
| Browser / Playwright | UI or user-visible flow | unknown | component/API smoke plus notes |
| Change pack | Capability/API/state contract change | recommended | .gse/changes/ markdown |
| Lifecycle state | Full lifecycle change | recommended | GSE phase/status files |
| Role plan | Complex staged execution/review | recommended | GSE roles + quality gates |
| Subagents | Parallel bounded work | unknown | sequential role execution |

## Quality Gates Selected

## Evidence Plan

## Review And Closure
`
}

async function initChange(target) {
  const resolvedTarget = path.resolve(target)
  const changeId = slug(changeIdArg)
  const changeDir = path.join(resolvedTarget, '.gse', 'changes', changeId)
  const allFiles = {
    brief: ['brief.md', renderBrief(changeId)],
    spec: ['spec.md', renderSpec(changeId)],
    design: ['design.md', renderDesign(changeId)],
    tasks: ['tasks.md', renderTasks(changeId)],
    evidence: ['evidence.md', renderEvidence(changeId)],
    review: ['review.md', renderReview(changeId)],
    executionQuality: ['execution-quality-pack.md', renderExecutionPack(changeId)],
  }
  const fileKeysByLevel = {
    lite: ['brief', 'evidence'],
    standard: ['brief', 'spec', 'tasks', 'evidence'],
    enterprise: ['brief', 'spec', 'design', 'tasks', 'evidence', 'review', 'executionQuality'],
  }
  const files = fileKeysByLevel[level].map((key) => allFiles[key])
  const results = files.map(([name]) => ({
    relativePath: path.join('.gse', 'changes', changeId, name).replace(/\\/g, '/'),
    status: force || !fs.existsSync(path.join(changeDir, name)) ? 'written' : 'skipped',
  }))
  const writes = files
    .filter(([name]) => force || !fs.existsSync(path.join(changeDir, name)))
    .map(([name, content]) => ({
      kind: 'text-write',
      path: `.gse/changes/${changeId}/${name}`,
      content: content.trimStart().replace(/\n/g, '\r\n'),
    }))
  const statePath = path.join(resolvedTarget, '.gse', 'state.json')
  fs.mkdirSync(path.dirname(statePath), { recursive: true })
  if (!fs.existsSync(statePath)) fs.writeFileSync(statePath, JSON.stringify({ schemaVersion: 1, stateRevision: 0, activeChangeId: null }) + '\n', 'utf8')
  if (writes.length > 0) {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    const nextState = {
      ...state,
      activeChangeId: changeId,
      phase: 'spec',
      currentSlice: {
        ...(state.currentSlice ?? {}),
        id: changeId,
        status: 'planned',
      nextAction: level === 'lite'
        ? 'Implement the smallest verifiable change and record focused evidence.'
        : 'Execute the change tasks and record evidence.',
      },
      currentSummary: `Change ${changeId} specification initialized.`,
      updatedAt: new Date().toISOString(),
    }
    const transaction = await executeTransaction({
      target: resolvedTarget,
      operationId: `init-change-${changeId}`,
      expectedRevision: state.stateRevision,
      writes: [
        ...writes,
        { kind: 'json-replace', path: '.gse/state.json', value: nextState },
      ],
      events: [],
      allowedFieldsByRecordType: ALLOWED_FIELDS_BY_RECORD_TYPE,
    })
    if (transaction.status !== 'complete') throw new Error(transaction.message)
  }
  const written = results.filter((item) => item.status !== 'skipped').length
  const skipped = results.filter((item) => item.status === 'skipped').length
  return {
    target: resolvedTarget,
    generatedAt: new Date().toISOString(),
    changeId,
    level,
    force,
    summary: {
      status: 'passed',
      written,
      skipped,
      total: results.length,
    },
    results,
  }
}

const target = selfTest ? createFixture() : targetArg
const report = await initChange(target)

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else {
  console.log(`# GSE Change Init\n\nTarget: ${report.target}\nChange: ${report.changeId}\nLevel: ${report.level}`)
  for (const item of report.results) console.log(`- ${item.relativePath}: ${item.status}`)
}
