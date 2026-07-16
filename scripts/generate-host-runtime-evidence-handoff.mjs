#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

function hasArg(name) {
  return args.includes(name)
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const out = path.resolve(readArg('--out', path.join(root, '.gse', 'acceptance', 'host-runtime-evidence-handoff.md')))
const displayRoot = readArg('--display-root', '<gse-root>')
const jsonOnly = hasArg('--json')
const dryRun = hasArg('--dry-run')
const force = hasArg('--force')

function read(relativePath) {
  const fullPath = path.join(root, relativePath)
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8').replace(/^\uFEFF/, '') : ''
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  })
  return {
    status: result.status ?? 1,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
    command: [command, ...commandArgs].join(' '),
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function runHostAudit() {
  const result = run(process.execPath, [path.join(root, 'scripts', 'audit-host-runtime-invocations.mjs'), '--root', root, '--json'])
  if (result.status !== 0) {
    return { ok: false, error: 'host runtime invocation audit failed', result }
  }
  const data = parseJson(result.stdout)
  if (!data) return { ok: false, error: 'host runtime invocation audit returned invalid JSON', result }
  return { ok: true, data, command: result.command }
}

function hostRowsFromCompatibility() {
  const text = read('references/compatibility.md')
  const rows = []
  let inHostMatrix = false
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '## Host Matrix') {
      inHostMatrix = true
      continue
    }
    if (inHostMatrix && line.startsWith('## ')) break
    if (!inHostMatrix) continue
    if (!line.startsWith('| ')) continue
    if (line.includes('---') || line.includes('Host family')) continue
    const cells = line.split('|').map((item) => item.trim()).filter(Boolean)
    if (cells.length < 6) continue
    rows.push({
      hostFamily: cells[0],
      adapterLocation: cells[1],
      sourcePointer: cells[2],
      currentStatus: cells[3].replace(/`/g, ''),
      evidence: cells[4],
      fallback: cells[5],
    })
  }
  return rows
}

function commandFor(hostFamily) {
  const safeHost = hostFamily.replace(/\|/g, '').replace(/\s+/g, ' ').trim()
  return [
    'node __GSE__/scripts/record-host-invocation.mjs',
    '--root __PROJECT_OR_GSE__',
    `--host "${safeHost}"`,
    '--host-version "__VERSION_OR_UNKNOWN__"',
    '--project "__PROJECT_NAME__"',
    '--adapter-path "__HOST_ADAPTER_OR_POINTER__"',
    '--invocation-method "__NATIVE_SLASH_COMMAND_OR_PORTABLE_TEXT_COMMAND_OR_HOST_UI_COMMAND_OR_RUNTIME_BRIDGE__"',
    '--command "/gse continue"',
    '--status verified',
    '--evidence-owner "__PERSON_OR_AGENT__"',
    '--evidence "__THREAD_ID_TRANSCRIPT_SCREENSHOT_TERMINAL_OUTPUT_OR_HOST_LOG__"',
    '--portable-text-command true|false',
    '--native-slash-command true|false',
    '--generated-pointer true|false',
    '--owner-acceptance-required false',
    '--out __PROJECT_OR_GSE__/.gse/evidence/host-invocations/__DATE__-__HOST__-gse.md',
  ].join(' ')
}

function renderHandoff(audit, hostRows) {
  const inventory = audit.inventory ?? {}
  const lines = []
  lines.push('# GSE Host Runtime Evidence Handoff')
  lines.push('')
  lines.push('Generated: ' + new Date().toISOString())
  lines.push('Root: ' + displayRoot)
  lines.push('')
  lines.push('## Purpose')
  lines.push('')
  lines.push('Turn cross-host support into auditable runtime evidence. Generated adapters, docs, or command pointers are useful setup, but they are not proof that a host actually invoked GSE.')
  lines.push('')
  lines.push('## Fast Path')
  lines.push('')
  lines.push('- Native slash-command evidence is the final external gate.')
  lines.push('- If a host can invoke `/gse continue` natively, record that first.')
  lines.push('- Use portable text-command records only when native slash-command proof is unavailable.')
  lines.push('- Keep host capability status separate from portable `.gse/` workflow status.')
  lines.push('')
  lines.push('## Current Runtime Evidence')
  lines.push('')
  lines.push('- Host runtime invocation records: ' + (inventory.records ?? 0))
  lines.push('- Verified or accepted records: ' + (inventory.closeableRecords ?? 0))
  lines.push('- Hosts with records: ' + (inventory.hosts?.length ? inventory.hosts.join(', ') : 'none'))
  lines.push('- Native slash-command records: ' + (inventory.nativeSlashCommandRecords ?? 0))
  lines.push('- Portable text-command records: ' + (inventory.portableTextCommandRecords ?? 0))
  lines.push('- Audit command: `node scripts/audit-host-runtime-invocations.mjs --root __GSE_OR_PROJECT__ --json`')
  lines.push('')
  lines.push('## Host Evidence Plan')
  lines.push('')
  for (const host of hostRows) {
    lines.push('### ' + host.hostFamily)
    lines.push('')
    lines.push('- Adapter location: ' + host.adapterLocation)
    lines.push('- Current matrix status: ' + host.currentStatus)
    lines.push('- Existing evidence: ' + host.evidence)
    lines.push('- Fallback: ' + host.fallback)
    lines.push('- Required runtime proof: a persistent record under `.gse/evidence/host-invocations/` produced by `record-host-invocation.mjs` or manually matching the same fields.')
    lines.push('- Record command:')
    lines.push('')
    lines.push('```bash')
    lines.push(commandFor(host.hostFamily))
    lines.push('```')
    lines.push('')
  }
  lines.push('## Verification')
  lines.push('')
  lines.push('Run these commands after adding host evidence:')
  lines.push('')
  lines.push('```bash')
  lines.push('node scripts/audit-host-runtime-invocations.mjs --root __GSE_OR_PROJECT__ --json')
  lines.push('node scripts/audit-final-readiness.mjs --root __GSE_OR_PROJECT__ --json')
  lines.push('node scripts/validate-gse.mjs --root __GSE_OR_PROJECT__ --json')
  lines.push('```')
  lines.push('')
  lines.push('## Anti-Overclaim')
  lines.push('')
  lines.push('- Do not claim native slash-command support from generated pointers or portable text-command records.')
  lines.push('- Do not claim a host is supported without a host runtime invocation record for that host.')
  lines.push('- Do not mark a host record accepted when `owner-acceptance-required` is true.')
  lines.push('- Keep host capability status separate from portable `.gse/` workflow status.')
  lines.push('- Treat subagents, MCP, LSP, browser tools, hooks, and plugins as host/session-specific until current evidence proves them.')
  lines.push('')
  lines.push('## Next Action')
  lines.push('')
  lines.push('Record real invocation evidence for Claude Code-style, Hermes/AION-style, WorkBuddy/other IDE agents, and any host-native slash-command mechanism that becomes available. Start with native slash-command proof when the host supports it.')
  return lines.join('\n') + '\n'
}

const audit = runHostAudit()
if (!audit.ok) {
  console.error(JSON.stringify({ status: 'failed', root, out, error: audit.error, auditResult: audit.result }, null, 2))
  process.exit(1)
}

const hostRows = hostRowsFromCompatibility()
const handoff = renderHandoff(audit.data, hostRows)

if (!dryRun) {
  if (fs.existsSync(out) && !force) {
    console.error(JSON.stringify({ status: 'exists', root, out, error: 'output exists; pass --force to overwrite' }, null, 2))
    process.exit(1)
  }
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, handoff, 'utf8')
}

const report = {
  status: dryRun ? 'ready' : 'written',
  root,
  out,
  dryRun,
  hostAuditCommand: audit.command,
  summary: {
    hostFamilies: hostRows.length,
    records: audit.data.inventory?.records ?? 0,
    nativeSlashCommandRecords: audit.data.inventory?.nativeSlashCommandRecords ?? 0,
    portableTextCommandRecords: audit.data.inventory?.portableTextCommandRecords ?? 0,
  },
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(handoff)
