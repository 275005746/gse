import fs from 'node:fs'
import path from 'node:path'

import {
  findCanonicalGoalSource,
  findCanonicalGoalSources,
} from '../canonical-goal-source.mjs'
import {
  compareDerivedChange,
  deriveActiveChange,
  listActiveChangeIds,
} from './change-state.mjs'
import { digestBytes } from './persistence/paths.mjs'
import { inspectProjectStateV1 } from './project-state-v1.mjs'

const AUTHORITY_PATHS = Object.freeze({
  state: '.gse/state.json',
  currentSlice: '.gse/current-slice.md',
  goalMap: '.gse/goal-map.md',
  evidenceTail: '.gse/evidence/index.jsonl',
})

function readSource(target, relativePath) {
  const absolutePath = path.join(target, ...relativePath.split('/'))
  if (!fs.existsSync(absolutePath)) {
    return { relativePath, exists: false, valid: true, text: '', digest: null }
  }
  try {
    const bytes = fs.readFileSync(absolutePath)
    return {
      relativePath,
      exists: true,
      valid: true,
      text: bytes.toString('utf8').replace(/^﻿/, ''),
      digest: digestBytes(bytes),
    }
  } catch (error) {
    return {
      relativePath,
      exists: true,
      valid: false,
      text: '',
      digest: null,
      error: error.message,
    }
  }
}

function readJsonSource(target, relativePath) {
  const source = readSource(target, relativePath)
  if (!source.exists || !source.valid) return { ...source, data: null }
  try {
    return { ...source, data: JSON.parse(source.text) }
  } catch (error) {
    return { ...source, valid: false, data: null, error: error.message }
  }
}

function readJsonlTail(target, relativePath) {
  const source = readSource(target, relativePath)
  if (!source.exists || !source.valid) return { ...source, records: [], tail: null }
  if (source.text && !source.text.endsWith('\n')) {
    return {
      ...source,
      valid: false,
      records: [],
      tail: null,
      error: 'file does not end with a complete JSONL line',
    }
  }
  const records = []
  for (const [index, line] of source.text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue
    try {
      records.push(JSON.parse(line))
    } catch (error) {
      return {
        ...source,
        valid: false,
        records,
        tail: records.at(-1) ?? null,
        error: `line ${index + 1}: ${error.message}`,
      }
    }
  }
  return { ...source, records, tail: records.at(-1) ?? null }
}

function cleanInlineValue(value) {
  return String(value ?? '').trim().replace(/[.。:：]+$/, '').trim()
}

function firstMatch(text, expressions) {
  for (const expression of expressions) {
    const match = String(text ?? '').match(expression)
    if (match) return cleanInlineValue(match[1])
  }
  return ''
}

function markdownSection(markdown, heading) {
  const lines = String(markdown ?? '').split(/\r?\n/)
  const expected = `## ${heading}`.toLowerCase()
  const headingIndex = lines.findIndex((line) => line.trim().toLowerCase() === expected)
  if (headingIndex === -1) return ''
  const section = []
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) break
    const value = lines[index].replace(/^\s*[-*]\s*/, '').trim()
    if (value) section.push(value)
  }
  return section.join(' ')
}

function parseCurrentSlice(source) {
  if (!source.exists || !source.valid) return null
  const text = source.text
  const id = firstMatch(text, [
    /^\s*(?:[-*]\s*)?(?:Slice ID|Current Slice ID|ID)\s*:\s*`?([^`\n]+)`?\s*$/im,
  ])
  const status = firstMatch(text, [
    /^\s*(?:[-*]\s*)?Status\s*:\s*`?([^`\n]+)`?\s*$/im,
    /^##\s+Status\s*\r?\n+\s*([^\n]+)/im,
  ])
  return {
    id: id || null,
    outcome: markdownSection(text, 'Outcome') || null,
    status: status || null,
    nextAction: markdownSection(text, 'Next Action') || null,
    scope: markdownSection(text, 'Scope') || null,
    acceptance: markdownSection(text, 'Acceptance') || null,
    evidence: markdownSection(text, 'Evidence') || markdownSection(text, 'Evidence Plan') || null,
    risks: markdownSection(text, 'Risk') || markdownSection(text, 'Risks') || null,
    relativePath: source.relativePath,
  }
}

function parseGoalMap(source) {
  if (!source.exists || !source.valid) return null
  return {
    activeSlice: firstMatch(source.text, [
      /Active slice:\s*([^\n]+)/i,
      /Current slice:\s*([^\n]+)/i,
    ]) || null,
    nextAction: firstMatch(source.text, [/Next action:\s*([^\n]+)/i]) || null,
    relativePath: source.relativePath,
  }
}

function conflict(code, severity, sources, fields = {}) {
  return { code, severity, sources, ...fields }
}

function comparable(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizeComparable(value) {
  return cleanInlineValue(value).replace(/\s+/g, ' ').toLowerCase()
}

function addFieldConflict(conflicts, code, left, right, field) {
  if (!comparable(left) || !comparable(right)) return
  if (normalizeComparable(left) === normalizeComparable(right)) return
  conflicts.push(conflict(code, 'blocked', ['state', 'currentSlice'], {
    field,
    stateValue: left,
    currentSliceValue: right,
  }))
}

function evidenceRevision(record) {
  if (Number.isInteger(record?.stateRevision) && record.stateRevision >= 0) return record.stateRevision
  if (Number.isInteger(record?.sourceRevision) && record.sourceRevision >= 0) return record.sourceRevision
  return null
}

function digestMap(sources) {
  const digests = {}
  for (const source of sources) {
    if (source?.exists && typeof source.digest === 'string') digests[source.relativePath] = source.digest
  }
  return Object.fromEntries(Object.entries(digests).sort(([left], [right]) => left.localeCompare(right)))
}

function canonicalSnapshot(target, state) {
  const candidates = findCanonicalGoalSources(target, state)
  const selectedPath = findCanonicalGoalSource(target, state) || null
  const existing = candidates.filter((item) => item.exists)
  const files = existing.map((item) => readSource(target, item.relativePath))
  return {
    selectedPath,
    candidates,
    existingPaths: existing.map((item) => item.relativePath),
    ambiguous: existing.length > 1,
    files,
  }
}

function activeChangeSnapshot(target, state) {
  const changeIds = listActiveChangeIds(target)
  const requestedId = typeof state?.activeChangeId === 'string' && state.activeChangeId.trim()
    ? state.activeChangeId
    : null
  const selectedId = requestedId ?? (changeIds.length === 1 ? changeIds[0] : null)
  if (!selectedId) {
    return {
      requestedId,
      selectedId: null,
      availableIds: changeIds,
      derived: null,
      comparison: null,
      cache: null,
      cacheSource: null,
    }
  }
  const cacheSource = readJsonSource(target, `.gse/changes/${selectedId}/change.json`)
  const derived = deriveActiveChange(target, selectedId, {
    stateRevision: Number.isInteger(state?.stateRevision) ? state.stateRevision : 0,
  })
  return {
    requestedId,
    selectedId,
    availableIds: changeIds,
    derived,
    comparison: cacheSource.valid && cacheSource.data && derived
      ? compareDerivedChange(cacheSource.data, derived)
      : null,
    cache: cacheSource.data,
    cacheSource,
  }
}

export function sourceDigestsEqual(left, right) {
  const leftEntries = Object.entries(left ?? {}).sort(([a], [b]) => a.localeCompare(b))
  const rightEntries = Object.entries(right ?? {}).sort(([a], [b]) => a.localeCompare(b))
  return JSON.stringify(leftEntries) === JSON.stringify(rightEntries)
}

export function resolveProjectAuthority(target) {
  const resolvedTarget = path.resolve(target)
  const stateSource = readJsonSource(resolvedTarget, AUTHORITY_PATHS.state)
  const stateInspection = stateSource.valid && stateSource.data
    ? inspectProjectStateV1(stateSource.data)
    : null
  const state = stateInspection?.normalizedState ?? stateSource.data
  const currentSliceSource = readSource(resolvedTarget, AUTHORITY_PATHS.currentSlice)
  const goalMapSource = readSource(resolvedTarget, AUTHORITY_PATHS.goalMap)
  const evidenceSource = readJsonlTail(resolvedTarget, AUTHORITY_PATHS.evidenceTail)
  const currentSlice = parseCurrentSlice(currentSliceSource)
  const goalMap = parseGoalMap(goalMapSource)
  const canonicalGoal = canonicalSnapshot(resolvedTarget, state)
  const activeChange = activeChangeSnapshot(resolvedTarget, state)
  const conflicts = []
  const warnings = []

  if (!stateSource.exists) conflicts.push(conflict('MISSING_PROJECT_STATE', 'blocked', ['state']))
  else if (!stateSource.valid || stateInspection?.classification === 'invalid') {
    conflicts.push(conflict('INVALID_PROJECT_STATE', 'blocked', ['state'], {
      error: stateSource.error ?? stateInspection?.reasonCode ?? null,
    }))
  }
  if (!currentSliceSource.valid) conflicts.push(conflict('INVALID_CURRENT_SLICE_SOURCE', 'blocked', ['currentSlice'], { error: currentSliceSource.error }))
  if (!evidenceSource.valid) conflicts.push(conflict('INVALID_EVIDENCE_INDEX', 'blocked', ['evidenceTail'], { error: evidenceSource.error }))

  if (state?.currentSlice && currentSlice) {
    addFieldConflict(conflicts, 'CURRENT_SLICE_ID_CONFLICT', state.currentSlice.id, currentSlice.id, 'id')
    addFieldConflict(conflicts, 'CURRENT_SLICE_STATUS_CONFLICT', state.currentSlice.status, currentSlice.status, 'status')
    addFieldConflict(conflicts, 'CURRENT_SLICE_NEXT_ACTION_CONFLICT', state.currentSlice.nextAction, currentSlice.nextAction, 'nextAction')
  }

  if (!currentSliceSource.exists) warnings.push(conflict('CURRENT_SLICE_SOURCE_MISSING', 'warning', ['currentSlice']))
  if (!goalMapSource.exists) warnings.push(conflict('GOAL_MAP_SOURCE_MISSING', 'warning', ['goalMap']))
  if (canonicalGoal.ambiguous) {
    warnings.push(conflict('CANONICAL_GOAL_SOURCE_AMBIGUOUS', 'warning', ['canonicalGoal'], {
      paths: canonicalGoal.existingPaths,
    }))
  }
  if (goalMap) {
    if (comparable(goalMap.nextAction) && comparable(state?.currentSlice?.nextAction)
      && normalizeComparable(goalMap.nextAction) !== normalizeComparable(state.currentSlice.nextAction)) {
      warnings.push(conflict('GOAL_MAP_NEXT_ACTION_DRIFT', 'warning', ['goalMap', 'state'], {
        goalMapValue: goalMap.nextAction,
        stateValue: state.currentSlice.nextAction,
      }))
    }
    if (comparable(goalMap.activeSlice) && comparable(state?.currentSlice?.outcome)
      && normalizeComparable(goalMap.activeSlice) !== normalizeComparable(state.currentSlice.outcome)) {
      warnings.push(conflict('GOAL_MAP_ACTIVE_SLICE_DRIFT', 'warning', ['goalMap', 'state'], {
        goalMapValue: goalMap.activeSlice,
        stateValue: state.currentSlice.outcome,
      }))
    }
  }

  if (state?.activeChangeId && !activeChange.derived) {
    conflicts.push(conflict('ACTIVE_CHANGE_MISSING', 'blocked', ['state', 'activeChange'], {
      activeChangeId: state.activeChangeId,
    }))
  }
  if (activeChange.comparison?.status === 'blocked') {
    conflicts.push(conflict('ACTIVE_CHANGE_SOURCE_CONTRADICTION', 'blocked', ['activeChange'], {
      activeChangeId: activeChange.selectedId,
      paths: activeChange.comparison.conflicts,
    }))
  }
  if (!state?.activeChangeId && activeChange.availableIds.length > 1) {
    warnings.push(conflict('ACTIVE_CHANGE_AMBIGUOUS', 'warning', ['activeChange'], {
      changeIds: activeChange.availableIds,
    }))
  }

  const latestEvidenceRevision = evidenceRevision(evidenceSource.tail)
  if (Number.isInteger(state?.stateRevision) && latestEvidenceRevision !== null) {
    if (latestEvidenceRevision > state.stateRevision) {
      conflicts.push(conflict('EVIDENCE_REVISION_AHEAD', 'blocked', ['state', 'evidenceTail'], {
        stateRevision: state.stateRevision,
        evidenceRevision: latestEvidenceRevision,
      }))
    } else if (latestEvidenceRevision < state.stateRevision && state.lastEvidence === evidenceSource.tail?.evidenceFile) {
      conflicts.push(conflict('CURRENT_CLAIM_EVIDENCE_REVISION_STALE', 'blocked', ['state', 'evidenceTail'], {
        stateRevision: state.stateRevision,
        evidenceRevision: latestEvidenceRevision,
      }))
    }
  }

  const sourceDigests = digestMap([
    stateSource,
    currentSliceSource,
    goalMapSource,
    evidenceSource,
    ...canonicalGoal.files,
    activeChange.cacheSource,
  ])
  if (activeChange.derived?.sourceDigests) Object.assign(sourceDigests, activeChange.derived.sourceDigests)
  const orderedSourceDigests = Object.fromEntries(Object.entries(sourceDigests).sort(([left], [right]) => left.localeCompare(right)))
  const allConflicts = [...conflicts, ...warnings]

  return {
    status: conflicts.length > 0 ? 'blocked' : warnings.length > 0 ? 'warning' : 'consistent',
    stateRevision: Number.isInteger(state?.stateRevision) ? state.stateRevision : null,
    authoritativeState: state ?? null,
    projectMode: typeof state?.mode === 'string' ? state.mode : null,
    sources: {
      state: {
        path: stateSource.relativePath,
        exists: stateSource.exists,
        valid: stateSource.valid && stateInspection?.classification !== 'invalid',
        classification: stateInspection?.classification ?? null,
      },
      currentSlice: {
        path: currentSliceSource.relativePath,
        exists: currentSliceSource.exists,
        valid: currentSliceSource.valid,
        value: currentSlice,
      },
      goalMap: {
        path: goalMapSource.relativePath,
        exists: goalMapSource.exists,
        valid: goalMapSource.valid,
        value: goalMap,
      },
      canonicalGoal: {
        path: canonicalGoal.selectedPath,
        candidates: canonicalGoal.candidates,
        ambiguous: canonicalGoal.ambiguous,
      },
      activeChange: {
        id: activeChange.selectedId,
        availableIds: activeChange.availableIds,
        derived: activeChange.derived,
        comparison: activeChange.comparison,
      },
      evidenceTail: {
        path: evidenceSource.relativePath,
        exists: evidenceSource.exists,
        valid: evidenceSource.valid,
        record: evidenceSource.tail,
        revision: latestEvidenceRevision,
      },
    },
    sourceDigests: orderedSourceDigests,
    conflicts: allConflicts,
    freshness: {
      evidenceRevision: latestEvidenceRevision,
      evidenceRelativeToState: latestEvidenceRevision === null || !Number.isInteger(state?.stateRevision)
        ? 'unknown'
        : latestEvidenceRevision === state.stateRevision
          ? 'current'
          : latestEvidenceRevision > state.stateRevision
            ? 'ahead'
            : 'behind',
      activeChangeSources: activeChange.comparison?.status === 'blocked' ? 'contradictory' : 'current-or-unavailable',
    },
    safeToContinue: conflicts.length === 0,
  }
}

export function validateProjectAuthorityDigests(target, expectedDigests) {
  const current = resolveProjectAuthority(target)
  if (sourceDigestsEqual(current.sourceDigests, expectedDigests)) return true
  return {
    reasonCode: 'CURRENT_STATE_SOURCE_CHANGED',
    message: 'Current-state authority sources changed before publication.',
  }
}

export { AUTHORITY_PATHS }
