#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { resolveAutonomyPolicy } from './core/autonomy-policy.mjs'
import { createResultEnvelope } from './core/contracts.mjs'
import { facadeRoute } from './core/lifecycle.mjs'
import { resolveProjectAuthority } from './core/project-authority.mjs'
import { resolveTaskProfile } from './core/profiles.mjs'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const target = path.resolve(readArg('--target', process.cwd()))
const commandText = readArg('--command', args.find((item) => item.startsWith('/gse') || item.startsWith('gse ')) ?? '/gse help')
const jsonOnly = args.includes('--json')
const execute = args.includes('--execute')
const compactOutput = args.includes('--compact')
const force = args.includes('--force') || /(?:^|\s)--force(?:\s|$)/.test(commandText)

function readJson(relativePath) {
  const fullPath = path.join(target, relativePath)
  if (!fs.existsSync(fullPath)) return null
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8').replace(/^\uFEFF/, ''))
  } catch {
    return null
  }
}

function readText(relativePath) {
  const fullPath = path.join(target, relativePath)
  if (!fs.existsSync(fullPath)) return ''
  return fs.readFileSync(fullPath, 'utf8').replace(/^\uFEFF/, '')
}

function exists(relativePath) {
  return fs.existsSync(path.join(target, relativePath))
}

function runNode(script, commandArgs) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', script), ...commandArgs], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  })
  const stdout = (result.stdout ?? '').trim()
  let diagnosticSummary = null
  try {
    const parsed = JSON.parse(stdout)
    if (parsed?.summary && typeof parsed.summary.failed === 'number') {
      diagnosticSummary = parsed.summary
    }
  } catch {
    diagnosticSummary = null
  }
  const status = result.status ?? 1
  const ok = status === 0 || Boolean(diagnosticSummary && diagnosticSummary.failed === 0)
  return {
    command: [process.execPath, path.join(root, 'scripts', script), ...commandArgs].join(' '),
    status,
    ok,
    diagnosticSummary,
    stdout,
    stderr: (result.stderr ?? '').trim(),
  }
}

function normalizeCommand(value) {
  return String(value || '')
    .trim()
    .replace(/^gse\b/i, '/gse')
    .replace(/\s+/g, ' ')
}

function readRestValue(items, name, fallback = '') {
  const index = items.indexOf(name)
  if (index === -1) return fallback
  const values = []
  for (let cursor = index + 1; cursor < items.length; cursor += 1) {
    const item = items[cursor]
    if (item.startsWith('--')) break
    values.push(item)
  }
  return values.join(' ').replace(/^["']|["']$/g, '').trim() || fallback
}

function parsedStdout(result) {
  try {
    return JSON.parse(result?.stdout ?? '')
  } catch {
    return null
  }
}

function resultFromPayload(command, payload, { ok = true, stderr = '' } = {}) {
  return {
    command,
    status: ok ? 0 : 1,
    ok,
    diagnosticSummary: {
      status: ok ? 'passed' : 'failed',
      failed: ok ? 0 : 1,
      total: 1,
    },
    stdout: JSON.stringify(payload, null, 2),
    stderr,
  }
}

function markdownSection(markdown, heading) {
  const lines = markdown.split(/\r?\n/)
  const expected = `## ${heading}`.toLowerCase()
  const headingIndex = lines.findIndex((line) => line.trim().toLowerCase() === expected)
  if (headingIndex === -1) return ''
  const section = []
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) break
    const value = lines[index].replace(/^\s*[-*]\s*/, '').trim()
    if (value) section.push(value)
  }
  return section.join(' ')
}

const normalized = normalizeCommand(commandText)
const parts = normalized.split(' ')
const verb = parts[0] === '/gse' ? (parts[1] || 'help') : 'help'
const rest = parts.slice(2)
const state = readJson('.gse/state.json')
const authority = exists('.gse') ? resolveProjectAuthority(target) : null
const authoritySummary = authority
  ? {
      status: authority.status,
      stateRevision: authority.stateRevision,
      projectMode: authority.projectMode,
      safeToContinue: authority.safeToContinue,
      sources: Object.fromEntries(
        Object.entries(authority.sources).map(([name, source]) => [name, {
          path: source.path ?? null,
          exists: source.exists ?? null,
          valid: source.valid ?? null,
        }]),
      ),
      conflicts: authority.conflicts,
      freshness: authority.freshness,
    }
  : null
const projectProfile = exists('.gse/project-profile.md')
const goalMap = exists('.gse/goal-map.md')
const qualityGates = exists('.gse/quality-gates.md')
const canonicalPlan = state?.canonicalPlan ?? null
const canonicalGoalSource = state?.canonicalGoalSource ?? state?.canonicalPlan ?? null

const commandMap = {
  help: {
    route: 'references/commands.md',
    effect: 'read-only',
    summary: 'Show GSE commands and project entry files.',
  },
  frame: {
    route: 'scripts/detect-project-stage.mjs',
    effect: 'read-only',
    summary: 'Frame through current project discovery and first unmet gate.',
  },
  specify: {
    route: 'scripts/init-change.mjs',
    effect: 'read-only by default; write-with-execute',
    summary: 'Specify through the existing native Change pack.',
  },
  build: {
    route: 'scripts/generate-continue-packet.mjs',
    effect: 'read-only',
    summary: 'Build from the accepted current Change and next action.',
  },
  continue: {
    route: 'scripts/generate-continue-packet.mjs',
    effect: 'read-only',
    summary: 'Run a hard continuation preflight and generate a compact state packet.',
  },
  context: {
    route: 'scripts/audit-context-health.mjs or scripts/generate-context-checkpoint.mjs',
    effect: 'read-only by default; bounded checkpoint write with --execute',
    summary: 'Inspect context pressure and route compact output, bounded workers, checkpoint, or rollover.',
  },
  stage: {
    route: 'scripts/detect-project-stage.mjs',
    effect: 'read-only',
    summary: 'Detect the current project stage, first unmet gate, bounded context pack, roles, and next stage.',
  },
  discover: {
    route: 'scripts/generate-goal-discovery-packet.mjs or scripts/promote-goal-discovery.mjs',
    effect: 'read-only by default; session persistence or Goal/Spec promotion with --execute',
    summary: 'Turn natural-language intent into comparable paths, record a choice, and explicitly promote it into Goal/Spec artifacts.',
  },
  next: {
    route: 'scripts/generate-continue-packet.mjs',
    effect: 'read-only',
    summary: 'Alias for /gse continue.',
  },
  status: {
    route: 'scripts/generate-final-form-progress-report.mjs or .gse/state.json',
    effect: 'read-only',
    summary: 'Show project state, or GSE final-form progress when the target is the GSE skill.',
  },
  doctor: {
    route: 'scripts/audit-public-acceptance-readiness.mjs or scripts/audit-target-project.mjs',
    effect: 'read-only',
    summary: 'Diagnose final-form public/host claim evidence for GSE, or target-project GSE readiness for normal projects.',
  },
  repair: {
    route: 'scripts/audit-state-repair.mjs',
    effect: 'read-only by default; shared Core v1 migration with --execute',
    summary: 'Diagnose Core v1 compatibility, state/evidence drift, and risk-history health; explicitly migrate safe legacy state.',
  },
  acceptance: {
    route: 'scripts/audit-public-acceptance-readiness.mjs or scripts/audit-target-project.mjs',
    effect: 'read-only',
    summary: 'Alias for /gse doctor focused on final acceptance boundaries.',
  },
  'owner-actions': {
    route: 'scripts/audit-public-acceptance-readiness.mjs',
    effect: 'read-only',
    summary: 'Show the remaining owner/external actions required before public acceptance.',
  },
  probe: {
    route: 'scripts/probe-public-external-gates.mjs',
    effect: 'read-only',
    summary: 'Probe supplied owner/external evidence locations before accepted records are written.',
  },
  release: {
    route: 'scripts/generate-release-bundle.mjs or scripts/audit-release-bundle.mjs',
    effect: 'read-only by default; write-with-execute for canonical bundle generation',
    summary: 'Dry-run or generate a release bundle for open-source/package handoff.',
  },
  package: {
    route: 'scripts/package-gse.mjs',
    effect: 'read-only by default; write-with-execute for local package generation',
    summary: 'Dry-run or generate a local installable GSE package.',
  },
  install: {
    route: 'scripts/install-gse.mjs',
    effect: 'read-only by default; write-with-execute for install target writes',
    summary: 'Dry-run or install GSE from a local package path or URL-shaped package source.',
  },
  'public-release': {
    route: 'scripts/generate-public-release-checklist.mjs or scripts/audit-public-release-checklist.mjs',
    effect: 'read-only by default; write-with-execute for canonical checklist generation',
    summary: 'Dry-run or generate the ordered owner/public release checklist.',
  },
  maintenance: {
    route: 'scripts/generate-maintenance-snapshot.mjs',
    effect: 'read-only',
    summary: 'Generate a recurring maintenance snapshot for benchmark, drift, evidence, installed sync, session sync, and release freshness checks.',
  },
  owner: {
    route: 'scripts/audit-public-acceptance-readiness.mjs',
    effect: 'read-only',
    summary: 'Alias for /gse owner-actions.',
  },
  audit: {
    route: 'scripts/audit-target-project.mjs',
    effect: 'read-only',
    summary: 'Audit target project GSE readiness.',
  },
  close: {
    route: 'scripts/audit-close-gate.mjs',
    effect: 'read-only',
    summary: 'Check whether current slice can close.',
  },
  verify: {
    route: 'references/quality-gates.md',
    effect: 'read-only',
    summary: 'Select and run focused verification according to project quality gates.',
  },
  learn: {
    route: 'scripts/record-learning.mjs or scripts/audit-learning-promotion.mjs',
    effect: 'read-only by default; write-with-execute for .gse/learnings.md or candidate-only .gse/learning-promotions.md',
    summary: 'Record a reusable project lesson, or run promotion analysis with --promote.',
  },
  slice: {
    route: 'references/spec-workflow.md',
    effect: 'read-only',
    summary: 'Normalize outcome, scope, acceptance, evidence, risk, and next action.',
  },
  init: {
    route: 'scripts/init-project.mjs',
    effect: 'write-with-execute',
    summary: 'Initialize .gse scaffold when --execute is supplied.',
  },
  adopt: {
    route: 'references/adoption-recipes.md',
    effect: 'write-with-execute',
    summary: 'Adopt GSE without overwriting local rules.',
  },
  change: {
    route: 'scripts/init-change.mjs',
    effect: 'write-with-execute',
    summary: 'Create a change pack when --execute is supplied.',
  },
}

const knownCommand = Object.hasOwn(commandMap, verb)
const route = knownCommand ? commandMap[verb] : null
let execution = null

if (!knownCommand) {
  execution = resultFromPayload(
    'resolve GSE command',
    {
      status: 'unknown-command',
      command: normalized,
      verb,
      message: `Unknown GSE command: ${verb}`,
      help: '/gse help',
      availableCommands: Object.keys(commandMap).map((name) => `/gse ${name}`),
    },
    { ok: false, stderr: `Unknown GSE command: ${verb}` },
  )
} else if (verb === 'help') {
  const commands = Object.entries(commandMap).map(([name, definition]) => ({
    command: `/gse ${name}`,
    effect: definition.effect,
    summary: definition.summary,
    route: definition.route,
  }))
  execution = resultFromPayload('render GSE command registry', {
    status: 'ready',
    title: 'GSE Commands',
    commands,
    entryFiles: ['SKILL.md', 'references/commands.md'],
  })
} else if (verb === 'init') {
  const mode = rest.includes('--mode') ? rest[rest.indexOf('--mode') + 1] : 'auto'
  const initArgs = ['--target', target, '--mode', mode, '--json']
  if (force) initArgs.push('--force')
  execution = execute
    ? runNode('init-project.mjs', initArgs)
    : resultFromPayload('preview init-project.mjs', {
        status: 'preview',
        target,
        mode,
        writes: { performed: false, requiresExecute: true },
      })
} else if (verb === 'adopt') {
  const mode = rest.includes('--mode') ? rest[rest.indexOf('--mode') + 1] : 'auto'
  const expectedArtifacts = [
    '.gse/state.json',
    '.gse/evidence/index.jsonl',
    '.gse/README.md',
    '.gse/project-profile.md',
    '.gse/goal-map.md',
    '.gse/quality-gates.md',
    '.gse/project-guards.md',
    '.gse/tooling.md',
    '.gse/host-capabilities.md',
    '.gse/learnings.md',
  ]
  const existingArtifacts = expectedArtifacts.filter((item) => exists(item))
  const missingArtifacts = expectedArtifacts.filter((item) => !exists(item))
  const preservedProjectFiles = ['AGENTS.md', 'CLAUDE.md', 'README.md', 'package.json']
    .filter((item) => exists(item))
  const beforeAudit = runNode('audit-target-project.mjs', ['--target', target, '--json'])
  if (!execute) {
    execution = resultFromPayload('preview GSE adoption', {
      status: 'preview',
      target,
      mode,
      readiness: parsedStdout(beforeAudit),
      proposedWrites: missingArtifacts,
      preservedArtifacts: existingArtifacts,
      preservedProjectFiles,
      conflicts: [],
      writes: { performed: false, requiresExecute: true },
      evidenceBoundary: 'Discovered project configuration remains documented until its commands are executed.',
    })
  } else {
    const initArgs = ['--target', target, '--mode', mode, '--json']
    if (force) initArgs.push('--force')
    const adoption = runNode('init-project.mjs', initArgs)
    const afterAudit = adoption.ok
      ? runNode('audit-target-project.mjs', ['--target', target, '--json'])
      : null
    execution = resultFromPayload('adopt GSE with init-project.mjs and audit-target-project.mjs', {
      status: adoption.ok ? 'adopted' : 'failed',
      target,
      mode,
      force: force,
      adoption: parsedStdout(adoption),
      readiness: parsedStdout(afterAudit),
      proposedWrites: missingArtifacts,
      preservedArtifacts: force ? [] : existingArtifacts,
      preservedProjectFiles,
      conflicts: [],
      writes: { performed: adoption.ok },
      evidenceBoundary: 'Discovered project configuration remains documented until its commands are executed.',
    }, { ok: adoption.ok, stderr: adoption.stderr })
  }
} else if (verb === 'slice') {
  const currentSliceText = readText('.gse/current-slice.md')
  const stateSlice = state?.currentSlice ?? {}
  const profileIndex = rest.indexOf('--profile')
  const requestedProfile = profileIndex === -1 ? null : rest[profileIndex + 1]
  const intent = [
    readRestValue(rest, '--outcome'),
    readRestValue(rest, '--scope'),
    readRestValue(rest, '--acceptance'),
  ].filter(Boolean).join(' ')
  const taskProfile = resolveTaskProfile({
    intent,
    projectMode: state?.mode ?? null,
    preferredProfile: requestedProfile,
  })
  const autonomyPolicy = resolveAutonomyPolicy({ taskProfile })
  const hasSliceCommandArguments = rest.some((item) => item.startsWith('--'))
  const fields = {
    outcome: readRestValue(rest, '--outcome') || stateSlice.outcome || markdownSection(currentSliceText, 'Outcome') || null,
    scope: readRestValue(rest, '--scope') || markdownSection(currentSliceText, 'Scope') || null,
    nonGoals: readRestValue(rest, '--non-goals') || markdownSection(currentSliceText, 'Non-goals') || null,
    acceptance: readRestValue(rest, '--acceptance') || markdownSection(currentSliceText, 'Acceptance') || null,
    evidence: readRestValue(rest, '--evidence') || markdownSection(currentSliceText, 'Evidence') || markdownSection(currentSliceText, 'Evidence Plan') || null,
    risks: readRestValue(rest, '--risks') || markdownSection(currentSliceText, 'Risks') || null,
    nextAction: readRestValue(rest, '--next-action') || stateSlice.nextAction || markdownSection(currentSliceText, 'Next Action') || null,
    proofBoundary: readRestValue(rest, '--proof-boundary')
      || (!hasSliceCommandArguments && (stateSlice.proofBoundary || markdownSection(currentSliceText, 'Proof Boundary') || markdownSection(currentSliceText, 'Capability Boundary')))
      || null,
    evidenceMatrix: readRestValue(rest, '--evidence-matrix')
      || (!hasSliceCommandArguments && (stateSlice.evidenceMatrix || markdownSection(currentSliceText, 'Evidence Matrix')))
      || null,
  }
  const requiredFieldNames = taskProfile.taskProfile === 'lite'
    ? ['outcome', 'scope', 'acceptance', 'evidence', 'nextAction']
    : Object.keys(fields)
  const missingFields = requiredFieldNames.filter((name) => !fields[name])
  const boundaryText = `${fields.proofBoundary || ''} ${fields.acceptance || ''}`.toLowerCase()
  const hasIndependentBoundary = taskProfile.taskProfile === 'lite'
    || /user[- ]visible|production|security|migration|safety|capability|route|api|persistence|integration/.test(boundaryText)
  const nextActionParts = String(fields.nextAction || '').split(/\s*(?:;|\n|\band then\b|\bthen\b)\s*/i).filter(Boolean)
  const contractErrors = [
    ...missingFields,
    ...(taskProfile.status === 'ask_user' ? ['taskProfile requires a hard-risk decision before implementation'] : []),
    ...(taskProfile.taskProfile !== 'lite' && fields.proofBoundary && !hasIndependentBoundary ? ['proofBoundary must name a user-visible, production, security, migration, or capability boundary'] : []),
    ...(fields.nextAction && nextActionParts.length > 1 ? ['nextAction must describe one verifiable behavior'] : []),
  ]
  execution = resultFromPayload('normalize current GSE slice', {
    status: contractErrors.length === 0 ? 'ready' : 'needs-input',
    target,
    projectMode: state?.mode ?? null,
    taskProfile: taskProfile.taskProfile,
    taskProfileStatus: taskProfile.status,
    taskProfileTriggers: taskProfile.triggerIds,
    autonomyPolicy,
    currentStateAuthority: authoritySummary,
    ...fields,
    contract: {
      kind: taskProfile.taskProfile === 'lite' ? 'direct-lite-slice' : 'functional-proof-boundary',
      requiredFields: requiredFieldNames,
      independentAcceptance: hasIndependentBoundary,
      complete: contractErrors.length === 0,
      internalStepsBelongToSlice: true,
      persistence: 'none',
    },
    missingFields,
    contractErrors,
    sources: {
      state: Boolean(state),
      currentSlice: Boolean(currentSliceText),
      goalMap,
      qualityGates,
      commandArguments: rest.some((item) => item.startsWith('--')),
    },
    writes: { performed: false },
  })
} else if (verb === 'specify') {
  const changeId = rest.find((item) => !item.startsWith('--')) ?? 'gse-change'
  const levelIndex = rest.indexOf('--level')
  const level = levelIndex === -1 ? null : rest[levelIndex + 1]
  if (!level) {
    execution = resultFromPayload('resolve Change level', {
      status: 'needs-input',
      changeId,
      message: 'Formal Change creation requires --level lite|standard|enterprise.',
      writes: { performed: false },
    }, { ok: false, stderr: 'Missing required --level.' })
  } else {
    execution = execute
      ? runNode('init-change.mjs', ['--target', target, '--change-id', changeId, '--level', level, '--json'])
      : {
          command: [process.execPath, path.join(root, 'scripts', 'init-change.mjs'), '--target', target, '--change-id', changeId, '--level', level, '--json'].join(' '),
          status: 0,
          ok: true,
          diagnosticSummary: { status: 'passed', failed: 0, total: 1 },
          stdout: JSON.stringify({ status: 'preview', changeId, level, writes: { performed: false } }),
          stderr: '',
        }
  }
} else if (verb === 'change') {
  const changeId = rest.find((item) => !item.startsWith('--')) ?? 'gse-change'
  const levelIndex = rest.indexOf('--level')
  const level = levelIndex === -1 ? null : rest[levelIndex + 1]
  if (!level) {
    execution = resultFromPayload('resolve Change level', {
      status: 'needs-input',
      changeId,
      message: 'Formal Change creation requires --level lite|standard|enterprise.',
      writes: { performed: false },
    }, { ok: false, stderr: 'Missing required --level.' })
  } else if (execute) {
    execution = runNode('init-change.mjs', ['--target', target, '--change-id', changeId, '--level', level, '--json'])
  } else {
    execution = resultFromPayload('preview Change creation', {
      status: 'preview',
      changeId,
      level,
      writes: { performed: false, requiresExecute: true },
    })
  }
} else if (verb === 'frame' || verb === 'stage') {
  const intent = rest.filter((item) => !item.startsWith('--')).join(' ')
  execution = runNode('detect-project-stage.mjs', ['--root', root, '--target', target, '--intent', intent, '--json'])
} else if (verb === 'discover') {
  const sessionIndex = rest.indexOf('--session')
  const selectIndex = rest.indexOf('--select')
  if (sessionIndex !== -1 || selectIndex !== -1) {
    const promotionArgs = [
      '--root', root,
      '--target', target,
      '--session', sessionIndex === -1 ? '' : (rest[sessionIndex + 1] || ''),
      '--select', selectIndex === -1 ? '' : (rest[selectIndex + 1] || ''),
      '--json',
    ]
    const changeIdIndex = rest.indexOf('--change-id')
    if (changeIdIndex !== -1 && rest[changeIdIndex + 1]) promotionArgs.push('--change-id', rest[changeIdIndex + 1])
    if (rest.includes('--promote')) promotionArgs.push('--promote')
    if (execute) promotionArgs.push('--execute')
    execution = runNode('promote-goal-discovery.mjs', promotionArgs)
  } else {
    const valueFlags = new Set(['--session-id'])
    const intentParts = []
    for (let index = 0; index < rest.length; index += 1) {
      const item = rest[index]
      if (valueFlags.has(item)) {
        index += 1
      } else if (!item.startsWith('--')) {
        intentParts.push(item)
      }
    }
    const discoveryArgs = ['--root', root, '--target', target, '--intent', intentParts.join(' '), '--json']
    const sessionIdIndex = rest.indexOf('--session-id')
    if (sessionIdIndex !== -1 && rest[sessionIdIndex + 1]) discoveryArgs.push('--session-id', rest[sessionIdIndex + 1])
    if (execute) discoveryArgs.push('--execute')
    execution = runNode('generate-goal-discovery-packet.mjs', discoveryArgs)
  }
} else if (verb === 'build' || verb === 'continue' || verb === 'next') {
  const continueArgs = ['--root', root, '--target', target, '--json']
  if (compactOutput) continueArgs.push('--compact')
  if (rest.includes('--brief')) continueArgs.push('--brief')
  if (rest.includes('--doctor') || rest.includes('--full')) continueArgs.push('--doctor')
  const profileIndex = rest.indexOf('--profile')
  if (profileIndex !== -1 && rest[profileIndex + 1]) continueArgs.push('--profile', rest[profileIndex + 1])
  const sessionIndex = rest.indexOf('--session')
  const sessionIdIndex = rest.indexOf('--session-id')
  if (sessionIndex !== -1 && rest[sessionIndex + 1]) continueArgs.push('--session', path.resolve(rest[sessionIndex + 1]))
  if (sessionIdIndex !== -1 && rest[sessionIdIndex + 1]) continueArgs.push('--session-id', rest[sessionIdIndex + 1])
  execution = runNode('generate-continue-packet.mjs', continueArgs)
} else if (verb === 'context') {
  const contextArgs = ['--target', target, '--json']
  const sessionIndex = rest.indexOf('--session')
  const sessionIdIndex = rest.indexOf('--session-id')
  if (sessionIndex !== -1 && rest[sessionIndex + 1]) contextArgs.push('--session', path.resolve(rest[sessionIndex + 1]))
  if (sessionIdIndex !== -1 && rest[sessionIdIndex + 1]) contextArgs.push('--session-id', rest[sessionIdIndex + 1])
  if (rest.includes('--checkpoint')) {
    const checkpointArgs = ['--root', root, '--target', target, ...contextArgs.slice(2)]
    const outIndex = rest.indexOf('--out')
    if (outIndex !== -1 && rest[outIndex + 1]) checkpointArgs.push('--out', path.resolve(rest[outIndex + 1]))
    if (execute) checkpointArgs.push('--execute')
    execution = runNode('generate-context-checkpoint.mjs', checkpointArgs)
  } else {
    execution = runNode('audit-context-health.mjs', contextArgs)
  }
} else if (verb === 'status') {
  const targetHasFinalFormReport = fs.existsSync(path.join(target, 'scripts', 'generate-final-form-progress-report.mjs'))
    && fs.existsSync(path.join(target, 'references', 'final-readiness.md'))
  execution = targetHasFinalFormReport
    ? runNode('generate-final-form-progress-report.mjs', ['--root', target, '--dry-run', '--json'])
    : {
        command: 'read .gse/state.json',
        status: state ? 0 : 1,
        ok: Boolean(state),
        diagnosticSummary: state ? { status: 'passed', failed: 0, total: 1 } : { status: 'failed', failed: 1, total: 1 },
        stdout: JSON.stringify({
          status: authority?.status === 'blocked'
            ? 'blocked'
            : state
              ? authority?.status ?? 'ready'
              : 'missing-state',
          target,
          state: authority?.authoritativeState ?? state ?? null,
          currentStateAuthority: authoritySummary,
          project: {
            hasGse: exists('.gse'),
            projectProfile,
            goalMap,
            qualityGates,
            canonicalPlan,
            canonicalPlanExists: canonicalPlan ? exists(canonicalPlan) : null,
            canonicalGoalSource,
            canonicalGoalSourceExists: canonicalGoalSource ? exists(canonicalGoalSource) : null,
            goalMapRole: 'gse-execution-projection',
          },
          limits: [
            'Generic project status reports the authoritative Core v1 state with explicit projection conflicts and fallback warnings.',
            'Goal Map remains an execution projection and never overrides state or current-slice authority.',
            'Final-form progress report is available when the target is the GSE skill package.',
          ],
        }),
        stderr: state ? '' : '.gse/state.json is missing or invalid',
      }
} else if (verb === 'doctor' || verb === 'acceptance') {
  const targetHasPublicAcceptanceDoctor = fs.existsSync(path.join(target, 'scripts', 'audit-public-acceptance-readiness.mjs'))
    && fs.existsSync(path.join(target, 'references', 'final-readiness.md'))
  execution = targetHasPublicAcceptanceDoctor
    ? runNode('audit-public-acceptance-readiness.mjs', ['--root', target, '--json'])
    : runNode('audit-target-project.mjs', ['--target', target, '--json'])
} else if (verb === 'repair') {
  const repairArgs = ['--root', root, '--target', target, '--json']
  if (execute) repairArgs.push('--execute')
  const maxRiskIndex = rest.indexOf('--max-risk-length')
  if (maxRiskIndex !== -1) repairArgs.push('--max-risk-length', rest[maxRiskIndex + 1] || '260')
  execution = runNode('audit-state-repair.mjs', repairArgs)
} else if (verb === 'owner-actions' || verb === 'owner') {
  const targetHasPublicAcceptanceDoctor = fs.existsSync(path.join(target, 'scripts', 'audit-public-acceptance-readiness.mjs'))
    && fs.existsSync(path.join(target, 'references', 'final-readiness.md'))
  if (targetHasPublicAcceptanceDoctor) {
    const doctor = runNode('audit-public-acceptance-readiness.mjs', ['--root', target, '--json'])
    let compact = null
    try {
      const parsed = JSON.parse(doctor.stdout)
      compact = {
        status: parsed.summary?.status ?? 'unknown',
        publicAccepted: parsed.summary?.publicAccepted ?? 'unknown',
        pendingGateCount: parsed.summary?.pendingGates ?? 0,
        actions: (parsed.pendingGates ?? []).map((gate, index) => ({
          order: String(index + 1).padStart(2, '0'),
          area: gate.area,
          owner: gate.owner,
          status: gate.status,
          requiredEvidence: gate.requiredEvidence,
          recordCommand: gate.recordCommand,
          preflightCommand: gate.preflightCommand,
        })),
        verificationCommands: [
          'node scripts/run-gse-command.mjs --root __GSE__ --target __GSE__ --command "/gse probe --public-repo-url __PUBLIC_REPO_URL__ --security-contact-url __SECURITY_CONTACT_URL__ --public-ci-run-url __PUBLIC_CI_RUN_URL__ --registry-package-url __REGISTRY_PACKAGE_URL__ --marketplace-url __MARKETPLACE_LISTING_URL__ --native-host-evidence __NATIVE_HOST_EVIDENCE__ --other-host-evidence __OTHER_HOST_EVIDENCE__" --json',
          'node scripts/audit-public-acceptance-readiness.mjs --root __GSE__ --json',
          'node scripts/audit-final-readiness.mjs --root __GSE__ --json',
          'node scripts/audit-owner-external-gate-kit.mjs --root __GSE__ --json',
        ],
        limits: [
          'These are owner/external collection actions, not public acceptance.',
          'Run preflight commands first, then record real accepted evidence when available.',
        ],
      }
    } catch {
      compact = null
    }
    execution = {
      ...doctor,
      command: doctor.command + ' -> compact owner actions',
      stdout: compact ? JSON.stringify(compact, null, 2) : doctor.stdout,
    }
  } else {
    execution = {
      command: 'read target final-readiness/public-acceptance support',
      status: 1,
      ok: false,
      diagnosticSummary: { status: 'failed', failed: 1, total: 1 },
      stdout: JSON.stringify({
        status: 'unsupported-target',
        target,
        error: '/gse owner-actions is only available for GSE skill packages with public acceptance audits.',
      }),
      stderr: 'target does not expose scripts/audit-public-acceptance-readiness.mjs and references/final-readiness.md',
    }
  }
} else if (verb === 'probe') {
  const targetHasProbe = fs.existsSync(path.join(target, 'scripts', 'probe-public-external-gates.mjs'))
  if (targetHasProbe) {
    const passthrough = []
    const allowedValueFlags = new Set([
      '--public-repo-url',
      '--security-contact-url',
      '--public-ci-run-url',
      '--registry-package-url',
      '--marketplace-url',
      '--native-host-evidence',
      '--other-host-evidence',
      '--timeout-ms',
    ])
    const allowedBooleanFlags = new Set(['--allow-local-fixture'])
    for (let index = 0; index < rest.length; index += 1) {
      const item = rest[index]
      if (allowedBooleanFlags.has(item)) {
        passthrough.push(item)
      } else if (allowedValueFlags.has(item)) {
        passthrough.push(item, rest[index + 1] ?? '')
        index += 1
      }
    }
    execution = runNode('probe-public-external-gates.mjs', ['--root', target, ...passthrough, '--json'])
  } else {
    execution = {
      command: 'read target public external gate probe support',
      status: 1,
      ok: false,
      diagnosticSummary: { status: 'failed', failed: 1, total: 1 },
      stdout: JSON.stringify({
        status: 'unsupported-target',
        target,
        error: '/gse probe is only available for GSE skill packages that include scripts/probe-public-external-gates.mjs.',
      }),
      stderr: 'target does not expose scripts/probe-public-external-gates.mjs',
    }
  }
} else if (verb === 'release') {
  const targetHasReleaseBundle = fs.existsSync(path.join(target, 'scripts', 'generate-release-bundle.mjs'))
    && fs.existsSync(path.join(target, 'scripts', 'audit-release-bundle.mjs'))
  if (targetHasReleaseBundle) {
    const labelIndex = rest.indexOf('--label')
    const outIndex = rest.indexOf('--out')
    const label = labelIndex === -1 ? 'gse-release-bundle-v1.0.0' : (rest[labelIndex + 1] || 'gse-release-bundle-v1.0.0')
    const out = outIndex === -1 ? path.join(target, '.gse', 'release-bundles', label) : path.resolve(rest[outIndex + 1] || path.join(target, '.gse', 'release-bundles', label))
    const releaseArgs = ['--root', target, '--label', label, '--out', out]
    if (force) releaseArgs.push('--force')
    execution = execute
      ? runNode('generate-release-bundle.mjs', [...releaseArgs, '--json'])
      : runNode('generate-release-bundle.mjs', [...releaseArgs, '--dry-run', '--json'])
  } else {
    execution = {
      command: 'read target release bundle support',
      status: 1,
      ok: false,
      diagnosticSummary: { status: 'failed', failed: 1, total: 1 },
      stdout: JSON.stringify({
        status: 'unsupported-target',
        target,
        error: '/gse release is only available for GSE skill packages that include release bundle scripts.',
      }),
      stderr: 'target does not expose scripts/generate-release-bundle.mjs and scripts/audit-release-bundle.mjs',
    }
  }
} else if (verb === 'package') {
  const targetHasPackageScript = fs.existsSync(path.join(target, 'scripts', 'package-gse.mjs'))
  if (targetHasPackageScript) {
    const labelIndex = rest.indexOf('--label')
    const outIndex = rest.indexOf('--out')
    const label = labelIndex === -1 ? 'gse-command-package' : (rest[labelIndex + 1] || 'gse-command-package')
    const out = outIndex === -1 ? path.join(target, '.gse', 'packages', label) : path.resolve(rest[outIndex + 1] || path.join(target, '.gse', 'packages', label))
    const packageArgs = ['--root', target, '--label', label, '--out', out]
    if (force) packageArgs.push('--force')
    execution = execute
      ? runNode('package-gse.mjs', [...packageArgs, '--json'])
      : runNode('package-gse.mjs', [...packageArgs, '--dry-run', '--json'])
  } else {
    execution = {
      command: 'read target package support',
      status: 1,
      ok: false,
      diagnosticSummary: { status: 'failed', failed: 1, total: 1 },
      stdout: JSON.stringify({
        status: 'unsupported-target',
        target,
        error: '/gse package is only available for GSE skill packages that include scripts/package-gse.mjs.',
      }),
      stderr: 'target does not expose scripts/package-gse.mjs',
    }
  }
} else if (verb === 'install') {
  const targetHasInstallScript = fs.existsSync(path.join(target, 'scripts', 'install-gse.mjs'))
  if (targetHasInstallScript) {
    const sourceIndex = rest.indexOf('--source')
    const sourceUrlIndex = rest.indexOf('--source-url')
    const manifestUrlIndex = rest.indexOf('--manifest-url')
    const installTargetIndex = rest.indexOf('--install-target')
    const legacyTargetIndex = rest.indexOf('--target')
    const publicKeyIndex = rest.indexOf('--public-key')
    const packageSource = sourceIndex === -1 ? null : path.resolve(rest[sourceIndex + 1] || '')
    const packageSourceUrl = sourceUrlIndex === -1 ? null : (rest[sourceUrlIndex + 1] || '')
    const manifestUrl = manifestUrlIndex === -1 ? null : (rest[manifestUrlIndex + 1] || '')
    const installTarget = installTargetIndex !== -1
      ? path.resolve(rest[installTargetIndex + 1] || '')
      : legacyTargetIndex !== -1
        ? path.resolve(rest[legacyTargetIndex + 1] || '')
        : null
    const publicKey = publicKeyIndex === -1 ? null : path.resolve(rest[publicKeyIndex + 1] || '')
    if (!installTarget || (!packageSource && !packageSourceUrl && !manifestUrl)) {
      execution = {
        command: 'parse /gse install arguments',
        status: 0,
        ok: true,
        diagnosticSummary: { status: 'waiting-for-input', failed: 0, total: 1 },
        stdout: JSON.stringify({
          status: 'waiting-for-input',
          target,
          required: ['--source <package-dir> or --source-url <package-url>', '--install-target <install-skill-dir>'],
          example: '/gse install --source __PACKAGE_DIR__ --install-target __INSTALL_SKILL_DIR__',
          effect: 'read-only by default; add --execute to write the install target',
        }),
        stderr: '',
      }
    } else {
      const installArgs = ['--target', installTarget, '--json']
      if (packageSource) installArgs.push('--source', packageSource)
      if (packageSourceUrl) installArgs.push('--source-url', packageSourceUrl)
      if (manifestUrl) installArgs.push('--manifest-url', manifestUrl)
      if (publicKey) installArgs.push('--public-key', publicKey)
      if (rest.includes('--skip-integrity')) installArgs.push('--skip-integrity')
      if (rest.includes('--skip-signature')) installArgs.push('--skip-signature')
      if (force) installArgs.push('--force')
      execution = execute
        ? runNode('install-gse.mjs', installArgs)
        : runNode('install-gse.mjs', [...installArgs, '--dry-run'])
    }
  } else {
    execution = {
      command: 'read target install support',
      status: 1,
      ok: false,
      diagnosticSummary: { status: 'failed', failed: 1, total: 1 },
      stdout: JSON.stringify({
        status: 'unsupported-target',
        target,
        error: '/gse install is only available for GSE skill packages that include scripts/install-gse.mjs.',
      }),
      stderr: 'target does not expose scripts/install-gse.mjs',
    }
  }
} else if (verb === 'public-release') {
  const targetHasPublicReleaseChecklist = fs.existsSync(path.join(target, 'scripts', 'generate-public-release-checklist.mjs'))
    && fs.existsSync(path.join(target, 'scripts', 'audit-public-release-checklist.mjs'))
  if (targetHasPublicReleaseChecklist) {
    const outIndex = rest.indexOf('--out')
    const manifestIndex = rest.indexOf('--manifest')
    const out = outIndex === -1
      ? path.join(target, '.gse', 'acceptance', 'public-release-checklist.md')
      : path.resolve(rest[outIndex + 1] || path.join(target, '.gse', 'acceptance', 'public-release-checklist.md'))
    const checklistArgs = ['--root', target, '--out', out, '--json']
    if (manifestIndex !== -1) checklistArgs.push('--manifest', path.resolve(rest[manifestIndex + 1] || path.join(target, '.gse', 'acceptance', 'release-status-manifest.json')))
    if (force) checklistArgs.push('--force')
    execution = execute
      ? runNode('generate-public-release-checklist.mjs', checklistArgs)
      : runNode('generate-public-release-checklist.mjs', [...checklistArgs, '--dry-run'])
  } else {
    execution = {
      command: 'read target public release checklist support',
      status: 1,
      ok: false,
      diagnosticSummary: { status: 'failed', failed: 1, total: 1 },
      stdout: JSON.stringify({
        status: 'unsupported-target',
        target,
        error: '/gse public-release is only available for GSE skill packages that include public release checklist scripts.',
      }),
      stderr: 'target does not expose scripts/generate-public-release-checklist.mjs and scripts/audit-public-release-checklist.mjs',
    }
  }
} else if (verb === 'maintenance') {
  const maintenanceArgs = ['--root', target, '--target', target, '--json']
  const installedRootIndex = rest.indexOf('--installed-root')
  if (installedRootIndex !== -1 && rest[installedRootIndex + 1]) maintenanceArgs.push('--installed-root', rest[installedRootIndex + 1])
  const outIndex = rest.indexOf('--out')
  if (outIndex !== -1 && rest[outIndex + 1]) maintenanceArgs.push('--out', path.resolve(rest[outIndex + 1]))
  if (rest.includes('--skip-release-bundle')) maintenanceArgs.push('--skip-release-bundle')
  if (rest.includes('--package-smoke')) maintenanceArgs.push('--package-smoke')
  if (execute) maintenanceArgs.push('--execute')
  execution = runNode('generate-maintenance-snapshot.mjs', maintenanceArgs)
} else if (verb === 'audit') {
  execution = runNode('audit-target-project.mjs', ['--target', target, '--json'])
} else if (verb === 'close') {
  execution = runNode('audit-close-gate.mjs', ['--target', target, '--json'])
} else if (verb === 'verify') {
  const profileIndex = rest.indexOf('--profile')
  const profile = profileIndex === -1 ? 'lite' : (rest[profileIndex + 1] || 'lite')
  execution = runNode('run-validation-profile.mjs', ['--target', target, '--profile', profile, '--json'])
} else if (verb === 'learn') {
  if (rest.includes('--promote')) {
    const promotionArgs = ['--root', root, '--target', target, '--json']
    if (execute) promotionArgs.push('--write')
    execution = runNode('audit-learning-promotion.mjs', promotionArgs)
  } else {
    const learningArgs = [
      '--target', target,
      '--summary', readRestValue(rest, '--summary'),
      '--trigger', readRestValue(rest, '--trigger', 'reusable lesson'),
      '--source', readRestValue(rest, '--source', 'run-gse-command'),
      '--promotion', readRestValue(rest, '--promotion', 'first occurrence: learning note'),
      '--json',
    ]
    const impact = readRestValue(rest, '--impact')
    if (impact) learningArgs.push('--impact', impact)
    if (execute) learningArgs.push('--execute')
    execution = runNode('record-learning.mjs', learningArgs)
  }
}

const facadeStage = facadeRoute(verb) ? verb : null
const parsedChangeId = (verb === 'specify' || verb === 'change')
  ? (rest.find((item) => !item.startsWith('--')) ?? 'gse-change')
  : null
const childDiagnostics = execution?.diagnosticSummary
  ? [{ code: execution.ok ? 'COMMAND_ROUTE_OK' : knownCommand ? 'COMMAND_ROUTE_FAILED' : 'UNKNOWN_COMMAND', field: 'execution' }]
  : []
const coreResult = createResultEnvelope({
  status: execution?.ok
    ? (verb === 'close' ? 'complete' : 'proceed')
    : verb === 'verify'
      ? 'repair'
      : 'blocked',
  stage: facadeStage,
  reasonCode: !knownCommand
    ? 'UNKNOWN_COMMAND'
    : verb === 'release'
      ? 'POST_CLOSE_RELEASE'
      : execution?.ok
        ? 'READY'
        : 'COMMAND_ROUTE_FAILED',
  message: verb === 'release'
    ? 'Release remains a separately authorized post-Close flow.'
    : execution?.ok
      ? `${facadeStage || verb} route completed.`
      : `${verb} route requires attention.`,
  changeId: state?.activeChangeId ?? parsedChangeId,
  stateRevision: state?.stateRevision ?? null,
  requiredActions: execution?.ok
    ? []
    : [knownCommand ? 'Inspect the command diagnostics and repair the reported failure.' : 'Run /gse help and choose a supported command.'],
  diagnostics: childDiagnostics,
  safeToRetry: verb !== 'close' || !execution?.ok,
})

const report = {
  root,
  target,
  command: normalized,
  verb,
  route,
  project: {
    hasGse: exists('.gse'),
    projectProfile,
    goalMap,
    qualityGates,
    stateValid: Boolean(state),
    phase: state?.phase ?? null,
    currentSlice: state?.currentSlice ?? null,
    canonicalPlan,
    canonicalPlanExists: canonicalPlan ? exists(canonicalPlan) : null,
    canonicalGoalSource,
    canonicalGoalSourceExists: canonicalGoalSource ? exists(canonicalGoalSource) : null,
    goalMapRole: 'gse-execution-projection',
  },
  execution,
  coreResult,
  limits: [
    'This runner executes portable GSE command semantics.',
    'It does not prove a host UI accepted a native slash command unless the host invokes this runner or a host smoke records that behavior.',
    'Write-capable commands require --execute; overwriting existing artifacts also requires explicit --force.',
  ],
}

if (jsonOnly && compactOutput && execution?.stdout) {
  try {
    console.log(JSON.stringify(JSON.parse(execution.stdout), null, 2))
  } catch {
    console.log(execution.stdout)
  }
} else if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else if (verb === 'help' && execution?.stdout) {
  const help = parsedStdout(execution)
  console.log(help.title)
  for (const item of help.commands) console.log(`${item.command} - ${item.summary}`)
} else {
  console.log('GSE command: ' + report.command)
  console.log('Route: ' + (report.route?.route ?? 'unknown-command'))
  console.log('Effect: ' + (report.route?.effect ?? 'none'))
  console.log('Target: ' + report.target)
}

if (execution && !execution.ok) process.exit(1)
