#!/usr/bin/env node
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

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    windowsHide: true,
    shell: Boolean(options.shell),
  })
  return {
    status: result.status ?? 1,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
    command: options.shell ? command : [command, ...commandArgs].join(' '),
  }
}

function parseJson(stdout) {
  try {
    return JSON.parse(stdout)
  } catch {
    return null
  }
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

function shellQuote(value) {
  return JSON.stringify(String(value))
}

const fixtureValues = {
  __GSE__: root,
  __PUBLIC_REPO_URL__: 'https://github.com/example/gse',
  __PUBLIC_CI_RUN_URL__: 'https://github.com/example/gse/actions/runs/123456789',
  __COMMIT_SHA__: '0123456789abcdef0123456789abcdef01234567',
  __BRANCH__: 'main',
  __REQUIRED_CHECKS__: shellQuote('Validate GSE'),
  __OWNER__: 'fixture-owner',
  __YYYY_MM_DD__: '2026-07-07',
  __SETTINGS_EVIDENCE_URL__: 'https://github.com/example/gse/settings/branches',
  __URL_OR_RECORD__: 'https://example.com/security',
  __EMAIL_URL_GITHUB_SECURITY_ADVISORY_OTHER__: 'url',
  __PUBLIC_CONTACT__: 'https://example.com/security',
  __REGISTRY_NAME__: 'npm',
  __REGISTRY_PACKAGE_URL__: 'https://registry.example/gse',
  __MARKETPLACE_NAME__: 'ExampleMarketplace',
  __MARKETPLACE_LISTING_URL__: 'https://marketplace.example/gse',
  __VERSION__: '1.0.0',
  __DIGEST__: 'sha256:fixture',
  __HOST__: 'FixtureHost',
  __VERSION_OR_UNKNOWN__: 'fixture-host-1.0.0',
  __HOST_ADAPTER_OR_COMMAND_PATH__: 'adapters/fixture-native-command.md',
  __HOST_ADAPTER_OR_POINTER__: 'adapters/fixture-pointer.md',
  __HOST_ADAPTER_OR_RUNTIME_ENTRYPOINT__: 'adapters/fixture-runtime-entrypoint.md',
  __THREAD_TRANSCRIPT_SCREENSHOT_OR_HOST_LOG__: 'fixture-native-host-log',
  __THREAD_TRANSCRIPT_SCREENSHOT_TERMINAL_OUTPUT_OR_HOST_LOG__: 'fixture-other-host-log',
  __PORTABLE_TEXT_COMMAND_HOST_UI_COMMAND_RUNTIME_BRIDGE__: 'runtime-bridge',
  __HOST_UI_COMMAND_RUNTIME_BRIDGE_PLUGIN_COMMAND_AGENT_COMMAND__: 'runtime-bridge',
}

function substituteCommand(command) {
  let substituted = command
  for (const [placeholder, value] of Object.entries(fixtureValues)) {
    substituted = substituted.split(placeholder).join(value)
  }
  return substituted
}

function unresolvedPlaceholders(command) {
  return [...command.matchAll(/__[A-Z0-9_]+__/g)].map((match) => match[0])
}

const readiness = run(process.execPath, [path.join(root, 'scripts', 'audit-public-acceptance-readiness.mjs'), '--root', root, '--json'])
const readinessData = parseJson(readiness.stdout)
const pendingGates = readinessData?.pendingGates ?? []
const commandRuns = pendingGates.map((gate) => {
  const template = String(gate.preflightCommand ?? '')
  const command = substituteCommand(template)
  const unresolved = unresolvedPlaceholders(command)
  const hasAnglePlaceholder = /<[^>]+>/.test(command)
  const hasDryRunJson = command.includes('--dry-run') && command.includes('--json')
  const result = unresolved.length || hasAnglePlaceholder || !hasDryRunJson
    ? { status: 1, stdout: '', stderr: 'command template failed pre-execution checks', command }
    : run(command, [], { cwd: root, shell: true })
  const output = parseJson(result.stdout)

  return {
    area: gate.area,
    template,
    command,
    unresolved,
    hasAnglePlaceholder,
    hasDryRunJson,
    exitStatus: result.status,
    stdoutStatus: output?.status ?? 'unparsed',
    errors: Array.isArray(output?.errors) ? output.errors : [],
    stderr: result.stderr,
  }
})

const commandCount = commandRuns.length
const executedCount = commandRuns.filter((item) => item.exitStatus === 0).length
const templatesAreResolved = commandRuns.every((item) => item.unresolved.length === 0 && !item.hasAnglePlaceholder)
const templatesArePreflight = commandRuns.every((item) => item.hasDryRunJson)
const commandsExitCleanly = commandRuns.every((item) => item.exitStatus === 0)
const commandsReturnReady = commandRuns.every((item) => item.stdoutStatus === 'ready' && item.errors.length === 0)
const expectedPendingBoundary = readinessData?.summary?.publicAccepted === 'verified' ? commandCount === 0 : commandCount > 0

const checks = [
  check('PACD01', 'public acceptance readiness doctor runs before command drill', readiness.status === 0 && readinessData?.summary?.status === 'passed', readiness.command, readiness.stderr),
  check('PACD02', 'drill consumes generated pending gate preflight commands', expectedPendingBoundary && pendingGates.every((gate) => String(gate.preflightCommand ?? '').includes('--dry-run --json')), `${commandCount} command(s)`),
  check('PACD03', 'fixture substitution resolves shell-safe placeholders', templatesAreResolved, commandRuns.map((item) => `${item.area}:${item.unresolved.join(',') || 'resolved'}`).join('; ')),
  check('PACD04', 'all generated commands remain dry-run JSON preflights', templatesArePreflight, commandRuns.map((item) => `${item.area}:${item.hasDryRunJson}`).join('; ')),
  check('PACD05', 'substituted preflight commands execute with exit code 0', commandsExitCleanly, commandRuns.map((item) => `${item.area}:${item.exitStatus}`).join('; ')),
  check('PACD06', 'substituted preflight commands return ready without validation errors', commandsReturnReady, commandRuns.map((item) => `${item.area}:${item.stdoutStatus}${item.errors.length ? ':' + item.errors.join('|') : ''}`).join('; ')),
  check('PACD07', 'drill keeps public acceptance boundary honest', readinessData?.summary?.publicAccepted !== 'verified' || commandCount === 0, `publicAccepted=${readinessData?.summary?.publicAccepted ?? 'unknown'}; commands=${commandCount}`),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: {
    status: failed === 0 ? 'passed' : 'failed',
    passed,
    failed,
    total: checks.length,
    commandsChecked: commandCount,
    commandsExecuted: executedCount,
    publicAccepted: readinessData?.summary?.publicAccepted ?? 'unknown',
    pendingGates: readinessData?.summary?.pendingGates ?? 'unknown',
  },
  workflows: {
    publicAcceptanceCommandDryRunDrill: failed === 0 ? 'verified' : 'failed',
    publicAccepted: readinessData?.summary?.publicAccepted ?? 'unknown',
  },
  commandRuns,
  limits: [
    'This drill executes generated owner/external preflight command templates after fixture substitution.',
    'It proves command-template mechanics only; it does not create real public release, repository, CI, registry, marketplace, security, or host-runtime evidence.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Public Acceptance Command Dry-Run Drill')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Commands checked: ' + data.summary.commandsChecked)
  lines.push('- Commands executed: ' + data.summary.commandsExecuted)
  lines.push('- Public accepted: ' + data.summary.publicAccepted)
  lines.push('')
  lines.push('## Commands')
  lines.push('')
  if (data.commandRuns.length === 0) {
    lines.push('- None.')
  } else {
    for (const item of data.commandRuns) {
      lines.push('- ' + item.area + ': exit=' + item.exitStatus + ', status=' + item.stdoutStatus)
    }
  }
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
