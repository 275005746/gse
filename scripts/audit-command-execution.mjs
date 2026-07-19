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
const keepTemp = args.includes('--keep-temp')
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

function snapshotTree(dir) {
  if (!fs.existsSync(dir)) return []
  const entries = []
  function visit(current, relative = '') {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const childRelative = path.join(relative, entry.name)
      const child = path.join(current, entry.name)
      if (entry.isDirectory()) visit(child, childRelative)
      else if (entry.isFile()) entries.push([childRelative.replace(/\\/g, '/'), fs.readFileSync(child, 'base64')])
    }
  }
  visit(dir)
  return entries
}

function writeUpdateFixture(targetDir, stateContent) {
  fs.mkdirSync(path.join(targetDir, '.gse', 'evidence'), { recursive: true })
  fs.mkdirSync(path.join(targetDir, 'docs'), { recursive: true })
  fs.writeFileSync(path.join(targetDir, '.gse', 'README.md'), '# GSE\n\nCanonical plan: `docs/productization-architecture.md`.\n', 'utf8')
  fs.writeFileSync(path.join(targetDir, '.gse', 'project-profile.md'), '# Project Profile\n\n- Product/system name: Update Fixture.\n', 'utf8')
  fs.writeFileSync(path.join(targetDir, '.gse', 'goal-map.md'), '# Goal Map\n\n## Current Focus\n\n- Active slice: Preserve update lifecycle.\n- Next action: Verify update lifecycle.\n', 'utf8')
  fs.writeFileSync(path.join(targetDir, '.gse', 'quality-gates.md'), '# Quality Gates\n\n## Universal\n', 'utf8')
  fs.writeFileSync(path.join(targetDir, 'docs', 'productization-architecture.md'), '# Plan\n', 'utf8')
  fs.writeFileSync(path.join(targetDir, '.gse', 'state.json'), stateContent, 'utf8')
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

function maybeRun(enabled, script, commandArgs) {
  return enabled ? run(script, commandArgs) : null
}

fs.mkdirSync(target, { recursive: true })
const agentsSentinel = '# Test Project\n\nExisting project rules must remain unchanged.\n'
fs.writeFileSync(path.join(target, 'AGENTS.md'), agentsSentinel, 'utf8')

const initPreviewRun = run('run-gse-command.mjs', ['--root', root, '--target', target, '--command', '/gse init --mode standard', '--json'])
const initPreview = parseJson(initPreviewRun.stdout)
const initPreviewData = parseJson(initPreview?.execution?.stdout || '')
const initPreviewWasReadOnly = !fs.existsSync(path.join(target, '.gse'))
const initRun = run('run-gse-command.mjs', ['--root', root, '--target', target, '--command', '/gse init --mode standard', '--execute', '--json'])
const init = parseJson(initRun.stdout)
const initData = parseJson(init?.execution?.stdout || '')
const initializedStatePath = path.join(target, '.gse', 'state.json')
const initializedState = parseJson(fs.readFileSync(initializedStatePath, 'utf8'))
const initializedStateText = fs.readFileSync(initializedStatePath, 'utf8')
const initRerun = run('init-project.mjs', ['--target', target, '--mode', 'standard'])
const initRerunData = parseJson(initRerun.stdout)
const initRerunPreservedState = fs.readFileSync(initializedStatePath, 'utf8') === initializedStateText
const initForceRerun = run('init-project.mjs', ['--target', target, '--mode', 'standard', '--force'])
const initForceRerunData = parseJson(initForceRerun.stdout)
const initForcePreservedState = fs.readFileSync(initializedStatePath, 'utf8') === initializedStateText

const legacyInitTarget = path.join(target, 'legacy-init-project')
fs.mkdirSync(path.join(legacyInitTarget, '.gse'), { recursive: true })
fs.writeFileSync(path.join(legacyInitTarget, '.gse', 'state.json'), JSON.stringify({
  schemaVersion: 1,
  projectName: 'legacy-init-project',
  mode: 'lite',
  phase: 'execute',
  currentSlice: { id: 'legacy', outcome: 'preserve legacy state', status: 'planned', nextAction: 'review migration' },
  toolStatus: { browser: 'unknown', lsp: 'unknown', mcp: 'unknown', subagents: 'unknown', ci: 'unknown' },
  lastEvidence: '.gse/evidence/index.jsonl',
  residualRisks: ['legacy risk'],
}, null, 2) + '\n', 'utf8')
const legacyInitBefore = snapshotTree(legacyInitTarget)
const legacyInitRun = run('init-project.mjs', ['--target', legacyInitTarget, '--mode', 'lite'])
const legacyInitData = parseJson(legacyInitRun.stdout)
const legacyInitAfter = snapshotTree(legacyInitTarget)

const malformedInitTarget = path.join(target, 'malformed-init-project')
fs.mkdirSync(path.join(malformedInitTarget, '.gse'), { recursive: true })
fs.writeFileSync(path.join(malformedInitTarget, '.gse', 'state.json'), '{ invalid json\n', 'utf8')
const malformedInitBefore = snapshotTree(malformedInitTarget)
const malformedInitRun = run('init-project.mjs', ['--target', malformedInitTarget, '--mode', 'lite', '--force'])
const malformedInitData = parseJson(malformedInitRun.stdout)
const malformedInitAfter = snapshotTree(malformedInitTarget)

const canonicalUpdateTarget = path.join(target, 'canonical-update-project')
writeUpdateFixture(canonicalUpdateTarget, JSON.stringify({
  schemaVersion: 1,
  stateRevision: 4,
  activeChangeId: null,
  projectName: 'canonical-update-project',
  mode: 'lite',
  phase: 'execute',
  currentSlice: { id: 'canonical-update', outcome: 'preserve update state', status: 'planned', nextAction: 'run update' },
  toolStatuses: { browser: 'unknown', lsp: 'unknown', mcp: 'unknown', subagents: 'unknown', ci: 'unknown' },
  lastEvidence: '.gse/evidence/index.jsonl',
  residualRisks: [],
}, null, 2) + '\n')
const canonicalUpdateRun = run('update-project-state.mjs', ['--target', canonicalUpdateTarget, '--json'])
const canonicalUpdateData = parseJson(canonicalUpdateRun.stdout)
const canonicalUpdatedState = parseJson(fs.readFileSync(path.join(canonicalUpdateTarget, '.gse', 'state.json'), 'utf8'))

const legacyUpdateTarget = path.join(target, 'legacy-update-project')
writeUpdateFixture(legacyUpdateTarget, JSON.stringify({
  schemaVersion: 1,
  projectName: 'legacy-update-project',
  mode: 'lite',
  phase: 'execute',
  currentSlice: { id: 'legacy-update', outcome: 'migrate update state', status: 'planned', nextAction: 'review migration' },
  toolStatus: { browser: 'unknown', lsp: 'unknown', mcp: 'unknown', subagents: 'unknown', ci: 'unknown' },
  lastEvidence: '.gse/evidence/index.jsonl',
  residualRisks: ['legacy update risk'],
}, null, 2) + '\n')
const legacyUpdateBefore = snapshotTree(legacyUpdateTarget)
const legacyUpdatePreviewRun = run('update-project-state.mjs', ['--target', legacyUpdateTarget, '--json'])
const legacyUpdatePreview = parseJson(legacyUpdatePreviewRun.stdout)
const legacyUpdateAfterPreview = snapshotTree(legacyUpdateTarget)
const legacyUpdateExecuteRun = run('update-project-state.mjs', ['--target', legacyUpdateTarget, '--execute', '--json'])
const legacyUpdateExecute = parseJson(legacyUpdateExecuteRun.stdout)
const migratedUpdateState = parseJson(fs.readFileSync(path.join(legacyUpdateTarget, '.gse', 'state.json'), 'utf8'))
const legacyUpdateRerun = run('update-project-state.mjs', ['--target', legacyUpdateTarget, '--json'])
const legacyUpdateRerunData = parseJson(legacyUpdateRerun.stdout)
const rerunUpdateState = parseJson(fs.readFileSync(path.join(legacyUpdateTarget, '.gse', 'state.json'), 'utf8'))

const malformedUpdateTarget = path.join(target, 'malformed-update-project')
writeUpdateFixture(malformedUpdateTarget, '{ malformed json\n')
const malformedUpdateBefore = snapshotTree(malformedUpdateTarget)
const malformedUpdateRun = run('update-project-state.mjs', ['--target', malformedUpdateTarget, '--force', '--json'])
const malformedUpdateData = parseJson(malformedUpdateRun.stdout)
const malformedUpdateAfter = snapshotTree(malformedUpdateTarget)
fs.mkdirSync(path.join(target, 'docs'), { recursive: true })
fs.writeFileSync(path.join(target, 'docs', 'productization-architecture.md'), '# Productization Architecture\n', 'utf8')
fs.appendFileSync(path.join(target, '.gse', 'README.md'), '\nCanonical plan: `docs/productization-architecture.md`.\n', 'utf8')
fs.writeFileSync(
  path.join(target, '.gse', 'goal-map.md'),
  '# Goal Map\n\nCanonical product goal source: `docs/productization-architecture.md`.\n\nThis file is a GSE execution projection. Canonical product goal source wins if this projection conflicts with product roadmap, architecture, PRD, or vision docs. State.json tracks continuation state, evidence records verification history, and learnings retain reusable lessons.\n\nNext action: continue.\n',
  'utf8',
)

const adapterRun = run('generate-command-adapter.mjs', ['--target', target, '--host', 'all', '--json'])
const helpRun = run('run-gse-command.mjs', ['--root', root, '--target', path.dirname(target), '--command', '/gse help', '--json'])
const unknownRun = run('run-gse-command.mjs', ['--root', root, '--target', target, '--command', '/gse unsupported-command', '--json'])
const helpData = parseJson(parseJson(helpRun.stdout)?.execution?.stdout || '')
const unknown = parseJson(unknownRun.stdout)
const unknownData = parseJson(unknown?.execution?.stdout || '')

const adoptTarget = path.join(target, 'adopt-project')
fs.mkdirSync(path.join(adoptTarget, '.gse'), { recursive: true })
const adoptAgentsSentinel = '# Existing Rules\n\nDo not replace this file.\n'
const adoptProfileSentinel = '# Existing Project Profile\n\nKeep this adopted profile unchanged.\n'
fs.writeFileSync(path.join(adoptTarget, 'AGENTS.md'), adoptAgentsSentinel, 'utf8')
fs.writeFileSync(path.join(adoptTarget, '.gse', 'project-profile.md'), adoptProfileSentinel, 'utf8')
const adoptPreviewRun = run('run-gse-command.mjs', ['--root', root, '--target', adoptTarget, '--command', '/gse adopt --mode lite', '--json'])
const adoptPreview = parseJson(adoptPreviewRun.stdout)
const adoptPreviewData = parseJson(adoptPreview?.execution?.stdout || '')
const adoptPreviewPreserved = fs.readFileSync(path.join(adoptTarget, 'AGENTS.md'), 'utf8') === adoptAgentsSentinel
  && fs.readFileSync(path.join(adoptTarget, '.gse', 'project-profile.md'), 'utf8') === adoptProfileSentinel
const adoptExecuteRun = run('run-gse-command.mjs', ['--root', root, '--target', adoptTarget, '--command', '/gse adopt --mode lite', '--execute', '--json'])
const adoptExecute = parseJson(adoptExecuteRun.stdout)
const adoptExecuteData = parseJson(adoptExecute?.execution?.stdout || '')
const adoptExecutePreserved = fs.readFileSync(path.join(adoptTarget, 'AGENTS.md'), 'utf8') === adoptAgentsSentinel
  && fs.readFileSync(path.join(adoptTarget, '.gse', 'project-profile.md'), 'utf8') === adoptProfileSentinel

fs.writeFileSync(path.join(target, '.gse', 'current-slice.md'), '# Current Slice\n\n## Outcome\nShip public command semantics.\n\n## Scope\nPortable CLI routing.\n\n## Non-goals\nNo publication.\n\n## Acceptance\nA user-visible portable command route returns the normalized packet.\n\n## Proof Boundary\nThe portable command capability is independently accepted through the public CLI route.\n\n## Evidence Matrix\nProven: command routing. Needs strengthening: close integration. Not covered: publication.\n\n## Evidence Plan\nRun the public CLI against disposable targets.\n\n## Risks\nExisting project rules could be overwritten.\n\n## Next Action\nRun Lite validation.\n', 'utf8')
const sliceRun = run('run-gse-command.mjs', ['--root', root, '--target', target, '--command', '/gse slice', '--json'])
const slice = parseJson(sliceRun.stdout)
const sliceData = parseJson(slice?.execution?.stdout || '')
const mechanicalSliceRun = run('run-gse-command.mjs', ['--root', root, '--target', target, '--command', '/gse slice --outcome add resolver type --scope resolver.ts --non-goals no route --acceptance type compiles --evidence unit test --risks none --next-action add call site', '--json'])
const mechanicalSlice = parseJson(mechanicalSliceRun.stdout)
const mechanicalSliceData = parseJson(mechanicalSlice?.execution?.stdout || '')
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
const installSentinel = '# Existing Installed Skill\n\nPreserve without explicit force.\n'
if (full && installExecuteRun?.status === 0) fs.writeFileSync(path.join(installExecuteTarget, 'SKILL.md'), installSentinel, 'utf8')
const installPreserveRun = maybeRun(full, 'run-gse-command.mjs', ['--root', root, '--target', root, '--command', `/gse install --source ${packageExecuteOut} --install-target ${installExecuteTarget}`, '--execute', '--json'])
const installPreservedWithoutForce = full && fs.existsSync(path.join(installExecuteTarget, 'SKILL.md'))
  ? fs.readFileSync(path.join(installExecuteTarget, 'SKILL.md'), 'utf8') === installSentinel
  : false
const installForceRun = maybeRun(full, 'run-gse-command.mjs', ['--root', root, '--target', root, '--command', `/gse install --source ${packageExecuteOut} --install-target ${installExecuteTarget}`, '--execute', '--force', '--json'])
const installOverwrittenWithForce = full && fs.existsSync(path.join(installExecuteTarget, 'SKILL.md'))
  ? fs.readFileSync(path.join(installExecuteTarget, 'SKILL.md'), 'utf8') !== installSentinel
  : false
const publicReleaseDryRun = maybeRun(full, 'run-gse-command.mjs', ['--root', root, '--target', root, '--command', '/gse public-release', '--json'])
const publicReleaseExecuteOut = path.join(target, 'public-release-checklist-command-exec.md')
const publicReleaseExecuteRun = maybeRun(full, 'run-gse-command.mjs', ['--root', root, '--target', root, '--command', `/gse public-release --out ${publicReleaseExecuteOut}`, '--execute', '--json'])
if (full) {
  fs.writeFileSync(
    path.join(target, '.gse', 'goal-map.md'),
    '# Goal Map\n\nCanonical product goal source: `docs/productization-architecture.md`.\n\nThis file is a GSE execution projection. Canonical product goal source wins if this projection conflicts with product roadmap, architecture, PRD, or vision docs. State.json tracks continuation state, evidence records verification history, and learnings retain reusable lessons.\n\nNext action: continue.\n',
    'utf8',
  )
}
const doctorTargetRun = maybeRun(full, 'run-gse-command.mjs', ['--root', root, '--target', target, '--command', '/gse doctor', '--json'])
const verifyRun = maybeRun(full, 'run-gse-command.mjs', ['--root', root, '--target', root, '--command', '/gse verify --profile lite', '--json'])
const auditRun = maybeRun(full, 'run-gse-command.mjs', ['--root', root, '--target', target, '--command', '/gse audit', '--json'])
const closeRun = maybeRun(full, 'run-gse-command.mjs', ['--root', root, '--target', target, '--command', '/gse close', '--json'])
if (full) {
  const statePath = path.join(target, '.gse', 'state.json')
  const stateForRepair = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  const { stateRevision, activeChangeId, toolStatuses, ...legacyState } = stateForRepair
  fs.writeFileSync(
    statePath,
    JSON.stringify({
      ...legacyState,
      toolStatus: toolStatuses,
      residualRisks: Array.from({ length: 8 }, (_, index) => `Command repair fixture risk ${index + 1}.`),
      riskArchive: [{
        archivedAt: '2026-07-01T00:00:00.000Z',
        risk: 'Previously archived command repair fixture risk.',
        resolution: 'Command migration fixture.',
      }],
    }, null, 2) + '\n',
    'utf8',
  )
}
const repairPreviewRun = maybeRun(full, 'run-gse-command.mjs', ['--root', root, '--target', target, '--command', '/gse repair', '--json'])
const repairExecuteRun = maybeRun(full, 'run-gse-command.mjs', ['--root', root, '--target', target, '--command', '/gse repair --max-risk-length 260', '--execute', '--json'])
const repairRerun = maybeRun(full, 'run-gse-command.mjs', ['--root', root, '--target', target, '--command', '/gse repair', '--json'])
const changeRun = maybeRun(full, 'run-gse-command.mjs', ['--root', root, '--target', target, '--command', '/gse change add-login --level lite', '--execute', '--json'])

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
const repairPreview = repairPreviewRun ? parseJson(repairPreviewRun.stdout) : null
const repairPreviewData = repairPreview ? parseJson(repairPreview.execution?.stdout ?? '') : null
const repairRerunReport = repairRerun ? parseJson(repairRerun.stdout) : null
const repairRerunData = repairRerunReport ? parseJson(repairRerunReport.execution?.stdout ?? '') : null
const doctorData = doctor ? parseJson(doctor.execution?.stdout ?? '') : null
const doctorTargetData = doctorTarget ? parseJson(doctorTarget.execution?.stdout ?? '') : null
const auditData = audit ? parseJson(audit.execution?.stdout ?? '') : null
const closeData = close ? parseJson(close.execution?.stdout ?? '') : null
const ownerActionsData = ownerActions ? parseJson(ownerActions.execution?.stdout ?? '') : null
const probeWaitingData = probeWaiting ? parseJson(probeWaiting.execution?.stdout ?? '') : null
const probeRejectData = probeReject ? parseJson(probeReject.execution?.stdout ?? '') : null
const releaseDryRunData = releaseDryRunReport ? parseJson(releaseDryRunReport.execution?.stdout ?? '') : null
const releaseExecuteData = releaseExecuteReport ? parseJson(releaseExecuteReport.execution?.stdout ?? '') : null
const packageDryRunReport = packageDryRun ? parseJson(packageDryRun.stdout) : null
const packageExecuteReport = packageExecuteRun ? parseJson(packageExecuteRun.stdout) : null
const installDryRunReport = installDryRun ? parseJson(installDryRun.stdout) : null
const installExecuteReport = installExecuteRun ? parseJson(installExecuteRun.stdout) : null
const installPreserveReport = installPreserveRun ? parseJson(installPreserveRun.stdout) : null
const installForceReport = installForceRun ? parseJson(installForceRun.stdout) : null
const packageDryRunData = packageDryRunReport ? parseJson(packageDryRunReport.execution?.stdout ?? '') : null
const packageExecuteData = packageExecuteReport ? parseJson(packageExecuteReport.execution?.stdout ?? '') : null
const installDryRunData = installDryRunReport ? parseJson(installDryRunReport.execution?.stdout ?? '') : null
const installExecuteData = installExecuteReport ? parseJson(installExecuteReport.execution?.stdout ?? '') : null
const installPreserveData = installPreserveReport ? parseJson(installPreserveReport.execution?.stdout ?? '') : null
const installForceData = installForceReport ? parseJson(installForceReport.execution?.stdout ?? '') : null
const publicReleaseDryRunReport = publicReleaseDryRun ? parseJson(publicReleaseDryRun.stdout) : null
const publicReleaseExecuteReport = publicReleaseExecuteRun ? parseJson(publicReleaseExecuteRun.stdout) : null
const publicReleaseDryRunData = publicReleaseDryRunReport ? parseJson(publicReleaseDryRunReport.execution?.stdout ?? '') : null
const publicReleaseExecuteData = publicReleaseExecuteReport ? parseJson(publicReleaseExecuteReport.execution?.stdout ?? '') : null

const repairCommandConditions = full
  ? {
      previewStatus: repairPreviewRun.status === 0,
      previewReason: repairPreviewData?.compatibility?.reasonCode === 'MIGRATION_INSPECTION_READY',
      previewWrites: repairPreviewData?.summary?.writes === 0,
      executeStatus: repairExecuteRun.status === 0,
      childStatus: repairExecute?.execution?.status === 0,
      executeReason: repairExecuteData?.compatibility?.reasonCode === 'TRANSACTION_COMMITTED',
      migrationStatus: repairExecuteData?.migration?.status === 'complete',
      revision: repairExecuteData?.state?.stateRevision === 1,
      archiveRemoved: repairExecuteData?.state?.embeddedRiskArchive === 0,
      historyCount: repairExecuteData?.riskHistory?.records === 3,
      stateWrite: repairExecuteData?.writes?.some((item) => item.action === 'core-v1-migration' && item.targetPath === '.gse/state.json') === true,
      historyExists: fs.existsSync(path.join(target, '.gse', 'risk-history.jsonl')),
      noBackups: !fs.existsSync(path.join(target, '.gse', 'backups')),
      rerunStatus: repairRerun.status === 0,
      rerunReason: repairRerunData?.compatibility?.reasonCode === 'PROJECT_STATE_V1_CANONICAL',
      rerunWrites: repairRerunData?.summary?.writes === 0,
    }
  : {}

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
  check('CMDX02a', '/gse init previews without writing', initPreviewRun.status === 0 && initPreviewData?.status === 'preview' && initPreviewData?.writes?.performed === false && initPreviewWasReadOnly, '/gse init --mode standard'),
  check('CMDX02b', '/gse init --execute initializes the target through the public runner', initRun.status === 0 && init?.execution?.status === 0 && Array.isArray(initData?.results) && initData.results.some((item) => item.relativePath === 'state.json') && initializedState?.schemaVersion === 1 && Number.isInteger(initializedState?.stateRevision) && initializedState.stateRevision >= 1 && initializedState?.activeChangeId === null && fs.readFileSync(path.join(target, 'AGENTS.md'), 'utf8') === agentsSentinel, '/gse init --mode standard --execute'),
  check('CMDX02c', 'canonical init rerun preserves existing project state', initRerun.status === 0 && Array.isArray(initRerunData?.results) && initRerunData.results.find((item) => item.relativePath === 'state.json')?.status === 'skipped' && initRerunPreservedState, 'direct init-project canonical rerun'),
  check('CMDX02d', 'canonical init --force still preserves existing project state', initForceRerun.status === 0 && Array.isArray(initForceRerunData?.results) && initForceRerunData.results.find((item) => item.relativePath === 'state.json')?.status === 'skipped' && initForcePreservedState, 'direct init-project canonical --force rerun'),
  check('CMDX02e', 'legacy init returns an exact migration proposal with zero writes', legacyInitRun.status !== 0 && legacyInitData?.reasonCode === 'MIGRATION_INSPECTION_READY' && legacyInitData?.proposedWrites?.some((item) => item.path === '.gse/state.json') && JSON.stringify(legacyInitAfter) === JSON.stringify(legacyInitBefore), 'direct init-project legacy fixture'),
  check('CMDX02f', 'malformed init fails closed and --force performs zero scaffold writes', malformedInitRun.status !== 0 && !['proceed', 'complete'].includes(malformedInitData?.status) && typeof malformedInitData?.reasonCode === 'string' && malformedInitData.reasonCode !== 'MIGRATION_INSPECTION_READY' && malformedInitData?.results?.length === 0 && JSON.stringify(malformedInitAfter) === JSON.stringify(malformedInitBefore), JSON.stringify({ status: malformedInitData?.status ?? null, reasonCode: malformedInitData?.reasonCode ?? null, treePreserved: JSON.stringify(malformedInitAfter) === JSON.stringify(malformedInitBefore) })),
  check('CMDX02g', 'canonical update enters the transaction with defined revision and active Change identity', canonicalUpdateRun.status === 0 && canonicalUpdateData?.summary?.status === 'passed' && canonicalUpdatedState?.stateRevision === 5 && canonicalUpdatedState?.activeChangeId === null, JSON.stringify({ status: canonicalUpdateData?.summary?.status ?? null, stateRevision: canonicalUpdatedState?.stateRevision ?? null, activeChangeId: canonicalUpdatedState?.activeChangeId ?? 'missing' })),
  check('CMDX02h', 'legacy update defaults to an exact read-only migration proposal', legacyUpdatePreviewRun.status === 0 && legacyUpdatePreview?.summary?.status === 'migration-available' && legacyUpdatePreview?.migration?.reasonCode === 'MIGRATION_INSPECTION_READY' && legacyUpdatePreview?.results?.some((item) => item.relativePath === '.gse/state.json' && item.status === 'would-write') && JSON.stringify(legacyUpdateAfterPreview) === JSON.stringify(legacyUpdateBefore), 'direct update legacy preview'),
  check('CMDX02i', 'legacy update migrates only with explicit execution', legacyUpdateExecuteRun.status === 0 && legacyUpdateExecute?.summary?.status === 'passed' && legacyUpdateExecute?.migration?.reasonCode === 'TRANSACTION_COMMITTED' && migratedUpdateState?.stateRevision === 1 && migratedUpdateState?.activeChangeId === null && !Object.hasOwn(migratedUpdateState ?? {}, 'toolStatus'), JSON.stringify({ status: legacyUpdateExecute?.summary?.status ?? null, reasonCode: legacyUpdateExecute?.migration?.reasonCode ?? null, stateRevision: migratedUpdateState?.stateRevision ?? null })),
  check('CMDX02j', 'post-migration update rerun follows the canonical transaction path', legacyUpdateRerun.status === 0 && legacyUpdateRerunData?.summary?.status === 'passed' && !legacyUpdateRerunData?.migration && rerunUpdateState?.stateRevision === 2 && rerunUpdateState?.activeChangeId === null, JSON.stringify({ status: legacyUpdateRerunData?.summary?.status ?? null, stateRevision: rerunUpdateState?.stateRevision ?? null })),
  check('CMDX02k', 'malformed update fails closed and --force cannot bypass it', malformedUpdateRun.status !== 0 && malformedUpdateData?.summary?.status === 'failed' && malformedUpdateData?.results?.length === 0 && malformedUpdateData?.recommendation?.includes('--force does not bypass') && JSON.stringify(malformedUpdateAfter) === JSON.stringify(malformedUpdateBefore), JSON.stringify({ status: malformedUpdateData?.summary?.status ?? null, treePreserved: JSON.stringify(malformedUpdateAfter) === JSON.stringify(malformedUpdateBefore) })),
  check('CMDX03', 'host command adapters are generated', adapterRun.status === 0 && claudeCommand.includes('run-gse-command.mjs') && codexPointer.includes('run-gse-command.mjs') && copilotPointer.includes('GitHub Copilot GSE Adapter') && geminiPointer.includes('Gemini GSE Adapter'), 'generated supported host adapters'),
  check('CMDX04a', '/gse help renders the authoritative registry outside a GSE project', helpRun.status === 0 && help?.execution?.status === 0 && helpData?.status === 'ready' && helpData?.commands?.length === Object.keys(helpData?.commands ?? {}).length && helpData?.commands?.some((item) => item.command === '/gse adopt' && item.effect.includes('write-with-execute')), '/gse help'),
  check('CMDX04b', 'unknown commands fail distinctly and point to help', unknownRun.status !== 0 && unknown?.coreResult?.reasonCode === 'UNKNOWN_COMMAND' && unknownData?.status === 'unknown-command' && unknownData?.help === '/gse help', '/gse unsupported-command'),
  check('CMDX04c', '/gse adopt preview is read-only and reports missing artifacts', adoptPreviewRun.status === 0 && adoptPreviewData?.status === 'preview' && adoptPreviewData?.writes?.performed === false && adoptPreviewData?.proposedWrites?.length > 0 && adoptPreviewPreserved, '/gse adopt --mode lite'),
  check('CMDX04d', '/gse adopt --execute creates missing artifacts and preserves existing rules and GSE state', adoptExecuteRun.status === 0 && adoptExecuteData?.status === 'adopted' && adoptExecuteData?.writes?.performed === true && adoptExecutePreserved && fs.existsSync(path.join(adoptTarget, '.gse', 'project-profile.md')), '/gse adopt --mode lite --execute'),
  check('CMDX04e', '/gse slice returns a complete proof-boundary packet without writes', sliceRun.status === 0 && sliceData?.status === 'ready' && ['outcome', 'scope', 'nonGoals', 'acceptance', 'evidence', 'risks', 'nextAction', 'proofBoundary', 'evidenceMatrix'].every((field) => typeof sliceData?.[field] === 'string' && sliceData[field].length > 0) && sliceData?.contract?.independentAcceptance === true && sliceData?.writes?.performed === false, '/gse slice'),
  check('CMDX04f', 'mechanical implementation steps do not satisfy the functional Slice contract', mechanicalSliceRun.status === 0 && mechanicalSliceData?.status === 'needs-input' && mechanicalSliceData?.contractErrors?.some((item) => item.includes('proofBoundary')), '/gse slice mechanical-step fixture'),
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
      check('CMDX08g6', '/gse install --execute preserves existing files without force', installPreserveRun.status === 0 && installPreserveReport?.execution?.status === 0 && installPreserveData?.summary?.skipped > 0 && installPreservedWithoutForce, '/gse install --execute without --force'),
      check('CMDX08g7', '/gse install overwrites existing files only with explicit force', installForceRun.status === 0 && installForceReport?.execution?.status === 0 && installForceData?.summary?.written > 0 && installOverwrittenWithForce, '/gse install --execute --force'),
      check('CMDX08h', '/gse public-release dry-runs the ordered public release checklist without writing canonical output', publicReleaseDryRun.status === 0 && publicReleaseDryRunReport?.execution?.status === 0 && publicReleaseDryRunData?.status === 'ready' && publicReleaseDryRunData?.dryRun === true && publicReleaseDryRunData?.publicReleaseChecklist === 'ready', '/gse public-release'),
      check('CMDX08i', '/gse public-release --execute writes the requested checklist output', publicReleaseExecuteRun.status === 0 && publicReleaseExecuteReport?.execution?.status === 0 && publicReleaseExecuteData?.status === 'written' && publicReleaseExecuteData?.dryRun === false && fs.existsSync(publicReleaseExecuteOut) && fs.readFileSync(publicReleaseExecuteOut, 'utf8').includes('GSE Public Release Checklist'), '/gse public-release --execute --out <tmp>'),
      check('CMDX09', '/gse doctor falls back to target project doctor for normal projects', doctorTarget?.execution?.command?.includes('audit-target-project.mjs') && doctorTargetData?.workflows?.targetProjectDoctor?.startsWith('verified') && doctorTargetData?.summary?.failed === 0, '/gse doctor on fixture target'),
      check('CMDX10', '/gse verify executes validation profile runner', verifyRun.status === 0 && verify?.execution?.status === 0 && verify?.execution?.stdout?.includes('"profile": "lite"') && verify?.execution?.stdout?.includes('"validationProfile": "verified"'), '/gse verify --profile lite'),
      check('CMDX19', '/gse verify retains validation routing and adds a verify envelope', verify?.coreResult?.stage === 'verify', '/gse verify'),
      check('CMDX11', '/gse audit executes target project doctor', audit?.execution?.command?.includes('audit-target-project.mjs') && auditData?.workflows?.targetProjectDoctor?.startsWith('verified') && auditData?.summary?.failed === 0, '/gse audit'),
      check('CMDX12', '/gse close executes the close gate and preserves not-ready diagnostics', close?.execution?.command?.includes('audit-close-gate.mjs') && closeRun.status !== 0 && closeData?.summary?.status === 'not-ready' && closeData?.checks?.some((item) => item.id === 'CG04' && item.status === 'failed') && closeData?.checks?.some((item) => item.id === 'CG05' && item.status === 'failed'), '/gse close'),
      check('CMDX20', '/gse close remains a readiness check and adds a close envelope', close?.coreResult?.stage === 'close' && !close?.execution?.command?.includes('release'), '/gse close'),
      check('CMDX21', 'release remains post-Close and outside the five-stage facade', releaseDryRunReport?.coreResult?.stage === null && releaseDryRunReport?.coreResult?.reasonCode === 'POST_CLOSE_RELEASE', '/gse release'),
      check('CMDX13', '/gse change executes change pack creation only with --execute', changeRun.status === 0 && change?.execution?.status === 0 && fs.existsSync(path.join(target, '.gse', 'changes', 'add-login', 'brief.md')), '/gse change --execute'),
      check(
        'CMDX14',
        '/gse repair is read-only by default and explicitly migrates safe legacy state',
        Object.values(repairCommandConditions).every(Boolean),
        JSON.stringify({
          ...repairCommandConditions,
          actualRerunReason: repairRerunData?.compatibility?.reasonCode ?? null,
          rerunProposedWrites: repairRerunData?.compatibility?.proposedWrites ?? [],
          rerunDiagnostics: repairRerunData?.compatibility?.diagnostics ?? [],
        }),
      ),
    ]
  : []

const checks = [...liteChecks, ...fullChecks]
const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const commandRuns = [initPreviewRun, initRun, adapterRun, helpRun, unknownRun, adoptPreviewRun, adoptExecuteRun, sliceRun, continueRun, stageRun, discoverRun, discoverySelectRun, discoveryPromoteRun, repairRun, frameRun, specifyRun, buildRun, shortCliRun, statusRun, doctorRun, acceptanceRun, ownerActionsRun, ownerActionsCompactRun, probeWaitingRun, probeRejectRun, releaseDryRun, releaseExecuteRun, packageDryRun, packageExecuteRun, installDryRun, installExecuteRun, installPreserveRun, installForceRun, publicReleaseDryRun, publicReleaseExecuteRun, doctorTargetRun, verifyRun, auditRun, closeRun, changeRun, repairPreviewRun, repairExecuteRun, repairRerun].filter(Boolean)
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

if (!keepTemp) {
  try {
    fs.rmSync(target, { recursive: true, force: true })
  } catch {
    report.cleanupWarning = 'failed to remove temp target: ' + target
  }
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(JSON.stringify(report, null, 2))

if (failed > 0) process.exit(1)
