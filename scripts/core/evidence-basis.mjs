import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'

import { captureEvidenceDependencies } from './evidence.mjs'

export const CORE_CONTRACT_REVISION = 'core-v1'
export const PORTABLE_HOST_CAPABILITY_BASIS = 'portable-node-runtime'

const IGNORED_DIRTY_PATHS = [
  '.gse/locks/',
  '.gse/transactions/',
  '.gse/recovery/',
]
const IGNORED_DIRTY_FILES = new Set([
  '.gse/state.json',
  '.gse/evidence/index.jsonl',
])

function normalizeStatusPath(line) {
  const raw = line.slice(3).trim()
  const renamed = raw.includes(' -> ') ? raw.split(' -> ').pop() : raw
  return renamed.replace(/^"|"$/g, '').replace(/\\/g, '/')
}

function ignoredDirtyPath(relativePath) {
  return IGNORED_DIRTY_FILES.has(relativePath)
    || IGNORED_DIRTY_PATHS.some((prefix) => relativePath.startsWith(prefix))
    || /^\.gse\/changes\/[^/]+\/change\.json$/.test(relativePath)
}

export function deriveDirtyWorktreeDigest(target) {
  const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: target,
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.status !== 0) return null
  const normalized = (result.stdout ?? '')
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => !ignoredDirtyPath(normalizeStatusPath(line)))
    .sort((left, right) => left.localeCompare(right))
    .join('\n')
  return `sha256:${crypto.createHash('sha256').update(normalized, 'utf8').digest('hex')}`
}

function configurationBasis(projectState, activeChange) {
  const configuration = []
  if (typeof activeChange?.profile === 'string') configuration.push({ key: 'change.profile', value: activeChange.profile })
  if (typeof projectState?.mode === 'string') configuration.push({ key: 'project.mode', value: projectState.mode })
  return configuration
}

function sourcePaths(activeChange) {
  if (!Array.isArray(activeChange?.derivedFrom)) return []
  return [...new Set(activeChange.derivedFrom.filter((item) => typeof item === 'string'))].sort((left, right) => left.localeCompare(right))
}

function declaredPaths(evidenceRecords, field) {
  if (!Array.isArray(evidenceRecords)) return []
  const paths = evidenceRecords.flatMap((record) => {
    const group = record?.dependencies?.[field]
    return Array.isArray(group) ? group.map((item) => item?.path) : []
  })
  return [...new Set(paths.filter((item) => typeof item === 'string'))].sort((left, right) => left.localeCompare(right))
}

function mergePaths(...groups) {
  return [...new Set(groups.flat().filter((item) => typeof item === 'string'))].sort((left, right) => left.localeCompare(right))
}

function mergeConfiguration(projectState, activeChange, configuration) {
  const entries = new Map(configurationBasis(projectState, activeChange).map((item) => [item.key, item]))
  for (const item of Array.isArray(configuration) ? configuration : []) entries.set(item.key, item)
  return [...entries.values()].sort((left, right) => left.key.localeCompare(right.key))
}

export function deriveCurrentEvidenceDependencies(target, {
  projectState,
  activeChange,
  evidenceRecords = [],
  inputPaths = [],
  generatedArtifacts = [],
  configuration = [],
  contractRevision = CORE_CONTRACT_REVISION,
  hostCapabilityBasis = PORTABLE_HOST_CAPABILITY_BASIS,
} = {}) {
  const sourceRevision = Number.isInteger(projectState?.sourceRevision)
    ? projectState.sourceRevision
    : projectState?.stateRevision
  return captureEvidenceDependencies(target, {
    sourceRevision,
    dirtyWorktreeDigest: deriveDirtyWorktreeDigest(target),
    inputPaths: mergePaths(sourcePaths(activeChange), inputPaths, declaredPaths(evidenceRecords, 'inputPaths')),
    generatedArtifacts: mergePaths(generatedArtifacts, declaredPaths(evidenceRecords, 'generatedArtifacts')),
    configuration: mergeConfiguration(projectState, activeChange, configuration),
    contractRevision,
    hostCapabilityBasis,
  })
}

export function currentEvidenceBasis(target, { projectState, activeChange, evidenceRecords = [] } = {}) {
  return {
    stateRevision: projectState?.stateRevision,
    ...deriveCurrentEvidenceDependencies(target, { projectState, activeChange, evidenceRecords }),
  }
}
