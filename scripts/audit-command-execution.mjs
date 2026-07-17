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
const profile = readArg('--profile', 'lite')
const target = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-command-exec-'))

if (!['lite', 'full'].includes(profile)) {
  console.error(`Unknown command execution audit profile: ${profile}`)
  process.exit(1)
}

function run(script, commandArgs) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', script), ...commandArgs], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  })
  return {
    command: [process.execPath, path.join(root, 'scripts', script), ...commandArgs].join(' '),
    status: result.status ?? 1,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  }
}

function parseJson(text) {
  try { return JSON.parse(text) } catch { return null }
}

function diagnosticOk(runResult, report) {
  if (runResult.status === 0 && report?.execution?.ok) return true
  if (report?.execution?.diagnosticSummary?.failed === 0) return true
  const child = parseJson(report?.execution?.stdout || '')
  return child?.summary?.failed === 0
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

function maybeRun(enabled, script, commandArgs) {
  return enabled ? run(script, commandArgs) : null
}

fs.mkdirSync(target, { recursive: true })
fs.writeFileSync(path.join(target, 'AGENTS.md'), '# Test Project\n', 'utf8')

const initRun = run('init-project.mjs', ['--target', target, '--mode', 'standard', '--json'])
fs.mkdirSync(path.join(target, 'docs'), { recursive: true })
fs.writeFileSync(path.join(target, 'docs', 'productization-architecture.md'), '# Productization Architecture\n', 'utf8')
fs.appendFileSync(path.join(target, '.gse', 'README.md'), '\nCanonical plan: `docs/productization-architecture.md`.\n', 'utf8')

const adapterRun = run('generate-command-adapter.mjs', ['--target', target, '--host', 'all', '--json'])
const helpRun = run('run-gse-command.mjs', ['--root', root, '--target', target, '--command', '/gse help', '--json'])
const continueRun = run('run-gse-command.mjs', ['--root', root, '--target', target, '--command', '/gse continue', '--json'])
const stageRun = run('run-gse-command.mjs', ['--root', root, '--target', target, '--command', '/gse stage continue this project', '--json'])
const discoverRun = run('run-gse-command.mjs', ['--root', root, '--target', target, '--command', '/gse discover build a paid creator cover tool --session-id command-cover', '--execute', '--json'])
const discover = parseJson(discoverRun.stdout)
const discoverData = parseJson(discover?.execution?.stdout || '')
const discoverySelectRun = run('run-gse-command.mjs', ['--root', root, '--target', target, '--command', '/gse discover --session command-cover --select minimal-proof --promote', '--json'])
const discoverySelect = parseJson(discoverySelectRun.stdout)
const discoverySelectData = parseJson(discoverySelect?.execution?.stdout || '')
const discoveryPromoteRun = run('run-gse-command.mjs', ['--root', root, '--target', target, '--command', '/gse discover --session command-cover --select minimal-proof --change-id command-cover-proof --promote', '--execute', '--json'])
const discoveryPromote = parseJson(discoveryPromoteRun.stdout)
const discoveryPromoteData = parseJson(discoveryPromote?.execution?.stdout || '')
const repairRun = run('run-gse-command.mjs', ['--root', root, '--target', target, '--command', '/gse repair', '--json'])
const frameRun = run('run-gse-command.mjs', ['--root', root, '--target', target, '--command', '/gse frame', '--json'])
const specifyRun = run('run-gse-command.mjs', ['--root', root, '--target', target, '--command', '/gse specify facade-change --level standard', '--json'])
const buildRun = run('run-gse-command.mjs', ['--root', root, '--target', target, '--command', '/gse build', '--json'])
const shortCliRun = run('gse.mjs', ['status', '--target', target, '--json'])

const full = profile === 'full'
const statusRun = maybeRun(full, 'run-gse-command.mjs', ['--root', root, '--target', root, '--command', '/gse status', '--json'])
const doctorRun = maybeRun(full, 'run-gse-command.mjs', ['--root', root, '--target', root, '--command', '/gse doctor', '--json'])
const acceptanceRun = maybeRun(full, 'run-gse-command.mjs', ['--root', root, '--target', root, '--command', '/gse acceptance', '--json'])
const ownerActionsRun = maybeRun(full, 'run-gse-command.mjs', ['--root', root, '--target', root, '--command', '/gse owner-actions', '--json'])
const ownerActionsCompactRun = maybeRun(full, 'run-gse-command.mjs', ['--root', root, '--target', root, '--command', '/gse owner-actions', '--json', '--compact'])
const probeWaitingRun = maybeRun(full, 'run-gse-command.mjs', ['--root', root, '--target', root, '--command', '/gse probe', '--json'])
const probeRejectRun = maybeRun(full, 'run-gse-command.mjs', ['--root', root, '--target', root, '--command', '/gse probe --public-repo-url https://github.com/example/gse', '--json'])
const releaseDryRun = maybeRun(full, 'run-gse-command.mjs', ['--root', root, '--target', root, '--command', '/gse release --label command-exec-release', '--json'])
const releaseExecuteOut = path.join(target, 'release-bundle-command-exec')
const releaseExecuteRun = maybeRun(full, 'run-gse-command.mjs', ['--root', root, '--target', root, '--command', `/gse release --label command-exec-release --out ${releaseExecuteOut}`, '--execute', '--json'])
const packageDryRun = maybeRun(full, 'run-gse-command.mjs', ['--root', root, '--target', root, '--command', '/gse package --label command-exec-package', '--json'])
const packageExecuteOut = path.join(target, 'package-command-exec')
const packageExecuteRun = maybeRun(full, 'run-gse-command.mjs', ['--root', root, '--target', root, '--command', `/gse package --label command-exec-package --out ${packageExecuteOut}`, '--execute', '--json'])
const installDryRunTarget = path.join(target, 'install-dry-run-command-exec')
const installDryRun = maybeRun(full, 'run-gse-command.mjs', ['--root', root, '--target', root, '--command', `/gse install --source ${packageExecuteOut} --install-target ${installDryRunTarget}`, '--json'])
const installExecuteTarget = path.join(target, 'install-command-exec')
const installExecuteRun = maybeRun(full, 'run-gse-command.mjs', ['--root', root, '--target', root, '--command', `/gse install --source ${packageExecuteOut} --install-target ${installExecuteTarget}`, '--execute', '--json'])
const publicReleaseDryRun = maybeRun(full, 'run-gse-command.mjs', ['--root', root, '--target', root, '--command', '/gse public-release', '--json'])
const publicReleaseExecuteOut = path.join(target, 'public-release-checklist-command-exec.md')
const publicReleaseExecuteRun = maybeRun(full, 'run-gse-command.mjs', ['--root', root, '--target', root, '--command', `/gse public-release --out ${publicReleaseExecuteOut}`, '--execute', '--json'])
const doctorTargetRun = maybeRun(full, 'run-gse-command.mjs', ['--root', root, '--target', target, '--command', '/gse doctor', '--json'])
const verifyRun = maybeRun(full, 'run-gse-command.mjs', ['--root', root, '--target', root, '--command', '/gse verify --profile lite', '--json'])
const auditRun = maybeRun(full, 'run-gse-command.mjs', ['--root', root, '--target', target, '--command', '/gse audit', '--json'])
const closeRun = maybeRun(full, 'run-gse-command.mjs', ['--root', root, '--target', target, '--command', '/gse close', '--json'])
const changeRun = maybeRun(full, 'run-gse-command.mjs', ['--root', root, '--target', target, '--command', '/gse change add-login --level lite', '--execute', '--json'])
if (full) {
  const statePath = path.join(target, '.gse', 'state.json')
  const stateForRepair = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  stateForRepair.residualRisks = Array.from({ length: 9 }, (_, index) => `Command repair fixture risk ${index + 1}.`)
  fs.writeFileSync(statePath, JSON.stringify(stateForRepair, null, 2) + '\n', 'utf8')
}
const repairExecuteRun = maybeRun(full, 'run-gse-command.mjs', ['--root', root, '--target', target, '--command', '/gse repair --max-active-risks 3', '--execute', '--json'])

const help = parseJson(helpRun.stdout)
const cont = parseJson(continueRun.stdout)
const stage = parseJson(stageRun.stdout)
const repair = parseJson(repairRun.stdout)
const frame = parseJson(frameRun.stdout)
const specify = parseJson(specifyRun.stdout)
const build = parseJson(buildRun.stdout)
const status = statusRun ? parseJson(statusRun.stdout) : null
const doctor = doctorRun ? parseJson(doctorRun.stdout) : null
const acceptance = acceptanceRun ? parseJson(acceptanceRun.stdout) : null
const ownerActions = ownerActionsRun ? parseJson(ownerActionsRun.stdout) : null
const ownerActionsCompact = ownerActionsCompactRun ? parseJson(ownerActionsCompactRun.stdout) : null
const probeWaiting = probeWaitingRun ? parseJson(probeWaitingRun.stdout) : null
const probeReject = probeRejectRun ? parseJson(probeRejectRun.stdout) : null
const releaseDryRunReport = releaseDryRun ? parseJson(releaseDryRun.stdout) : null
const releaseExecuteReport = releaseExecuteRun ? parseJson(releaseExecuteRun.stdout) : null
const doctorTarget = doctorTargetRun ? parseJson(doctorTargetRun.stdout) : null
const verify = verifyRun ? parseJson(verifyRun.stdout) : null
const audit = auditRun ? parseJson(auditRun.stdout) : null
const close = closeRun ? parseJson(closeRun.stdout) : null
const change = changeRun ? parseJson(changeRun.stdout) : null
const repairExecute = repairExecuteRun ? parseJson(repairExecuteRun.stdout) : null
const repairExecuteData = repairExecute ? parseJson(repairExecute.execution?.stdout ?? '') : null
const doctorData = doctor ? parseJson(doctor.execution?.stdout ?? '') : null
const ownerActionsData = ownerActions ? parseJson(ownerActions.execution?.stdout ?? '') : null
const probeWaitingData = probeWaiting ? parseJson(probeWaiting.execution?.stdout ?? '') : null
const probeRejectData = probeReject ? parseJson(probeReject.execution?.stdout ?? '') : null
const releaseDryRunData = releaseDryRunReport ? parseJson(releaseDryRunReport.execution?.stdout ?? '') : null
const releaseExecuteData = releaseExecuteReport ? parseJson(releaseExecuteReport.execution?.stdout ?? '') : null
const packageDryRunReport = packageDryRun ? parseJson(packageDryRun.stdout) : null
const packageExecuteReport = packageExecuteRun ? parseJson(packageExecuteRun.stdout) : null
const installDryRunReport = installDryRun ? parseJson(installDryRun.stdout) : null
const installExecuteReport = installExecuteRun ? parseJson(installExecuteRun.stdout) : null
const packageDryRunData = packageDryRunReport ? parseJson(packageDryRunReport.execution?.stdout ?? '') : null
const packageExecuteData = packageExecuteReport ? parseJson(packageExecuteReport.execution?.stdout ?? '') : null
const installDryRunData = installDryRunReport ? parseJson(installDryRunReport.execution?.stdout ?? '') : null
const installExecuteData = installExecuteReport ? parseJson(installExecuteReport.execution?.stdout ?? '') : null
const publicReleaseDryRunReport = publicReleaseDryRun ? parseJson(publicReleaseDryRun.stdout) : null
const publicReleaseExecuteReport = publicReleaseExecuteRun ? parseJson(publicReleaseExecuteRun.stdout) : null
const publicReleaseDryRunData = publicReleaseDryRunReport ? parseJson(publicReleaseDryRunReport.execution?.stdout ?? '') : null
const publicReleaseExecuteData = publicReleaseExecuteReport ? parseJson(publicReleaseExecuteReport.execution?.stdout ?? '') : null

const claudeCommand = fs.existsSync(path.join(target, '.claude', 'commands', 'gse.md'))
  ? fs.readFileSync(path.join(target, '.claude', 'commands', 'gse.md'), 'utf8')
  : ''
const codexPointer = fs.existsSync(path.join(target, '.codex', 'gse-command.md'))
  ? fs.readFileSync(path.join(target, '.codex', 'gse-command.md'), 'utf8')
  : ''
const copilotPointer = fs.existsSync(path.join(target, '.github', 'copilot-instructions.md'))
  ? fs.readFileSync(path.join(target, '.github', 'copilot-instructions.md'), 'utf8')
  : ''
const geminiPointer = fs.existsSync(path.join(target, 'GEMINI.md'))
  ? fs.readFileSync(path.join(target, 'GEMINI.md'), 'utf8')
  : ''

const liteChecks = [
  check('CMDX01', 'portable command runner exists', fs.existsSync(path.join(root, 'scripts', 'run-gse-command.mjs')), 'scripts/run-gse-command.mjs'),
  check('CMDX02', 'target project initializes for command smoke', initRun.status === 0, initRun.command),
  check('CMDX03', 'host command adapters are generated', adapterRun.status === 0 && claudeCommand.includes('run-gse-command.mjs') && codexPointer.includes('run-gse-command.mjs') && copilotPointer.includes('GitHub Copilot GSE Adapter') && geminiPointer.includes('Gemini GSE Adapter'), 'generated supported host adapters'),
  check('CMDX04', '/gse help resolves command reference', helpRun.status === 0 && help?.route?.route === 'references/commands.md', '/gse help'),
  check('CMDX05', '/gse continue executes hard preflight and compact state generator', continueRun.status === 0 && cont?.execution?.status === 0 && cont?.execution?.command?.includes('generate-continue-packet.mjs') && cont?.execution?.stdout?.includes('"compactState"'), '/gse continue'),
  check('CMDX05d', '/gse stage executes current-stage detection', stageRun.status === 0 && stage?.execution?.status === 0 && stage?.execution?.command?.includes('detect-project-stage.mjs') && stage?.execution?.stdout?.includes('"current_stage"'), '/gse stage'),
  check('CMDX05e', '/gse discover routes natural-language intent to three comparable choices', discoverRun.status === 0 && discover?.execution?.command?.includes('generate-goal-discovery-packet.mjs') && discoverData?.status === 'awaiting-choice' && discoverData?.paths?.length === 3 && discoverData?.choicePrompt, '/gse discover <intent> --execute'),
  check('CMDX05f', '/gse discover selection previews promotion without writes', discoverySelectRun.status === 0 && discoverySelectData?.status === 'promotion-preview' && discoverySelectData?.writes?.performed === false && !fs.existsSync(path.join(target, '.gse', 'changes', 'command-cover-minimal-proof')), '/gse discover --session <id> --select <path> --promote'),
  check('CMDX05g', '/gse discover explicitly promotes selected path into Goal Spec', discoveryPromoteRun.status === 0 && discoveryPromoteData?.status === 'promoted' && fs.existsSync(path.join(target, '.gse', 'changes', 'command-cover-proof', 'spec.md')), '/gse discover --session <id> --select <path> --promote --execute'),
  check('CMDX05c', '/gse repair executes state/evidence repair audit in read-only mode', repairRun.status === 0 && repair?.execution?.status === 0 && repair?.execution?.command?.includes('audit-state-repair.mjs') && repair?.execution?.stdout?.includes('"repairActions"'), '/gse repair'),
  check('CMDX16', '/gse frame routes to current-stage detection and returns a v1 envelope', frameRun.status === 0 && frame?.coreResult?.stage === 'frame' && frame?.execution?.command?.includes('detect-project-stage.mjs'), '/gse frame'),
  check('CMDX17', '/gse specify previews the existing Change route without writes', specifyRun.status === 0 && specify?.coreResult?.stage === 'specify' && specify?.execution?.command?.includes('init-change.mjs') && !fs.existsSync(path.join(target, '.gse', 'changes', 'facade-change')), '/gse specify'),
  check('CMDX18', '/gse build routes to continuation and returns a build envelope', buildRun.status === 0 && build?.coreResult?.stage === 'build' && build?.execution?.command?.includes('generate-continue-packet.mjs'), '/gse build'),
  check('CMDX05b', 'short CLI wrapper routes to portable command runner', shortCliRun.status === 0 && shortCliRun.stdout.includes('"/gse status"') && shortCliRun.stdout.includes('"stateValid": true'), 'scripts/gse.mjs status --target <target> --json'),
]

const fullChecks = full
  ? [
      check('CMDX06', '/gse status exposes GSE final-form progress when target is GSE skill', statusRun.status === 0 && status?.execution?.status === 0 && status?.execution?.stdout?.includes('fullFinalFormReadiness') && status?.execution?.stdout?.includes('pendingGateCount'), '/gse status'),
      check('CMDX07', '/gse doctor exposes GSE public acceptance evidence state when target is GSE skill', doctorRun.status === 0 && doctor?.execution?.status === 0 && doctorData?.workflows?.publicAcceptanceDoctor === 'verified' && doctorData?.summary?.pendingGates > 0 && doctorData?.summary?.publicAccepted === 'not-accepted', '/gse doctor'),
      check('CMDX08', '/gse acceptance aliases the public acceptance doctor', acceptanceRun.status === 0 && acceptance?.execution?.status === 0 && acceptance?.execution?.stdout?.includes('"publicAcceptanceDoctor": "verified"'), '/gse acceptance'),
      check('CMDX08b', '/gse owner-actions exposes compact owner/external action commands without claiming acceptance', ownerActionsRun.status === 0 && ownerActions?.execution?.status === 0 && ownerActionsData?.pendingGateCount > 0 && ownerActionsData?.publicAccepted === 'not-accepted' && ownerActionsData.actions?.every((item) => item.recordCommand && item.preflightCommand), '/gse owner-actions'),
      check('CMDX08c', '/gse owner-actions --compact returns owner packet without wrapper path noise', ownerActionsCompactRun.status === 0 && ownerActionsCompact?.pendingGateCount > 0 && ownerActionsCompact?.publicAccepted === 'not-accepted' && !ownerActionsCompactRun.stdout.includes(root) && !ownerActionsCompactRun.stdout.includes(process.execPath), '/gse owner-actions --json --compact'),
      check('CMDX08c2', '/gse owner-actions --compact routes probe verification through portable command runner', ownerActionsCompactRun.status === 0 && ownerActionsCompact?.verificationCommands?.some((command) => command.includes('run-gse-command.mjs') && command.includes('/gse probe')) && !ownerActionsCompact?.verificationCommands?.some((command) => command.startsWith('node scripts/probe-public-external-gates.mjs')), '/gse owner-actions compact verificationCommands'),
      check('CMDX08d', '/gse probe runs as a waiting diagnostic without evidence inputs', probeWaitingRun.status === 0 && probeWaiting?.execution?.status === 0 && probeWaitingData?.status === 'waiting-for-input' && probeWaitingData?.summary?.checked === 0, '/gse probe'),
      check('CMDX08e', '/gse probe rejects placeholder public evidence through portable command runner', probeRejectRun.status !== 0 && probeReject?.execution?.status !== 0 && probeRejectData?.status === 'failed' && probeRejectData?.probes?.some((item) => item.errors?.some((error) => error.includes('not a placeholder'))), '/gse probe --public-repo-url https://github.com/example/gse'),
      check('CMDX08f', '/gse release dry-runs release bundle generation without writing canonical output', releaseDryRun.status === 0 && releaseDryRunReport?.execution?.status === 0 && ['ready', 'dry-run'].includes(releaseDryRunData?.status) && releaseDryRunData?.dryRun === true && releaseDryRunData?.validation?.status === 'passed', '/gse release'),
      check('CMDX08g', '/gse release --execute writes a release bundle to the requested output path', releaseExecuteRun.status === 0 && releaseExecuteReport?.execution?.status === 0 && releaseExecuteData?.status === 'written' && releaseExecuteData?.dryRun === false && fs.existsSync(path.join(releaseExecuteOut, 'bundle-manifest.json')), '/gse release --execute --out <tmp>'),
      check('CMDX08g2', '/gse package dry-runs local package generation without writing package output', packageDryRun.status === 0 && packageDryRunReport?.execution?.status === 0 && packageDryRunData?.status === 'ready' && packageDryRunData?.dryRun === true && packageDryRunData?.fileCount > 20 && !fs.existsSync(path.join(root, '.gse', 'packages', 'command-exec-package')), '/gse package'),
      check('CMDX08g3', '/gse package --execute writes a package manifest to the requested output path', packageExecuteRun.status === 0 && packageExecuteReport?.execution?.status === 0 && packageExecuteData?.status === 'written' && packageExecuteData?.dryRun === false && fs.existsSync(path.join(packageExecuteOut, 'gse-package-manifest.json')), '/gse package --execute --out <tmp>'),
      check('CMDX08g4', '/gse install dry-runs package installation without writing the install target', installDryRun.status === 0 && installDryRunReport?.execution?.status === 0 && installDryRunData?.status === 'passed' && installDryRunData?.dryRun === true && installDryRunData?.summary?.written > 20 && !fs.existsSync(path.join(installDryRunTarget, 'SKILL.md')), '/gse install --source <package> --install-target <tmp>'),
      check('CMDX08g5', '/gse install --execute writes an install target with the GSE skill entrypoint', installExecuteRun.status === 0 && installExecuteReport?.execution?.status === 0 && installExecuteData?.status === 'passed' && installExecuteData?.dryRun === false && fs.existsSync(path.join(installExecuteTarget, 'SKILL.md')) && fs.existsSync(path.join(installExecuteTarget, 'scripts', 'gse.mjs')), '/gse install --execute --source <package> --install-target <tmp>'),
      check('CMDX08h', '/gse public-release dry-runs the ordered public release checklist without writing canonical output', publicReleaseDryRun.status === 0 && publicReleaseDryRunReport?.execution?.status === 0 && publicReleaseDryRunData?.status === 'ready' && publicReleaseDryRunData?.dryRun === true && publicReleaseDryRunData?.publicReleaseChecklist === 'ready', '/gse public-release'),
      check('CMDX08i', '/gse public-release --execute writes the requested checklist output', publicReleaseExecuteRun.status === 0 && publicReleaseExecuteReport?.execution?.status === 0 && publicReleaseExecuteData?.status === 'written' && publicReleaseExecuteData?.dryRun === false && fs.existsSync(publicReleaseExecuteOut) && fs.readFileSync(publicReleaseExecuteOut, 'utf8').includes('GSE Public Release Checklist'), '/gse public-release --execute --out <tmp>'),
      check('CMDX09', '/gse doctor falls back to target project doctor for normal projects', diagnosticOk(doctorTargetRun, doctorTarget) && doctorTarget?.execution?.command?.includes('audit-target-project.mjs'), '/gse doctor on fixture target'),
      check('CMDX10', '/gse verify executes validation profile runner', verifyRun.status === 0 && verify?.execution?.status === 0 && verify?.execution?.stdout?.includes('"profile": "lite"') && verify?.execution?.stdout?.includes('"validationProfile": "verified"'), '/gse verify --profile lite'),
      check('CMDX19', '/gse verify retains validation routing and adds a verify envelope', verify?.coreResult?.stage === 'verify', '/gse verify'),
      check('CMDX11', '/gse audit executes target project doctor', diagnosticOk(auditRun, audit), '/gse audit'),
      check('CMDX12', '/gse close executes close gate', diagnosticOk(closeRun, close), '/gse close'),
      check('CMDX20', '/gse close remains a readiness check and adds a close envelope', close?.coreResult?.stage === 'close' && !close?.execution?.command?.includes('release'), '/gse close'),
      check('CMDX21', 'release remains post-Close and outside the five-stage facade', releaseDryRunReport?.coreResult?.stage === null && releaseDryRunReport?.coreResult?.reasonCode === 'POST_CLOSE_RELEASE', '/gse release'),
      check('CMDX13', '/gse change executes change pack creation only with --execute', changeRun.status === 0 && change?.execution?.status === 0 && fs.existsSync(path.join(target, '.gse', 'changes', 'add-login', 'brief.md')), '/gse change --execute'),
      check('CMDX14', '/gse repair --execute performs reversible residual risk compaction only when requested', repairExecuteRun.status === 0 && repairExecute?.execution?.status === 0 && repairExecuteData?.summary?.writes === 1 && repairExecuteData?.writes?.some((item) => item.action === 'compact-residual-risks') && fs.existsSync(path.join(target, '.gse', 'backups')), '/gse repair --execute'),
    ]
  : []

const checks = [...liteChecks, ...fullChecks]
const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const commandRuns = [initRun, adapterRun, helpRun, continueRun, stageRun, discoverRun, discoverySelectRun, discoveryPromoteRun, repairRun, frameRun, specifyRun, buildRun, shortCliRun, statusRun, doctorRun, acceptanceRun, ownerActionsRun, ownerActionsCompactRun, probeWaitingRun, probeRejectRun, releaseDryRun, releaseExecuteRun, packageDryRun, packageExecuteRun, installDryRun, installExecuteRun, publicReleaseDryRun, publicReleaseExecuteRun, doctorTargetRun, verifyRun, auditRun, closeRun, changeRun, repairExecuteRun].filter(Boolean)
const report = {
  root,
  generatedAt: new Date().toISOString(),
  target,
  profile,
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    portableCommandExecution: failed === 0 ? 'verified' : 'failed',
    generatedHostCommandPointers: failed === 0 ? 'verified' : 'failed',
    profile,
  },
  commands: commandRuns.map((item) => item.command),
  limits: [
    'Lite profile verifies portable command entry and generated host command pointers.',
    'Full profile verifies every portable command path, including heavier status, doctor, verify, audit, close, and change paths.',
    'This audit does not prove Claude Code, Codex, Hermes, WorkBuddy, Copilot, Gemini, or generic UI runtimes invoked the command natively.',
  ],
  checks,
}

fs.rmSync(target, { recursive: true, force: true })

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(JSON.stringify(report, null, 2))

if (failed > 0) process.exit(1)
