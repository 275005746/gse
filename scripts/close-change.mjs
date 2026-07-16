#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const target = path.resolve(readArg('--target', process.cwd()))
const changeId = String(readArg('--change-id', '')).trim().toLowerCase()
const status = readArg('--status', 'verified')
const date = readArg('--date', new Date().toISOString().slice(0, 10))
const dryRun = args.includes('--dry-run')
const force = args.includes('--force')
const jsonOnly = args.includes('--json')

const validStatus = new Set(['result', 'verified', 'accepted'])
if (!changeId) {
  console.error('Missing --change-id.')
  process.exit(1)
}
if (!validStatus.has(status)) {
  console.error('Invalid --status value. Expected result, verified, or accepted.')
  process.exit(1)
}

const changeDir = path.join(target, '.gse', 'changes', changeId)
const archiveDir = path.join(target, '.gse', 'archive', `${date}-${changeId}`)
const evidenceIndex = path.join(target, '.gse', 'evidence', 'index.jsonl')
const requiredFiles = [
  'brief.md',
  'spec.md',
  'tasks.md',
  'evidence.md',
  'review.md',
]

function read(relativePath) {
  const fullPath = path.join(changeDir, relativePath)
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : ''
}

function fail(message, extra = {}) {
  const report = { target, changeId, status: 'failed', message, ...extra }
  console.error(JSON.stringify(report, null, 2))
  process.exit(1)
}

if (!fs.existsSync(changeDir)) fail('Change directory does not exist.', { changeDir })
if (fs.existsSync(archiveDir) && !force) fail('Archive directory already exists. Use --force to overwrite.', { archiveDir })

const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(changeDir, file)))
if (missing.length) fail('Required change files are missing.', { missing })

const evidence = read('evidence.md')
const review = read('review.md')
const hasEvidenceStatus = ['result', 'verified', 'accepted'].some((term) => evidence.toLowerCase().includes(term))
const hasReviewClosure = review.includes('## Closure')
if (!hasEvidenceStatus) fail('Evidence file does not include result/verified/accepted status vocabulary.', { file: 'evidence.md' })
if (!hasReviewClosure) fail('Review file does not include closure section.', { file: 'review.md' })

const archiveRecord = `# Change Archive Record

Change ID: ${changeId}
Closed At: ${new Date().toISOString()}
Status: ${status}
Source: .gse/changes/${changeId}
Archive: .gse/archive/${date}-${changeId}

## Closure Rules

- Required change files were present.
- Evidence status vocabulary was present.
- Review closure section was present.
- Source change folder was moved to archive.
`

const indexRecord = {
  date,
  recordType: 'change-archive',
  changeId,
  status,
  summary: `Archived GSE change ${changeId}.`,
  evidenceFile: `.gse/archive/${date}-${changeId}/evidence.md`,
  archivePath: `.gse/archive/${date}-${changeId}`,
  commands: [
    `node scripts/close-change.mjs --target ${target} --change-id ${changeId} --status ${status} --date ${date} --json`,
  ],
  nextAction: 'Continue from .gse/state.json and the current goal map.',
}

if (!dryRun) {
  fs.mkdirSync(path.dirname(archiveDir), { recursive: true })
  fs.rmSync(archiveDir, { recursive: true, force: true })
  fs.renameSync(changeDir, archiveDir)
  fs.writeFileSync(path.join(archiveDir, 'archive-record.md'), archiveRecord.replace(/\n/g, '\r\n'), 'utf8')
  fs.mkdirSync(path.dirname(evidenceIndex), { recursive: true })
  fs.appendFileSync(evidenceIndex, JSON.stringify(indexRecord) + '\n', 'utf8')
}

const report = {
  target,
  changeId,
  status: 'passed',
  evidenceStatus: status,
  dryRun,
  source: changeDir,
  archive: archiveDir,
  indexRecord,
}

console.log(JSON.stringify(report, null, 2))
