#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1] ?? fallback
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(readArg('--root', path.join(scriptDirectory, '..')))
const jsonOnly = args.includes('--json')
const fixtureRoot = path.join(root, 'scripts', 'fixtures', 'core-foundation')
const requiredFixtureIds = [
  'legacy-lite',
  'legacy-standard-change',
  'enterprise-hard-risk',
  'stale-evidence',
  'contradictory-close',
  'transaction-faults',
  'truncated-jsonl',
]

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/')
}

function digestBytes(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`
}

function snapshotDirectory(directory) {
  const files = []
  const entries = []

  function visit(currentDirectory, relativeDirectory = '') {
    const children = fs.readdirSync(currentDirectory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))

    for (const child of children) {
      const relativePath = relativeDirectory
        ? path.join(relativeDirectory, child.name)
        : child.name
      const posixPath = toPosix(relativePath)
      const absolutePath = path.join(currentDirectory, child.name)

      if (child.isDirectory()) {
        entries.push(`${posixPath}/`)
        visit(absolutePath, relativePath)
      } else if (child.isFile()) {
        const bytes = fs.readFileSync(absolutePath)
        entries.push(posixPath)
        files.push({ path: posixPath, bytes, digest: digestBytes(bytes) })
      } else {
        entries.push(posixPath)
      }
    }
  }

  if (fs.existsSync(directory)) visit(directory)
  files.sort((left, right) => left.path.localeCompare(right.path))
  entries.sort((left, right) => left.localeCompare(right))
  return { files, entries }
}

function byteSnapshotsEqual(left, right) {
  if (left.files.length !== right.files.length) return false
  return left.files.every((leftFile, index) => {
    const rightFile = right.files[index]
    return leftFile.path === rightFile.path
      && leftFile.bytes.length === rightFile.bytes.length
      && leftFile.bytes.equals(rightFile.bytes)
  })
}

function isInspectionGeneratedPath(relativePath) {
  const normalized = relativePath.endsWith('/') ? relativePath.slice(0, -1) : relativePath
  return normalized === '.gse/transactions'
    || normalized.startsWith('.gse/transactions/')
    || normalized === '.gse/locks'
    || normalized.startsWith('.gse/locks/')
    || normalized === '.gse/recovery'
    || normalized.startsWith('.gse/recovery/')
    || normalized === '.gse/change.json'
    || /(?:^|\/)change\.json$/.test(normalized)
    || normalized === '.gse/state-cache.json'
    || /(?:^|\/)state-cache\.json$/.test(normalized)
    || /(?:^|\/)state\.cache\.json$/.test(normalized)
    || /(?:^|\/)cache\/.*state.*\.json$/i.test(normalized)
}

function createdPaths(before, after) {
  const beforeEntries = new Set(before.entries)
  return after.entries.filter((entry) => !beforeEntries.has(entry))
}

function errorDiagnostic(modulePath, error) {
  return {
    code: 'MODULE_UNAVAILABLE',
    module: modulePath,
    errorCode: typeof error?.code === 'string' ? error.code : null,
    message: error instanceof Error ? error.message : String(error),
  }
}

async function guardedImport(relativeModulePath) {
  try {
    return {
      available: true,
      module: await import(new URL(relativeModulePath, import.meta.url)),
      diagnostic: null,
    }
  } catch (error) {
    return {
      available: false,
      module: null,
      diagnostic: errorDiagnostic(relativeModulePath, error),
    }
  }
}

const [changeStateImport, migrationImport, evidenceImport] = await Promise.all([
  guardedImport('./core/change-state.mjs'),
  guardedImport('./core/migration-v1.mjs'),
  guardedImport('./core/evidence.mjs'),
])

function unavailableFunction(functionName, moduleImport, modulePath) {
  return {
    status: 'unavailable',
    reasonCode: 'FUNCTION_UNAVAILABLE',
    message: `${functionName} is unavailable; compatibility behavior could not be probed.`,
    diagnostics: [
      moduleImport.diagnostic ?? {
        code: 'EXPORT_UNAVAILABLE',
        module: modulePath,
        export: functionName,
        message: `${modulePath} does not export ${functionName}.`,
      },
    ],
  }
}

function failedProbe(error) {
  return {
    status: 'unavailable',
    reasonCode: 'PROBE_ERROR',
    message: 'The compatibility probe returned an error instead of crashing the audit.',
    diagnostics: [{
      code: typeof error?.code === 'string' ? error.code : 'PROBE_ERROR',
      message: error instanceof Error ? error.message : String(error),
    }],
  }
}

function resultField(result, field) {
  return result?.[field]
    ?? result?.coreResult?.[field]
    ?? result?.result?.[field]
    ?? null
}

async function inspectProject(target) {
  const inspect = migrationImport.module?.inspectGseV1Project
  if (typeof inspect !== 'function') {
    return {
      available: false,
      result: unavailableFunction('inspectGseV1Project', migrationImport, './core/migration-v1.mjs'),
    }
  }

  try {
    return { available: true, result: await Promise.resolve(inspect(target)) }
  } catch (error) {
    return { available: true, result: failedProbe(error) }
  }
}

async function inspectContradiction(target) {
  const inspect = migrationImport.module?.inspectGseV1Project
  if (typeof inspect === 'function') return inspectProject(target)

  const derive = changeStateImport.module?.deriveActiveChange
  const compare = changeStateImport.module?.compareDerivedChange
  if (typeof derive !== 'function' || typeof compare !== 'function') {
    const missingFunctions = [
      typeof derive === 'function' ? null : 'deriveActiveChange',
      typeof compare === 'function' ? null : 'compareDerivedChange',
    ].filter(Boolean)
    return {
      available: false,
      result: {
        status: 'unavailable',
        reasonCode: 'FUNCTION_UNAVAILABLE',
        message: 'Neither migration inspection nor the change-state comparison path is available.',
        diagnostics: [
          migrationImport.diagnostic ?? {
            code: 'EXPORT_UNAVAILABLE',
            module: './core/migration-v1.mjs',
            export: 'inspectGseV1Project',
            message: './core/migration-v1.mjs does not export inspectGseV1Project.',
          },
          changeStateImport.diagnostic ?? {
            code: 'EXPORT_UNAVAILABLE',
            module: './core/change-state.mjs',
            exports: missingFunctions,
            message: `Missing exports: ${missingFunctions.join(', ')}.`,
          },
        ],
      },
    }
  }

  try {
    const changeId = 'contradictory-close'
    const cachedPath = path.join(target, '.gse', 'changes', changeId, 'change.json')
    const cached = JSON.parse(fs.readFileSync(cachedPath, 'utf8').replace(/^﻿/, ''))
    const derived = await Promise.resolve(derive(target, changeId))
    return { available: true, result: await Promise.resolve(compare(cached, derived)) }
  } catch (error) {
    return { available: true, result: failedProbe(error) }
  }
}

async function inspectUnsafeSource(target) {
  const derive = changeStateImport.module?.deriveActiveChange
  if (typeof derive !== 'function') {
    return {
      available: false,
      result: unavailableFunction('deriveActiveChange', changeStateImport, './core/change-state.mjs'),
    }
  }

  try {
    await Promise.resolve(derive(target, 'add-user-login'))
    return {
      available: true,
      result: {
        status: 'proceed',
        reasonCode: 'UNSAFE_SOURCE_ACCEPTED',
        diagnostics: [],
      },
    }
  } catch (error) {
    return {
      available: true,
      result: {
        status: 'blocked',
        reasonCode: typeof error?.code === 'string' ? error.code : 'PROBE_ERROR',
        diagnostics: [{
          code: typeof error?.code === 'string' ? error.code : 'PROBE_ERROR',
          message: error instanceof Error ? error.message : String(error),
        }],
      },
    }
  }
}

async function runFixtureProbe(fixtureId, operation, setup = null) {
  let temporaryDirectory = null
  try {
    const source = path.join(fixtureRoot, fixtureId)
    if (!fs.existsSync(source)) {
      return {
        available: false,
        result: {
          status: 'unavailable',
          reasonCode: 'FIXTURE_UNAVAILABLE',
          message: `Fixture ${fixtureId} does not exist.`,
          diagnostics: [{ code: 'FIXTURE_UNAVAILABLE', path: toPosix(path.relative(root, source)) }],
        },
        before: { files: [], entries: [] },
        after: { files: [], entries: [] },
        bytesEqual: false,
        createdPaths: [],
      }
    }

    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), `gse-core-${fixtureId}-`))
    const target = path.join(temporaryDirectory, 'project')
    fs.cpSync(source, target, { recursive: true, force: false, errorOnExist: true })
    if (setup) await setup(target)

    const before = snapshotDirectory(target)
    const outcome = await operation(target)
    const after = snapshotDirectory(target)
    return {
      available: outcome.available,
      result: outcome.result,
      before,
      after,
      bytesEqual: byteSnapshotsEqual(before, after),
      createdPaths: createdPaths(before, after),
    }
  } catch (error) {
    return {
      available: false,
      result: failedProbe(error),
      before: { files: [], entries: [] },
      after: { files: [], entries: [] },
      bytesEqual: false,
      createdPaths: [],
    }
  } finally {
    if (temporaryDirectory) fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  }
}

function loadManifest() {
  const manifestPath = path.join(fixtureRoot, 'manifest.json')
  try {
    return {
      value: JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^﻿/, '')),
      diagnostic: null,
    }
  } catch (error) {
    return {
      value: null,
      diagnostic: {
        code: 'MANIFEST_UNAVAILABLE',
        path: toPosix(path.relative(root, manifestPath)),
        message: error instanceof Error ? error.message : String(error),
      },
    }
  }
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

const manifest = loadManifest()
const manifestIds = Array.isArray(manifest.value?.fixtures)
  ? manifest.value.fixtures.map((fixture) => fixture?.id).filter((id) => typeof id === 'string')
  : []

const lite = await runFixtureProbe('legacy-lite', inspectProject)
const standard = await runFixtureProbe('legacy-standard-change', inspectProject)
const multiple = await runFixtureProbe(
  'legacy-standard-change',
  inspectProject,
  (target) => {
    const changesRoot = path.join(target, '.gse', 'changes')
    fs.cpSync(
      path.join(changesRoot, 'add-user-login'),
      path.join(changesRoot, 'second-change'),
      { recursive: true, force: false, errorOnExist: true },
    )
  },
)
const contradiction = await runFixtureProbe('contradictory-close', inspectContradiction)
const nestedHintConflict = await runFixtureProbe(
  'legacy-standard-change',
  inspectProject,
  (target) => {
    const statePath = path.join(target, '.gse', 'state.json')
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8').replace(/^﻿/, ''))
    state.activeChangeId = null
    state.currentSlice.activeChangeId = 'different-safe-change'
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`)
  },
)
const disagreeingStateHints = await runFixtureProbe(
  'legacy-standard-change',
  inspectProject,
  (target) => {
    const statePath = path.join(target, '.gse', 'state.json')
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8').replace(/^﻿/, ''))
    state.activeChangeId = 'first-safe-change'
    state.currentSlice.activeChangeId = 'second-safe-change'
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`)
  },
)
const staleHintsWithoutChanges = await runFixtureProbe(
  'legacy-lite',
  inspectProject,
  (target) => {
    const statePath = path.join(target, '.gse', 'state.json')
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8').replace(/^﻿/, ''))
    state.activeChangeId = 'stale-top-level'
    state.currentSlice = { activeChangeId: 'stale-nested' }
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`)
  },
)
const unsafeSource = await runFixtureProbe(
  'legacy-standard-change',
  inspectUnsafeSource,
  (target) => {
    const sourcePath = path.join(target, '.gse', 'changes', 'add-user-login', 'brief.md')
    const outsideDirectory = path.join(path.dirname(target), 'unsafe-source-target')
    fs.rmSync(sourcePath)
    fs.mkdirSync(outsideDirectory)
    fs.symlinkSync(outsideDirectory, sourcePath, 'junction')
  },
)

const probes = [
  lite,
  standard,
  multiple,
  contradiction,
  nestedHintConflict,
  disagreeingStateHints,
  staleHintsWithoutChanges,
  unsafeSource,
]

async function runEvidenceProbes() {
  const capture = evidenceImport.module?.captureEvidenceDependencies
  const evaluateFreshness = evidenceImport.module?.evaluateEvidenceFreshness
  const evaluateClose = evidenceImport.module?.evaluateCloseConsistency
  if (typeof capture !== 'function' || typeof evaluateFreshness !== 'function' || typeof evaluateClose !== 'function') {
    const unavailable = unavailableFunction('Task 6 evidence exports', evidenceImport, './core/evidence.mjs')
    return {
      available: false,
      fresh: unavailable,
      stale: unavailable,
      oldRevision: unavailable,
      incomplete: unavailable,
      missingCurrent: unavailable,
      dirtyDrift: unavailable,
      artifactDrift: unavailable,
      configurationDrift: unavailable,
      contractDrift: unavailable,
      environmentDrift: unavailable,
      hostDrift: unavailable,
      malformedPaths: unavailable,
      malformedConfiguration: unavailable,
      emptyClaimClose: unavailable,
      currentClose: unavailable,
      staleClose: unavailable,
      contradictoryClose: unavailable,
      resultPromotionAttempt: unavailable,
      acceptedPromotionAttempt: unavailable,
      missingLevelClose: unavailable,
      unknownLevelClose: unavailable,
      externalRequiredClose: unavailable,
    }
  }

  let temporaryDirectory = null
  try {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-core-evidence-'))
    const target = path.join(temporaryDirectory, 'project')
    const changeId = 'evidence-close'
    const changeDirectory = path.join(target, '.gse', 'changes', changeId)
    fs.mkdirSync(changeDirectory, { recursive: true })
    fs.writeFileSync(path.join(changeDirectory, 'brief.md'), '# Evidence Close\n')
    fs.writeFileSync(path.join(target, 'input.txt'), 'original input\n')
    fs.writeFileSync(path.join(target, 'artifact.txt'), 'generated artifact\n')

    const activeChange = changeStateImport.module.deriveActiveChange(target, changeId, { stateRevision: 4 })
    const projectState = { schemaVersion: 1, stateRevision: 4, sourceRevision: 4, activeChangeId: changeId }
    const dependencies = capture(target, {
      sourceRevision: 4,
      dirtyWorktreeDigest: null,
      inputPaths: ['input.txt'],
      generatedArtifacts: ['artifact.txt'],
      configuration: [{ key: 'profile', value: 'standard' }],
      contractRevision: 'core-v1',
      hostCapabilityBasis: 'portable-node-runtime',
    })
    const record = {
      schemaVersion: 1,
      evidenceId: 'evidence-verified',
      changeId,
      stateRevision: 4,
      status: 'verified',
      evidenceLevel: 'verified-unit',
      requiredEvidenceLevel: 'verified-unit',
      claim: 'The evidence fixture passed its declared verification.',
      dependencies,
    }
    const current = {
      stateRevision: 4,
      sourceRevision: 4,
      dirtyWorktreeDigest: null,
      contractRevision: dependencies.contractRevision,
      environmentFingerprint: dependencies.environmentFingerprint,
      hostCapabilityBasis: dependencies.hostCapabilityBasis,
      configuration: dependencies.configuration,
    }

    const fresh = evaluateFreshness(target, record, current)
    const missingCurrent = evaluateFreshness(target, record, { stateRevision: 4 })
    const dirtyDrift = evaluateFreshness(target, record, { ...current, dirtyWorktreeDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })
    fs.writeFileSync(path.join(target, 'artifact.txt'), 'changed artifact\n')
    const artifactDrift = evaluateFreshness(target, record, current)
    fs.writeFileSync(path.join(target, 'artifact.txt'), 'generated artifact\n')
    const configurationDrift = evaluateFreshness(target, record, { ...current, configuration: [{ key: 'profile', valueDigest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }] })
    const contractDrift = evaluateFreshness(target, record, { ...current, contractRevision: 'core-v2' })
    const environmentDrift = evaluateFreshness(target, record, { ...current, environmentFingerprint: 'node-different-environment' })
    const hostDrift = evaluateFreshness(target, record, { ...current, hostCapabilityBasis: 'different-host' })
    const malformedPaths = evaluateFreshness(target, { ...record, dependencies: { ...dependencies, inputPaths: [{ path: 'input.txt' }, { path: 'artifact.txt', digest: dependencies.inputPaths[0].digest }] } }, current)
    const malformedConfiguration = evaluateFreshness(target, { ...record, dependencies: { ...dependencies, configuration: [{ key: 'profile' }] } }, current)
    fs.writeFileSync(path.join(target, 'input.txt'), 'changed input\n')
    const stale = evaluateFreshness(target, record, current)
    fs.writeFileSync(path.join(target, 'input.txt'), 'original input\n')
    const oldRevision = evaluateFreshness(target, record, { ...current, stateRevision: 5 })
    const incomplete = evaluateFreshness(target, { ...record, dependencies: undefined }, current)
    const closeCurrent = { ...current, dirtyWorktreeDigest: null }
    const currentClose = evaluateClose(target, {
      projectState,
      activeChange,
      evidenceRecords: [record],
      currentDependencies: closeCurrent,
      pendingTransactions: [],
      requestedStatus: 'verified',
    })
    const emptyClaimClose = evaluateClose(target, {
      projectState,
      activeChange,
      evidenceRecords: [{ ...record, claim: '' }],
      currentDependencies: closeCurrent,
      pendingTransactions: [],
      requestedStatus: 'verified',
    })
    const staleClose = evaluateClose(target, {
      projectState,
      activeChange,
      evidenceRecords: [{ ...record, dependencies: { ...dependencies, sourceRevision: 3 } }],
      currentDependencies: closeCurrent,
      pendingTransactions: [],
      requestedStatus: 'verified',
    })
    const contradictoryClose = evaluateClose(target, {
      projectState,
      activeChange: { ...activeChange, sourceDigests: { ...activeChange.sourceDigests, [`.gse/changes/${changeId}/brief.md`]: digestBytes('wrong') } },
      evidenceRecords: [record],
      currentDependencies: closeCurrent,
      pendingTransactions: [],
      requestedStatus: 'verified',
    })
    const resultPromotionAttempt = evaluateClose(target, {
      projectState,
      activeChange,
      evidenceRecords: [{ ...record, status: 'result', evidenceLevel: 'result', requiredEvidenceLevel: 'verified-unit' }],
      currentDependencies: closeCurrent,
      pendingTransactions: [],
      requestedStatus: 'verified',
    })
    const acceptedPromotionAttempt = evaluateClose(target, {
      projectState,
      activeChange,
      evidenceRecords: [record],
      currentDependencies: closeCurrent,
      pendingTransactions: [],
      requestedStatus: 'accepted',
    })
    const missingLevelClose = evaluateClose(target, {
      projectState,
      activeChange,
      evidenceRecords: [{ ...record, evidenceLevel: undefined, requiredEvidenceLevel: undefined }],
      currentDependencies: closeCurrent,
      pendingTransactions: [],
      requestedStatus: 'verified',
    })
    const unknownLevelClose = evaluateClose(target, {
      projectState,
      activeChange,
      evidenceRecords: [{ ...record, evidenceLevel: 'unknown-level', requiredEvidenceLevel: 'unknown-level' }],
      currentDependencies: closeCurrent,
      pendingTransactions: [],
      requestedStatus: 'verified',
    })
    const externalRequiredClose = evaluateClose(target, {
      projectState,
      activeChange,
      evidenceRecords: [{ ...record, evidenceLevel: 'external-required', requiredEvidenceLevel: 'external-required' }],
      currentDependencies: closeCurrent,
      pendingTransactions: [],
      requestedStatus: 'verified',
    })
    return {
      available: true,
      fresh,
      stale,
      oldRevision,
      incomplete,
      missingCurrent,
      dirtyDrift,
      artifactDrift,
      configurationDrift,
      contractDrift,
      environmentDrift,
      hostDrift,
      malformedPaths,
      malformedConfiguration,
      emptyClaimClose,
      currentClose,
      staleClose,
      contradictoryClose,
      resultPromotionAttempt,
      acceptedPromotionAttempt,
      missingLevelClose,
      unknownLevelClose,
      externalRequiredClose,
    }
  } catch (error) {
    const unavailable = failedProbe(error)
    return {
      available: false,
      fresh: unavailable,
      stale: unavailable,
      oldRevision: unavailable,
      incomplete: unavailable,
      missingCurrent: unavailable,
      dirtyDrift: unavailable,
      artifactDrift: unavailable,
      configurationDrift: unavailable,
      contractDrift: unavailable,
      environmentDrift: unavailable,
      hostDrift: unavailable,
      malformedPaths: unavailable,
      malformedConfiguration: unavailable,
      emptyClaimClose: unavailable,
      currentClose: unavailable,
      staleClose: unavailable,
      contradictoryClose: unavailable,
      resultPromotionAttempt: unavailable,
      acceptedPromotionAttempt: unavailable,
      missingLevelClose: unavailable,
      unknownLevelClose: unavailable,
      externalRequiredClose: unavailable,
    }
  } finally {
    if (temporaryDirectory) fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  }
}

const evidenceProbes = await runEvidenceProbes()
const allCreatedPaths = probes.flatMap((probe) => probe.createdPaths)
const generatedPaths = allCreatedPaths.filter(isInspectionGeneratedPath)
const allProbesAvailable = probes.every((probe) => probe.available)
const liteProjectState = resultField(lite.result, 'proposedProjectState')
const standardActiveChange = resultField(standard.result, 'proposedActiveChange')

const contradictionSourcePath = '.gse/changes/contradictory-close/brief.md'
const contradictionConflicts = resultField(contradiction.result, 'conflicts')

const checks = [
  check(
    'COMP01',
    'fixture manifest names every foundation fixture',
    requiredFixtureIds.every((id) => manifestIds.includes(id)),
    manifest.diagnostic ?? { requiredFixtureIds, manifestIds },
  ),
  check(
    'COMP02',
    'legacy Lite inspection proposes revision fields without writes',
    lite.available
      && resultField(lite.result, 'status') === 'proceed'
      && liteProjectState?.stateRevision === 0
      && lite.bytesEqual,
    { result: lite.result, byteEquality: lite.bytesEqual },
    'Inspection must remain byte-preserving and return a proposed state rather than persist it.',
  ),
  check(
    'COMP03',
    'one legacy Change derives a revisioned cache',
    standard.available
      && resultField(standard.result, 'status') === 'proceed'
      && standardActiveChange?.changeId === 'add-user-login'
      && standardActiveChange?.lifecycleStage === 'specify',
    { result: standard.result, byteEquality: standard.bytesEqual },
  ),
  check(
    'COMP04',
    'two active Changes are explicitly unsupported',
    multiple.available
      && resultField(multiple.result, 'status') === 'blocked'
      && resultField(multiple.result, 'reasonCode') === 'MULTIPLE_ACTIVE_CHANGES_UNSUPPORTED'
      && multiple.bytesEqual,
    { result: multiple.result, byteEquality: multiple.bytesEqual },
    'The deliberate second-change setup is excluded by taking the byte snapshot after duplication.',
  ),
  check(
    'COMP05',
    'source digest change contradicts cached derived state',
    contradiction.available
      && resultField(contradiction.result, 'status') === 'blocked'
      && resultField(contradiction.result, 'reasonCode') === 'STATE_ARTIFACT_CONTRADICTION'
      && Array.isArray(contradictionConflicts)
      && contradictionConflicts.includes(contradictionSourcePath)
      && !contradictionConflicts.includes('INVALID_SOURCE_DIGESTS')
      && contradiction.bytesEqual,
    {
      result: contradiction.result,
      expectedConflict: contradictionSourcePath,
      byteEquality: contradiction.bytesEqual,
    },
  ),
  check(
    'COMP06',
    'inspection never creates transaction or cache files',
    allProbesAvailable && generatedPaths.length === 0,
    {
      createdPaths: allCreatedPaths,
      prohibitedCreatedPaths: generatedPaths,
      unavailableDiagnostics: probes
        .filter((probe) => !probe.available)
        .flatMap((probe) => probe.result?.diagnostics ?? []),
    },
    'Inspection probes must execute before absence of created paths can establish read-only behavior.',
  ),
  check(
    'COMP07',
    'matching dependencies keep evidence current',
    evidenceProbes.available && evidenceProbes.fresh.current === true && evidenceProbes.fresh.reasonCodes.length === 0,
    evidenceProbes.fresh,
  ),
  check(
    'COMP08',
    'changed input digest makes evidence stale',
    evidenceProbes.available && evidenceProbes.stale.current === false && evidenceProbes.stale.reasonCodes.includes('EVIDENCE_INPUT_DIGEST_MISMATCH'),
    evidenceProbes.stale,
  ),
  check(
    'COMP09',
    'older state revision makes evidence stale',
    evidenceProbes.available && evidenceProbes.oldRevision.current === false && evidenceProbes.oldRevision.reasonCodes.includes('EVIDENCE_STATE_REVISION_MISMATCH'),
    evidenceProbes.oldRevision,
  ),
  check(
    'COMP10',
    'missing dependency metadata is downgraded',
    evidenceProbes.available && evidenceProbes.incomplete.current === false && evidenceProbes.incomplete.downgraded === true && evidenceProbes.incomplete.reasonCodes.includes('EVIDENCE_DEPENDENCIES_INCOMPLETE'),
    evidenceProbes.incomplete,
  ),
  check(
    'COMP14',
    'missing explicit current metadata never self-compares as fresh',
    evidenceProbes.available && evidenceProbes.missingCurrent.current === false && evidenceProbes.missingCurrent.reasonCodes.includes('EVIDENCE_DEPENDENCIES_INCOMPLETE'),
    evidenceProbes.missingCurrent,
  ),
  check(
    'COMP15',
    'dirty worktree, artifact, configuration, contract, environment, and host drift are stale',
    evidenceProbes.available
      && evidenceProbes.dirtyDrift.current === false
      && evidenceProbes.artifactDrift.current === false
      && evidenceProbes.configurationDrift.current === false
      && evidenceProbes.contractDrift.current === false
      && evidenceProbes.environmentDrift.current === false
      && evidenceProbes.hostDrift.current === false,
    {
      dirty: evidenceProbes.dirtyDrift,
      artifact: evidenceProbes.artifactDrift,
      configuration: evidenceProbes.configurationDrift,
      contract: evidenceProbes.contractDrift,
      environment: evidenceProbes.environmentDrift,
      host: evidenceProbes.hostDrift,
    },
  ),
  check(
    'COMP16',
    'malformed path and configuration dependencies fail closed',
    evidenceProbes.available
      && evidenceProbes.malformedPaths.current === false
      && evidenceProbes.malformedPaths.reasonCodes.includes('EVIDENCE_DEPENDENCIES_INCOMPLETE')
      && evidenceProbes.malformedConfiguration.current === false
      && evidenceProbes.malformedConfiguration.reasonCodes.includes('EVIDENCE_DEPENDENCIES_INCOMPLETE'),
    { paths: evidenceProbes.malformedPaths, configuration: evidenceProbes.malformedConfiguration },
  ),
  check(
    'COMP19',
    'Close requires a non-empty claim on current proof',
    evidenceProbes.available
      && evidenceProbes.emptyClaimClose.status === 'blocked'
      && evidenceProbes.emptyClaimClose.reasonCode === 'EVIDENCE_LEVEL_INSUFFICIENT',
    evidenceProbes.emptyClaimClose,
  ),
  check(
    'COMP17',
    'Close accepts a positive current proof only with independent current dependencies',
    evidenceProbes.available && evidenceProbes.currentClose.status === 'complete' && evidenceProbes.currentClose.reasonCode === 'READY',
    evidenceProbes.currentClose,
  ),
  check(
    'COMP18',
    'Close blocks missing, unknown, and external-required evidence levels',
    evidenceProbes.available
      && evidenceProbes.missingLevelClose.status === 'blocked'
      && evidenceProbes.unknownLevelClose.status === 'blocked'
      && evidenceProbes.externalRequiredClose.status === 'blocked',
    {
      missing: evidenceProbes.missingLevelClose,
      unknown: evidenceProbes.unknownLevelClose,
      external: evidenceProbes.externalRequiredClose,
    },
  ),
  check(
    'COMP12',
    'Close blocks cached/artifact contradiction',
    evidenceProbes.available && evidenceProbes.contradictoryClose.status === 'blocked' && evidenceProbes.contradictoryClose.reasonCode === 'STATE_ARTIFACT_CONTRADICTION',
    evidenceProbes.contradictoryClose,
  ),
  check(
    'COMP13',
    'Close never promotes result to verified or verified to accepted',
    evidenceProbes.available
      && evidenceProbes.resultPromotionAttempt.status === 'blocked'
      && evidenceProbes.resultPromotionAttempt.reasonCode === 'EVIDENCE_LEVEL_INSUFFICIENT'
      && evidenceProbes.acceptedPromotionAttempt.status === 'blocked'
      && evidenceProbes.acceptedPromotionAttempt.reasonCode === 'EVIDENCE_LEVEL_INSUFFICIENT',
    {
      resultToVerified: evidenceProbes.resultPromotionAttempt,
      verifiedToAccepted: evidenceProbes.acceptedPromotionAttempt,
    },
  ),
  check(
    'SEC01',
    'explicit Change hints cannot silently lose precedence conflicts',
    nestedHintConflict.available
      && resultField(nestedHintConflict.result, 'status') === 'ask_user'
      && resultField(nestedHintConflict.result, 'reasonCode') === 'SOURCE_PRECEDENCE_AMBIGUOUS'
      && nestedHintConflict.bytesEqual
      && disagreeingStateHints.available
      && resultField(disagreeingStateHints.result, 'status') === 'ask_user'
      && resultField(disagreeingStateHints.result, 'reasonCode') === 'SOURCE_PRECEDENCE_AMBIGUOUS'
      && disagreeingStateHints.bytesEqual,
    {
      nestedVsRepository: nestedHintConflict.result,
      topLevelVsNested: disagreeingStateHints.result,
      byteEquality: {
        nestedVsRepository: nestedHintConflict.bytesEqual,
        topLevelVsNested: disagreeingStateHints.bytesEqual,
      },
    },
    'Each setup mutation occurs before its byte snapshot; inspection itself must preserve every byte.',
  ),
  check(
    'SEC02',
    'zero repository Changes cannot silently clear explicit stale hints',
    staleHintsWithoutChanges.available
      && resultField(staleHintsWithoutChanges.result, 'status') === 'ask_user'
      && resultField(staleHintsWithoutChanges.result, 'reasonCode') === 'SOURCE_PRECEDENCE_AMBIGUOUS'
      && Array.isArray(resultField(staleHintsWithoutChanges.result, 'proposedWrites'))
      && resultField(staleHintsWithoutChanges.result, 'proposedWrites').length === 0
      && resultField(staleHintsWithoutChanges.result, 'conflicts')?.includes('state.activeChangeId=stale-top-level')
      && resultField(staleHintsWithoutChanges.result, 'conflicts')?.includes('state.currentSlice.activeChangeId=stale-nested')
      && staleHintsWithoutChanges.bytesEqual,
    { result: staleHintsWithoutChanges.result, byteEquality: staleHintsWithoutChanges.bytesEqual },
  ),
  check(
    'SEC03',
    'active Change derivation rejects containment-unsafe source artifacts',
    unsafeSource.available
      && resultField(unsafeSource.result, 'status') === 'blocked'
      && resultField(unsafeSource.result, 'reasonCode') === 'PATH_OUTSIDE_TARGET'
      && unsafeSource.bytesEqual,
    { result: unsafeSource.result, byteEquality: unsafeSource.bytesEqual },
    'The audit creates a directory junction at brief.md; setup failure makes this check fail rather than skip.',
  ),
]

const failed = checks.filter((item) => item.status === 'failed').length
const status = failed === 0 ? 'passed' : 'failed'
const report = {
  root,
  generatedAt: new Date().toISOString(),
  status,
  summary: { status, passed: checks.length - failed, failed, total: checks.length },
  checks,
  limits: [
    'This is a read-only fixture audit: every probe runs against a fresh temporary copy and static fixture sources are never mutated.',
    'Byte equality compares the complete sorted relative POSIX file set and each file\'s raw Buffer bytes; digests are retained only as evidence metadata.',
    'Temporary probe directories are always removed in finally blocks.',
    'The audit proposes compatibility outcomes only; it does not create transactions, locks, recovery state, or derived cache files.',
  ],
}

function renderMarkdown(data) {
  const lines = [
    '# GSE Core Compatibility Audit',
    '',
    `Status: ${data.status}`,
    `Checks: ${data.summary.passed}/${data.summary.total}`,
    '',
  ]
  for (const item of data.checks) {
    lines.push(`${item.status === 'passed' ? '[x]' : '[ ]'} ${item.id} ${item.label}: ${JSON.stringify(item.evidence)}`)
  }
  lines.push('', 'Limits:')
  for (const limit of data.limits) lines.push(`- ${limit}`)
  return `${lines.join('\n')}\n`
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(renderMarkdown(report))

if (failed > 0) process.exit(1)
