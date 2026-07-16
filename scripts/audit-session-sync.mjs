#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

function readArgs(name) {
  const values = []
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && args[index + 1]) values.push(args[index + 1])
  }
  return values
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const jsonOnly = args.includes('--json')
const requireInstalled = args.includes('--require-installed')
const requiredThreads = readArgs('--require-thread')
const recordPath = path.join(root, '.gse', 'session-sync.jsonl')

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

function parseJsonl(filePath) {
  if (!fs.existsSync(filePath)) return { records: [], errors: [] }
  const lines = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
  const records = []
  const errors = []
  lines.forEach((line, index) => {
    if (!line.trim()) return
    try {
      records.push(JSON.parse(line))
    } catch (error) {
      errors.push({ line: index + 1, error: error.message })
    }
  })
  return { records, errors }
}

function validRecord(record) {
  const validStatuses = new Set(['sent', 'installed-sync', 'skipped', 'failed', 'archived', 'unavailable'])
  return record?.schemaVersion === 1 &&
    typeof record.recordedAt === 'string' &&
    validStatuses.has(record.status) &&
    typeof record.method === 'string' &&
    record.method.length > 0 &&
    typeof record.evidence === 'string' &&
    record.evidence.length > 0
}

const { records, errors } = parseJsonl(recordPath)
const invalidRecords = records.filter((record) => !validRecord(record))
const installedRecords = records.filter((record) => record.status === 'installed-sync')
const threadResults = requiredThreads.map((threadId) => {
  const matches = records.filter((record) => record.threadId === threadId)
  const latest = matches.at(-1) ?? null
  const accepted = latest && ['sent', 'archived', 'unavailable', 'failed', 'skipped'].includes(latest.status)
  return { threadId, latest, accepted }
})

const checks = [
  check(
    'SS01',
    'session sync record file is optional but parseable when present',
    errors.length === 0,
    fs.existsSync(recordPath) ? recordPath : 'no .gse/session-sync.jsonl yet',
    errors.map((item) => `line ${item.line}: ${item.error}`).join('; '),
  ),
  check(
    'SS02',
    'all session sync records follow schema',
    invalidRecords.length === 0,
    `records=${records.length}, invalid=${invalidRecords.length}`,
  ),
  requireInstalled
    ? check(
        'SS03',
        'installed-copy sync/parity evidence is recorded',
        installedRecords.length > 0,
        installedRecords.at(-1)?.evidence ?? 'missing installed-sync record',
      )
    : check('SS03', 'installed-copy sync record is optional unless required', true, 'no --require-installed supplied'),
  check(
    'SS04',
    'required thread sync outcomes are recorded honestly',
    threadResults.every((item) => item.accepted),
    threadResults.map((item) => `${item.threadId}:${item.latest?.status ?? 'missing'}`).join(', ') || 'no --require-thread supplied',
    'Allowed outcomes are sent, archived, unavailable, failed, or skipped; adoption must not be inferred from the record alone.',
  ),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  recordPath,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    sessionSyncRecords: failed === 0 ? 'verified' : 'failed',
    installedSyncRecorded: installedRecords.length > 0 ? 'recorded' : 'not-recorded',
    requiredThreadCount: requiredThreads.length,
  },
  records: {
    total: records.length,
    installedSync: installedRecords.length,
    requiredThreads: threadResults,
  },
  limits: [
    'This audit verifies sync records and honest outcomes; it does not prove a target session adopted the new capability.',
    'Use --require-thread for owner-requested active sessions and --require-installed for installed-copy capability sync closure.',
    'Archived or unavailable sessions should be recorded as such instead of treated as successful syncs.',
  ],
  checks,
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(JSON.stringify(report, null, 2))

if (failed > 0) process.exit(1)
