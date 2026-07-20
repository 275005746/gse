#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { closeChange } from './close-change.mjs'
import { currentEvidenceBasis } from './core/evidence-basis.mjs'
import { readCommittedJsonl } from './core/persistence/jsonl.mjs'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(readArg('--root', path.join(scriptDirectory, '..')))
const jsonOnly = args.includes('--json')
const target = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-change-lifecycle-'))
const initScript = path.join(root, 'scripts', 'init-change.mjs')
const initProjectScript = path.join(root, 'scripts', 'init-project.mjs')
const recordScript = path.join(root, 'scripts', 'record-evidence.mjs')
const closeScript = path.join(root, 'scripts', 'close-change.mjs')

function run(script, commandArgs) {
  return spawnSync(process.execPath, [script, ...commandArgs], { cwd: root, encoding: 'utf8', windowsHide: true })
}

function parseJson(text) {
  try { return JSON.parse(text) } catch { return null }
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

function digestTree(rootPath) {
  try {
    const stat = fs.lstatSync(rootPath)
    if (stat.isFile()) {
      return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(rootPath)).digest('hex')}`
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) return null
    const chunks = []
    for (const entry of fs.readdirSync(rootPath, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.isSymbolicLink()) return null
      chunks.push(Buffer.from(`${entry.name}\0`, 'utf8'))
      chunks.push(Buffer.from(digestTree(path.join(rootPath, entry.name)) ?? 'missing', 'utf8'))
    }
    return `sha256:${crypto.createHash('sha256').update(Buffer.concat(chunks)).digest('hex')}`
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null
    throw error
  }
}

function directorySnapshot(directory) {
  return {
    digest: digestTree(directory),
    exists: fs.existsSync(directory),
  }
}

fs.mkdirSync(path.join(target, '.gse', 'evidence'), { recursive: true })
const projectInit = run(initProjectScript, ['--target', target, '--mode', 'standard', '--json'])
if (projectInit.status !== 0) throw new Error(projectInit.stderr || 'Project initialization failed.')

const init = run(initScript, ['--target', target, '--change-id', 'Archive Me', '--level', 'standard', '--json'])
const initializedStatePath = path.join(target, '.gse', 'state.json')
const initializedState = JSON.parse(fs.readFileSync(initializedStatePath, 'utf8'))
const changeDirectory = path.join(target, '.gse', 'changes', 'archive-me')
const initializedChange = JSON.parse(fs.readFileSync(path.join(changeDirectory, 'change.json'), 'utf8'))
const initializedDesignDigest = initializedChange.sourceDigests?.['design.md'] ?? null
const initializedReviewDigest = initializedChange.sourceDigests?.['review.md'] ?? null
fs.writeFileSync(path.join(changeDirectory, 'design.md'), '# Design\n', 'utf8')
fs.writeFileSync(path.join(changeDirectory, 'review.md'), '# Review\n', 'utf8')
fs.writeFileSync(path.join(changeDirectory, 'build-output.txt'), 'verified build output\n', 'utf8')
const evidence = run(recordScript, [
  '--target', target,
  '--operation-id', 'record-archive-me-evidence',
  '--event-id', 'archive-me-evidence',
  '--change-id', 'archive-me',
  '--status', 'verified',
  '--evidence-level', 'verified-unit',
  '--required-evidence-level', 'verified-unit',
  '--claim', 'Archive lifecycle fixture passed its focused verification.',
  '--evidence-class', 'test',
  '--method', 'change lifecycle audit fixture',
  '--contract-revision', 'core-v1',
  '--host-capability-basis', 'portable-node-runtime',
  '--input', '.gse/changes/archive-me/brief.md',
  '--input', '.gse/changes/archive-me/design.md',
  '--input', '.gse/changes/archive-me/evidence.md',
  '--input', '.gse/changes/archive-me/review.md',
  '--input', '.gse/changes/archive-me/spec.md',
  '--input', '.gse/changes/archive-me/tasks.md',
  '--artifact', '.gse/changes/archive-me/build-output.txt',
  '--evidence-file', '.gse/changes/archive-me/evidence.md',
  '--next-action', 'Close and archive the fixture Change.',
  '--json',
])
const evidenceJson = parseJson(evidence.stdout)
const recordedState = JSON.parse(fs.readFileSync(initializedStatePath, 'utf8'))
const recordedChange = JSON.parse(fs.readFileSync(path.join(changeDirectory, 'change.json'), 'utf8'))

const conflictTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-change-lifecycle-conflict-'))
fs.cpSync(target, conflictTarget, { recursive: true })
const conflictSourceDir = path.join(conflictTarget, '.gse', 'changes', 'archive-me')
const conflictArchiveDir = path.join(conflictTarget, '.gse', 'archive', '2026-07-06-archive-me')
fs.mkdirSync(conflictArchiveDir, { recursive: true })
fs.writeFileSync(path.join(conflictArchiveDir, 'owner.txt'), 'existing archive remains authoritative\n', 'utf8')
const conflictBefore = {
  source: directorySnapshot(conflictSourceDir),
  archive: directorySnapshot(conflictArchiveDir),
  state: fs.readFileSync(path.join(conflictTarget, '.gse', 'state.json'), 'utf8'),
  evidence: fs.readFileSync(path.join(conflictTarget, '.gse', 'evidence', 'index.jsonl'), 'utf8'),
}
const archiveConflict = await closeChange({
  target: conflictTarget,
  changeId: 'archive-me',
  status: 'verified',
  date: '2026-07-06',
  force: true,
})
const conflictAfter = {
  source: directorySnapshot(conflictSourceDir),
  archive: directorySnapshot(conflictArchiveDir),
  state: fs.readFileSync(path.join(conflictTarget, '.gse', 'state.json'), 'utf8'),
  evidence: fs.readFileSync(path.join(conflictTarget, '.gse', 'evidence', 'index.jsonl'), 'utf8'),
}

const raceTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-change-lifecycle-race-'))
fs.cpSync(target, raceTarget, { recursive: true })
const raceSourceDir = path.join(raceTarget, '.gse', 'changes', 'archive-me')
const raceArchiveDir = path.join(raceTarget, '.gse', 'archive', '2026-07-06-archive-me')
const raceBefore = {
  source: directorySnapshot(raceSourceDir),
  state: fs.readFileSync(path.join(raceTarget, '.gse', 'state.json'), 'utf8'),
  evidence: fs.readFileSync(path.join(raceTarget, '.gse', 'evidence', 'index.jsonl'), 'utf8'),
}
const originalExistsSync = fs.existsSync
let archiveChecks = 0
fs.existsSync = (candidate) => {
  if (path.resolve(candidate) === path.resolve(raceArchiveDir)) {
    archiveChecks += 1
    if (archiveChecks === 1) {
      fs.mkdirSync(raceArchiveDir, { recursive: true })
      fs.writeFileSync(path.join(raceArchiveDir, 'owner.txt'), 'racing archive remains authoritative\n', 'utf8')
      return false
    }
  }
  return originalExistsSync(candidate)
}
let archiveRace
try {
  archiveRace = await closeChange({
    target: raceTarget,
    changeId: 'archive-me',
    status: 'verified',
    date: '2026-07-06',
    force: true,
  })
} finally {
  fs.existsSync = originalExistsSync
}
const raceAfter = {
  source: directorySnapshot(raceSourceDir),
  archive: directorySnapshot(raceArchiveDir),
  archiveOwner: fs.readFileSync(path.join(raceArchiveDir, 'owner.txt'), 'utf8'),
  state: fs.readFileSync(path.join(raceTarget, '.gse', 'state.json'), 'utf8'),
  evidence: fs.readFileSync(path.join(raceTarget, '.gse', 'evidence', 'index.jsonl'), 'utf8'),
}

const driftTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-change-lifecycle-drift-'))
fs.cpSync(target, driftTarget, { recursive: true })
const driftState = JSON.parse(fs.readFileSync(path.join(driftTarget, '.gse', 'state.json'), 'utf8'))
const driftChange = JSON.parse(fs.readFileSync(path.join(driftTarget, '.gse', 'changes', 'archive-me', 'change.json'), 'utf8'))
const driftEvidence = readCommittedJsonl(driftTarget, '.gse/evidence/index.jsonl', { allowMissing: true })
const staleDependencies = currentEvidenceBasis(driftTarget, {
  projectState: driftState,
  activeChange: driftChange,
  evidenceRecords: driftEvidence.records,
})
fs.appendFileSync(path.join(driftTarget, '.gse', 'changes', 'archive-me', 'build-output.txt'), 'drifted after caller snapshot\n', 'utf8')
const driftSourceDir = path.join(driftTarget, '.gse', 'changes', 'archive-me')
const driftArchiveDir = path.join(driftTarget, '.gse', 'archive', '2026-07-06-archive-me')
const driftBefore = {
  source: directorySnapshot(driftSourceDir),
  state: fs.readFileSync(path.join(driftTarget, '.gse', 'state.json'), 'utf8'),
  evidence: fs.readFileSync(path.join(driftTarget, '.gse', 'evidence', 'index.jsonl'), 'utf8'),
}
const dependencyDrift = await closeChange({
  target: driftTarget,
  changeId: 'archive-me',
  status: 'verified',
  date: '2026-07-06',
  currentDependencies: staleDependencies,
})
const driftAfter = {
  source: directorySnapshot(driftSourceDir),
  archive: directorySnapshot(driftArchiveDir),
  state: fs.readFileSync(path.join(driftTarget, '.gse', 'state.json'), 'utf8'),
  evidence: fs.readFileSync(path.join(driftTarget, '.gse', 'evidence', 'index.jsonl'), 'utf8'),
}

const dryRun = await closeChange({
  target,
  changeId: 'archive-me',
  status: 'verified',
  date: '2026-07-06',
  dryRun: true,
})
const dryRunStatus = dryRun.status === 'complete' ? 0 : 1
const dryRunPreservedSource = fs.existsSync(path.join(target, '.gse', 'changes', 'archive-me'))
const close = await closeChange({
  target,
  changeId: 'archive-me',
  status: 'verified',
  date: '2026-07-06',
})
const closeStatus = close.status === 'complete' ? 0 : 1
const closeJson = close
const archiveDir = path.join(target, '.gse', 'archive', '2026-07-06-archive-me')
const sourceDir = path.join(target, '.gse', 'changes', 'archive-me')
const replayBefore = {
  archive: directorySnapshot(archiveDir),
  state: fs.readFileSync(path.join(target, '.gse', 'state.json'), 'utf8'),
  evidence: fs.readFileSync(path.join(target, '.gse', 'evidence', 'index.jsonl'), 'utf8'),
  goalMap: fs.readFileSync(path.join(target, '.gse', 'goal-map.md'), 'utf8'),
}
const closeReplay = await closeChange({
  target,
  changeId: 'archive-me',
  status: 'verified',
  date: '2026-07-06',
})
const replayAfter = {
  archive: directorySnapshot(archiveDir),
  source: directorySnapshot(sourceDir),
  state: fs.readFileSync(path.join(target, '.gse', 'state.json'), 'utf8'),
  evidence: fs.readFileSync(path.join(target, '.gse', 'evidence', 'index.jsonl'), 'utf8'),
  goalMap: fs.readFileSync(path.join(target, '.gse', 'goal-map.md'), 'utf8'),
}
const indexText = replayAfter.evidence
const committedArchiveEvidence = readCommittedJsonl(target, '.gse/evidence/index.jsonl', { allowMissing: false })
const archiveEvent = committedArchiveEvidence.records.find((record) => (
  record.recordType === 'change-archive'
  && record.changeId === 'archive-me'
))
const archiveRecord = fs.existsSync(path.join(archiveDir, 'archive-record.md')) ? fs.readFileSync(path.join(archiveDir, 'archive-record.md'), 'utf8') : ''

const checks = [
  check('CHGLC01', 'close-change script exists', fs.existsSync(closeScript), 'scripts/close-change.mjs'),
  check('CHGLC02', 'init-change creates state and derived cache at one revision', init.status === 0
    && initializedState.activeChangeId === 'archive-me'
    && initializedState.stateRevision === initializedChange.stateRevision, {
    init: { status: init.status, stdout: init.stdout, stderr: init.stderr },
    stateRevision: initializedState.stateRevision,
    cacheRevision: initializedChange.stateRevision,
  }),
  check('CHGLC03', 'record-evidence refreshes edited source digests and commits current evidence', evidence.status === 0
    && evidenceJson?.status === 'complete'
    && recordedState.stateRevision === recordedChange.stateRevision
    && recordedChange.sourceDigests?.['design.md'] !== initializedDesignDigest
    && recordedChange.sourceDigests?.['review.md'] !== initializedReviewDigest, {
    recorder: { status: evidence.status, stdout: evidence.stdout, stderr: evidence.stderr, result: evidenceJson },
    initializedDesignDigest,
    recordedDesignDigest: recordedChange.sourceDigests?.['design.md'],
    initializedReviewDigest,
    recordedReviewDigest: recordedChange.sourceDigests?.['review.md'],
    stateRevision: recordedState.stateRevision,
    cacheRevision: recordedChange.stateRevision,
  }),
  check('CHGLC04', 'dry-run reports pass without moving source folder', dryRunStatus === 0 && dryRunPreservedSource, { status: dryRunStatus, reasonCode: dryRun.reasonCode, message: dryRun.message }),
  check('CHGLC05', 'close moves change folder into archive', closeStatus === 0 && fs.existsSync(archiveDir) && !fs.existsSync(sourceDir), { status: closeStatus, reasonCode: close.reasonCode, message: close.message }),
  check('CHGLC06', 'archive record captures closure metadata and authorizing proof', archiveRecord.includes('Status: verified')
    && archiveRecord.includes('Source: .gse/changes/archive-me')
    && archiveRecord.includes('Authorizing Evidence: archive-me-evidence'), 'archive-record.md'),
  check('CHGLC07', 'archive event preserves the effective evidence contract and provenance', indexText.includes('"recordType":"change-archive"')
    && indexText.includes('"changeId":"archive-me"')
    && indexText.includes('"commands":')
    && indexText.includes('"nextAction":')
    && indexText.includes('"transactionId":"tx-close-change-2026-07-06-archive-me"')
    && archiveEvent?.status === 'verified'
    && archiveEvent?.evidenceLevel === 'verified-unit'
    && archiveEvent?.requiredEvidenceLevel === 'verified-unit'
    && archiveEvent?.evidenceRefs?.includes('archive-me-evidence'), archiveEvent ?? '.gse/evidence/index.jsonl'),
  check('CHGLC08', 'close output includes evidence reference and archive path', closeJson?.evidenceRefs?.includes('archive-me-evidence') && closeJson?.artifactRefs?.includes('.gse/archive/2026-07-06-archive-me'), 'close-change Core result envelope'),
  check('CHGLC09', 'archive writes an idempotent goal-map execution link', replayBefore.goalMap.includes('gse-change-lifecycle:archive-me')
    && replayBefore.goalMap.includes('.gse/archive/2026-07-06-archive-me')
    && replayAfter.goalMap === replayBefore.goalMap, '.gse/goal-map.md'),
  check('CHGLC10', 'repeated close returns committed replay without mutating canonical artifacts', closeReplay.status === 'complete'
    && closeReplay.reasonCode === 'TRANSACTION_ALREADY_COMMITTED'
    && replayAfter.source.exists === false
    && replayAfter.archive.digest === replayBefore.archive.digest
    && replayAfter.state === replayBefore.state
    && replayAfter.evidence === replayBefore.evidence
    && replayAfter.goalMap === replayBefore.goalMap, { closeReplay, replayBefore, replayAfter }),
  check('CHGLC11', 'existing archive blocks force close without replacing or mutating either authority', archiveConflict.status === 'blocked'
    && archiveConflict.reasonCode === 'ARCHIVE_EXISTS'
    && conflictAfter.source.digest === conflictBefore.source.digest
    && conflictAfter.archive.digest === conflictBefore.archive.digest
    && conflictAfter.state === conflictBefore.state
    && conflictAfter.evidence === conflictBefore.evidence, { archiveConflict, conflictBefore, conflictAfter }),
  check('CHGLC12', 'archive appearing after preflight blocks force close under the project lock', archiveRace.status === 'blocked'
    && archiveRace.reasonCode === 'ARCHIVE_EXISTS'
    && archiveChecks >= 2
    && raceAfter.source.digest === raceBefore.source.digest
    && raceAfter.archive.exists === true
    && raceAfter.archiveOwner === 'racing archive remains authoritative\n'
    && raceAfter.state === raceBefore.state
    && raceAfter.evidence === raceBefore.evidence, { archiveRace, archiveChecks, raceBefore, raceAfter }),
  check('CHGLC13', 'lock-held dependency revalidation blocks drift before publication', dependencyDrift.status === 'blocked'
    && dependencyDrift.reasonCode === 'EVIDENCE_STALE'
    && driftAfter.source.digest === driftBefore.source.digest
    && driftAfter.archive.exists === false
    && driftAfter.state === driftBefore.state
    && driftAfter.evidence === driftBefore.evidence, { dependencyDrift, driftBefore, driftAfter }),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: { changeArchiveLifecycle: failed === 0 ? 'verified' : 'failed' },
  limits: [
    'This audit verifies local change archive mechanics in a fixture.',
    'It does not certify the product correctness of a real target-project change.',
  ],
  checks,
}

fs.rmSync(target, { recursive: true, force: true })
fs.rmSync(conflictTarget, { recursive: true, force: true })
fs.rmSync(raceTarget, { recursive: true, force: true })
fs.rmSync(driftTarget, { recursive: true, force: true })

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(JSON.stringify(report, null, 2))

if (failed > 0) process.exit(1)
