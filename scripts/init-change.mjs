#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { deriveActiveChangeFromSources, listActiveChangeIds } from './core/change-state.mjs'
import { readAtomicJson } from './core/persistence/atomic-json.mjs'
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
const level = readArg('--level')
const validLevels = new Set(['lite', 'standard', 'enterprise'])

if (!level) {
  console.error('Missing required --level. Expected lite, standard, or enterprise.')
  process.exit(1)
}

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
  fs.writeFileSync(path.join(dir, '.gse', 'state.json'), `${JSON.stringify({ schemaVersion: 1, stateRevision: 0, activeChangeId: null })}\n`, 'utf8')
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
    standard: ['brief', 'spec', 'design', 'tasks', 'evidence', 'review', 'executionQuality'],
    enterprise: ['brief', 'spec', 'design', 'tasks', 'evidence', 'review', 'executionQuality'],
  }
  const files = fileKeysByLevel[level].map((key) => allFiles[key])
  const sourceNames = ['brief.md', 'spec.md', 'design.md', 'tasks.md', 'evidence.md', 'review.md']
  const state = readAtomicJson(resolvedTarget, '.gse/state.json')
  if (!Number.isInteger(state?.stateRevision) || state.stateRevision < 0) {
    throw new Error('Project state does not contain a valid stateRevision.')
  }
  if (state.activeChangeId !== null && state.activeChangeId !== changeId) {
    throw new Error(`Another Change is active: ${state.activeChangeId}.`)
  }
  const conflictingChangeIds = listActiveChangeIds(resolvedTarget)
    .filter((activeChangeId) => activeChangeId !== changeId)
  if (conflictingChangeIds.length > 0) {
    throw new Error(`Core v1 supports only one active Change: ${conflictingChangeIds.join(', ')}.`)
  }

  const selectedFiles = new Map(files)
  const sourceSnapshots = new Map()
  const finalSources = new Map()
  for (const name of sourceNames) {
    const filePath = path.join(changeDir, name)
    const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath) : null
    sourceSnapshots.set(name, existing)
    if (selectedFiles.has(name) && (force || existing === null)) {
      finalSources.set(name, Buffer.from(selectedFiles.get(name).trimStart().replace(/\n/g, '\r\n')))
    } else if (existing !== null) {
      finalSources.set(name, existing)
    }
  }
  const cachePath = path.join(changeDir, 'change.json')
  const cacheSnapshot = fs.existsSync(cachePath) ? fs.readFileSync(cachePath) : null
  const results = files.map(([name]) => ({
    relativePath: path.join('.gse', 'changes', changeId, name).replace(/\\/g, '/'),
    status: force || !fs.existsSync(path.join(changeDir, name)) ? 'written' : 'skipped',
  }))
  const sourceWrites = files
    .filter(([name]) => force || !fs.existsSync(path.join(changeDir, name)))
    .map(([name, content]) => ({
      kind: 'text-write',
      path: `.gse/changes/${changeId}/${name}`,
      content: content.trimStart().replace(/\n/g, '\r\n'),
    }))
  const activeChange = deriveActiveChangeFromSources(changeId, finalSources, {
    profile: level,
    stateRevision: state.stateRevision + 1,
  })
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
    operationId: `init-change-${changeId}-r${state.stateRevision}`,
    expectedRevision: state.stateRevision,
    writes: [
      ...sourceWrites,
      {
        kind: 'json-replace',
        path: `.gse/changes/${changeId}/change.json`,
        value: activeChange,
      },
      { kind: 'json-replace', path: '.gse/state.json', value: nextState },
    ],
    events: [],
    allowedFieldsByRecordType: ALLOWED_FIELDS_BY_RECORD_TYPE,
    validatePreconditions: ({ state: lockedState }) => {
      if (lockedState.activeChangeId !== null && lockedState.activeChangeId !== changeId) {
        return {
          reasonCode: 'ACTIVE_CHANGE_MISMATCH',
          message: 'Another Change became active before initialization was published.',
        }
      }
      const lockedConflicts = listActiveChangeIds(resolvedTarget)
        .filter((activeChangeId) => activeChangeId !== changeId)
      if (lockedConflicts.length > 0) {
        return {
          reasonCode: 'MULTIPLE_ACTIVE_CHANGES_UNSUPPORTED',
          message: 'Another Change appeared before initialization was published.',
        }
      }
      for (const [name, before] of sourceSnapshots) {
        const filePath = path.join(changeDir, name)
        const current = fs.existsSync(filePath) ? fs.readFileSync(filePath) : null
        if ((before === null) !== (current === null) || (before !== null && !before.equals(current))) {
          return {
            reasonCode: 'CHANGE_SOURCE_DRIFT',
            message: 'Change source files changed before initialization was published.',
          }
        }
      }
      const currentCache = fs.existsSync(cachePath) ? fs.readFileSync(cachePath) : null
      if (
        (cacheSnapshot === null) !== (currentCache === null)
        || (cacheSnapshot !== null && !cacheSnapshot.equals(currentCache))
      ) {
        return {
          reasonCode: 'ACTIVE_CHANGE_CACHE_DRIFT',
          message: 'The active Change cache changed before initialization was published.',
        }
      }
      return true
    },
  })
  if (transaction.status !== 'complete') {
    const error = new Error(transaction.message)
    error.code = transaction.reasonCode
    throw error
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
