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

const [changeStateImport, migrationImport, evidenceImport, projectStateImport] = await Promise.all([
  guardedImport('./core/change-state.mjs'),
  guardedImport('./core/migration-v1.mjs'),
  guardedImport('./core/evidence.mjs'),
  guardedImport('./core/project-state-v1.mjs'),
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

async function runExecutableMigrationProbes() {
  const inspect = migrationImport.module?.inspectGseV1Project
  const execute = migrationImport.module?.executeGseV1Migration
  if (typeof inspect !== 'function' || typeof execute !== 'function') {
    const unavailable = unavailableFunction('Executable migration exports', migrationImport, './core/migration-v1.mjs')
    return {
      available: false,
      migration: unavailable,
      drift: unavailable,
      malformedLedger: unavailable,
      duplicateEventId: unavailable,
      duplicateDeduplicationKey: unavailable,
    }
  }

  const temporaryDirectories = []
  const copyFixture = (label) => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), `gse-core-execute-${label}-`))
    temporaryDirectories.push(temporaryDirectory)
    const target = path.join(temporaryDirectory, 'project')
    fs.cpSync(path.join(fixtureRoot, 'legacy-lite'), target, {
      recursive: true,
      force: false,
      errorOnExist: true,
    })
    return target
  }
  const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^﻿/, ''))
  const readJsonl = (filePath) => fs.existsSync(filePath)
    ? fs.readFileSync(filePath, 'utf8').trimEnd().split('\n').filter(Boolean).map((line) => JSON.parse(line))
    : []
  const transactionManifests = (target) => {
    const rootPath = path.join(target, '.gse', 'transactions')
    if (!fs.existsSync(rootPath)) return []
    return fs.readdirSync(rootPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(rootPath, entry.name, 'manifest.json'))
      .filter((filePath) => fs.existsSync(filePath))
      .map(readJson)
  }
  const legacySetup = (target) => {
    const statePath = path.join(target, '.gse', 'state.json')
    const state = readJson(statePath)
    delete state.stateRevision
    state.toolStatus = { lsp: 'verified' }
    state.residualRisks = [
      'active risk 1',
      'active risk 2',
      'active risk 3',
      'active risk 4',
      'active risk 5',
      'active risk 6',
      'overflow risk 1',
      'overflow risk 2',
    ]
    state.riskArchive = [{
      risk: 'legacy archived risk',
      archivedAt: '2026-07-01T00:00:00.000Z',
      resolution: 'Resolved before Core v1 migration.',
    }]
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`)
  }
  const ledgerRecord = (eventId, deduplicationKey, risk) => ({
    schemaVersion: 1,
    eventId,
    transactionId: null,
    recordType: 'risk-history',
    riskId: `risk-${eventId}`,
    deduplicationKey,
    risk,
    sourceRevision: 0,
    archivedAt: '2026-07-01T00:00:00.000Z',
    resolution: 'Legacy committed ledger fixture.',
    stateRevision: 0,
  })

  try {
    const migrationTarget = copyFixture('migration')
    legacySetup(migrationTarget)
    const dryRun = await Promise.resolve(inspect(migrationTarget))
    const first = await Promise.resolve(execute(migrationTarget, { sourceDigests: dryRun.sourceDigests }))
    const stateAfterFirst = readJson(path.join(migrationTarget, '.gse', 'state.json'))
    const ledgerPath = path.join(migrationTarget, '.gse', 'risk-history.jsonl')
    const ledgerAfterFirst = readJsonl(ledgerPath)
    const manifestsAfterFirst = transactionManifests(migrationTarget)
    const second = await Promise.resolve(execute(migrationTarget))
    const stateAfterSecond = readJson(path.join(migrationTarget, '.gse', 'state.json'))
    const ledgerAfterSecond = readJsonl(ledgerPath)
    const manifestsAfterSecond = transactionManifests(migrationTarget)
    const riskWrites = manifestsAfterFirst.flatMap((manifest) => manifest.writes ?? [])
      .filter((write) => write.kind === 'jsonl-append' && write.path === '.gse/risk-history.jsonl')

    const driftTarget = copyFixture('drift')
    legacySetup(driftTarget)
    const driftInspection = await Promise.resolve(inspect(driftTarget))
    const driftStatePath = path.join(driftTarget, '.gse', 'state.json')
    const driftState = readJson(driftStatePath)
    driftState.currentSummary = 'Changed after the reviewed inspection.'
    fs.writeFileSync(driftStatePath, `${JSON.stringify(driftState, null, 2)}\n`)
    const drift = await Promise.resolve(execute(driftTarget, { sourceDigests: driftInspection.sourceDigests }))

    const malformedTarget = copyFixture('malformed-ledger')
    fs.writeFileSync(path.join(malformedTarget, '.gse', 'risk-history.jsonl'), '{"incomplete":true')
    const malformedLedger = await Promise.resolve(inspect(malformedTarget))

    const duplicateEventTarget = copyFixture('duplicate-event')
    const duplicateEventDigestA = `sha256:${'a'.repeat(64)}`
    const duplicateEventDigestB = `sha256:${'b'.repeat(64)}`
    fs.writeFileSync(
      path.join(duplicateEventTarget, '.gse', 'risk-history.jsonl'),
      `${JSON.stringify(ledgerRecord('duplicate-event', duplicateEventDigestA, 'risk a'))}\n${JSON.stringify(ledgerRecord('duplicate-event', duplicateEventDigestB, 'risk b'))}\n`,
    )
    const duplicateEventId = await Promise.resolve(inspect(duplicateEventTarget))

    const duplicateDedupTarget = copyFixture('duplicate-dedup')
    const duplicateDedupDigest = `sha256:${'c'.repeat(64)}`
    fs.writeFileSync(
      path.join(duplicateDedupTarget, '.gse', 'risk-history.jsonl'),
      `${JSON.stringify(ledgerRecord('event-a', duplicateDedupDigest, 'risk c'))}\n${JSON.stringify(ledgerRecord('event-b', duplicateDedupDigest, 'risk d'))}\n`,
    )
    const duplicateDeduplicationKey = await Promise.resolve(inspect(duplicateDedupTarget))

    return {
      available: true,
      migration: {
        dryRun,
        first,
        second,
        stateAfterFirst,
        stateAfterSecond,
        ledgerAfterFirst,
        ledgerAfterSecond,
        manifestsAfterFirst,
        manifestsAfterSecond,
        riskWrites,
      },
      drift: {
        result: drift,
        transactionCount: transactionManifests(driftTarget).length,
        stateHasRevision: Object.hasOwn(readJson(driftStatePath), 'stateRevision'),
      },
      malformedLedger,
      duplicateEventId,
      duplicateDeduplicationKey,
    }
  } catch (error) {
    const unavailable = failedProbe(error)
    return {
      available: false,
      migration: unavailable,
      drift: unavailable,
      malformedLedger: unavailable,
      duplicateEventId: unavailable,
      duplicateDeduplicationKey: unavailable,
    }
  } finally {
    for (const temporaryDirectory of temporaryDirectories) {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true })
    }
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
      missingEvidenceFileClose: unavailable,
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
    const evidenceFile = '.gse/evidence/current.md'
    fs.mkdirSync(path.join(target, '.gse', 'evidence'), { recursive: true })
    fs.writeFileSync(path.join(target, ...evidenceFile.split('/')), '# Current Evidence\n')
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
      evidenceFile,
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
    fs.rmSync(path.join(target, ...evidenceFile.split('/')))
    const missingEvidenceFileClose = evaluateClose(target, {
      projectState,
      activeChange,
      evidenceRecords: [record],
      currentDependencies: closeCurrent,
      pendingTransactions: [],
      requestedStatus: 'verified',
    })
    fs.writeFileSync(path.join(target, ...evidenceFile.split('/')), '# Current Evidence\n')
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
      missingEvidenceFileClose,
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
      missingEvidenceFileClose: unavailable,
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
const executableMigrationProbes = await runExecutableMigrationProbes()
const inspectState = projectStateImport.module?.inspectProjectStateV1
const canonicalFixtureState = {
  schemaVersion: 1,
  stateRevision: 4,
  activeChangeId: null,
  residualRisks: ['active'],
  riskHistoryPath: '.gse/risk-history.jsonl',
  archivedRiskCount: 2,
}
const canonicalStateProbe = typeof inspectState === 'function'
  ? inspectState(canonicalFixtureState)
  : unavailableFunction('inspectProjectStateV1', projectStateImport, './core/project-state-v1.mjs')
const aliasStateProbe = typeof inspectState === 'function'
  ? inspectState({ schemaVersion: 1, projectName: 'legacy', toolStatus: { lsp: 'verified' } })
  : unavailableFunction('inspectProjectStateV1', projectStateImport, './core/project-state-v1.mjs')
const aliasConflictProbe = typeof inspectState === 'function'
  ? inspectState({ schemaVersion: 1, toolStatuses: { lsp: 'verified' }, toolStatus: { lsp: 'unknown' } })
  : unavailableFunction('inspectProjectStateV1', projectStateImport, './core/project-state-v1.mjs')
const riskCompactionProbe = typeof inspectState === 'function'
  ? inspectState({
      schemaVersion: 1,
      projectName: 'legacy-risk',
      residualRisks: ['active', 'duplicate history', 'duplicate history'],
      riskArchive: [{ risk: 'older history', archivedAt: '2026-07-01', resolution: 'resolved' }],
    }, { activeRiskLimit: 1, archivedAt: '2026-07-19T00:00:00.000Z' })
  : unavailableFunction('inspectProjectStateV1', projectStateImport, './core/project-state-v1.mjs')
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
    'canonical Lite inspection returns a byte-preserving no-op',
    lite.available
      && resultField(lite.result, 'status') === 'complete'
      && resultField(lite.result, 'reasonCode') === 'PROJECT_STATE_V1_CANONICAL'
      && liteProjectState?.stateRevision === 0
      && Array.isArray(resultField(lite.result, 'proposedWrites'))
      && resultField(lite.result, 'proposedWrites').length === 0
      && lite.bytesEqual,
    { result: lite.result, byteEquality: lite.bytesEqual },
    'Canonical inspection must remain byte-preserving and avoid unnecessary migration writes.',
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
    'COMP06a',
    'Core v1 state compatibility classifies canonical state idempotently',
    canonicalStateProbe.classification === 'canonical'
      && canonicalStateProbe.normalizedState?.schemaVersion === canonicalFixtureState.schemaVersion
      && canonicalStateProbe.normalizedState?.stateRevision === canonicalFixtureState.stateRevision
      && canonicalStateProbe.normalizedState?.activeChangeId === canonicalFixtureState.activeChangeId
      && canonicalStateProbe.normalizedState?.riskHistoryPath === canonicalFixtureState.riskHistoryPath
      && canonicalStateProbe.normalizedState?.archivedRiskCount === canonicalFixtureState.archivedRiskCount
      && JSON.stringify(canonicalStateProbe.normalizedState?.residualRisks) === JSON.stringify(canonicalFixtureState.residualRisks)
      && canonicalStateProbe.riskHistoryEvents.length === 0,
    canonicalStateProbe,
  ),
  check(
    'COMP06b',
    'legacy toolStatus normalizes only when canonical toolStatuses is absent',
    aliasStateProbe.classification === 'migratable'
      && aliasStateProbe.normalizedState?.toolStatuses?.lsp === 'verified'
      && !Object.hasOwn(aliasStateProbe.normalizedState ?? {}, 'toolStatus'),
    aliasStateProbe,
  ),
  check(
    'COMP06c',
    'conflicting tool-status aliases block migration',
    aliasConflictProbe.classification === 'invalid'
      && aliasConflictProbe.reasonCode === 'CONFLICTING_TOOL_STATUS_ALIASES',
    aliasConflictProbe,
  ),
  check(
    'COMP06d',
    'risk history externalization keeps bounded active risks and stable deduplicated events',
    riskCompactionProbe.classification === 'migratable'
      && riskCompactionProbe.normalizedState?.residualRisks?.length === 1
      && riskCompactionProbe.riskHistoryEvents?.length === 2
      && riskCompactionProbe.normalizedState?.archivedRiskCount === 2
      && !Object.hasOwn(riskCompactionProbe.normalizedState ?? {}, 'riskArchive'),
    riskCompactionProbe,
  ),
  check(
    'COMP06e',
    'executable legacy migration commits canonical state and one batched risk ledger append',
    executableMigrationProbes.available
      && executableMigrationProbes.migration.dryRun?.status === 'proceed'
      && executableMigrationProbes.migration.dryRun?.reasonCode === 'MIGRATION_INSPECTION_READY'
      && executableMigrationProbes.migration.first?.status === 'complete'
      && executableMigrationProbes.migration.stateAfterFirst?.stateRevision === 1
      && executableMigrationProbes.migration.stateAfterFirst?.activeChangeId === null
      && executableMigrationProbes.migration.stateAfterFirst?.toolStatuses?.lsp === 'verified'
      && !Object.hasOwn(executableMigrationProbes.migration.stateAfterFirst ?? {}, 'toolStatus')
      && !Object.hasOwn(executableMigrationProbes.migration.stateAfterFirst ?? {}, 'riskArchive')
      && executableMigrationProbes.migration.stateAfterFirst?.residualRisks?.length === 6
      && executableMigrationProbes.migration.ledgerAfterFirst?.length === 3
      && executableMigrationProbes.migration.riskWrites?.length === 1
      && executableMigrationProbes.migration.riskWrites?.[0]?.eventIds?.length === 3,
    executableMigrationProbes.migration,
  ),
  check(
    'COMP06f',
    'canonical migration rerun is a no-op without revision or ledger duplication',
    executableMigrationProbes.available
      && executableMigrationProbes.migration.second?.status === 'complete'
      && executableMigrationProbes.migration.second?.reasonCode === 'PROJECT_STATE_V1_CANONICAL'
      && executableMigrationProbes.migration.stateAfterSecond?.stateRevision === 1
      && executableMigrationProbes.migration.ledgerAfterSecond?.length === 3
      && executableMigrationProbes.migration.manifestsAfterSecond?.length === executableMigrationProbes.migration.manifestsAfterFirst?.length,
    executableMigrationProbes.migration,
  ),
  check(
    'COMP06g',
    'execution rejects source drift against the reviewed dry-run digest set without publishing',
    executableMigrationProbes.available
      && executableMigrationProbes.drift.result?.status === 'blocked'
      && executableMigrationProbes.drift.result?.reasonCode === 'MIGRATION_SOURCE_DIGEST_MISMATCH'
      && executableMigrationProbes.drift.transactionCount === 0
      && executableMigrationProbes.drift.stateHasRevision === false,
    executableMigrationProbes.drift,
  ),
  check(
    'COMP06h',
    'malformed and duplicate risk ledgers block with precise reason codes',
    executableMigrationProbes.available
      && executableMigrationProbes.malformedLedger?.status === 'repair'
      && executableMigrationProbes.malformedLedger?.reasonCode === 'INVALID_RISK_HISTORY_LEDGER'
      && executableMigrationProbes.duplicateEventId?.status === 'blocked'
      && executableMigrationProbes.duplicateEventId?.reasonCode === 'DUPLICATE_RISK_HISTORY_ID'
      && executableMigrationProbes.duplicateDeduplicationKey?.status === 'blocked'
      && executableMigrationProbes.duplicateDeduplicationKey?.reasonCode === 'DUPLICATE_RISK_HISTORY_ID',
    {
      malformed: executableMigrationProbes.malformedLedger,
      duplicateEventId: executableMigrationProbes.duplicateEventId,
      duplicateDeduplicationKey: executableMigrationProbes.duplicateDeduplicationKey,
    },
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
    'COMP19a',
    'Close blocks an authorizing proof whose evidence artifact is missing',
    evidenceProbes.available
      && evidenceProbes.missingEvidenceFileClose.status === 'blocked'
      && evidenceProbes.missingEvidenceFileClose.reasonCode === 'EVIDENCE_FILE_MISSING',
    evidenceProbes.missingEvidenceFileClose,
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
      && evidenceProbes.acceptedPromotionAttempt.reasonCode === 'EVIDENCE_CURRENT_PROOF_MISSING',
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
    'Static fixture sources are never mutated; executable probes use disposable temporary copies and remove them in finally blocks.',
    'Byte equality compares the complete sorted relative POSIX file set and each file\'s raw Buffer bytes; digests are retained only as evidence metadata.',
    'Temporary probe directories are always removed in finally blocks.',
    'Executable probes may create transactions, locks, recovery state, derived caches, and risk ledgers only inside disposable temporary copies.',
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
