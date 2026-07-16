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

function preflightCommand(command) {
  if (!command || command === 'No command mapping exists yet.') return 'No command mapping exists yet.'
  if (command.includes('--dry-run')) return command
  return command + ' --dry-run --json'
}

function shellSafePlaceholders(command) {
  return command.replace(/<([^>]+)>/g, (_, label) => {
    const normalized = label
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
    return `__${normalized || 'VALUE'}__`
  })
}

const gateGuidance = {
  'License decision': {
    owner: 'project owner',
    command: 'node scripts/record-public-release.mjs --root <gse> --license-status selected --spdx <ID> --license-file <path> --approved-by <owner> --decision-date <YYYY-MM-DD> --evidence-status accepted',
    requiredEvidence: 'Owner-selected SPDX license and accepted evidence, or an owner-approved not-public decision.',
  },
  'Public security contact': {
    owner: 'project owner',
    command: 'node scripts/record-public-security-contact.mjs --root <gse> --contact-status accepted --contact-type <email|url|github-security-advisory|other> --contact-value <public-contact> --is-public true --security-policy-updated true --evidence-owner <owner> --evidence-date <YYYY-MM-DD> --evidence-url <url-or-record> --accepted-by <owner> --accepted-at <YYYY-MM-DD> --evidence-status accepted --force',
    requiredEvidence: 'Owner-approved vulnerability disclosure path, evidence URL or record, and accepted security contact status.',
  },
  'Public CI run': {
    owner: 'external CI',
    command: 'node scripts/record-public-ci-run.mjs --root <gse> --run-status accepted --run-conclusion success --repository-url <public-repo-url> --workflow-name "Validate GSE" --workflow-file .github/workflows/validate-gse.yml --run-url <public-ci-run-url> --commit-sha <commit-sha> --branch <branch> --required-checks <required-checks> --evidence-owner <owner> --evidence-date <YYYY-MM-DD> --evidence-url <public-ci-run-url> --verification-result passed --accepted-by <owner> --accepted-at <YYYY-MM-DD> --proves-public-ci-run true --proves-required-checks true --proves-release-commit true --evidence-status accepted --force',
    requiredEvidence: 'Real public CI run URL, commit SHA, branch, required checks, successful conclusion, and accepted evidence.',
  },
  'Public repository settings': {
    owner: 'repository owner',
    command: 'node scripts/record-public-repository-settings.mjs --root <gse> --settings-status accepted --repository-url <public-repo-url> --default-branch <branch> --visibility public --issues-enabled true --pull-requests-enabled true --security-policy-visible true --branch-protection-enabled true --required-status-checks-enabled true --required-checks <required-checks> --require-review-before-merge true --require-conversation-resolution true --restrict-force-pushes true --restrict-deletions true --evidence-owner <owner> --evidence-date <YYYY-MM-DD> --evidence-url <settings-evidence-url> --verification-result passed --accepted-by <owner> --accepted-at <YYYY-MM-DD> --evidence-status accepted --force',
    requiredEvidence: 'Real public repository URL, branch protection, required checks, maintainer policy, and accepted evidence.',
  },
  'Public registry publication': {
    owner: 'external registry',
    command: 'node scripts/record-public-channel-publication.mjs --root <gse> --publication-status accepted --channel-type package-registry --channel-name <registry-name> --channel-url <registry-package-url> --version <version> --artifact-digest <digest> --review-status published --evidence-owner <owner> --evidence-date <YYYY-MM-DD> --evidence-url <registry-package-url> --verification-result passed --accepted-by <owner> --accepted-at <YYYY-MM-DD> --proves-registry-publication true --proves-channel-installability true --evidence-status accepted --force',
    requiredEvidence: 'Real registry package URL, version, digest, publication date, verification command, and accepted evidence.',
  },
  'Marketplace approval': {
    owner: 'external marketplace',
    command: 'node scripts/record-public-channel-publication.mjs --root <gse> --publication-status accepted --channel-type marketplace --channel-name <marketplace-name> --channel-url <marketplace-listing-url> --version <version> --review-status approved --evidence-owner <owner> --evidence-date <YYYY-MM-DD> --evidence-url <marketplace-listing-url> --verification-result passed --accepted-by <owner> --accepted-at <YYYY-MM-DD> --proves-marketplace-approval true --proves-channel-installability true --evidence-status accepted --force',
    requiredEvidence: 'Real marketplace or catalog listing URL, approval/publication status, review date, and accepted evidence.',
  },
  'Native slash command': {
    owner: 'host runtime',
    command: 'node scripts/record-host-invocation.mjs --root <gse> --host <host> --host-version <version-or-unknown> --project gse --adapter-path <host-adapter-or-command-path> --invocation-method "native slash command" --command "/gse continue" --status accepted --evidence-owner <owner> --evidence <thread-transcript-screenshot-or-host-log> --verification-command "node scripts/audit-final-readiness.mjs --root <gse> --json" --native-slash-command true --portable-text-command false --generated-pointer false --owner-acceptance-required false --force',
    requiredEvidence: 'Real host runtime invocation evidence proving native slash-command behavior, not portable text routing.',
  },
  'Other host runtime invocation': {
    owner: 'host runtime',
    command: 'node scripts/record-host-invocation.mjs --root <gse> --host <host> --host-version <version-or-unknown> --project gse --adapter-path <host-adapter-or-runtime-entrypoint> --invocation-method <host-ui-command|runtime-bridge|plugin-command|agent-command> --command "/gse continue" --status accepted --evidence-owner <owner> --evidence <thread-transcript-screenshot-terminal-output-or-host-log> --verification-command "node scripts/audit-final-readiness.mjs --root <gse> --json" --native-slash-command false --portable-text-command false --generated-pointer false --owner-acceptance-required false --force',
    requiredEvidence: 'Real runtime invocation record for each claimed host, including evidence URL/path, accepted status, and no generated-pointer dependency.',
  },
}

const finalReadiness = run(process.execPath, [path.join(root, 'scripts', 'audit-final-readiness.mjs'), '--root', root, '--json'])
const finalReadinessData = parseJson(finalReadiness.stdout)
const matrix = finalReadinessData?.matrix ?? []
const pendingGates = matrix
  .filter((row) => row.status === 'owner-required' || row.status === 'external-required')
  .map((row) => {
    const rawCommand = gateGuidance[row.area]?.command ?? 'No command mapping exists yet.'
    const recordCommand = shellSafePlaceholders(rawCommand)
    return {
      area: row.area,
      status: row.status,
      currentEvidence: row.evidence,
      recordCommand,
      preflightCommand: preflightCommand(recordCommand),
      requiredEvidence: gateGuidance[row.area]?.requiredEvidence ?? 'Add explicit owner/external evidence, then re-run final readiness.',
      owner: gateGuidance[row.area]?.owner ?? 'unknown',
      willPromoteWhenAccepted: Boolean(gateGuidance[row.area]),
    }
  })

const expectedFinalGates = Object.keys(gateGuidance)
const pendingGateNames = new Set(pendingGates.map((gate) => gate.area))
const matrixGateNames = new Set(matrix.map((gate) => gate.area))
const currentPendingRowsHaveCommands = pendingGates.every((gate) => gate.recordCommand !== 'No command mapping exists yet.')
const currentPendingRowsHavePreflightCommands = pendingGates.every((gate) => gate.preflightCommand !== 'No command mapping exists yet.' && gate.preflightCommand.includes('--dry-run --json'))
const pendingCommandsAreExecutableTemplates = pendingGates.every((gate) =>
  !gate.recordCommand.includes('...') &&
  !gate.preflightCommand.includes('...') &&
  !/[<>]/.test(gate.recordCommand) &&
  !/[<>]/.test(gate.preflightCommand) &&
  !gate.recordCommand.includes('--invocation-status') &&
  !gate.preflightCommand.includes('--invocation-status') &&
  (gate.recordCommand.includes('record-host-invocation.mjs') ? gate.recordCommand.includes('--status accepted') : true),
)
const expectedGatesCoveredByMatrix = expectedFinalGates.every((gate) => matrixGateNames.has(gate))
const ownerExternalGatesRemainHonest = matrix.every((row) => row.status === 'verified' || row.status === 'owner-required' || row.status === 'external-required' || row.status === 'not-claimed')
const publicAccepted = finalReadinessData?.workflows?.publicAccepted ?? 'unknown'
const claimBoundaryHonest = publicAccepted === 'verified' ? pendingGates.length === 0 : pendingGates.length > 0

const checks = [
  check('PAD01', 'final readiness audit runs before public acceptance diagnosis', finalReadiness.status === 0 && finalReadinessData?.summary?.status === 'passed', finalReadiness.command, finalReadiness.stderr),
  check('PAD02', 'public acceptance doctor covers all final owner/external gate types', expectedGatesCoveredByMatrix, expectedFinalGates.join(', ')),
  check('PAD03', 'pending final gates have concrete record commands', currentPendingRowsHaveCommands, pendingGates.map((gate) => `${gate.area} -> ${gate.recordCommand}`).join('; ')),
  check('PAD03b', 'pending final gates expose dry-run preflight commands', currentPendingRowsHavePreflightCommands, pendingGates.map((gate) => `${gate.area} -> ${gate.preflightCommand}`).join('; ')),
  check('PAD03c', 'pending final gate commands are complete executable templates', pendingCommandsAreExecutableTemplates, pendingGates.map((gate) => `${gate.area} -> ${gate.recordCommand}`).join('; ')),
  check('PAD04', 'pending final gates keep owner/external responsibility visible', pendingGates.every((gate) => gate.owner !== 'unknown'), pendingGates.map((gate) => `${gate.area}:${gate.owner}`).join(', ')),
  check('PAD05', 'final readiness statuses remain honest when required gates are accepted and optional claims are not-claimed', ownerExternalGatesRemainHonest && claimBoundaryHonest, `publicAccepted=${publicAccepted}; pending=${pendingGates.length}`),
  check('PAD06', 'doctor does not claim external acceptance from local mechanics', publicAccepted !== 'verified' || pendingGates.length === 0, 'public acceptance follows final-readiness matrix only'),
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
    pendingGates: pendingGates.length,
    publicAccepted,
  },
  workflows: {
    publicAcceptanceDoctor: failed === 0 ? 'verified' : 'failed',
    publicAccepted,
  },
  pendingGates,
  nextCommands: pendingGates.map((gate) => gate.recordCommand),
  nextPreflightCommands: pendingGates.map((gate) => gate.preflightCommand),
  limits: [
    'This doctor identifies missing owner/external evidence and record commands.',
    'It does not choose a license, publish a package, configure a public repository, run public CI, approve a marketplace listing, or prove optional host-native slash commands.',
    'A gate is accepted only after a real accepted record is created and final readiness is re-audited.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Public Acceptance Doctor')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Public accepted: ' + data.summary.publicAccepted)
  lines.push('- Pending gates: ' + data.summary.pendingGates)
  lines.push('')
  lines.push('## Pending Gates')
  lines.push('')
  if (data.pendingGates.length === 0) {
    lines.push('- None. Re-run final readiness and close gate before claiming public acceptance.')
  } else {
    for (const gate of data.pendingGates) {
      lines.push('- ' + gate.area + ': ' + gate.status)
      lines.push('  - Owner: ' + gate.owner)
      lines.push('  - Current evidence: ' + gate.currentEvidence)
      lines.push('  - Required evidence: ' + gate.requiredEvidence)
      lines.push('  - Preflight command: `' + gate.preflightCommand + '`')
      lines.push('  - Record command: `' + gate.recordCommand + '`')
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
