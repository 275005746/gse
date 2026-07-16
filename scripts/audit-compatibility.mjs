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
const jsonOnly = args.includes('--json')
const compatibilityPath = path.join(root, 'references', 'compatibility.md')
const hostAdaptersPath = path.join(root, 'references', 'host-adapters.md')
const toolAdaptersPath = path.join(root, 'references', 'tool-adapters.md')
const generatedCodexAdapter = path.join(root, 'examples', 'agent-runtime-host', '.codex', 'gse-adapter.md')
const generatedClaudeAdapter = path.join(root, 'examples', 'agent-runtime-host', '.claude', 'gse-adapter.md')

function read(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

const compatibility = read(compatibilityPath)
const hostAdapters = read(hostAdaptersPath)
const toolAdapters = read(toolAdaptersPath)
const codexAdapter = read(generatedCodexAdapter)
const claudeAdapter = read(generatedClaudeAdapter)

const requiredHosts = [
  'Codex-style',
  'Claude Code-style',
  'Hermes/AION-style runtime',
  'WorkBuddy/other IDE agents',
  'Copilot/Gemini-style assistants',
  'Unknown or custom host',
]
const allowedStatuses = ['verified', 'documented', 'unknown', 'unavailable']
const riskyCapabilities = ['Subagents', 'MCP', 'LSP/index', 'Browser/Playwright', 'Hooks/plugins']

function extractTableRows(markdown, heading) {
  const lines = markdown.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() === '## ' + heading)
  if (start === -1) return []
  const rows = []
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (line.startsWith('## ')) break
    if (!line.startsWith('|')) continue
    if (/^\|\s*-/.test(line)) continue
    rows.push(line)
  }
  return rows
}

function rowCells(row) {
  return row
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim())
}

function statusesInText(text) {
  const matches = text.match(/`([^`]+)`/g) ?? []
  return matches.map((item) => item.slice(1, -1)).filter((item) => allowedStatuses.includes(item))
}

const hostRows = extractTableRows(compatibility, 'Host Matrix')
const capabilityRows = extractTableRows(compatibility, 'Capability Matrix')
const hostRowText = hostRows.join('\n')
const capabilityMap = new Map(capabilityRows.map((row) => {
  const cells = rowCells(row)
  return [cells[0], cells]
}))

const codexHostRow = hostRows.find((row) => row.includes('| Codex-style |')) ?? ''
const claudeHostRow = hostRows.find((row) => row.includes('| Claude Code-style |')) ?? ''
const riskyRows = riskyCapabilities.map((name) => ({ name, cells: capabilityMap.get(name) ?? [] }))
const riskyVerifiedRows = riskyRows.filter((row) => row.cells.slice(1, 6).some((cell) => cell.includes('`verified`')))
const statusBackticks = new Set((hostRows.join('\n') + '\n' + capabilityRows.join('\n') + '\n' + compatibility.match(/## Status Vocabulary[\s\S]*?## Portable Source Of Truth/)?.[0]).match(/`([^`]+)`/g)?.map((item) => item.slice(1, -1)) ?? [])
const suspiciousStatusLabels = [...statusBackticks].filter((item) => {
  if (allowedStatuses.includes(item)) return false
  if (item === '.gse/' || item.startsWith('examples/') || item.startsWith('scripts/') || item.startsWith('references/') || item.startsWith('assets/')) return false
  return /verified|documented|unknown|unavailable/i.test(item)
})

const checks = [
  check('C01', 'compatibility reference exists', fs.existsSync(compatibilityPath), 'references/compatibility.md'),
  check('C02', 'required host families are represented', requiredHosts.every((host) => hostRowText.includes(host)), requiredHosts.join(', ')),
  check('C03', 'status vocabulary is defined', allowedStatuses.every((status) => compatibility.includes('`' + status + '`')), allowedStatuses.join(', ')),
  check('C04', 'no suspicious status labels appear', suspiciousStatusLabels.length === 0, suspiciousStatusLabels.length === 0 ? 'only allowed status labels detected' : suspiciousStatusLabels.join(', ')),
  check('C05', 'portable source-of-truth rule is present', compatibility.includes('`.gse/` is the portable source of truth') && hostAdapters.includes('`.gse/` is the portable source of truth'), 'compatibility.md and host-adapters.md'),
  check('C06', 'generated Codex and Claude adapters point to .gse', codexAdapter.includes('Source of truth: `.gse/`.') && claudeAdapter.includes('Source of truth: `.gse/`.'), 'examples/agent-runtime-host host adapters'),
  check('C07', 'Codex/Claude verified claims cite local evidence', codexHostRow.includes('`verified`') && codexHostRow.includes('examples/agent-runtime-host/.codex/gse-adapter.md') && claudeHostRow.includes('`verified`') && claudeHostRow.includes('examples/agent-runtime-host/.claude/gse-adapter.md'), 'host matrix evidence cells'),
  check('C08', 'risky host capabilities are not marked verified without current evidence', riskyVerifiedRows.length === 0, riskyVerifiedRows.length === 0 ? 'subagents/MCP/LSP/browser/hooks remain non-verified' : riskyVerifiedRows.map((row) => row.name).join(', ')),
  check('C09', 'adoption rules require current-session verification', compatibility.includes('Record host-specific commands, hooks, MCP servers, subagents, models, browser tools, and indexes as `unknown` until checked in that project/session.') && compatibility.includes('Use `verified` only when current evidence proves the claim.'), 'Adoption Rules'),
  check('C10', 'related references route through compatibility matrix', hostAdapters.includes('references/compatibility.md') && toolAdapters.includes('references/compatibility.md'), 'host-adapters.md and tool-adapters.md'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: { compatibilityMatrix: failed === 0 ? 'verified' : 'failed' },
  limits: [
    'Compatibility audit verifies documented support claims and source-of-truth invariants; it does not prove runtime host capabilities.',
    'Generated host pointer claims are allowed as verified by current local evidence; runtime execution still requires host invocation records.',
    'Subagents, MCP, LSP/index, browser, hooks/plugins, and provider model routing remain project/session-specific until separately verified.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Compatibility Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Compatibility matrix: ' + data.workflows.compatibilityMatrix)
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
