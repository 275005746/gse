#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalize(value) {
  return clean(value).toLowerCase()
}

function slugify(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'learning'
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

const target = path.resolve(readArg('--target', process.cwd()))
const summary = clean(readArg('--summary', ''))
const trigger = clean(readArg('--trigger', 'reusable lesson'))
const source = clean(readArg('--source', 'manual'))
const impact = clean(readArg('--impact', ''))
const promotion = clean(readArg('--promotion', 'first occurrence: learning note'))
const date = clean(readArg('--date', today()))
const execute = args.includes('--execute')
const jsonOnly = args.includes('--json')
const gseDir = path.join(target, '.gse')
const learningsPath = path.join(gseDir, 'learnings.md')

function report(data) {
  if (jsonOnly) console.log(JSON.stringify(data, null, 2))
  else {
    console.log('Status: ' + data.status)
    console.log('Target: ' + data.target)
    if (data.path) console.log('Path: ' + data.path)
    if (data.reason) console.log('Reason: ' + data.reason)
  }
}

if (!summary) {
  report({
    status: 'waiting-for-input',
    target,
    required: ['--summary <reusable lesson>'],
    optional: ['--trigger <why captured>', '--source <where learned>', '--impact <what it prevents>', '--promotion <upgrade rule>'],
    effect: 'dry-run by default; add --execute to write .gse/learnings.md',
  })
  process.exit(0)
}

if (!fs.existsSync(gseDir) || !fs.statSync(gseDir).isDirectory()) {
  report({
    status: 'failed',
    target,
    reason: 'target does not contain a .gse directory; initialize or adopt GSE before recording learnings',
  })
  process.exit(1)
}

const existing = fs.existsSync(learningsPath) ? fs.readFileSync(learningsPath, 'utf8').replace(/^\uFEFF/, '') : '# Learnings\n\n'
const existingLines = existing.split(/\r?\n/)
const duplicateSummaryLineIndex = existingLines.findIndex((line) => line.trim().startsWith('- Summary:') && normalize(line.replace(/^- Summary:\s*/, '')) === normalize(summary))
const duplicate = duplicateSummaryLineIndex !== -1

const relativePath = path.relative(target, learningsPath).replace(/\\/g, '/')
const entry = [
  '## ' + date + ' - ' + slugify(summary),
  '',
  '- Trigger: ' + trigger,
  '- Summary: ' + summary,
  '- Source: ' + source,
  '- Impact: ' + (impact || 'helps future agents avoid repeating the same failure or decision drift'),
  '- Promotion: ' + promotion,
  '- Status: learning-note',
  '',
].join('\n')

if (duplicate) {
  if (execute) {
    let insertAt = duplicateSummaryLineIndex + 1
    let occurrenceLineIndex = -1
    for (let cursor = duplicateSummaryLineIndex + 1; cursor < existingLines.length; cursor += 1) {
      const line = existingLines[cursor]
      if (/^##\s+/.test(line)) break
      if (line.trim().startsWith('- Occurrences:')) {
        occurrenceLineIndex = cursor
        break
      }
      if (line.trim().startsWith('- Source:')) insertAt = cursor
    }
    if (occurrenceLineIndex === -1) {
      existingLines.splice(insertAt, 0, '- Occurrences: 2')
    } else {
      const current = Number(existingLines[occurrenceLineIndex].replace(/^- Occurrences:\s*/, '').trim()) || 1
      existingLines[occurrenceLineIndex] = '- Occurrences: ' + String(current + 1)
    }
    fs.writeFileSync(learningsPath, existingLines.join('\n').replace(/\n*$/, '\n'), 'utf8')
    report({
      status: 'updated',
      target,
      path: relativePath,
      summary,
      reason: 'duplicate summary counted without appending another entry',
      evidenceStatus: 'verified',
    })
    process.exit(0)
  }
  report({
    status: 'skipped',
    target,
    path: relativePath,
    summary,
    reason: 'duplicate summary already exists',
    evidenceStatus: 'verified',
  })
  process.exit(0)
}

if (!execute) {
  report({
    status: 'ready',
    target,
    path: relativePath,
    summary,
    trigger,
    source,
    impact: impact || null,
    promotion,
    dryRun: true,
    effect: 'add --execute to append the learning entry',
    preview: entry,
  })
  process.exit(0)
}

fs.mkdirSync(gseDir, { recursive: true })
const prefix = existing.endsWith('\n') ? existing : existing + '\n'
fs.writeFileSync(learningsPath, prefix + (prefix.endsWith('\n\n') ? '' : '\n') + entry, 'utf8')

report({
  status: 'written',
  target,
  path: relativePath,
  summary,
  trigger,
  source,
  impact: impact || null,
  promotion,
  dryRun: false,
  evidenceStatus: 'verified',
})
