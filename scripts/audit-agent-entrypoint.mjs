#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1] ?? fallback
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const jsonOnly = args.includes('--json')

function read(relativePath) {
  const absolutePath = path.join(root, relativePath)
  return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, 'utf8').replace(/^\uFEFF/, '') : ''
}

function check(id, label, passed, evidence, risk = '') {
  return { id, label, status: passed ? 'passed' : 'failed', evidence, risk }
}

const entrypoint = read('AGENTS.md')
const codexAdapter = read('.codex/gse-adapter.md')
const codexCommand = read('.codex/gse-command.md')
const claudeAdapter = read('.claude/gse-adapter.md')
const claudeCommand = read('.claude/commands/gse.md')
const packageJson = read('package.json')
const validationProfile = read('scripts/run-validation-profile.mjs')
const validator = read('scripts/validate-gse.mjs')

const requiredRoutes = [
  '.gse/project-profile.md',
  '.gse/state.json',
  '.gse/current-slice.md',
  '.gse/goal-map.md',
  '.gse/quality-gates.md',
  'references/commands.md',
  'references/router.md',
  'references/stage-orchestrator.md',
]
const continuationContract = [
  'Cross-Session Continuation',
  'currentSlice',
  'nextAction',
  '/gse continue --json --compact',
  'same top-level Plan Unit',
  'do not create or dispatch Host tasks',
  'public acceptance',
]
const capabilityRegistries = [
  '.gse/host-capabilities.md',
  '.gse/skills/',
  '.gse/plugins/',
  '.gse/hooks/',
  '.gse/mcp/',
  '.gse/lsp/',
]
const adapters = [codexAdapter, codexCommand, claudeAdapter, claudeCommand]

const checks = [
  check('AE01', 'repository AGENTS.md entrypoint exists', Boolean(entrypoint), 'AGENTS.md'),
  check('AE02', 'entrypoint declares .gse as portable source of truth', /portable source of truth/i.test(entrypoint) && /\.gse\//.test(entrypoint), 'AGENTS.md portable source section'),
  check('AE03', 'entrypoint routes state, commands, stages, goals, and quality gates', requiredRoutes.every((route) => entrypoint.includes(route)), requiredRoutes.join(', ')),
  check('AE04', 'entrypoint exposes capability registries', capabilityRegistries.every((route) => entrypoint.includes(route)), capabilityRegistries.join(', ')),
  check('AE05', 'entrypoint preserves capability status vocabulary', ['verified', 'documented', 'unknown', 'unavailable', 'external-required'].every((status) => entrypoint.includes(status)), 'capability status vocabulary'),
  check('AE06', 'entrypoint rejects pointer and generated-file runtime overclaims', /pointer|generated/i.test(entrypoint) && /runtime proof/i.test(entrypoint), 'adapter claim boundary'),
  check('AE07', 'Codex and Claude adapters point to AGENTS.md and .gse', adapters.every((text) => text.includes('AGENTS.md') && text.includes('.gse/')), 'four host pointer files'),
  check('AE08', 'host adapters preserve native runtime claim boundaries', /does not prove native/i.test(codexAdapter) && /does not prove native/i.test(claudeAdapter) && /not proof of a native/i.test(codexCommand) && /do not mark.*slash commands.*verified/is.test(claudeCommand), 'Codex and Claude pointer boundaries'),
  check('AE09', 'package includes the shared entrypoint', packageJson.includes('AGENTS.md'), 'package.json files'),
  check('AE10', 'focused audit is wired into Lite and consolidated validation', validationProfile.includes('audit-agent-entrypoint.mjs') && validator.includes('audit-agent-entrypoint.mjs'), 'validation wiring'),
  check('AE11', 'entrypoint defines a bounded cross-session continuation contract', continuationContract.every((item) => entrypoint.includes(item)), continuationContract.join(', ')),
  check('AE12', 'cross-session handoff does not depend on prior conversation history', /without relying on prior conversation history/i.test(entrypoint) && /claim boundary is preserved/i.test(entrypoint), 'portable handoff boundary'),
]

const failed = checks.filter((item) => item.status === 'failed').length
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed: checks.length - failed, failed, total: checks.length },
  workflows: {
    repositoryAgentEntrypoint: failed === 0 ? 'verified' : 'incomplete',
    thinHostAdapters: failed === 0 ? 'verified' : 'incomplete',
  },
  checks,
  limits: [
    'This audit verifies repository routing and adapter claim boundaries.',
    'It does not prove native slash-command invocation or runtime availability of optional host tools.',
  ],
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(JSON.stringify(report, null, 2))
if (failed > 0) process.exit(1)
