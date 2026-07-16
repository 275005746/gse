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
const hostArg = readArg('--host', 'all')
const force = args.includes('--force')
const jsonOnly = args.includes('--json')

const hostConfigs = {
  codex: {
    title: 'Codex Adapter',
    path: path.join('.codex', 'gse-adapter.md'),
    bullets: [
      'Read `.gse/project-profile.md` before using host-specific tools.',
      'Mark subagent, MCP, browser, and LSP capabilities as verified only after current-session evidence.',
      'Use `references/compatibility.md` and `references/drift-audit.md` when adapter claims and current tools disagree.',
    ],
  },
  claude: {
    title: 'Claude Code Adapter',
    path: path.join('.claude', 'gse-adapter.md'),
    bullets: [
      'Commands and agents should point back to `.gse/` for goals, evidence, quality gates, and learning rules.',
      'Do not copy the goal map, quality gates, or evidence log into this folder.',
      'Use `references/compatibility.md` and `references/drift-audit.md` when adapter claims and current tools disagree.',
    ],
  },
}

function render(config) {
  return [
    '# ' + config.title,
    '',
    'Source of truth: `.gse/`.',
    '',
    ...config.bullets.map((item) => '- ' + item),
    '',
    'Capability status vocabulary: `verified`, `documented`, `unknown`, `unavailable`.',
    '',
  ].join('\n')
}

function writeAdapter(host) {
  const config = hostConfigs[host]
  if (!config) return { host, status: 'invalid', path: null }
  const fullPath = path.join(target, config.path)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  if (!force && fs.existsSync(fullPath)) return { host, status: 'skipped', path: fullPath, relativePath: config.path }
  fs.writeFileSync(fullPath, render(config).replace(/\n/g, '\r\n'), 'utf8')
  return { host, status: 'written', path: fullPath, relativePath: config.path }
}

const hosts = hostArg === 'all' ? Object.keys(hostConfigs) : hostArg.split(',').map((item) => item.trim()).filter(Boolean)
const invalid = hosts.filter((host) => !hostConfigs[host])
if (invalid.length) {
  console.error('Invalid --host value: ' + invalid.join(', ') + '. Expected codex, claude, or all.')
  process.exit(1)
}

const results = hosts.map(writeAdapter)
const report = { target, force, hosts, results }

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(JSON.stringify(report, null, 2))
