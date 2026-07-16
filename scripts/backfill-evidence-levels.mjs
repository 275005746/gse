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
const defaultLevel = readArg('--default-level', 'result')
const evidenceIndexPath = path.join(root, '.gse', 'evidence', 'index.jsonl')
const allowedLevels = new Set([
  'result',
  'verified-unit',
  'verified-component',
  'verified-api',
  'verified-browser',
  'verified-ci',
  'accepted-owner',
  'accepted-release',
  'external-required',
])

function parseJsonl(filePath) {
  if (!fs.existsSync(filePath)) return { records: [], errors: [{ line: 0, error: 'missing evidence index' }] }
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

function summarize(record) {
  return record.summary || record.recordType || '(unknown)'
}

if (!allowedLevels.has(defaultLevel)) {
  console.error(`--default-level must be one of: ${[...allowedLevels].join(', ')}`)
  process.exit(1)
}

const { records, errors } = parseJsonl(evidenceIndexPath)
const missingBefore = records.filter((record) => !record.evidenceLevel)
const updatedRecords = records.map((record) => {
  if (record.evidenceLevel) return record
  return {
    ...record,
    evidenceLevel: defaultLevel,
    requiredEvidenceLevel: record.requiredEvidenceLevel || defaultLevel,
    evidenceLevelBackfill: 'conservative-historical-default',
  }
})
const missingAfter = updatedRecords.filter((record) => !record.evidenceLevel)
const invalidAfter = updatedRecords.filter((record) => !allowedLevels.has(record.evidenceLevel))

const report = {
  root,
  evidenceIndexPath,
  execute,
  defaultLevel,
  summary: {
    status: errors.length || invalidAfter.length ? 'failed' : execute ? 'written' : 'dry-run',
    records: records.length,
    missingBefore: missingBefore.length,
    missingAfter: missingAfter.length,
    invalidAfter: invalidAfter.length,
  },
  changed: missingBefore.slice(0, 20).map((record) => summarize(record)),
  omittedChangedCount: Math.max(0, missingBefore.length - 20),
  errors,
  limits: [
    'This script only fills missing historical evidenceLevel fields with a conservative default.',
    'The default level should stay result unless a human or focused audit can prove a stronger level.',
    'It does not rewrite evidence status or claim that old records were verified by a stronger proof type.',
  ],
}

if (errors.length === 0 && invalidAfter.length === 0 && execute && missingBefore.length > 0) {
  fs.writeFileSync(evidenceIndexPath, updatedRecords.map((record) => JSON.stringify(record)).join('\n') + '\n', 'utf8')
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(JSON.stringify(report, null, 2))

if (report.summary.status === 'failed') process.exit(1)
