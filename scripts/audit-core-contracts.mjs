#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  REQUIRED_ENVELOPE_FIELDS,
  assertTransactionManifestContract,
  createResultEnvelope,
  normalizeStatus,
} from './core/contracts.mjs'
import { sanitizeStructuredRecord } from './core/redaction.mjs'
import { profileForLegacyLevel, classifyProfile } from './core/profiles.mjs'
import { mapLegacyStage } from './core/lifecycle.mjs'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1] ?? fallback
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(readArg('--root', path.join(scriptDirectory, '..')))
const jsonOnly = args.includes('--json')
const schemaRoot = path.join(root, 'schemas', 'core', 'v1')
const schemaRequirements = {
  'result-envelope.schema.json': [
    'schemaVersion', 'operationId', 'status', 'stage', 'reasonCode', 'message',
    'changeId', 'taskId', 'stateRevision', 'requiredActions', 'artifactRefs',
    'evidenceRefs', 'diagnostics', 'safeToRetry',
  ],
  'project-state.schema.json': ['schemaVersion', 'stateRevision', 'activeChangeId'],
  'active-change.schema.json': [
    'schemaVersion', 'changeId', 'stateRevision', 'profile', 'lifecycleStage',
    'lifecycleState', 'sourceDigests', 'derivedFrom', 'conflicts',
  ],
  'evidence-event.schema.json': [
    'schemaVersion', 'eventId', 'transactionId', 'date', 'timestamp', 'recordType',
    'changeId', 'taskId', 'status', 'evidenceLevel', 'requiredEvidenceLevel',
    'claim', 'evidenceClass', 'method', 'stateRevision', 'dependencies',
    'invalidationScope', 'outcome', 'limitations', 'actor', 'evidenceFile',
    'relatedArtifacts', 'nextAction',
  ],
  'transaction-manifest.schema.json': [
    'schemaVersion', 'transactionId', 'operationId', 'createdAt',
    'expectedRevision', 'nextRevision', 'status', 'writes', 'eventIds',
  ],
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

function inspectSchemas() {
  const failures = []
  const schemas = {}
  for (const [name, required] of Object.entries(schemaRequirements)) {
    const schemaPath = path.join(schemaRoot, name)
    if (!fs.existsSync(schemaPath)) {
      failures.push(`${name}: missing`)
      continue
    }
    let schema
    try {
      schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8').replace(/^﻿/, ''))
      schemas[name] = schema
    } catch (error) {
      failures.push(`${name}: invalid JSON (${error.message})`)
      continue
    }
    if (schema.$id !== `https://gse.local/schemas/core/v1/${name}`) {
      failures.push(`${name}: v1 schema id`)
    }
    if (schema.type !== 'object' || schema.additionalProperties !== false) {
      failures.push(`${name}: object/additionalProperties contract`)
    }
    if (!required.every((field) => schema.required?.includes(field) && Object.hasOwn(schema.properties ?? {}, field))) {
      failures.push(`${name}: required fields`)
    }
  }

  const result = schemas['result-envelope.schema.json']
  if (result && (
    JSON.stringify(result.properties?.status?.enum) !== JSON.stringify(['proceed', 'repair', 'ask_user', 'blocked', 'complete'])
    || JSON.stringify(result.properties?.stage?.enum) !== JSON.stringify(['frame', 'specify', 'build', 'verify', 'close', null])
  )) failures.push('result-envelope.schema.json: status/stage enums')

  const projectState = schemas['project-state.schema.json']
  const legacyStateFields = [
    'projectName', 'mode', 'canonicalGoalSource', 'canonicalPlan', 'phase',
    'currentSummary', 'currentSlice', 'toolStatuses', 'lastEvidence',
    'blockedGates', 'nextChecks', 'residualRisks', 'riskArchive',
  ]
  if (projectState && !legacyStateFields.every((field) => Object.hasOwn(projectState.properties ?? {}, field) && !projectState.required?.includes(field))) {
    failures.push('project-state.schema.json: optional legacy fields')
  }

  const activeChange = schemas['active-change.schema.json']
  const activeChangeStages = ['frame', 'specify', 'build', 'verify', 'close']
  const activeChangeStates = [
    'draft', 'framed', 'specified', 'building', 'verifying', 'verified', 'closed',
    'needs_decision', 'blocked', 'failed', 'superseded', 'cancelled',
  ]
  if (activeChange && (
    JSON.stringify(activeChange.properties?.profile?.enum) !== JSON.stringify(['lite', 'standard', 'enterprise'])
    || JSON.stringify(activeChange.properties?.lifecycleStage?.enum) !== JSON.stringify(activeChangeStages)
    || JSON.stringify(activeChange.properties?.lifecycleState?.enum) !== JSON.stringify(activeChangeStates)
    || activeChange.properties?.sourceDigests?.additionalProperties?.pattern !== '^sha256:[a-f0-9]{64}$'
  )) failures.push('active-change.schema.json: profile/lifecycle/digest contract')

  const evidence = schemas['evidence-event.schema.json']
  const dependencyFields = [
    'sourceRevision', 'dirtyWorktreeDigest', 'inputPaths', 'generatedArtifacts',
    'configuration', 'contractRevision', 'environmentFingerprint', 'hostCapabilityBasis',
  ]
  if (evidence && (
    JSON.stringify(evidence.properties?.status?.enum) !== JSON.stringify(['result', 'verified', 'accepted'])
    || !dependencyFields.every((field) => evidence.properties?.dependencies?.required?.includes(field))
  )) failures.push('evidence-event.schema.json: status/dependencies contract')

  const transaction = schemas['transaction-manifest.schema.json']
  const writeSchema = transaction?.$defs?.write
  const writeKinds = ['json-replace', 'jsonl-append', 'text-write', 'tree-move']
  const transactionStatuses = ['prepared', 'staged', 'published', 'committed', 'rolled-back', 'recovered']
  if (transaction && (
    JSON.stringify(writeSchema?.properties?.kind?.enum) !== JSON.stringify(writeKinds)
    || JSON.stringify(transaction.properties?.status?.enum) !== JSON.stringify(transactionStatuses)
    || !writeSchema?.allOf?.some((condition) => condition.then?.required?.includes('eventId') && condition.then.required.includes('beforeSize'))
    || !writeSchema?.allOf?.some((condition) => condition.then?.required?.includes('sourcePath') && condition.then.required.includes('targetPath'))
  )) failures.push('transaction-manifest.schema.json: kind/status/conditional write contract')

  return failures
}

function manifestAssertionEvidence() {
  const manifest = {
    schemaVersion: 1,
    transactionId: 'tx-core-contract-audit',
    operationId: 'op-core-contract-audit',
    createdAt: '2026-07-16T12:00:00.000Z',
    expectedRevision: 4,
    nextRevision: 5,
    status: 'prepared',
    writes: [{
      kind: 'json-replace',
      path: '.gse/state.json',
      beforeDigest: null,
      afterDigest: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
      beforeImagePath: '.gse/transactions/tx-core-contract-audit/before/state.json',
      stagedPath: '.gse/transactions/tx-core-contract-audit/staged/state.json',
    }],
    eventIds: [],
  }

  let validAccepted = false
  let badRevisionRejected = false
  let incompleteWriteRejected = false
  let unsafePathsRejected = false
  let strictTimestampRejected = false
  let eventIdsRejected = false
  let schemaMismatchRejected = false
  try {
    assertTransactionManifestContract(manifest)
    validAccepted = true
  } catch {}
  try {
    assertTransactionManifestContract({ ...manifest, nextRevision: 6 })
  } catch (error) {
    badRevisionRejected = error.code === 'INVALID_TRANSACTION_MANIFEST'
  }
  try {
    assertTransactionManifestContract({
      ...manifest,
      writes: [{ ...manifest.writes[0], stagedPath: undefined }],
    })
  } catch (error) {
    incompleteWriteRejected = error.code === 'INVALID_TRANSACTION_MANIFEST'
  }
  const unsafePaths = [
    '/absolute/path',
    'C:\\absolute\\path',
    'C:drive-relative',
    '\\\\server\\share\\path',
    '../escape',
    'safe/../normalized-away',
    '.',
    '',
  ]
  unsafePathsRejected = unsafePaths.every((unsafePath) => {
    try {
      assertTransactionManifestContract({
        ...manifest,
        writes: [{
          ...manifest.writes[0],
          kind: 'tree-move',
          path: unsafePath,
          stagedPath: unsafePath,
          sourcePath: unsafePath,
          targetPath: unsafePath,
        }],
      })
      return false
    } catch (error) {
      return error.code === 'INVALID_TRANSACTION_MANIFEST'
        && error.diagnostics?.some((item) => item.code === 'INVALID_WRITE_PATH')
    }
  })
  strictTimestampRejected = ['2026-07-16', '2026-02-30T12:00:00Z'].every((createdAt) => {
    try {
      assertTransactionManifestContract({ ...manifest, createdAt })
      return false
    } catch (error) {
      return error.code === 'INVALID_TRANSACTION_MANIFEST'
        && error.diagnostics?.some((item) => item.code === 'INVALID_TIMESTAMP')
    }
  })
  const jsonlWrite = {
    ...manifest.writes[0],
    kind: 'jsonl-append',
    path: '.gse/evidence/index.jsonl',
    eventId: 'evt-one',
    beforeSize: 0,
  }
  const inconsistentEventManifests = [
    { ...manifest, writes: [jsonlWrite], eventIds: [] },
    { ...manifest, writes: [jsonlWrite], eventIds: ['evt-one', 'evt-extra'] },
    { ...manifest, writes: [jsonlWrite, { ...jsonlWrite, path: '.gse/audit/events.jsonl' }], eventIds: ['evt-one'] },
  ]
  eventIdsRejected = inconsistentEventManifests.every((candidate) => {
    try {
      assertTransactionManifestContract(candidate)
      return false
    } catch (error) {
      return error.code === 'INVALID_TRANSACTION_MANIFEST'
        && error.diagnostics?.some((item) => item.code === 'INCONSISTENT_EVENT_IDS')
    }
  })
  try {
    assertTransactionManifestContract({
      ...manifest,
      createdAt: 'not-a-date',
      extra: true,
      eventIds: ['duplicate', 'duplicate'],
    })
  } catch (error) {
    schemaMismatchRejected = error.code === 'INVALID_TRANSACTION_MANIFEST'
      && ['INVALID_TIMESTAMP', 'UNKNOWN_FIELD', 'INVALID_EVENT_IDS'].every((code) => error.diagnostics?.some((item) => item.code === code))
  }
  return {
    validAccepted,
    badRevisionRejected,
    incompleteWriteRejected,
    unsafePathsRejected,
    strictTimestampRejected,
    eventIdsRejected,
    schemaMismatchRejected,
  }
}

const schemaFailures = inspectSchemas()
const envelope = createResultEnvelope({
  operationId: 'op-core-contract-audit',
  status: 'proceed',
  stage: 'build',
  reasonCode: 'READY',
  message: 'Build may continue.',
  changeId: 'core-foundation',
  stateRevision: 4,
})
const manifestEvidence = manifestAssertionEvidence()
const successfulEnvelope = createResultEnvelope({
  operationId: 'op-core-contract-diagnostic-audit',
  status: 'proceed',
  stage: 'build',
  reasonCode: 'READY',
  message: 'Build may continue.',
  diagnostics: [{ code: 'UPSTREAM', detail: 'Bearer diagnostic-secret-value' }],
})
const successfulEnvelopeDiagnosticsSanitized = REQUIRED_ENVELOPE_FIELDS.every((key) => Object.hasOwn(successfulEnvelope, key))
  && successfulEnvelope.status === 'proceed'
  && successfulEnvelope.reasonCode === 'READY'
  && successfulEnvelope.safeToRetry === true
  && successfulEnvelope.diagnostics.length === 1
  && successfulEnvelope.diagnostics[0].code === 'UPSTREAM'
  && successfulEnvelope.diagnostics[0].value === '<redacted>'
  && !Object.hasOwn(successfulEnvelope.diagnostics[0], 'detail')
  && !JSON.stringify(successfulEnvelope).includes('diagnostic-secret-value')
function captureEnvelope(input) {
  try {
    return { envelope: createResultEnvelope(input), error: null }
  } catch (error) {
    return { envelope: null, error: error.message }
  }
}

function isValidRepairAttempt(attempt) {
  const invalid = attempt.envelope
  return attempt.error === null
    && invalid?.status === 'repair'
    && invalid.reasonCode === 'CORE_VALIDATION_FAILED'
    && invalid.message === 'Core operation input did not satisfy the v1 contract.'
    && invalid.diagnostics.length > 0
    && invalid.diagnostics.every((item) => item && typeof item === 'object' && !Array.isArray(item))
    && !/(?:Bearer diagnostic-secret-value|ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456|AKIAABCDEFGHIJKLMNOP|sk_abcdefghijklmnop-secret)/.test(JSON.stringify(invalid))
    && typeof invalid.operationId === 'string'
    && invalid.operationId.length > 0
    && invalid.changeId === null
    && invalid.taskId === null
    && invalid.stateRevision === null
    && invalid.requiredActions.length === 0
    && invalid.safeToRetry === false
}

const invalidAttempts = [
  captureEnvelope(null),
  captureEnvelope({ status: false, reasonCode: 0, safeToRetry: 'yes' }),
  captureEnvelope({
    schemaVersion: 2,
    operationId: 42,
    unexpected: 'Bearer diagnostic-secret-value',
    status: 'not-a-core-status',
    stage: 'unknown',
    reasonCode: 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456',
    message: { raw: 'AKIAABCDEFGHIJKLMNOP' },
    changeId: 9,
    taskId: ['sk_abcdefghijklmnop-secret'],
    stateRevision: -1,
    requiredActions: ['repair input', 5],
    diagnostics: [{ code: 'CALLER_DIAGNOSTIC', detail: 'Bearer diagnostic-secret-value' }],
  }),
]
const sanitized = sanitizeStructuredRecord(
  {
    claim: 'Used Bearer abcdefghijklmnop for verification.',
    metadata: {
      token: 'nested-secret-value',
      stdout: 'nested raw command output',
      note: 'Bearer zyxwvutsrqponmlk was observed.',
    },
    token: 'secret-value',
    stdout: 'raw command output must not persist',
    ignored: 'not-allowlisted',
  },
  ['claim', 'metadata', 'token', 'stdout'],
)
let secretBlocked = false
try {
  sanitizeStructuredRecord(
    { claim: '-----BEGIN PRIVATE KEY-----\nsecret material' },
    ['claim'],
  )
} catch (error) {
  secretBlocked = error.code === 'SUSPECTED_SECRET'
}

const profileTriggerTable = JSON.parse(
  fs.readFileSync(path.join(root, 'assets', 'policies', 'profile-triggers.v1.json'), 'utf8'),
)
const expectedHardTriggers = {
  RISK_AUTH_TRUST: {
    input: 'authenticationAuthorizationOrTrust',
    policies: ['claim-matched-verification', 'security-review'],
  },
  RISK_COMPLIANCE_LEGAL: {
    input: 'complianceOrLegal',
    policies: ['owner-decision'],
  },
  RISK_INFRA_BLAST_RADIUS: {
    input: 'highBlastRadiusInfrastructure',
    policies: ['independent-review', 'rollback-proof'],
  },
  RISK_IRREVERSIBLE_MIGRATION: {
    input: 'irreversibleOrProductionMigration',
    policies: ['rollback-proof'],
  },
  RISK_PAYMENTS: {
    input: 'paymentsOrMoney',
    policies: ['financial-integrity'],
  },
  RISK_PRODUCTION_RELEASE: {
    input: 'productionReleaseOrDeployment',
    policies: ['separate-release-authorization'],
  },
  RISK_PUBLIC_CONTRACT: {
    input: 'publicApiSchemaOrProtocol',
    policies: ['compatibility-review'],
  },
  RISK_SENSITIVE_DATA: {
    input: 'sensitiveOrRegulatedData',
    policies: ['privacy-review'],
  },
}
const hardTriggerIds = Object.keys(expectedHardTriggers).sort()
const hardTriggers = profileTriggerTable.triggers.filter((trigger) => trigger.hard === true)
const hardPolicyRowsValid =
  JSON.stringify(hardTriggers.map((trigger) => trigger.id).sort()) === JSON.stringify(hardTriggerIds) &&
  hardTriggers.every((trigger) => {
    const expected = expectedHardTriggers[trigger.id]
    return expected !== undefined &&
      trigger.input === expected.input &&
      JSON.stringify([...trigger.policies].sort()) === JSON.stringify(expected.policies) &&
      trigger.profileFloor === 'enterprise' &&
      trigger.downgradeable === false &&
      trigger.unknownBehavior === 'ask_user'
  })
const allHardFalseSignals = Object.fromEntries(hardTriggers.map((trigger) => [trigger.input, false]))

const legacyProfiles = [1, 2, 3].map(profileForLegacyLevel)
const trustedAuthProfile = classifyProfile({
  legacyLevel: 1,
  signals: { ...allHardFalseSignals, authenticationAuthorizationOrTrust: true },
})
const unknownAuthProfile = classifyProfile({
  legacyLevel: 1,
  signals: { ...allHardFalseSignals, authenticationAuthorizationOrTrust: 'unknown' },
})
const missingHardProfile = classifyProfile({ legacyLevel: 1, signals: {} })
const knownLiteProfile = classifyProfile({ legacyLevel: 1, signals: allHardFalseSignals })
const preferredStandardProfile = classifyProfile({
  legacyLevel: 1,
  preferredProfile: 'standard',
  signals: allHardFalseSignals,
})
const preferredLiteAuthProfile = classifyProfile({
  legacyLevel: 1,
  preferredProfile: 'lite',
  signals: { ...allHardFalseSignals, authenticationAuthorizationOrTrust: true },
})
const malformedHardFloorProfile = classifyProfile(
  { legacyLevel: 1, signals: { authenticationAuthorizationOrTrust: true } },
  {
    ...profileTriggerTable,
    triggers: profileTriggerTable.triggers.map((trigger) =>
      trigger.id === 'RISK_AUTH_TRUST' ? { ...trigger, profileFloor: 'lite' } : trigger
    ),
  },
)
const malformedTriggerContainerProfile = classifyProfile({ legacyLevel: 1, signals: {} }, {
  ...profileTriggerTable,
  triggers: {},
})
const malformedTriggerRowProfile = classifyProfile({ legacyLevel: 1, signals: {} }, {
  ...profileTriggerTable,
  triggers: [null],
})
const emptyHardPoliciesProfile = classifyProfile({ legacyLevel: 1, signals: {} }, {
  ...profileTriggerTable,
  triggers: profileTriggerTable.triggers.map((trigger) =>
    trigger.id === 'RISK_AUTH_TRUST' ? { ...trigger, policies: [] } : trigger
  ),
})
function captureProfileClassification(options) {
  try {
    return classifyProfile(options)
  } catch (error) {
    return { thrown: true, error: error.message }
  }
}

const revokedOptions = Proxy.revocable({}, {})
revokedOptions.revoke()
const revokedOptionsProfile = captureProfileClassification(revokedOptions.proxy)
const throwingOptionsProfiles = ['legacyLevel', 'preferredProfile', 'signals'].map((field) =>
  captureProfileClassification(new Proxy({}, {
    get(target, property, receiver) {
      if (property === field) throw new Error(field)
      return Reflect.get(target, property, receiver)
    },
  }))
)
const throwingOwnPropertySignalsProfile = captureProfileClassification({
  legacyLevel: 1,
  signals: new Proxy({}, {
    getOwnPropertyDescriptor() {
      throw new Error('signals own-property check')
    },
  }),
})
const throwingValueAccessSignalsProfile = captureProfileClassification({
  legacyLevel: 1,
  signals: new Proxy({ ...allHardFalseSignals }, {
    getOwnPropertyDescriptor(target, property) {
      return Reflect.getOwnPropertyDescriptor(target, property)
    },
    get() {
      throw new Error('signals value access')
    },
  }),
})
const proxyFailureProfiles = [
  revokedOptionsProfile,
  ...throwingOptionsProfiles,
  throwingOwnPropertySignalsProfile,
  throwingValueAccessSignalsProfile,
]
const inheritedSignals = Object.create({ authenticationAuthorizationOrTrust: true })
Object.assign(inheritedSignals, allHardFalseSignals)
delete inheritedSignals.authenticationAuthorizationOrTrust
const inheritedSignalProfile = classifyProfile({ legacyLevel: 1, signals: inheritedSignals })
const malformedProfilesFailClosed = [
  malformedHardFloorProfile,
  malformedTriggerContainerProfile,
  malformedTriggerRowProfile,
  emptyHardPoliciesProfile,
  ...proxyFailureProfiles,
].every((profile) =>
  profile.status === 'ask_user' &&
  profile.reasonCode === 'HARD_RISK_POLICY_INVALID' &&
  profile.selectedProfile === 'enterprise' &&
  profile.confidence === 'low'
)
const legacyStageMappings = {
  frame: ['intake', 'opportunity'].map(mapLegacyStage),
  specify: ['requirements', 'design', 'architecture', 'planning'].map(mapLegacyStage),
  build: mapLegacyStage('implementation'),
  verify: mapLegacyStage('verification'),
}
const learningConcern = mapLegacyStage('learning')
const releaseConcern = mapLegacyStage('release')

const checks = [
  check('CORE01', 'all Core v1 schemas exist, parse, and expose required contract shape', schemaFailures.length === 0, schemaFailures.length === 0 ? Object.keys(schemaRequirements).join(', ') : schemaFailures.join('; ')),
  check('CORE02', 'result envelope normalizes legacy block to blocked', normalizeStatus('block') === 'blocked', 'normalizeStatus(block)'),
  check('CORE03', 'result envelope supplies every stable field and manifest runtime invariants hold', REQUIRED_ENVELOPE_FIELDS.every((key) => Object.hasOwn(envelope, key)) && Object.values(manifestEvidence).every(Boolean), JSON.stringify({ envelope, manifestEvidence })),
  check('CORE04', 'invalid envelope input returns a valid repair envelope with diagnostics', invalidAttempts.every(isValidRepairAttempt), JSON.stringify(invalidAttempts)),
  check('CORE05', 'known credentials and raw command output never persist, including successful envelope diagnostics', successfulEnvelopeDiagnosticsSanitized && !Object.hasOwn(sanitized, 'token') && !Object.hasOwn(sanitized, 'stdout') && !JSON.stringify(sanitized).includes('secret-value') && !JSON.stringify(sanitized).toLowerCase().includes('stdout') && JSON.stringify(sanitized).includes('[REDACTED]'), JSON.stringify({ successfulEnvelope, sanitized })),
  check('CORE06', 'suspected private key content blocks structured writes', secretBlocked, 'SUSPECTED_SECRET'),
  check('CORE07', 'legacy profiles map correctly and malformed policy or option inputs fail closed', JSON.stringify(legacyProfiles) === JSON.stringify(['lite', 'standard', 'enterprise']) && hardPolicyRowsValid && malformedProfilesFailClosed, JSON.stringify({ legacyProfiles, hardTriggerIds: hardTriggers.map((trigger) => trigger.id).sort(), hardPolicyRowsValid, malformedProfilesFailClosed, malformedHardFloorProfile, malformedTriggerContainerProfile, malformedTriggerRowProfile, emptyHardPoliciesProfile, revokedOptionsProfile, throwingOptionsProfiles, throwingOwnPropertySignalsProfile, throwingValueAccessSignalsProfile })),
  check('CORE08', 'authentication, authorization, or trust signals select enterprise with a risk trigger', trustedAuthProfile.selectedProfile === 'enterprise' && trustedAuthProfile.triggerIds?.includes('RISK_AUTH_TRUST'), JSON.stringify(trustedAuthProfile)),
  check('CORE09', 'unknown or missing hard-risk signals require a user decision at enterprise', unknownAuthProfile.status === 'ask_user' && unknownAuthProfile.reasonCode === 'HARD_RISK_UNKNOWN' && missingHardProfile.status === 'ask_user' && missingHardProfile.reasonCode === 'HARD_RISK_UNKNOWN' && missingHardProfile.selectedProfile === 'enterprise' && hardTriggerIds.every((id) => missingHardProfile.triggerIds?.includes(id)), JSON.stringify({ unknownAuthProfile, missingHardProfile })),
  check('CORE10', 'preferred profiles raise but cannot lower hard-risk classification and inherited signals are ignored', knownLiteProfile.status === 'proceed' && knownLiteProfile.selectedProfile === 'lite' && preferredStandardProfile.selectedProfile === 'standard' && preferredLiteAuthProfile.selectedProfile === 'enterprise' && inheritedSignalProfile.status === 'ask_user' && inheritedSignalProfile.reasonCode === 'HARD_RISK_UNKNOWN' && inheritedSignalProfile.selectedProfile === 'enterprise', JSON.stringify({ knownLiteProfile, preferredStandardProfile, preferredLiteAuthProfile, inheritedSignalProfile })),
  check('CORE11', 'legacy lifecycle stages map to the Core frame, specify, build, and verify stages', Object.entries(legacyStageMappings).every(([stage, mapped]) => Array.isArray(mapped) ? mapped.every((item) => item.stage === stage) : mapped.stage === stage), JSON.stringify(legacyStageMappings)),
  check('CORE12', 'learning and release concerns map to learning and post-close release handling', learningConcern.concern === 'learn' && releaseConcern.concern === 'post_close_release' && releaseConcern.stage === null, JSON.stringify({ learningConcern, releaseConcern })),
]

const failed = checks.filter((item) => item.status === 'failed').length
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed: checks.length - failed, failed, total: checks.length },
  workflows: { coreContracts: failed === 0 ? 'verified' : 'incomplete' },
  checks,
  limits: [
    'This audit verifies Core v1 contract shape and local helper behavior without a third-party JSON Schema validator.',
    'Raw command stdout and stderr are intentionally outside the structured-record persistence contract.',
  ],
}

function renderMarkdown(data) {
  const lines = [
    '# GSE Core Contract Audit',
    '',
    `Status: ${data.summary.status}`,
    `Checks: ${data.summary.passed}/${data.summary.total}`,
    '',
  ]
  for (const item of data.checks) {
    lines.push(`${item.status === 'passed' ? '[x]' : '[ ]'} ${item.id} ${item.label}: ${item.evidence}`)
  }
  lines.push('', 'Limits:')
  for (const limit of data.limits) lines.push(`- ${limit}`)
  return `${lines.join('\n')}\n`
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(renderMarkdown(report))

if (failed > 0) process.exit(1)
