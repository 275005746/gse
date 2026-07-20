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
const target = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-command-adapter-'))
const script = path.join(root, 'scripts', 'generate-command-adapter.mjs')

function run(commandArgs) {
  return spawnSync(process.execPath, [script, ...commandArgs], { cwd: root, encoding: 'utf8', windowsHide: true })
}

function parseJson(text) {
  try { return JSON.parse(text) } catch { return null }
}

function read(relativePath) {
  const fullPath = path.join(target, relativePath)
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : ''
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

const firstRun = run(['--target', target, '--host', 'all', '--json'])
const first = parseJson(firstRun.stdout)
const secondRun = run(['--target', target, '--host', 'all', '--json'])
const second = parseJson(secondRun.stdout)
const invalidRun = run(['--target', target, '--host', 'unknown'])
const claudeCommand = read(path.join('.claude', 'commands', 'gse.md'))
const codexPointer = read(path.join('.codex', 'gse-command.md'))
const hermesPointer = read(path.join('.gse', 'host-adapters', 'hermes-runtime.md'))
const workbuddyPointer = read(path.join('.gse', 'host-adapters', 'workbuddy.md'))
const genericPointer = read(path.join('.gse', 'host-adapters', 'generic-agent.md'))
const copilotPointer = read(path.join('.github', 'copilot-instructions.md'))
const geminiPointer = read('GEMINI.md')
const expectedHosts = ['claude', 'codex', 'hermes', 'workbuddy', 'copilot', 'gemini', 'generic']
const pointerHosts = ['codex', 'hermes', 'workbuddy', 'copilot', 'gemini', 'generic']
const firstResultByHost = new Map((first?.results ?? []).map((item) => [item.host, item]))

const adapterContents = [claudeCommand, codexPointer, hermesPointer, workbuddyPointer, copilotPointer, geminiPointer, genericPointer]
const checks = [
  check('CMDAD01', 'command adapter generator exists', fs.existsSync(script), 'scripts/generate-command-adapter.mjs'),
  check('CMDAD02', 'first run writes all supported command adapters', firstRun.status === 0 && first?.results?.length === expectedHosts.length && expectedHosts.every((host) => firstResultByHost.get(host)?.status === 'written'), 'first run written count: ' + expectedHosts.length),
  check('CMDAD03', 'Claude adapter creates native slash-command path', claudeCommand.includes('# /gse') && first?.results?.some((item) => item.host === 'claude' && item.nativeSlashCommand === true && item.relativePath === '.claude/commands/gse.md'), '.claude/commands/gse.md'),
  check('CMDAD04', 'Codex adapter is honest pointer, not false native claim', codexPointer.includes('not proof of a native project-level /gse slash-command mechanism') && first?.results?.some((item) => item.host === 'codex' && item.nativeSlashCommand === false), '.codex/gse-command.md'),
  check('CMDAD05', 'adapters route back to portable GSE files', [claudeCommand, codexPointer, hermesPointer, workbuddyPointer, copilotPointer, geminiPointer, genericPointer].every((content) => content.includes('.gse/project-profile.md') && content.includes('.gse/state.json') && content.includes('.gse/goal-map.md') && content.includes('.gse/quality-gates.md')), 'adapter contents'),
  check('CMDAD06', 'rerun skips existing adapters by default', secondRun.status === 0 && second?.results?.every((item) => item.status === 'skipped'), 'second run skipped'),
  check('CMDAD07', 'unsupported host fails clearly', invalidRun.status === 1, 'invalid host exit 1'),
  check('CMDAD08', 'portable pointer adapters are generated for Hermes, WorkBuddy, Copilot, Gemini, and generic hosts', hermesPointer.includes('Hermes/AION Runtime GSE Adapter') && workbuddyPointer.includes('WorkBuddy GSE Adapter') && copilotPointer.includes('GitHub Copilot GSE Adapter') && geminiPointer.includes('Gemini GSE Adapter') && genericPointer.includes('Generic Agent GSE Adapter'), 'portable adapter files'),
  check('CMDAD09', 'non-Claude adapters do not claim native slash-command support', pointerHosts.every((host) => firstResultByHost.get(host)?.nativeSlashCommand === false) && [codexPointer, hermesPointer, workbuddyPointer, copilotPointer, geminiPointer, genericPointer].every((content) => content.includes('does not prove native /gse slash-command support') || content.includes('not proof of a native project-level /gse slash-command mechanism')), 'nativeSlashCommand false for portable pointers'),
  check('CMDAD10', 'portable pointers require current-session evidence before verified host tool claims', [hermesPointer, workbuddyPointer, copilotPointer, geminiPointer, genericPointer].every((content) => content.includes('unknown until') || content.includes('unless this host/session produced current evidence')), 'host capability honesty'),
  check('CMDAD11', 'all adapters consume one host-neutral continuation protocol', adapterContents.every((content) => content.includes('gse-host-native-continuation') && content.includes('topLevelPlanUnitId') && content.includes('canAutoContinue') && content.includes('requiresHostReinjection')), 'shared continuation protocol block'),
  check('CMDAD12', 'unknown hosts use turn-controlled fallback and adapters never launch another host', adapterContents.every((content) => content.includes('Unknown capability is host-turn-controlled') && content.includes('Never invoke another Agent host')) && adapterContents.every((content) => !/(?:spawn|start|launch|exec)\s+(?:claude|codex)/i.test(content)), 'turn-controlled fallback and no cross-host launcher'),
  check('CMDAD13', 'generated adapters report shape evidence without runtime overclaim', first?.results?.every((item) => item.verificationLevel === 'generated-shape-only'), first?.results),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    claudeNativeSlashCommandAdapter: failed === 0 ? 'generated-shape-verified' : 'failed',
    codexCommandPointerAdapter: failed === 0 ? 'generated-shape-verified' : 'failed',
    portableHostPointerAdapters: failed === 0 ? 'generated-shape-verified' : 'failed',
  },
  limits: [
    'This audit verifies generated adapter files and command routing.',
    'It does not execute Claude Code or Codex host runtimes.',
    'Codex project-level native slash-command support remains unverified.',
    'Hermes, WorkBuddy, Copilot, Gemini, and generic adapters are pointer files only until runtime invocation records exist.',
  ],
  checks,
}

fs.rmSync(target, { recursive: true, force: true })

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(JSON.stringify(report, null, 2))

if (failed > 0) process.exit(1)
