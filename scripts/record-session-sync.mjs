#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const execute = args.includes('--execute')
const jsonOnly = args.includes('--json')
const recordPath = path.join(root, '.gse', 'session-sync.jsonl')

function requiredArg(name) {
  const value = readArg(name)
  if (!value) {
    console.error(`${name} is required`)
    process.exit(1)
  }
  return value
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase()
}

const allowedStatuses = new Set([
  'sent',
  'installed-sync',
  'skipped',
  'failed',
  'archived',
  'unavailable',
])

const status = normalizeStatus(requiredArg('--status'))
if (!allowedStatuses.has(status)) {
  console.error(`--status must be one of: ${[...allowedStatuses].join(', ')}`)
  process.exit(1)
}

const record = {
  schemaVersion: 1,
  recordedAt: new Date().toISOString(),
  capability: readArg('--capability', 'gse-capability-sync'),
  status,
  method: requiredArg('--method'),
  threadId: readArg('--thread-id', null),
  project: readArg('--project', null),
  workspace: readArg('--workspace', null),
  evidence: requiredArg('--evidence'),
  messageSummary: readArg('--message-summary', ''),
  limits: [
    'This record proves a sync attempt or installed-copy parity record, not that the target session adopted the capability.',
    'A thread sync is accepted only when the transport returned success or when the failure/archived status is recorded honestly.',
  ],
}

const report = {
  root,
  recordPath,
  execute,
  summary: {
    status: execute ? 'written' : 'dry-run',
    threadId: record.threadId,
    syncStatus: record.status,
    method: record.method,
  },
  record,
}

if (execute) {
  fs.mkdirSync(path.dirname(recordPath), { recursive: true })
  fs.appendFileSync(recordPath, JSON.stringify(record) + '\n', 'utf8')
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else {
  console.log(`GSE session sync record: ${report.summary.status}`)
  console.log(`Status: ${record.status}`)
  console.log(`Method: ${record.method}`)
  if (record.threadId) console.log(`Thread: ${record.threadId}`)
}
