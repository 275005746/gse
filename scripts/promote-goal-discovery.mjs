#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1] ?? fallback
}

function slug(value, fallback = 'promoted-goal') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || fallback
}

function list(items, fallback = '- None recorded.') {
  return Array.isArray(items) && items.length > 0 ? items.map((item) => `- ${typeof item === 'string' ? item : item.value}`).join('\n') : fallback
}

function fail(status, error, extra = {}) {
  const report = { ...extra, status, error }
  console.log(jsonOnly ? JSON.stringify(report, null, 2) : `${status}: ${error}`)
  process.exit(1)
}

function readSession(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
    if (!parsed?.sessionId || !parsed?.intent || !Array.isArray(parsed?.paths)) throw new Error('required discovery fields are missing')
    return parsed
  } catch (error) {
    fail('invalid-session', `Cannot read discovery session ${filePath}: ${error.message}`, { sessionPath: filePath })
  }
}

function renderArtifacts(session, selectedPath, changeId, fingerprint) {
  const constraints = list(session.constraints)
  const unknowns = list(session.unknowns)
  const acceptance = list(selectedPath.acceptance)
  const risks = list(selectedPath.risks)
  const assumptions = list(selectedPath.assumptions)
  const evidence = list(selectedPath.evidencePlan)
  const selection = `${selectedPath.id} (${selectedPath.title})`
  return {
    'discovery.json': `${JSON.stringify({
      schemaVersion: 1,
      sourceSession: session,
      selection: {
        pathId: selectedPath.id,
        title: selectedPath.title,
        rationale: selectedPath.benefit,
      },
      promotion: { changeId, fingerprint },
    }, null, 2)}\n`,
    'brief.md': `# Change Brief

Change ID: ${changeId}
Discovery session: ${session.sessionId}
Selected path: ${selection}

## Outcome

${session.interpretedGoal || session.intent}

## Selection Rationale

${selectedPath.benefit}

## Scope

${selectedPath.scope}

## Constraints

${constraints}

## Non-goals

- Unresolved discovery questions are not treated as confirmed requirements.
- Promotion does not prove product value or complete implementation.

## Acceptance

${acceptance}

## Evidence Plan

${evidence}

## Risks

${risks}

## Next Action

Review this promoted spec, resolve material unknowns, and plan the smallest accepted slice.
`,
    'spec.md': `# Spec

Change ID: ${changeId}
Discovery session: ${session.sessionId}
Selected path: ${selection}

## User Outcome

${session.interpretedGoal || session.intent}

## Behavior

Deliver the selected strategy: ${selectedPath.summary}

## Scope

${selectedPath.scope}

## Constraints

${constraints}

## Open Questions

${unknowns}

## Assumptions

${assumptions}

## Cost And Benefit

- Cost level: ${selectedPath.cost?.level || 'unknown'}
- Time: ${selectedPath.cost?.time || 'unknown'}
- Complexity: ${selectedPath.cost?.complexity || 'unknown'}
- Expected benefit: ${selectedPath.benefit}

## Risks

${risks}

## Acceptance Criteria

${acceptance}

## Evidence Plan

${evidence}

## Error And Recovery

- If a material discovery assumption is contradicted, return to discovery instead of silently widening scope.
- If acceptance cannot be evidenced, keep the change open and record the failed criterion.

## Non-goals

- This spec does not claim market validation, native host Goal Mode integration, or completed implementation.
`,
    'design.md': `# Design

Change ID: ${changeId}

## Approach

Use the ${selection} strategy.

## State / Data Flow

Discovery intent -> selected path -> promoted Goal/Spec -> bounded implementation -> evidence.

## Interfaces And Contracts

The acceptance criteria and evidence plan in \`spec.md\` define the delivery boundary.

## Error And Recovery

Return to discovery when a selected-path assumption fails or the user changes direction.

## Alternatives Considered

${session.paths.map((item) => `- ${item.id}: ${item.summary}`).join('\n')}

## Rollback

Archive or remove this unimplemented change pack and restore the prior goal-map focus; do not rewrite historical discovery evidence.
`,
    'tasks.md': `# Tasks

Change ID: ${changeId}

## Slice Plan

- [ ] Resolve material open questions from \`spec.md\`.
- [ ] Confirm acceptance criteria and non-goals.
- [ ] Implement the smallest end-to-end selected-path slice.
- [ ] Run the evidence plan.
- [ ] Record results and residual risk.

## Stop Conditions

- Stop and return to discovery if a core assumption is contradicted.
- Stop promotion or implementation if scope changes materially without user selection.
`,
    'evidence.md': `# Evidence

Change ID: ${changeId}

## Required Evidence

${evidence}

## Results

Not run. Promotion is planning state, not implementation evidence.

## Evidence Status

result

## Residual Risk

${risks}
`,
    'review.md': `# Review

Change ID: ${changeId}

## Discovery Review

- [x] Natural-language goal captured.
- [x] Multiple paths compared.
- [x] User-selected path recorded.
- [x] Cost, benefit, and risk preserved.
- [ ] Implementation evidence reviewed.

## Claim Boundary

Promotion proves only that the selected discovery path became a formal Goal/Spec change pack.
`,
  }
}

function updateGoalMap(markdown, row, changeId, selectedPath) {
  const lines = String(markdown || '').split(/\r?\n/)
  const focusIndex = lines.findIndex((line) => line.trim() === '## Current Focus')
  if (focusIndex !== -1) {
    const focusEnd = lines.findIndex((line, index) => index > focusIndex && line.startsWith('## '))
    const end = focusEnd === -1 ? lines.length : focusEnd
    for (let index = focusIndex + 1; index < end; index += 1) {
      if (/^- Active slice:/.test(lines[index])) lines[index] = `- Active slice: ${changeId}`
      if (/^- Next action:/.test(lines[index])) lines[index] = `- Next action: Implement ${selectedPath.id} acceptance criteria`
    }
  }

  const goalNodesIndex = lines.findIndex((line) => line.trim() === '## Goal Nodes')
  if (goalNodesIndex === -1) {
    if (lines.length > 0 && lines.at(-1) !== '') lines.push('')
    lines.push('## Goal Nodes', '', '| ID | Goal | Status | Priority | Evidence | Next Slice |', '|---|---|---|---|---|---|', row)
    return `${lines.join('\n').replace(/\n+$/, '')}\n`
  }

  const separatorIndex = lines.findIndex((line, index) => index > goalNodesIndex && /^\|\s*-+/.test(line.trim()))
  if (separatorIndex === -1) {
    lines.splice(goalNodesIndex + 1, 0, '', '| ID | Goal | Status | Priority | Evidence | Next Slice |', '|---|---|---|---|---|---|', row)
    return `${lines.join('\n').replace(/\n+$/, '')}\n`
  }

  let insertionIndex = separatorIndex + 1
  while (insertionIndex < lines.length && lines[insertionIndex].trim().startsWith('|')) insertionIndex += 1
  lines.splice(insertionIndex, 0, row)
  return `${lines.join('\n').replace(/\n+$/, '')}\n`
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const target = path.resolve(readArg('--target', process.cwd()))
const sessionId = slug(readArg('--session', ''), '')
const selectedId = String(readArg('--select', '') || '').trim()
const promote = args.includes('--promote')
const execute = args.includes('--execute')
const jsonOnly = args.includes('--json')

if (!fs.existsSync(path.join(target, '.gse'))) fail('missing-gse', 'Target must contain .gse before discovery can be promoted.', { target })
if (!sessionId) fail('missing-session', 'A persisted discovery session is required. Use --session <session-id>.')

const sessionRelativePath = path.posix.join('.gse', 'discovery', `${sessionId}.json`)
const sessionPath = path.join(target, ...sessionRelativePath.split('/'))
if (!fs.existsSync(sessionPath)) fail('unknown-session', `Discovery session not found: ${sessionRelativePath}`, { sessionId })

const session = readSession(sessionPath)
const selectedPath = session.paths.find((item) => item.id === selectedId)
if (!selectedPath) {
  fail('unknown-path', `Unknown path "${selectedId}" for discovery session ${sessionId}.`, {
    sessionId,
    validPathIds: session.paths.map((item) => item.id),
  })
}

const changeId = slug(readArg('--change-id', '') || `${sessionId}-${selectedId}`)
const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ sessionId, intent: session.intent, selectedId, changeId })).digest('hex')
const changeRelativePath = path.posix.join('.gse', 'changes', changeId)
const changePath = path.join(target, ...changeRelativePath.split('/'))
const goalMapPath = path.join(target, '.gse', 'goal-map.md')
const artifacts = renderArtifacts(session, selectedPath, changeId, fingerprint)

const report = {
  status: promote ? 'promotion-preview' : 'selected',
  sessionId,
  selectedPath,
  selectionRationale: selectedPath.benefit,
  changeId,
  promotionFingerprint: fingerprint,
  artifactPlan: Object.keys(artifacts).map((file) => path.posix.join(changeRelativePath, file)),
  goalMapPath: '.gse/goal-map.md',
  writes: { requested: execute, performed: false },
  nextAction: promote
    ? 'Add --execute to write the promoted Goal/Spec artifacts.'
    : `Review the selection, then run --session ${sessionId} --select ${selectedId} --promote for an exact promotion preview.`,
  claimBoundary: 'Selection and promotion do not prove implementation, product value, user acceptance, or native host Goal Mode behavior.',
}

if (execute && !promote) fail('promotion-required', '--execute cannot write a selection unless --promote is also supplied.', report)

if (promote && execute) {
  if (fs.existsSync(changePath)) {
    const existingPath = path.join(changePath, 'discovery.json')
    let existing = null
    try { existing = JSON.parse(fs.readFileSync(existingPath, 'utf8')) } catch { existing = null }
    if (existing?.promotion?.fingerprint === fingerprint) {
      report.status = 'already-promoted'
      report.writes.performed = false
      report.nextAction = 'Continue from the existing promoted Goal/Spec change pack.'
      console.log(jsonOnly ? JSON.stringify(report, null, 2) : `${report.status}: ${changeRelativePath}`)
      process.exit(0)
    }
    fail('conflict', `Change path already exists and does not match this promotion: ${changeRelativePath}`, report)
  }

  const goalMap = fs.existsSync(goalMapPath) ? fs.readFileSync(goalMapPath, 'utf8') : ''
  if (goalMap.includes(`| ${changeId} |`)) fail('conflict', `Goal map already contains a different entry for ${changeId}.`, report)

  const stagePath = path.join(target, '.gse', `.tmp-discovery-${process.pid}-${Date.now()}`)
  try {
    fs.mkdirSync(stagePath, { recursive: true })
    for (const [file, content] of Object.entries(artifacts)) fs.writeFileSync(path.join(stagePath, file), content.replace(/\n/g, '\r\n'), 'utf8')
    fs.mkdirSync(path.dirname(changePath), { recursive: true })
    fs.renameSync(stagePath, changePath)
  } catch (error) {
    fs.rmSync(stagePath, { recursive: true, force: true })
    fs.rmSync(changePath, { recursive: true, force: true })
    fail('write-failed', `Could not write promoted change pack: ${error.message}`, report)
  }

  const row = `| ${changeId} | ${session.interpretedGoal || session.intent} | planned | P0 | ${path.posix.join(changeRelativePath, 'discovery.json')} | Implement ${selectedPath.id} acceptance criteria |`
  try {
    fs.writeFileSync(goalMapPath, updateGoalMap(goalMap, row, changeId, selectedPath), 'utf8')
  } catch (error) {
    fs.rmSync(changePath, { recursive: true, force: true })
    fail('write-failed', `Could not update goal map; promoted files were rolled back: ${error.message}`, report)
  }

  report.status = 'promoted'
  report.writes.performed = true
  report.nextAction = `Review ${path.posix.join(changeRelativePath, 'spec.md')} and plan the first accepted implementation slice.`
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else {
  console.log(`Status: ${report.status}`)
  console.log(`Selected: ${selectedPath.id} - ${selectedPath.title}`)
  console.log(report.nextAction)
}
