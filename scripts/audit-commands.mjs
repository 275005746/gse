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

function read(relativePath) {
  const fullPath = path.join(root, relativePath)
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : ''
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath))
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

const skill = read('SKILL.md')
const commands = read('references/commands.md')
const router = read('references/router.md')
const validate = read('scripts/validate-gse.mjs')

const requiredCommands = [
  '/gse help',
  '/gse init',
  '/gse adopt',
  '/gse continue',
  '/gse stage',
  '/gse discover',
  '/gse status',
  '/gse doctor',
  '/gse repair',
  '/gse acceptance',
  '/gse owner-actions',
  '/gse probe',
  '/gse release',
  '/gse package',
  '/gse install',
  '/gse public-release',
  '/gse change',
  '/gse slice',
  '/gse verify',
  '/gse learn',
  '/gse audit',
  '/gse close',
]

const checks = [
  check('CMD01', 'commands reference exists', exists('references/commands.md'), 'references/commands.md'),
  check('CMD02', 'SKILL routes command-style usage to commands reference', skill.includes('references/commands.md') && skill.includes('/gse ...'), 'SKILL.md'),
  check('CMD03', 'all required commands are documented', requiredCommands.every((item) => commands.includes(item)), requiredCommands.join(', ')),
  check('CMD04', 'commands preserve host-neutral slash-command boundary', commands.includes('host-neutral command semantics') && commands.includes('do not prove that the current host has native slash-command support'), 'references/commands.md'),
  check('CMD05', 'commands preserve evidence and acceptance boundaries', commands.includes('result -> verified -> accepted') && commands.includes('/gse close` is read-only in the portable command runner') && commands.includes('archive a named change pack after evidence exists'), 'references/commands.md'),
  check('CMD06', 'router references command-style usage', router.includes('references/commands.md') && router.includes('/gse'), 'references/router.md'),
  check('CMD07', 'validate-gse runs command audit', validate.includes('audit-commands.mjs'), 'scripts/validate-gse.mjs'),
  check('CMD08', 'short CLI wrapper exists and is documented', exists('scripts/gse.mjs') && skill.includes('scripts/gse.mjs') && commands.includes('scripts/gse.mjs') && read('README.md').includes('scripts/gse.mjs') && read('README.zh-CN.md').includes('scripts/gse.mjs'), 'scripts/gse.mjs, SKILL.md, README.md, README.zh-CN.md, references/commands.md'),
  check('CMD09', 'owner-actions compact output is documented for owner handoff', skill.includes('/gse owner-actions" --json --compact') && commands.includes('/gse owner-actions" --json --compact') && commands.includes('without local runner diagnostics'), 'SKILL.md, references/commands.md'),
  check('CMD10', 'probe command is documented as owner/external evidence preflight', skill.includes('/gse probe --public-repo-url') && commands.includes('/gse probe --public-repo-url') && commands.includes('waiting-for-input') && commands.includes('does not publish, approve, configure, or accept'), 'SKILL.md, references/commands.md'),
  check('CMD11', 'release command is documented as dry-run by default and write-only with execute', commands.includes('/gse release') && commands.includes('dry-run') && commands.includes('Only write a bundle when the command is run with `--execute`') && commands.includes('does not publish a package'), 'references/commands.md'),
  check('CMD12', 'public-release command is documented as checklist/runway and not acceptance', skill.includes('/gse public-release') && commands.includes('/gse public-release') && commands.includes('ordered public release checklist') && commands.includes('does not publish, approve, configure, or accept'), 'SKILL.md, references/commands.md'),
  check('CMD13', 'package/install commands expose installability without claiming publication', skill.includes('/gse package') && skill.includes('/gse install') && commands.includes('/gse package') && commands.includes('/gse install') && commands.includes('Only write a package when the command is run with `--execute`') && commands.includes('Only write the install target when the command is run with `--execute`') && commands.includes('does not publish to a registry'), 'SKILL.md, references/commands.md'),
  check('CMD14', 'close command is documented as read-only readiness check', commands.includes('| `/gse close` | Check whether the current slice is ready to close') && commands.includes('/gse close` is read-only in the portable command runner') && commands.includes('close-change.mjs --target <project-root> --change-id <change-id>'), 'references/commands.md'),
  check('CMD15', 'learn command is documented as execute-gated learning capture', commands.includes('| `/gse learn` | Record a reusable lesson') && commands.includes('/gse learn --summary') && commands.includes('Append the entry only when `--execute` is supplied') && skill.includes('scripts/record-learning.mjs'), 'SKILL.md, references/commands.md'),
  check('CMD16', 'repair command is documented as diagnostic by default and execute-gated for safe repair', commands.includes('| `/gse repair` | Diagnose or repair stale state') && commands.includes('/gse repair') && commands.includes('Automatic writes are limited to reversible residual-risk compaction') && skill.includes('audit-state-repair.mjs'), 'SKILL.md, references/commands.md'),
  check('CMD17', 'discover command documents options choice and explicit Goal Spec promotion', commands.includes('| `/gse discover') && commands.includes('generate-goal-discovery-packet.mjs') && commands.includes('promote-goal-discovery.mjs') && commands.includes('--select') && commands.includes('--promote --execute') && commands.includes('discovery output, selected path, and promoted Goal/Spec'), 'SKILL.md, references/commands.md'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: { commandSemantics: failed === 0 ? 'verified' : 'failed' },
  limits: [
    'This audit verifies GSE command semantics, not native slash-command support in any host.',
    'Host-specific command adapters still need project/session-specific evidence.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Command Semantics Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Command semantics: ' + data.workflows.commandSemantics)
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
