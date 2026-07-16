#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const jsonOnly = args.includes('--json')
const target = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-change-lifecycle-'))
const initScript = path.join(root, 'scripts', 'init-change.mjs')
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

fs.mkdirSync(path.join(target, '.gse', 'evidence'), { recursive: true })
fs.writeFileSync(path.join(target, '.gse', 'goal-map.md'), '# Goal Map\n', 'utf8')
fs.writeFileSync(path.join(target, '.gse', 'quality-gates.md'), '# Quality Gates\n', 'utf8')
fs.writeFileSync(path.join(target, '.gse', 'evidence', 'index.jsonl'), '', 'utf8')

const init = run(initScript, ['--target', target, '--change-id', 'Archive Me', '--level', 'standard', '--json'])
const dryRun = run(closeScript, ['--target', target, '--change-id', 'archive-me', '--status', 'verified', '--date', '2026-07-06', '--dry-run', '--json'])
const dryRunPreservedSource = fs.existsSync(path.join(target, '.gse', 'changes', 'archive-me'))
const close = run(closeScript, ['--target', target, '--change-id', 'archive-me', '--status', 'verified', '--date', '2026-07-06', '--json'])
const closeJson = parseJson(close.stdout)
const archiveDir = path.join(target, '.gse', 'archive', '2026-07-06-archive-me')
const sourceDir = path.join(target, '.gse', 'changes', 'archive-me')
const indexText = fs.readFileSync(path.join(target, '.gse', 'evidence', 'index.jsonl'), 'utf8')
const archiveRecord = fs.existsSync(path.join(archiveDir, 'archive-record.md')) ? fs.readFileSync(path.join(archiveDir, 'archive-record.md'), 'utf8') : ''

const checks = [
  check('CHGLC01', 'close-change script exists', fs.existsSync(closeScript), 'scripts/close-change.mjs'),
  check('CHGLC02', 'init-change creates closeable change pack', init.status === 0, 'scripts/init-change.mjs fixture run'),
  check('CHGLC03', 'dry-run reports pass without moving source folder', dryRun.status === 0 && dryRunPreservedSource, 'close-change --dry-run'),
  check('CHGLC04', 'close moves change folder into archive', close.status === 0 && fs.existsSync(archiveDir) && !fs.existsSync(sourceDir), '.gse/archive/YYYY-MM-DD-change-id'),
  check('CHGLC05', 'archive record captures closure metadata', archiveRecord.includes('Status: verified') && archiveRecord.includes('Source: .gse/changes/archive-me'), 'archive-record.md'),
  check('CHGLC06', 'evidence index receives schema-complete change-archive record', indexText.includes('"recordType":"change-archive"') && indexText.includes('"changeId":"archive-me"') && indexText.includes('"commands":') && indexText.includes('"nextAction":'), '.gse/evidence/index.jsonl'),
  check('CHGLC07', 'close output preserves evidence status and archive path', closeJson?.evidenceStatus === 'verified' && closeJson?.indexRecord?.archivePath === '.gse/archive/2026-07-06-archive-me', 'close-change JSON'),
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

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(JSON.stringify(report, null, 2))

if (failed > 0) process.exit(1)
