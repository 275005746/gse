#!/usr/bin/env node
import { inspectGseV1Project } from './core/migration-v1.mjs'
import { createResultEnvelope } from './core/contracts.mjs'

const OPERATION_ID = 'op-migration-v1-inspection-cli'
const READ_ONLY_LIMIT = 'Inspection is strictly dry-run and read-only; it cannot execute migration.'
const ALLOWED_FLAGS = new Set(['--target', '--json'])
const BLOCKING_FLAGS = new Set(['--execute', '--write', '--force'])

function envelope(input, extras = {}) {
  return {
    ...createResultEnvelope({ operationId: OPERATION_ID, ...input }),
    proposedProjectState: extras.proposedProjectState ?? null,
    proposedActiveChange: extras.proposedActiveChange ?? null,
    proposedWrites: Array.isArray(extras.proposedWrites) ? extras.proposedWrites : [],
    sourceDigests: extras.sourceDigests && typeof extras.sourceDigests === 'object' && !Array.isArray(extras.sourceDigests)
      ? extras.sourceDigests
      : {},
    conflicts: Array.isArray(extras.conflicts) ? extras.conflicts : [],
    limits: Array.isArray(extras.limits) ? extras.limits : [READ_ONLY_LIMIT],
  }
}

function blockedDryRunResult() {
  return envelope({
    status: 'blocked',
    stage: null,
    reasonCode: 'DRY_RUN_ONLY',
    message: 'Inspection cannot execute migration; this CLI is read-only.',
    changeId: null,
    taskId: null,
    stateRevision: null,
    requiredActions: [],
    artifactRefs: [],
    evidenceRefs: [],
    diagnostics: [],
    safeToRetry: false,
  })
}

function invalidArgumentsResult() {
  return envelope({
    status: 'repair',
    stage: null,
    reasonCode: 'INVALID_ARGUMENTS',
    message: 'Only --target <path> and --json are supported.',
    changeId: null,
    taskId: null,
    stateRevision: null,
    requiredActions: [],
    artifactRefs: [],
    evidenceRefs: [],
    diagnostics: [{ code: 'INVALID_ARGUMENTS' }],
    safeToRetry: false,
  })
}

function inspectionFailedResult() {
  return envelope({
    status: 'repair',
    stage: null,
    reasonCode: 'MIGRATION_INSPECTION_FAILED',
    message: 'Migration inspection failed unexpectedly.',
    changeId: null,
    taskId: null,
    stateRevision: null,
    requiredActions: [],
    artifactRefs: [],
    evidenceRefs: [],
    diagnostics: [{ code: 'MIGRATION_INSPECTION_FAILED' }],
    safeToRetry: false,
  })
}

function parseArguments(argv) {
  let target = process.cwd()
  let json = false
  let targetSeen = false

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--json') {
      json = true
      continue
    }
    if (argument === '--target') {
      if (targetSeen || index + 1 >= argv.length || argv[index + 1].startsWith('--')) {
        return null
      }
      targetSeen = true
      target = argv[index + 1]
      index += 1
      continue
    }
    if (argument.startsWith('--') || argument.length > 0) return null
  }

  return { target, json }
}

function exitCodeFor(result) {
  if (result.status === 'proceed' || result.status === 'complete') return 0
  if (result.status === 'ask_user') return 2
  return 1
}

function printMarkdown(result) {
  const lines = [
    `Status: ${result.status}`,
    `Reason: ${result.reasonCode}`,
    'Target: accepted for inspection (path omitted).',
    `Message: ${result.message}`,
  ]
  const paths = result.proposedWrites
    .map((write) => write && typeof write.path === 'string' ? write.path : null)
    .filter(Boolean)
  lines.push('Proposed write paths:')
  if (paths.length === 0) lines.push('- none')
  else for (const path of paths) lines.push(`- ${path}`)
  process.stdout.write(`${lines.join('\n')}\n`)
}

async function main() {
  const argv = process.argv.slice(2)
  const json = argv.includes('--json')
  let result
  let exitCode

  if (argv.some((argument) => BLOCKING_FLAGS.has(argument))) {
    result = blockedDryRunResult()
    exitCode = 1
  } else {
    const parsed = parseArguments(argv)
    if (parsed === null) {
      result = invalidArgumentsResult()
      exitCode = 1
    } else {
      try {
        result = await Promise.resolve(inspectGseV1Project(parsed.target))
        exitCode = exitCodeFor(result)
      } catch {
        result = inspectionFailedResult()
        exitCode = 1
      }
    }
  }

  if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  else printMarkdown(result)
  process.exitCode = exitCode
}

await main()
