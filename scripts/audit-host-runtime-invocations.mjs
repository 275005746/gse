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
const recordsDir = path.resolve(readArg('--records-dir', path.join(root, '.gse', 'evidence', 'host-invocations')))
const jsonOnly = args.includes('--json')

function read(relativePathOrFullPath) {
  const fullPath = path.isAbsolute(relativePathOrFullPath) ? relativePathOrFullPath : path.join(root, relativePathOrFullPath)
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8').replace(/^\uFEFF/, '') : ''
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath))
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

function run(commandArgs) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'record-host-invocation.mjs'), ...commandArgs], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  })
  return {
    status: result.status ?? 1,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function listRecords(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((item) => item.endsWith('.md'))
    .map((item) => path.join(dir, item))
}

function parseRecord(filePath) {
  const text = read(filePath)
  const field = (label) => {
    const prefix = label.endsWith('?') ? '- ' + label + ' ' : '- ' + label + ':'
    const line = text.split(/\r?\n/).find((item) => item.trimStart().startsWith(prefix))
    return line ? line.slice(line.indexOf(prefix) + prefix.length).trim() : ''
  }
  return {
    filePath,
    text,
    host: field('Host name'),
    status: field('Status'),
    nativeSlashCommand: field('Does this prove native slash-command support?'),
    portableTextCommand: field('Does this prove portable text-command routing only?'),
    generatedPointer: field('Does this rely on a generated pointer file?'),
    ownerAcceptanceRequired: field('Does this require owner acceptance before being called trusted?'),
    verificationCommand: field('Verification command'),
  }
}

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-host-invocation-audit-'))
const fixtureOut = path.join(fixture, 'codex-record.md')
const readyRun = run([
  '--root',
  root,
  '--host',
  'Codex',
  '--host-version',
  'fixture',
  '--project',
  'GSE fixture',
  '--adapter-path',
  '.codex/gse-command.md',
  '--invocation-method',
  'background-thread text command',
  '--command',
  '/gse help',
  '--status',
  'verified',
  '--evidence-owner',
  'fixture audit',
  '--evidence',
  'fixture transcript',
  '--portable-text-command',
  'true',
  '--native-slash-command',
  'false',
  '--generated-pointer',
  'true',
  '--owner-acceptance-required',
  'false',
  '--out',
  fixtureOut,
  '--json',
])
const readyData = parseJson(readyRun.stdout)
const missingRun = run(['--root', root, '--host', 'Codex', '--dry-run', '--json'])
const missingData = parseJson(missingRun.stdout)
const contradictoryRun = run([
  '--root',
  root,
  '--host',
  'Codex',
  '--invocation-method',
  'native slash command',
  '--status',
  'accepted',
  '--evidence-owner',
  'fixture audit',
  '--evidence',
  'fixture transcript',
  '--native-slash-command',
  'true',
  '--portable-text-command',
  'true',
  '--generated-pointer',
  'true',
  '--owner-acceptance-required',
  'false',
  '--dry-run',
  '--json',
])
const contradictoryData = parseJson(contradictoryRun.stdout)
const acceptedPointerRun = run([
  '--root',
  root,
  '--host',
  'Generic pointer host',
  '--invocation-method',
  'generated pointer',
  '--status',
  'accepted',
  '--evidence-owner',
  'fixture audit',
  '--evidence',
  'fixture transcript',
  '--verification-command',
  'node scripts/audit-final-readiness.mjs --root __GSE__ --json',
  '--native-slash-command',
  'false',
  '--portable-text-command',
  'false',
  '--generated-pointer',
  'true',
  '--owner-acceptance-required',
  'false',
  '--dry-run',
  '--json',
])
const acceptedPointerData = parseJson(acceptedPointerRun.stdout)

const records = listRecords(recordsDir).map(parseRecord)
const closeableRecords = records.filter((record) => ['verified', 'accepted'].includes(record.status))
const nativeRecords = closeableRecords.filter((record) => record.nativeSlashCommand === 'true')
const portableRecords = closeableRecords.filter((record) => record.portableTextCommand === 'true')
const hostNames = [...new Set(closeableRecords.map((record) => record.host).filter(Boolean))]
const recordsHaveNoContradictoryClaims = records.every((record) => !(record.nativeSlashCommand === 'true' && (record.portableTextCommand === 'true' || record.generatedPointer === 'true')))
const acceptedRecordsAreSelfVerifying = records.every((record) => record.status !== 'accepted' || (record.ownerAcceptanceRequired === 'false' && Boolean(record.verificationCommand)))
const acceptedRecordsDoNotRelyOnGeneratedPointers = records.every((record) => record.status !== 'accepted' || record.generatedPointer !== 'true')

const checks = [
  check('HRI01', 'host invocation record command exists', exists('scripts/record-host-invocation.mjs'), 'scripts/record-host-invocation.mjs'),
  check('HRI02', 'host invocation record command writes a valid fixture record', readyRun.status === 0 && readyData?.status === 'written' && fs.existsSync(fixtureOut) && read(fixtureOut).includes('Host name: Codex'), 'record-host-invocation fixture write'),
  check('HRI03', 'host invocation record command rejects missing required fields', missingRun.status !== 0 && missingData?.status === 'failed' && missingData?.errors?.some((item) => item.includes('--invocation-method')) && missingData?.errors?.some((item) => item.includes('--evidence-owner')), 'record-host-invocation missing-fields dry-run'),
  check('HRI04', 'host invocation template preserves boundaries', read('assets/templates/host-ui-invocation-record.md').includes('Does this prove native slash-command support?') && read('assets/templates/host-ui-invocation-record.md').includes('Does this prove portable text-command routing only?'), 'assets/templates/host-ui-invocation-record.md'),
  check('HRI05', 'host invocation readiness audit is wired into validator', read('scripts/validate-gse.mjs').includes('audit-host-runtime-invocations.mjs'), 'scripts/validate-gse.mjs'),
  check('HRI06', 'existing host invocation records, if present, parse with required status fields', records.every((record) => record.host && record.status && record.nativeSlashCommand && record.portableTextCommand), records.length ? `${records.length} record(s)` : 'no persistent records yet'),
  check('HRI07', 'record command rejects contradictory native and portable claims', contradictoryRun.status !== 0 && contradictoryData?.status === 'failed' && contradictoryData?.errors?.some((item) => item.includes('native slash-command records cannot also claim portable text-command routing')) && contradictoryData?.errors?.some((item) => item.includes('native slash-command records cannot rely on a generated pointer file')), 'record-host-invocation contradictory native/portable dry-run'),
  check('HRI08', 'persistent host invocation records do not mix native proof with portable or generated-pointer proof', recordsHaveNoContradictoryClaims, records.length ? `${records.length} record(s)` : 'no persistent records yet'),
  check('HRI09', 'accepted persistent host invocation records carry verification commands and no pending owner acceptance', acceptedRecordsAreSelfVerifying, records.length ? `${records.length} record(s)` : 'no persistent records yet'),
  check('HRI10', 'accepted host invocation records do not rely on generated pointer proof', acceptedPointerRun.status !== 0 && acceptedPointerData?.status === 'failed' && acceptedPointerData?.errors?.some((item) => item.includes('accepted host invocation records must not rely on a generated pointer file')) && acceptedRecordsDoNotRelyOnGeneratedPointers, records.length ? `${records.length} record(s)` : 'record-host-invocation accepted pointer dry-run'),
]

fs.rmSync(fixture, { recursive: true, force: true })

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  recordsDir,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    hostRuntimeInvocationRecords: failed === 0 ? 'verified' : 'failed',
    realHostNativeSlashCommandRecords: nativeRecords.length,
    realHostPortableTextCommandRecords: portableRecords.length,
  },
  inventory: {
    records: records.length,
    closeableRecords: closeableRecords.length,
    hosts: hostNames,
    nativeSlashCommandRecords: nativeRecords.length,
    portableTextCommandRecords: portableRecords.length,
  },
  limits: [
    'This audit verifies host invocation record mechanics and parses any persistent records under .gse/evidence/host-invocations.',
    'It does not create runtime evidence for a host by itself.',
    'Native slash-command support remains unverified for a host until a persistent verified or accepted record states native slash-command support true.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Host Runtime Invocation Records Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Records: ' + data.inventory.records)
  lines.push('- Hosts: ' + (data.inventory.hosts.length ? data.inventory.hosts.join(', ') : 'none'))
  lines.push('- Native slash-command records: ' + data.inventory.nativeSlashCommandRecords)
  lines.push('- Portable text-command records: ' + data.inventory.portableTextCommandRecords)
  lines.push('')
  lines.push('## Checks')
  lines.push('')
  for (const item of data.checks) {
    const marker = item.status === 'passed' ? '[x]' : '[ ]'
    lines.push('- ' + marker + ' ' + item.id + ' ' + item.label + ': ' + item.evidence)
  }
  lines.push('')
  lines.push('## Limits')
  lines.push('')
  for (const item of data.limits) lines.push('- ' + item)
  return lines.join('\n') + '\n'
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(renderMarkdown(report))

if (failed > 0) process.exit(1)
