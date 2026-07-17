# GSE Core Compatibility Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the Section 20 compatibility foundation: versioned Core contracts, deterministic profile/lifecycle compatibility, one derived revisioned active Change, revision-aware evidence and Close checks, read-only GSE 1.0 migration inspection, and crash-recoverable local mutations without breaking GSE 1.0 commands or artifacts.

**Architecture:** Keep the current dependency-free Node.js 18 ESM scripts as the public runtime. Add a small `scripts/core/` library beneath the existing command router, versioned JSON Schemas under `schemas/core/v1/`, a data-driven profile policy, and three executable audits. Existing Markdown remains human intent; `.gse/state.json` and `.gse/changes/<id>/change.json` are revisioned derived caches, while transaction manifests and commit markers make multi-file mutation recovery deterministic.

**Tech Stack:** Node.js 18+ ESM, built-in `fs`/`path`/`crypto`/`os` modules, JSON Schema documents, JSON/JSONL/Markdown, executable `audit-*.mjs` fixture tests; no new package dependency, service, database, daemon, or host runtime requirement.

---

## Scope Guard

This plan implements only `docs/superpowers/specs/2026-07-16-gse-enterprise-engineering-design.md` Section 20.

Included:

- Core schema v1 and the stable result envelope;
- profile trigger table v1, hard Enterprise floors, and Level 1/2/3 compatibility;
- `Frame → Specify → Build → Verify → Close` facade over the current 1.0 stages and commands;
- exactly zero or one active Change, derived from existing Markdown plus revisioned JSON caches;
- evidence dependency digests, deterministic freshness decisions, and Close consistency;
- read-only GSE 1.0 migration inspection;
- lock, expected revision, manifest, staging, commit marker, idempotent JSONL, rollback/roll-forward recovery, and secret-safe structured writes;
- named Core, compatibility, stale-evidence, contradictory-Close, and transaction-fault fixtures.

Explicitly excluded:

- support for two or more active Changes beyond returning `blocked` with `MULTIPLE_ACTIVE_CHANGES_UNSUPPORTED`;
- task DAGs, ownership scheduling, leases, provisional worker acceptance, or multi-Agent execution;
- executable Claude Code/Codex/Hermes adapters or host capability negotiation;
- complete frontend/data/security/infrastructure policy modules;
- automatic production migration, deployment, publication, or release;
- migration adapters for Comet, OpenSpec, or Superpowers.

## File and Responsibility Map

### Versioned contracts and policy

- Create `schemas/core/v1/result-envelope.schema.json` — public Core operation result shape.
- Create `schemas/core/v1/project-state.schema.json` — compatible `.gse/state.json` additions: `stateRevision` and `activeChangeId`.
- Create `schemas/core/v1/active-change.schema.json` — derived single-Change cache.
- Create `schemas/core/v1/evidence-event.schema.json` — revision/dependency-aware evidence records.
- Create `schemas/core/v1/transaction-manifest.schema.json` — complete transaction write set and recovery metadata.
- Create `assets/policies/profile-triggers.v1.json` — compatibility levels, soft triggers, hard floors, unknown behavior, and policies.

### Core modules

- Create `scripts/core/contracts.mjs` — envelope construction, status normalization, and schema-level runtime assertions.
- Create `scripts/core/profiles.mjs` — deterministic policy-table classifier.
- Create `scripts/core/lifecycle.mjs` — 1.0 stage mapping and five-stage facade metadata.
- Create `scripts/core/redaction.mjs` — structured-record allowlists, credential-field rejection, redaction, and secret blocking.
- Create `scripts/core/change-state.mjs` — source digests, one-active-Change derivation, cache comparison, and Close-relevant state.
- Create `scripts/core/evidence.mjs` — evidence dependency capture and freshness evaluation.
- Create `scripts/core/migration-v1.mjs` — byte-preserving, read-only 1.0 inspection and proposed derived writes.
- Create `scripts/core/persistence/paths.mjs` — target-bounded paths and SHA-256 helpers.
- Create `scripts/core/persistence/lock.mjs` — atomic project-local lock, expiry, stale-owner recovery, and bounded retry.
- Create `scripts/core/persistence/atomic-json.mjs` — staged JSON publish and before-image restore.
- Create `scripts/core/persistence/jsonl.mjs` — committed-prefix reader, idempotent append, and corrupt-tail quarantine metadata.
- Create `scripts/core/persistence/transaction.mjs` — manifest, intent, staging, publish, commit marker, revision, and rollback orchestration.
- Create `scripts/core/persistence/recovery.mjs` — commit-marker-authoritative roll-forward/rollback.

### Public scripts and compatibility integration

- Create `scripts/inspect-gse-v1-migration.mjs` — JSON/Markdown read-only migration report.
- Create `scripts/record-evidence.mjs` — allowlisted revision-aware evidence append through the transaction layer.
- Modify `scripts/init-project.mjs` — initialize revision fields and use one transaction for Core-owned state/evidence writes.
- Modify `scripts/update-project-state.mjs` — recover first, inspect legacy state, then transactionally update supported machine state.
- Modify `scripts/init-change.mjs` — preserve all seven Markdown files, enforce one active Change, and publish Markdown/state/change cache together.
- Modify `scripts/close-change.mjs` — require consistency and archive through one transaction.
- Modify `scripts/audit-state-repair.mjs` — recover first and transactionally compact risks; keep invalid JSON/JSONL conservative.
- Modify `scripts/audit-evidence-levels.mjs` — downgrade new records that lack dependency metadata.
- Modify `scripts/audit-close-gate.mjs` — add revision, active-Change, freshness, derived-cache, and pending-transaction checks without replacing CG01–CG12.
- Modify `scripts/detect-project-stage.mjs` — reuse the shared mapping while preserving detailed 1.0 output.
- Modify `scripts/run-gse-command.mjs` — add `frame`, `specify`, and `build`, preserve all old verbs, and attach `coreResult`.
- Modify `scripts/gse.mjs` only if forwarding a new facade flag is necessary; command text forwarding should otherwise remain unchanged.

### Audits and fixtures

- Create `scripts/audit-core-contracts.mjs` — schemas, envelopes, profile floors, lifecycle mapping, redaction.
- Create `scripts/audit-core-compatibility.mjs` — named migration, one-Change, stale-evidence, and contradictory-Close fixtures.
- Create `scripts/audit-core-transactions.mjs` — lock/revision/idempotency/fault/recovery fixtures.
- Create `scripts/fixtures/core-foundation/manifest.json` — fixture names, expected envelopes, revisions, blocker codes, and source-byte assertions.
- Create fixture content under:
  - `scripts/fixtures/core-foundation/legacy-lite/`;
  - `scripts/fixtures/core-foundation/legacy-standard-change/`;
  - `scripts/fixtures/core-foundation/enterprise-hard-risk/`;
  - `scripts/fixtures/core-foundation/stale-evidence/`;
  - `scripts/fixtures/core-foundation/contradictory-close/`;
  - `scripts/fixtures/core-foundation/transaction-faults/`;
  - `scripts/fixtures/core-foundation/truncated-jsonl/`.

### Validation, package, and references

- Modify `scripts/run-validation-profile.mjs` — run all three foundation audits in Lite.
- Modify `scripts/validate-gse.mjs` — make all three audits mandatory in the canonical validator.
- Modify `scripts/audit-change-system.mjs`, `scripts/audit-change-lifecycle.mjs`, and `scripts/audit-command-execution.mjs` — preserve 1.0 behavior while asserting new revisioned behavior.
- Modify `references/task-levels.md` — document versioned compatibility and hard-floor precedence.
- Modify `references/commands.md` — document five facade verbs, separate post-Close release, and migration inspection.
- Modify `package.json` — include `schemas` in package files and expose focused audit scripts.
- Update `.gse/evidence/2026-07-16.md` and append one revision-aware record to `.gse/evidence/index.jsonl` only after all focused validation passes.

## Stable Data Contracts

All tasks use these exact names and semantics.

```js
const CORE_STATUSES = ['proceed', 'repair', 'ask_user', 'blocked', 'complete']
const LIFECYCLE_STAGES = ['frame', 'specify', 'build', 'verify', 'close']
const PROFILES = ['lite', 'standard', 'enterprise']
```

A Core envelope always has every field below; unavailable identifiers are `null`, and list fields are empty arrays.

```js
{
  schemaVersion: 1,
  operationId: 'op-018f6f3e-3d45-7c2a-9b10-4e735a2c1180',
  status: 'proceed',
  stage: 'build',
  reasonCode: 'READY',
  message: 'Build may continue.',
  changeId: 'checkout-accessibility',
  taskId: null,
  stateRevision: 17,
  requiredActions: [],
  artifactRefs: [],
  evidenceRefs: [],
  diagnostics: [],
  safeToRetry: true,
}
```

The compatible project-state additions preserve the current 1.0 keys and add only `stateRevision` and `activeChangeId`:

```js
{
  schemaVersion: 1,
  stateRevision: 0,
  activeChangeId: null,
  projectName: 'gse',
  mode: 'enterprise',
  canonicalGoalSource: '.gse/gse-design-master-plan.md',
  canonicalPlan: '.gse/gse-design-master-plan.md',
  phase: 'final-form',
  currentSummary: {},
  currentSlice: null,
  toolStatuses: {},
  lastEvidence: null,
  blockedGates: [],
  nextChecks: [],
  residualRisks: [],
  riskArchive: [],
}
```

The derived active Change cache is:

```js
{
  schemaVersion: 1,
  changeId: 'add-user-login',
  stateRevision: 3,
  profile: 'standard',
  lifecycleStage: 'specify',
  lifecycleState: 'specified',
  sourceDigests: {
    'brief.md': 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
    'spec.md': 'sha256:2222222222222222222222222222222222222222222222222222222222222222',
    'design.md': 'sha256:3333333333333333333333333333333333333333333333333333333333333333',
    'tasks.md': 'sha256:4444444444444444444444444444444444444444444444444444444444444444',
    'evidence.md': 'sha256:5555555555555555555555555555555555555555555555555555555555555555',
    'review.md': 'sha256:6666666666666666666666666666666666666666666666666666666666666666'
  },
  derivedFrom: ['brief.md', 'spec.md', 'design.md', 'tasks.md', 'evidence.md', 'review.md'],
  conflicts: []
}
```

New evidence records use:

```js
{
  schemaVersion: 1,
  eventId: 'evt-gse-core-foundation-verified-component',
  transactionId: 'tx-gse-core-foundation-evidence',
  date: '2026-07-16',
  timestamp: '2026-07-16T12:00:00.000Z',
  recordType: 'verification',
  changeId: 'add-user-login',
  taskId: null,
  status: 'verified',
  evidenceLevel: 'verified-unit',
  requiredEvidenceLevel: 'verified-unit',
  claim: 'Core contract audit passes.',
  evidenceClass: 'unit',
  method: 'node scripts/audit-core-contracts.mjs --root . --json',
  stateRevision: 3,
  dependencies: {
    sourceRevision: null,
    dirtyWorktreeDigest: null,
    inputPaths: [{ path: 'scripts/core/contracts.mjs', digest: 'sha256:7777777777777777777777777777777777777777777777777777777777777777' }],
    generatedArtifacts: [],
    configuration: [{ key: 'node-major', valueDigest: 'sha256:8888888888888888888888888888888888888888888888888888888888888888' }],
    contractRevision: 'core-v1',
    environmentFingerprint: 'node-18-win32-x64',
    hostCapabilityBasis: 'portable-node'
  },
  invalidationScope: ['unit'],
  outcome: 'passed',
  limitations: ['No host-native invocation was tested.'],
  actor: 'gse-core',
  evidenceFile: '.gse/evidence/2026-07-16.md',
  relatedArtifacts: ['scripts/audit-core-contracts.mjs'],
  nextAction: 'Run compatibility and transaction audits.'
}
```

Transaction manifests use operations of exactly four kinds: `json-replace`, `jsonl-append`, `text-write`, and `tree-move`. Every operation records `beforeDigest`, `afterDigest`, and `stagedPath`; JSONL also records `eventId` and `beforeSize`, while moves record `sourcePath` and `targetPath`.

---

### Task 1: Add Versioned Core Contracts and Secret-Safe Envelopes

**Files:**
- Create: `schemas/core/v1/result-envelope.schema.json`
- Create: `schemas/core/v1/project-state.schema.json`
- Create: `schemas/core/v1/active-change.schema.json`
- Create: `schemas/core/v1/evidence-event.schema.json`
- Create: `schemas/core/v1/transaction-manifest.schema.json`
- Create: `scripts/core/contracts.mjs`
- Create: `scripts/core/redaction.mjs`
- Create: `scripts/audit-core-contracts.mjs`

- [ ] **Step 1: Create the failing Core contract audit**

Create `scripts/audit-core-contracts.mjs` with the repository-standard `check(id, label, ok, evidence)` report. Its first checks must be:

```js
const checks = [
  check('CORE01', 'all Core v1 schemas exist', schemaNames.every((name) => fs.existsSync(path.join(root, 'schemas', 'core', 'v1', name))), schemaNames.join(', ')),
  check('CORE02', 'result envelope normalizes legacy block to blocked', normalizeStatus('block') === 'blocked', 'normalizeStatus(block)'),
  check('CORE03', 'result envelope supplies every stable field', REQUIRED_ENVELOPE_FIELDS.every((key) => Object.hasOwn(envelope, key)), JSON.stringify(envelope)),
  check('CORE04', 'invalid envelope input returns diagnostics instead of malformed success', invalid.status === 'repair' && invalid.reasonCode === 'CORE_VALIDATION_FAILED' && invalid.diagnostics.length > 0, JSON.stringify(invalid)),
  check('CORE05', 'known credential fields never persist', !Object.hasOwn(sanitized, 'token') && !JSON.stringify(sanitized).includes('secret-value'), JSON.stringify(sanitized)),
  check('CORE06', 'suspected private key content blocks structured writes', secretBlocked, 'SUSPECTED_SECRET'),
]
```

Use direct imports from `./core/contracts.mjs` and `./core/redaction.mjs`; do not inspect source text to pass these behavioral checks.

- [ ] **Step 2: Run the audit and verify the red test**

Run:

```bash
node scripts/audit-core-contracts.mjs --root . --json
```

Expected: nonzero exit; `CORE01`–`CORE06` fail because the schemas and Core modules do not exist.

- [ ] **Step 3: Create the result-envelope schema**

Create `schemas/core/v1/result-envelope.schema.json` with this complete contract:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://gse.local/schemas/core/v1/result-envelope.schema.json",
  "title": "GSE Core Result Envelope v1",
  "type": "object",
  "additionalProperties": false,
  "required": ["schemaVersion", "operationId", "status", "stage", "reasonCode", "message", "changeId", "taskId", "stateRevision", "requiredActions", "artifactRefs", "evidenceRefs", "diagnostics", "safeToRetry"],
  "properties": {
    "schemaVersion": { "const": 1 },
    "operationId": { "type": "string", "minLength": 1 },
    "status": { "enum": ["proceed", "repair", "ask_user", "blocked", "complete"] },
    "stage": { "type": ["string", "null"], "enum": ["frame", "specify", "build", "verify", "close", null] },
    "reasonCode": { "type": "string", "minLength": 1 },
    "message": { "type": "string" },
    "changeId": { "type": ["string", "null"] },
    "taskId": { "type": ["string", "null"] },
    "stateRevision": { "type": ["integer", "null"], "minimum": 0 },
    "requiredActions": { "type": "array", "items": { "type": "string" } },
    "artifactRefs": { "type": "array", "items": { "type": "string" } },
    "evidenceRefs": { "type": "array", "items": { "type": "string" } },
    "diagnostics": { "type": "array", "items": { "type": "object" } },
    "safeToRetry": { "type": "boolean" }
  }
}
```

Create the other four schemas with `additionalProperties: false` and these explicit required fields:

```text
project-state.schema.json
  required: schemaVersion, stateRevision, activeChangeId
  optional compatible properties: projectName, mode, canonicalGoalSource, canonicalPlan,
    phase, currentSummary, currentSlice, toolStatuses, lastEvidence, blockedGates,
    nextChecks, residualRisks, riskArchive
  constraints: schemaVersion=1; stateRevision integer >= 0; activeChangeId string|null;
    arrays remain arrays; object-valued legacy fields remain objects or null where current 1.0 permits null

active-change.schema.json
  required: schemaVersion, changeId, stateRevision, profile, lifecycleStage,
    lifecycleState, sourceDigests, derivedFrom, conflicts
  constraints: schemaVersion=1; profile lite|standard|enterprise;
    lifecycleStage frame|specify|build|verify|close;
    lifecycleState draft|framed|specified|building|verifying|verified|closed|
      needs_decision|blocked|failed|superseded|cancelled;
    every source digest matches ^sha256:[a-f0-9]{64}$

evidence-event.schema.json
  required: schemaVersion, eventId, transactionId, date, timestamp, recordType,
    changeId, taskId, status, evidenceLevel, requiredEvidenceLevel, claim,
    evidenceClass, method, stateRevision, dependencies, invalidationScope,
    outcome, limitations, actor, evidenceFile, relatedArtifacts, nextAction
  dependencies required: sourceRevision, dirtyWorktreeDigest, inputPaths,
    generatedArtifacts, configuration, contractRevision, environmentFingerprint,
    hostCapabilityBasis
  constraints: schemaVersion=1; stateRevision integer >= 0;
    status result|verified|accepted; eventId and transactionId non-empty;
    input/artifact digests match ^sha256:[a-f0-9]{64}$

transaction-manifest.schema.json
  required: schemaVersion, transactionId, operationId, createdAt, expectedRevision,
    nextRevision, status, writes, eventIds
  each writes item required: kind, path, beforeDigest, afterDigest, stagedPath
  conditional fields: jsonl-append requires eventId and beforeSize;
    tree-move requires sourcePath and targetPath
  constraints: schemaVersion=1; nextRevision=expectedRevision+1 is enforced at runtime;
    kind json-replace|jsonl-append|text-write|tree-move;
    status prepared|staged|published|committed|rolled-back|recovered
```

Use `$id` values under `https://gse.local/schemas/core/v1/`. The JSON Schema cannot express `nextRevision = expectedRevision + 1`, so `scripts/core/contracts.mjs` must assert that relation behaviorally and `CORE03` must exercise it.

- [ ] **Step 4: Implement envelope normalization and validation**

Create `scripts/core/contracts.mjs` with these exports and behavior:

```js
import crypto from 'node:crypto'

export const CORE_STATUSES = Object.freeze(['proceed', 'repair', 'ask_user', 'blocked', 'complete'])
export const LIFECYCLE_STAGES = Object.freeze(['frame', 'specify', 'build', 'verify', 'close'])
export const REQUIRED_ENVELOPE_FIELDS = Object.freeze([
  'schemaVersion', 'operationId', 'status', 'stage', 'reasonCode', 'message',
  'changeId', 'taskId', 'stateRevision', 'requiredActions', 'artifactRefs',
  'evidenceRefs', 'diagnostics', 'safeToRetry',
])

export function normalizeStatus(value) {
  return value === 'block' ? 'blocked' : value
}

export function createOperationId() {
  return `op-${crypto.randomUUID()}`
}

function diagnosticsFor(input) {
  const diagnostics = []
  const status = normalizeStatus(input.status)
  if (!CORE_STATUSES.includes(status)) diagnostics.push({ code: 'INVALID_STATUS', field: 'status', value: input.status ?? null })
  if (input.stage !== null && !LIFECYCLE_STAGES.includes(input.stage)) diagnostics.push({ code: 'INVALID_STAGE', field: 'stage', value: input.stage ?? null })
  if (input.stateRevision !== null && (!Number.isInteger(input.stateRevision) || input.stateRevision < 0)) diagnostics.push({ code: 'INVALID_REVISION', field: 'stateRevision', value: input.stateRevision ?? null })
  return diagnostics
}

export function createResultEnvelope(input = {}) {
  const requested = {
    schemaVersion: 1,
    operationId: input.operationId || createOperationId(),
    status: normalizeStatus(input.status || 'proceed'),
    stage: input.stage ?? null,
    reasonCode: input.reasonCode || 'READY',
    message: input.message || '',
    changeId: input.changeId ?? null,
    taskId: input.taskId ?? null,
    stateRevision: input.stateRevision ?? null,
    requiredActions: Array.isArray(input.requiredActions) ? input.requiredActions : [],
    artifactRefs: Array.isArray(input.artifactRefs) ? input.artifactRefs : [],
    evidenceRefs: Array.isArray(input.evidenceRefs) ? input.evidenceRefs : [],
    diagnostics: Array.isArray(input.diagnostics) ? input.diagnostics : [],
    safeToRetry: input.safeToRetry !== false,
  }
  const diagnostics = [...requested.diagnostics, ...diagnosticsFor(requested)]
  if (diagnostics.length === requested.diagnostics.length) return requested
  return {
    ...requested,
    status: 'repair',
    stage: LIFECYCLE_STAGES.includes(requested.stage) ? requested.stage : null,
    reasonCode: 'CORE_VALIDATION_FAILED',
    message: 'Core operation input did not satisfy the v1 contract.',
    diagnostics,
    safeToRetry: false,
  }
}
```

- [ ] **Step 5: Implement allowlisted structured persistence and secret blocking**

Create `scripts/core/redaction.mjs` with:

```js
const KNOWN_CREDENTIAL_FIELDS = new Set(['password', 'passwd', 'secret', 'token', 'accessToken', 'refreshToken', 'apiKey', 'privateKey', 'authorization', 'cookie'])
const BLOCK_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /\bgh[opusr]_[A-Za-z0-9_]{20,}\b/,
]
const REDACT_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/gi,
  /\b(?:sk|pk)_[A-Za-z0-9_-]{16,}\b/g,
]

export function sanitizeStructuredRecord(record, allowedFields) {
  const output = {}
  for (const key of allowedFields) {
    if (!Object.hasOwn(record, key) || KNOWN_CREDENTIAL_FIELDS.has(key)) continue
    const serialized = JSON.stringify(record[key])
    if (BLOCK_PATTERNS.some((pattern) => pattern.test(serialized))) {
      const error = new Error(`Suspected secret content in ${key}`)
      error.code = 'SUSPECTED_SECRET'
      throw error
    }
    const redacted = REDACT_PATTERNS.reduce((value, pattern) => value.replace(pattern, '[REDACTED]'), serialized)
    output[key] = JSON.parse(redacted)
  }
  return output
}
```

The transaction layer in Task 4 must call this function before staging every GSE-owned JSON or JSONL record. Raw command stdout/stderr are never allowlisted.

- [ ] **Step 6: Run the focused audit**

Run:

```bash
node scripts/audit-core-contracts.mjs --root . --json
```

Expected: exit 0; `summary.failed` is `0`; `CORE01`–`CORE06` are `passed`.

- [ ] **Step 7: Run the existing encoding guard**

Run:

```bash
npm run check:encoding
```

Expected: exit 0; no new schema or ESM file is reported as invalid UTF-8.

- [ ] **Step 8: Stop for review without committing**

Review `git diff -- schemas/core/v1 scripts/core/contracts.mjs scripts/core/redaction.mjs scripts/audit-core-contracts.mjs`. Do not commit or push; this plan requires separate authorization for Git publication actions.

---

### Task 2: Add the Versioned Profile Classifier and Lifecycle Compatibility Map

**Files:**
- Create: `assets/policies/profile-triggers.v1.json`
- Create: `scripts/core/profiles.mjs`
- Create: `scripts/core/lifecycle.mjs`
- Modify: `scripts/audit-core-contracts.mjs`
- Modify: `scripts/detect-project-stage.mjs:61-74,197-216`
- Modify: `references/task-levels.md`

- [ ] **Step 1: Add failing classifier and lifecycle checks**

Add these behavioral checks to `scripts/audit-core-contracts.mjs`:

```js
check('CORE07', 'Level 1/2/3 map to Lite/Standard/Enterprise', ['lite', 'standard', 'enterprise'].every((profile, index) => profileForLegacyLevel(index + 1) === profile), 'legacy task levels'),
check('CORE08', 'authentication forces Enterprise', authResult.selectedProfile === 'enterprise' && authResult.triggerIds.includes('RISK_AUTH_TRUST'), JSON.stringify(authResult)),
check('CORE09', 'unknown possible hard risk asks the user', unknownResult.status === 'ask_user' && unknownResult.reasonCode === 'HARD_RISK_UNKNOWN', JSON.stringify(unknownResult)),
check('CORE10', 'user can raise but cannot lower a hard floor', raised.selectedProfile === 'standard' && lowered.selectedProfile === 'enterprise', `${raised.selectedProfile}/${lowered.selectedProfile}`),
check('CORE11', 'legacy stages map to the five-stage facade', expectedLegacyStages.every(([legacy, stage]) => mapLegacyStage(legacy).stage === stage), JSON.stringify(expectedLegacyStages)),
check('CORE12', 'learning and release remain outside five sequential stages', mapLegacyStage('learning').concern === 'learn' && mapLegacyStage('release').concern === 'post_close_release' && mapLegacyStage('release').stage === null, 'learning/release'),
```

- [ ] **Step 2: Run the audit and verify the red test**

Run:

```bash
node scripts/audit-core-contracts.mjs --root . --json
```

Expected: nonzero exit; `CORE07`–`CORE12` fail because policy and mapping modules are absent.

- [ ] **Step 3: Create the policy table**

Create `assets/policies/profile-triggers.v1.json` with this top-level shape:

```json
{
  "schemaVersion": 1,
  "profiles": ["lite", "standard", "enterprise"],
  "legacyLevels": {
    "1": "lite",
    "2": "standard",
    "3": "enterprise",
    "level-1": "lite",
    "level-2": "standard",
    "level-3": "enterprise",
    "lite": "lite",
    "standard": "standard",
    "enterprise": "enterprise"
  },
  "triggers": [
    { "id": "COMPLEXITY_THREE_MODULES", "dimension": "complexity", "input": "touchesThreeOrMoreModules", "profileFloor": "standard", "hard": false, "downgradeable": true, "unknownBehavior": "ignore", "policies": ["focused-integration"] },
    { "id": "COORDINATION_MULTIPLE_SESSIONS", "dimension": "coordination", "input": "multipleSessions", "profileFloor": "enterprise", "hard": false, "downgradeable": true, "unknownBehavior": "ignore", "policies": ["durable-handoff"] },
    { "id": "RISK_AUTH_TRUST", "dimension": "risk", "input": "authenticationAuthorizationOrTrust", "profileFloor": "enterprise", "hard": true, "downgradeable": false, "unknownBehavior": "ask_user", "policies": ["security-review", "claim-matched-verification"] },
    { "id": "RISK_PAYMENTS", "dimension": "risk", "input": "paymentsOrMoney", "profileFloor": "enterprise", "hard": true, "downgradeable": false, "unknownBehavior": "ask_user", "policies": ["financial-integrity"] },
    { "id": "RISK_SENSITIVE_DATA", "dimension": "risk", "input": "sensitiveOrRegulatedData", "profileFloor": "enterprise", "hard": true, "downgradeable": false, "unknownBehavior": "ask_user", "policies": ["privacy-review"] },
    { "id": "RISK_IRREVERSIBLE_MIGRATION", "dimension": "risk", "input": "irreversibleOrProductionMigration", "profileFloor": "enterprise", "hard": true, "downgradeable": false, "unknownBehavior": "ask_user", "policies": ["rollback-proof"] },
    { "id": "RISK_PUBLIC_CONTRACT", "dimension": "risk", "input": "publicApiSchemaOrProtocol", "profileFloor": "enterprise", "hard": true, "downgradeable": false, "unknownBehavior": "ask_user", "policies": ["compatibility-review"] },
    { "id": "RISK_PRODUCTION_RELEASE", "dimension": "risk", "input": "productionReleaseOrDeployment", "profileFloor": "enterprise", "hard": true, "downgradeable": false, "unknownBehavior": "ask_user", "policies": ["separate-release-authorization"] },
    { "id": "RISK_COMPLIANCE_LEGAL", "dimension": "risk", "input": "complianceOrLegal", "profileFloor": "enterprise", "hard": true, "downgradeable": false, "unknownBehavior": "ask_user", "policies": ["owner-decision"] },
    { "id": "RISK_INFRA_BLAST_RADIUS", "dimension": "risk", "input": "highBlastRadiusInfrastructure", "profileFloor": "enterprise", "hard": true, "downgradeable": false, "unknownBehavior": "ask_user", "policies": ["rollback-proof", "independent-review"] }
  ]
}
```

- [ ] **Step 4: Implement deterministic classification**

Create `scripts/core/profiles.mjs`. Export:

```js
export function profileForLegacyLevel(level)
export function classifyProfile({ legacyLevel = 1, preferredProfile = null, signals = {} }, table)
```

`classifyProfile` must:

1. map the legacy level to a baseline;
2. treat signal values as only `true`, `false`, or `'unknown'`;
3. return `ask_user` with `HARD_RISK_UNKNOWN` when a hard row has `'unknown'`;
4. apply the highest true profile floor;
5. allow `preferredProfile` to raise the result;
6. ignore a lower preference when any contributing row is hard or non-downgradeable;
7. return `{ schemaVersion: 1, status, reasonCode, selectedProfile, baselineProfile, triggerIds, policies, confidence }`.

Use the order `lite < standard < enterprise`; sort and deduplicate `triggerIds` and `policies` so identical inputs always yield byte-stable JSON.

- [ ] **Step 5: Implement the shared lifecycle mapping**

Create `scripts/core/lifecycle.mjs` with:

```js
export const LEGACY_STAGE_MAP = Object.freeze({
  intake: { stage: 'frame', concern: null },
  opportunity: { stage: 'frame', concern: null },
  requirements: { stage: 'specify', concern: null },
  design: { stage: 'specify', concern: null },
  architecture: { stage: 'specify', concern: null },
  planning: { stage: 'specify', concern: null },
  implementation: { stage: 'build', concern: null },
  verification: { stage: 'verify', concern: null },
  learning: { stage: null, concern: 'learn' },
  release: { stage: null, concern: 'post_close_release' },
})

export function mapLegacyStage(stage) {
  const normalized = String(stage || '').trim().toLowerCase()
  const mapped = LEGACY_STAGE_MAP[normalized]
  return mapped
    ? { legacyStage: normalized, ...mapped, supported: true }
    : { legacyStage: normalized || null, stage: null, concern: null, supported: false }
}

export function facadeRoute(stage) {
  return {
    frame: 'detect-project-stage.mjs',
    specify: 'init-change.mjs',
    build: 'generate-continue-packet.mjs',
    verify: 'run-validation-profile.mjs',
    close: 'audit-close-gate.mjs',
  }[stage] ?? null
}
```

- [ ] **Step 6: Make detailed stage detection reuse the mapping**

In `scripts/detect-project-stage.mjs`, import `mapLegacyStage` and add these fields without removing any current output:

```js
const lifecycle = mapLegacyStage(currentStage)

const report = {
  schemaVersion: 1,
  target,
  intent,
  current_stage: currentStage,
  stage_basis: stageBasis.length ? stageBasis : ['repository contains no corroborating lifecycle evidence'],
  missing_artifacts: missingArtifacts,
  required_references: routes[currentStage],
  role_route: roles[currentStage],
  evidence_gate: gates[currentStage],
  next_stage: nextStage,
  decision,
  confidence: stateStage === currentStage || currentStage === 'intake' ? 'high' : 'medium',
  risk_flags: [
    ...(wantsUi ? ['ui'] : []),
    ...(wantsBackend ? ['api-or-data'] : []),
    ...(wantsProduct && !opportunityEvidence ? ['unvalidated-product-value'] : []),
    ...(implementationEvidence && !verificationEvidence ? ['unverified-implementation'] : []),
  ],
  observed: {
    files: files.length,
    sourceFiles: sourceFiles.length,
    testFiles: testFiles.length,
    uiFiles: uiFiles.length,
    backendFiles: backendFiles.length,
    statePhase: state?.phase ?? null,
    evidenceFiles: evidenceFiles.length,
    screenshots: screenshotFiles.length,
  },
  limits: [
    'This is deterministic stage advice, not an automatic completion claim.',
    'The agent must inspect the cited evidence before acting and record why any override is safer.',
    'Only the returned current-stage references should be loaded initially; add another reference only for a named risk or failed gate.',
  ],
  lifecycle_stage: lifecycle.stage,
  lifecycle_concern: lifecycle.concern,
}
```

Keep every pre-existing expression above byte-for-byte except for insertion of the two `lifecycle_*` fields and the `mapLegacyStage` import.

- [ ] **Step 7: Document compatibility precedence**

Append to `references/task-levels.md`:

```markdown
## Core Profile Compatibility v1

- Level 1 and `lite` map to Lite.
- Level 2 and `standard` map to Standard.
- Level 3 and `enterprise` map to Enterprise.
- `assets/policies/profile-triggers.v1.json` is the machine-readable decision table.
- A user may raise rigor. A lower preference is ignored when a contributing trigger is hard or non-downgradeable.
- Unknown status for a possible hard-risk input returns `ask_user`; it never silently selects Lite or Standard.
```

- [ ] **Step 8: Run focused and existing lifecycle audits**

Run:

```bash
node scripts/audit-core-contracts.mjs --root . --json
node scripts/audit-stage-orchestrator.mjs --root . --json
```

Expected: both exit 0; `CORE07`–`CORE12` pass; existing stage audit has `summary.failed: 0`.

- [ ] **Step 9: Stop for review without committing**

Review the profile table for all eight hard triggers and verify `release` is not mapped to `close`. Do not commit or push.

---

### Task 3: Add Named Fixtures, Single-Change Derivation, and Read-Only 1.0 Inspection

**Files:**
- Create: `scripts/fixtures/core-foundation/manifest.json`
- Create: fixture files under the seven directories listed in the file map
- Create: `scripts/core/persistence/paths.mjs`
- Create: `scripts/core/change-state.mjs`
- Create: `scripts/core/migration-v1.mjs`
- Create: `scripts/inspect-gse-v1-migration.mjs`
- Create: `scripts/audit-core-compatibility.mjs`

- [ ] **Step 1: Create the fixture manifest and minimum source artifacts**

Create `scripts/fixtures/core-foundation/manifest.json`:

```json
{
  "schemaVersion": 1,
  "fixtures": [
    { "id": "legacy-lite", "expectedStatus": "proceed", "expectedRevision": 0, "assertSourceBytesUnchanged": true },
    { "id": "legacy-standard-change", "expectedStatus": "proceed", "expectedStage": "specify", "expectedRevision": 0, "assertSourceBytesUnchanged": true },
    { "id": "enterprise-hard-risk", "expectedStatus": "proceed", "expectedProfile": "enterprise", "expectedTriggerIds": ["RISK_AUTH_TRUST"] },
    { "id": "stale-evidence", "expectedStatus": "blocked", "expectedReasonCode": "EVIDENCE_INPUT_DIGEST_MISMATCH" },
    { "id": "contradictory-close", "expectedStatus": "blocked", "expectedReasonCode": "STATE_ARTIFACT_CONTRADICTION" },
    { "id": "transaction-faults", "faultSteps": ["after-lock", "after-manifest", "after-intent", "after-stage", "after-publish", "after-commit-marker"] },
    { "id": "truncated-jsonl", "expectedCommittedRecords": 1, "expectedQuarantinedTailLines": 1 }
  ]
}
```

Each legacy fixture must include `.gse/state.json`, `.gse/goal-map.md`, `.gse/quality-gates.md`, and `.gse/evidence/index.jsonl`. `legacy-standard-change` must include one complete `.gse/changes/add-user-login/` Markdown pack. Create fixed fixture dates and IDs; do not generate nondeterministic expected files.

- [ ] **Step 2: Create the failing compatibility audit**

Create `scripts/audit-core-compatibility.mjs` with checks:

```js
check('COMP01', 'fixture manifest names every foundation fixture', requiredFixtureIds.every((id) => manifest.fixtures.some((item) => item.id === id)), requiredFixtureIds.join(', ')),
check('COMP02', 'legacy Lite inspection proposes revision fields without writes', lite.status === 'proceed' && lite.proposedProjectState.stateRevision === 0 && sourceBytesEqual(liteBefore, liteAfter), JSON.stringify(lite)),
check('COMP03', 'one legacy Change derives a revisioned cache', standard.status === 'proceed' && standard.proposedActiveChange.changeId === 'add-user-login' && standard.proposedActiveChange.lifecycleStage === 'specify', JSON.stringify(standard)),
check('COMP04', 'two active Changes are explicitly unsupported', multiple.status === 'blocked' && multiple.reasonCode === 'MULTIPLE_ACTIVE_CHANGES_UNSUPPORTED', JSON.stringify(multiple)),
check('COMP05', 'source digest change contradicts cached derived state', contradiction.status === 'blocked' && contradiction.reasonCode === 'STATE_ARTIFACT_CONTRADICTION', JSON.stringify(contradiction)),
check('COMP06', 'inspection never creates transaction or cache files', createdPaths.length === 0, createdPaths.join(', ')),
```

Copy each static fixture to a temporary directory before mutation. The audit must remove temporary copies at the end and never alter `scripts/fixtures/core-foundation/`.

- [ ] **Step 3: Run the audit and verify the red test**

Run:

```bash
node scripts/audit-core-compatibility.mjs --root . --json
```

Expected: nonzero exit; `COMP02`–`COMP06` fail because derivation and inspection do not exist.

- [ ] **Step 4: Implement bounded path and digest helpers**

Create `scripts/core/persistence/paths.mjs`:

```js
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export function toPosix(relativePath) {
  return relativePath.replace(/\\/g, '/')
}

export function resolveInside(target, relativePath) {
  const root = path.resolve(target)
  const resolved = path.resolve(root, relativePath)
  const relation = path.relative(root, resolved)
  if (!relation || (!relation.startsWith('..') && !path.isAbsolute(relation))) return resolved
  const error = new Error(`Path escapes target: ${relativePath}`)
  error.code = 'PATH_OUTSIDE_TARGET'
  throw error
}

export function digestBytes(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`
}

export function digestFile(filePath) {
  return fs.existsSync(filePath) ? digestBytes(fs.readFileSync(filePath)) : null
}

export function digestValue(value) {
  return digestBytes(Buffer.from(JSON.stringify(value)))
}
```

- [ ] **Step 5: Implement one-active-Change derivation**

Create `scripts/core/change-state.mjs` and export:

```js
export function listActiveChangeIds(target)
export function deriveActiveChange(target, changeId, options = {})
export function compareDerivedChange(cached, derived)
export function deriveProjectState(existingState, activeChange)
```

Rules:

- ignore hidden entries and non-directories under `.gse/changes`;
- zero active Changes returns `activeChangeId: null`;
- more than one returns a `blocked` envelope with `MULTIPLE_ACTIVE_CHANGES_UNSUPPORTED`;
- hash `brief.md`, `spec.md`, `design.md`, `tasks.md`, `evidence.md`, and `review.md` as raw bytes;
- choose profile from `--level`/existing cache/Markdown task-level markers, in that precedence order;
- derive `specified/specify` when brief, spec, design, and tasks exist; `framed/frame` when only brief exists; otherwise `draft/frame`;
- never infer `verified` or `accepted` from prose containing those words;
- `compareDerivedChange` returns `STATE_ARTIFACT_CONTRADICTION` when any cached source digest differs.

- [ ] **Step 6: Implement byte-preserving migration inspection**

Create `scripts/core/migration-v1.mjs` with:

```js
export function inspectGseV1Project(target) {
  // Read current JSON and Markdown only.
  // Return a Core envelope plus proposedProjectState, proposedActiveChange,
  // proposedWrites, sourceDigests, conflicts, and limits.
}
```

The function must snapshot raw source bytes before derivation, perform no `mkdir`, `writeFile`, `appendFile`, `rename`, or `rm`, and return proposed writes only as in-memory `{ path, value }` entries. Invalid JSON returns `repair`; ambiguous source precedence returns `ask_user`; two Changes return `blocked`.

Create `scripts/inspect-gse-v1-migration.mjs` as a CLI wrapper supporting only `--target` and `--json`. If `--execute`, `--write`, or `--force` appears, return nonzero with reason `DRY_RUN_ONLY` rather than writing.

- [ ] **Step 7: Run compatibility and direct dry-run inspection**

Run:

```bash
node scripts/audit-core-compatibility.mjs --root . --json
node scripts/inspect-gse-v1-migration.mjs --target . --json
```

Expected: audit exits 0 with `COMP01`–`COMP06` passed. Direct inspection returns a valid envelope and `proposedWrites`, but `git status --short` shows no new `.gse` transaction/cache files caused by inspection.

- [ ] **Step 8: Verify explicit execution is refused**

Run:

```bash
node scripts/inspect-gse-v1-migration.mjs --target . --execute --json
```

Expected: nonzero exit; valid Core envelope with `status: "blocked"`, `reasonCode: "DRY_RUN_ONLY"`, and `safeToRetry: false`; source artifact digests are unchanged.

- [ ] **Step 9: Stop for review without committing**

Confirm the audit proves byte equality, not only file existence. Do not commit or push.

---

### Task 4: Implement Locking, Transaction Manifests, Commit Markers, Idempotent JSONL, and Recovery

**Files:**
- Create: `scripts/core/persistence/lock.mjs`
- Create: `scripts/core/persistence/atomic-json.mjs`
- Create: `scripts/core/persistence/jsonl.mjs`
- Create: `scripts/core/persistence/transaction.mjs`
- Create: `scripts/core/persistence/recovery.mjs`
- Create: `scripts/audit-core-transactions.mjs`
- Use: `scripts/fixtures/core-foundation/transaction-faults/`
- Use: `scripts/fixtures/core-foundation/truncated-jsonl/`

- [ ] **Step 1: Create the failing transaction fault audit**

Create `scripts/audit-core-transactions.mjs` with direct behavioral checks:

```js
check('TX01', 'lock excludes a second live writer', secondLock.status === 'blocked' && secondLock.reasonCode === 'LOCK_HELD', JSON.stringify(secondLock)),
check('TX02', 'expired lock is recoverable with an audit record', recoveredLock.recoveredStaleOwner === true, JSON.stringify(recoveredLock)),
check('TX03', 'revision mismatch publishes no write', mismatch.status === 'repair' && mismatch.reasonCode === 'STATE_REVISION_MISMATCH' && readRevision(target) === 2, JSON.stringify(mismatch)),
check('TX04', 'manifest contains the complete write set and digests', manifest.writes.length === requestedWrites.length && manifest.writes.every(hasRequiredWriteMetadata), JSON.stringify(manifest)),
check('TX05', 'commit marker is the authority point', beforeMarkerVisible === false && afterMarkerVisible === true, `${beforeMarkerVisible}/${afterMarkerVisible}`),
check('TX06', 'duplicate transaction and event replay are idempotent', replay.stateRevision === committed.stateRevision && countEventId(indexRecords, eventId) === 1, JSON.stringify(replay)),
check('TX07', 'truncated JSONL exposes committed prefix only', prefix.records.length === 1 && prefix.corruptTail.length === 1, JSON.stringify(prefix)),
check('TX08', 'faults before commit marker recover to the before state', preCommitFaults.every((item) => item.recovered === 'rolled-back' && item.stateDigest === item.beforeDigest), JSON.stringify(preCommitFaults)),
check('TX09', 'fault after commit marker recovers the complete after state', postCommitFault.recovered === 'rolled-forward' && postCommitFault.stateDigest === postCommitFault.afterDigest, JSON.stringify(postCommitFault)),
check('TX10', 'structured writes block suspected secrets before manifest publication', secretAttempt.status === 'blocked' && secretAttempt.reasonCode === 'SUSPECTED_SECRET' && !secretAttempt.manifestExists, JSON.stringify(secretAttempt)),
```

Inject faults through an explicit test-only `faultAfterStep` option accepted by `executeTransaction`; production CLIs must never expose this option.

- [ ] **Step 2: Run the audit and verify the red test**

Run:

```bash
node scripts/audit-core-transactions.mjs --root . --json
```

Expected: nonzero exit; TX checks fail because persistence modules are absent.

- [ ] **Step 3: Implement the atomic lock directory**

Create `scripts/core/persistence/lock.mjs`. Use `.gse/locks/core/` as the atomic ownership directory and `.gse/locks/stale/` for stale-owner records. Export:

```js
export function acquireProjectLock(target, { operationId, ttlMs = 30000, maxAttempts = 3, now = () => Date.now() })
export function renewProjectLock(lock, { ttlMs = 30000, now = () => Date.now() } = {})
export function releaseProjectLock(lock)
```

`owner.json` contains `operationId`, `pid`, `createdAt`, `expiresAt`, and `monotonicStartedNs: process.hrtime.bigint().toString()`. A live lock returns `blocked/LOCK_HELD`; an expired lock is atomically renamed into `stale/` before a new `mkdirSync` attempt. Never delete a lock whose operation ID does not match the caller.

- [ ] **Step 4: Implement staged JSON and JSONL primitives**

Create `scripts/core/persistence/atomic-json.mjs` with:

```js
export function stageJsonReplacement({ target, transactionDir, relativePath, value })
export function publishJsonReplacement(stagedWrite)
export function restoreJsonReplacement(stagedWrite)
```

Stage canonical JSON with a trailing newline. Preserve a before image and digest when the path exists. Publish by writing a sibling temporary file, `fsyncSync` on its descriptor, closing it, and `renameSync` to the canonical path.

Create `scripts/core/persistence/jsonl.mjs` with:

```js
export function readCommittedJsonl(target, relativePath)
export function stageJsonlAppend({ target, transactionDir, relativePath, event })
export function publishJsonlAppend(stagedWrite)
export function restoreJsonlAppend(stagedWrite)
```

Rules:

- historical entries without `transactionId` are treated as committed legacy entries;
- transaction-tagged entries are visible only when `.gse/transactions/<transactionId>/commit.json` exists;
- duplicate `eventId` is a no-op;
- a corrupt/truncated tail is returned in `corruptTail`, never included in `records`;
- rollback truncates to exact `beforeSize`;
- recovery may write quarantine metadata under `.gse/recovery/quarantine/`, but must preserve the original bytes until an explicit repair transaction.

- [ ] **Step 5: Implement transaction execution**

Create `scripts/core/persistence/transaction.mjs` and export:

```js
export async function executeTransaction({
  target,
  operationId,
  transactionId = `tx-${operationId}`,
  expectedRevision,
  writes,
  events = [],
  allowedFieldsByRecordType,
  faultAfterStep = null,
})
```

Execute these durable steps in this exact order:

1. sanitize every structured JSON/JSONL record;
2. acquire the project lock;
3. read `.gse/state.json` and compare `stateRevision` to `expectedRevision`;
4. create `.gse/transactions/<transactionId>/manifest.json` containing every write, before/after digest, staged path, expected revision, next revision, and event ID;
5. append one hidden intent event tagged with `transactionId`;
6. stage all writes;
7. publish all writes, updating project and active-Change `stateRevision` to `expectedRevision + 1`;
8. write and fsync `.gse/transactions/<transactionId>/commit.json`;
9. release the lock and return `complete` with the new revision.

On an ordinary exception before the marker, rollback immediately. On injected process-fault simulation, leave the transaction directory intact so `recoverTransactions` proves startup recovery. Reusing a committed `transactionId` returns the original committed result without incrementing revision.

- [ ] **Step 6: Implement marker-authoritative recovery**

Create `scripts/core/persistence/recovery.mjs` and export:

```js
export function recoverTransactions(target, { now = () => Date.now() } = {})
export function inspectPendingTransactions(target)
```

For each manifest:

- commit marker exists: finish any write whose canonical digest is not `afterDigest`, then report `rolled-forward`;
- marker absent: restore every published write in reverse order to `beforeDigest`, then report `rolled-back`;
- manifest invalid or before/after material unavailable: return `blocked/RECOVERY_AUTHORITY_REQUIRED` without guessing;
- append one idempotent recovery event only after the recovered state is coherent;
- never let a pending transaction count as a successful gate.

- [ ] **Step 7: Run the complete fault matrix**

Run:

```bash
node scripts/audit-core-transactions.mjs --root . --json
```

Expected: exit 0; TX01–TX10 pass; every pre-marker fixture rolls back, the post-marker fixture rolls forward, and duplicate replay produces one event and one revision increment.

- [ ] **Step 8: Run the contract and compatibility regressions**

Run:

```bash
node scripts/audit-core-contracts.mjs --root . --json
node scripts/audit-core-compatibility.mjs --root . --json
```

Expected: both exit 0 with `summary.failed: 0`.

- [ ] **Step 9: Stop for review without committing**

Inspect transaction fixture directories before cleanup in one diagnostic run and verify the manifest exists before intent/staging is considered committed. Do not commit or push.

---

### Task 5: Move Existing Core-Owned Mutation Paths Behind Transactions

**Files:**
- Modify: `scripts/init-project.mjs:100-220`
- Modify: `scripts/update-project-state.mjs:94-194`
- Modify: `scripts/init-change.mjs:35-49,226-259`
- Modify: `scripts/close-change.mjs:30-115`
- Modify: `scripts/audit-state-repair.mjs:52-60,101-264`
- Modify: `scripts/audit-change-system.mjs`
- Modify: `scripts/audit-change-lifecycle.mjs`
- Modify: `scripts/audit-command-execution.mjs`

- [ ] **Step 1: Extend existing audits with failing revision and transaction assertions**

Add these checks:

```js
// audit-change-system.mjs
check('CHG10', 'change creation writes a derived revisioned cache', first?.coreResult?.status === 'complete' && first?.stateRevision === 1 && exists(path.join(changeDir, 'change.json')), 'change.json/stateRevision'),
check('CHG11', 'second active Change is blocked without writes', blocked?.coreResult?.reasonCode === 'MULTIPLE_ACTIVE_CHANGES_UNSUPPORTED' && !exists(path.join(tempRoot, '.gse', 'changes', 'second-change')), 'single active Change boundary'),

// audit-change-lifecycle.mjs
check('CHGLC08', 'close commits archive, state, and evidence as one transaction', closeJson?.coreResult?.status === 'complete' && closeJson?.stateRevision === 3 && committedManifest(closeJson?.transactionId), 'archive transaction'),
check('CHGLC09', 'replaying close is idempotent', replay.status === 0 && replayJson?.transactionId === closeJson?.transactionId && countArchiveEvents(indexText, 'archive-me') === 1, 'close replay'),

// audit-command-execution.mjs full profile
check('CMDX15', 'repair execute reports a committed transaction revision', repairExecuteData?.coreResult?.status === 'complete' && Number.isInteger(repairExecuteData?.stateRevision), '/gse repair --execute'),
```

Update fixtures to initialize state via `init-project.mjs` rather than hand-writing an incomplete 1.0 state whenever the test is asserting new Core behavior.

- [ ] **Step 2: Run the three audits and verify the red tests**

Run:

```bash
node scripts/audit-change-system.mjs --root . --json
node scripts/audit-change-lifecycle.mjs --root . --json
node scripts/audit-command-execution.mjs --root . --profile full --json
```

Expected: nonzero exit; CHG10/CHG11, CHGLC08/CHGLC09, and CMDX15 fail while the previous checks remain diagnostic.

- [ ] **Step 3: Transactionalize project initialization**

Refactor `scripts/init-project.mjs` so directory creation and non-Core documentation scaffolding remain non-overwriting, but `.gse/state.json` and `.gse/evidence/index.jsonl` are passed to one `executeTransaction` call. Initial state must include:

```js
stateRevision: 0,
activeChangeId: null,
```

The transaction advances the committed state to revision `1`. Preserve current mode detection, host-pointer optionality, Markdown templates, and existing output fields; add:

```js
coreResult,
transactionId,
stateRevision: coreResult.stateRevision,
```

A rerun with the same deterministic initialization operation ID must not duplicate the adoption event.

- [ ] **Step 4: Transactionalize project state update**

At the start of `updateProject(target)`, call `recoverTransactions`. Use `inspectGseV1Project` to build the proposed state. Replace `writeFile` calls for state/index with one transaction. Keep dry-run entirely read-only and preserve invalid-JSON refusal unless `--force` is explicitly used after an owner-reviewed backup path is reported.

Expected revision mismatch output:

```js
createResultEnvelope({
  status: 'repair',
  reasonCode: 'STATE_REVISION_MISMATCH',
  message: 'Project state changed after this update was prepared.',
  stateRevision: actualRevision,
  requiredActions: ['rerun migration inspection'],
  safeToRetry: true,
})
```

- [ ] **Step 5: Transactionalize Change initialization**

Refactor `init-change.mjs` to:

1. recover pending transactions;
2. inspect active Change directories;
3. block a different second Change;
4. preserve current slug normalization and seven Markdown templates;
5. derive `change.json` from the exact Markdown bytes being staged;
6. set `state.activeChangeId`;
7. write all Markdown, project state, and active-Change cache in one transaction;
8. retain non-overwrite semantics by excluding existing files unless `--force` was supplied.

Do not add tasks JSON, DAGs, leases, or Agent ownership files.

- [ ] **Step 6: Transactionalize Change close**

Refactor `close-change.mjs` so `--dry-run` evaluates consistency only. A real close sends these writes to one transaction:

```js
[
  { kind: 'tree-move', sourcePath: `.gse/changes/${changeId}`, targetPath: `.gse/archive/${date}-${changeId}` },
  { kind: 'text-write', path: `.gse/archive/${date}-${changeId}/archive-record.md`, content: archiveRecord },
  { kind: 'json-replace', path: '.gse/state.json', value: { ...state, activeChangeId: null } },
  { kind: 'jsonl-append', path: '.gse/evidence/index.jsonl', event: indexRecord },
]
```

Remove the direct `rmSync`, `renameSync`, `writeFileSync`, and `appendFileSync` mutation block. `--force` may replace an archive only when the manifest has a recoverable before image; otherwise return `ask_user/ARCHIVE_CONFLICT`.

- [ ] **Step 7: Transactionalize supported state repair**

At the start of `auditStateRepair`, recover pending transactions and include recovery actions in the report. Replace `backupFile + writeFileSync` risk compaction with one JSON transaction. Keep these existing guarantees:

- invalid state JSON is never guessed;
- corrupt JSONL is never overwritten;
- diagnostic mode performs no write;
- only residual-risk compaction is auto-supported;
- the report preserves a reversible before reference in its transaction manifest.

Update `limits` to say recovery runs before diagnostics and supported writes use expected revisions.

- [ ] **Step 8: Run mutation-path audits**

Run:

```bash
node scripts/audit-change-system.mjs --root . --json
node scripts/audit-change-lifecycle.mjs --root . --json
node scripts/audit-state-repair.mjs --root . --self-test --json
node scripts/audit-command-execution.mjs --root . --profile full --json
node scripts/audit-core-transactions.mjs --root . --json
```

Expected: all exit 0 with `summary.failed: 0`; close replay has one archive event; second active Change is blocked; repair still refuses invalid JSON/JSONL.

- [ ] **Step 9: Stop for review without committing**

Search the five migrated scripts for remaining direct writes to `.gse/state.json` or `.gse/evidence/index.jsonl`. Any remaining direct Core-owned mutation is a blocker. Do not commit or push.

---

### Task 6: Add Revision-Aware Evidence and Deterministic Close Consistency

**Files:**
- Create: `scripts/core/evidence.mjs`
- Create: `scripts/record-evidence.mjs`
- Modify: `scripts/audit-evidence-levels.mjs:63-85,135-204`
- Modify: `scripts/audit-close-gate.mjs:208-419`
- Modify: `scripts/close-change.mjs`
- Modify: `scripts/audit-core-compatibility.mjs`
- Use: `scripts/fixtures/core-foundation/stale-evidence/`
- Use: `scripts/fixtures/core-foundation/contradictory-close/`

- [ ] **Step 1: Add failing evidence freshness and Close checks**

Extend `scripts/audit-core-compatibility.mjs`:

```js
check('COMP07', 'matching dependencies keep evidence current', fresh.current === true && fresh.reasonCodes.length === 0, JSON.stringify(fresh)),
check('COMP08', 'changed input digest makes evidence stale', stale.current === false && stale.reasonCodes.includes('EVIDENCE_INPUT_DIGEST_MISMATCH'), JSON.stringify(stale)),
check('COMP09', 'older state revision makes evidence stale', oldRevision.current === false && oldRevision.reasonCodes.includes('EVIDENCE_STATE_REVISION_MISMATCH'), JSON.stringify(oldRevision)),
check('COMP10', 'missing dependency metadata is downgraded', incomplete.current === false && incomplete.downgraded === true && incomplete.reasonCodes.includes('EVIDENCE_DEPENDENCIES_INCOMPLETE'), JSON.stringify(incomplete)),
check('COMP11', 'Close blocks stale evidence', staleClose.status === 'blocked' && staleClose.reasonCode === 'EVIDENCE_STALE', JSON.stringify(staleClose)),
check('COMP12', 'Close blocks cached/artifact contradiction', contradictoryClose.status === 'blocked' && contradictoryClose.reasonCode === 'STATE_ARTIFACT_CONTRADICTION', JSON.stringify(contradictoryClose)),
check('COMP13', 'Close never promotes result to verified or verified to accepted', promotionAttempt.status === 'blocked' && promotionAttempt.reasonCode === 'EVIDENCE_LEVEL_INSUFFICIENT', JSON.stringify(promotionAttempt)),
```

- [ ] **Step 2: Run compatibility audit and verify the red test**

Run:

```bash
node scripts/audit-core-compatibility.mjs --root . --json
```

Expected: nonzero exit; COMP07–COMP13 fail.

- [ ] **Step 3: Implement dependency capture and freshness evaluation**

Create `scripts/core/evidence.mjs` with exports:

```js
export function captureEvidenceDependencies(target, input)
export function evaluateEvidenceFreshness(target, record, current)
export function evaluateCloseConsistency(target, { projectState, activeChange, evidenceRecords, pendingTransactions })
```

`evaluateEvidenceFreshness` compares every declared input/artifact digest, `stateRevision`, `contractRevision`, environment fingerprint, and host capability basis. Return:

```js
{
  current: reasonCodes.length === 0,
  downgraded: reasonCodes.includes('EVIDENCE_DEPENDENCIES_INCOMPLETE'),
  reasonCodes: [...new Set(reasonCodes)].sort(),
  checkedDependencies,
}
```

A missing path is a mismatch. Missing dependency metadata is never fresh. Historical records remain parseable, but cannot satisfy a new revision-aware Close gate.

`evaluateCloseConsistency` must block when:

- a transaction is pending recovery;
- project and Change revisions differ;
- active Change ID differs;
- recomputed source digests differ from `change.json`;
- no verified/accepted record belongs to the active Change and current revision;
- any required record is stale or below `requiredEvidenceLevel`;
- a requested `accepted` Close has only verified evidence.

- [ ] **Step 4: Add the transactional evidence recorder**

Create `scripts/record-evidence.mjs`. Required CLI inputs:

```text
--target
--operation-id
--event-id
--change-id
--status
--evidence-level
--required-evidence-level
--claim
--evidence-class
--method
--contract-revision
--host-capability-basis
--input scripts/core/contracts.mjs (the `--input` flag is repeatable)
--evidence-file
--next-action
--json
```

Optional inputs are `--task-id`, `--artifact`, `--config key=value`, `--limitation`, and `--actor`. Derive `environmentFingerprint` as `node-${process.versions.node.split('.')[0]}-${process.platform}-${process.arch}` and read `stateRevision` from the current state; neither is free-form caller input. Capture digests, build the allowlisted evidence record, and append it through `executeTransaction` using the supplied operation/event IDs. Reject raw stdout/stderr flags and any secret-blocking content. Do not claim the supplied method ran; the caller is responsible for invoking this recorder only after command evidence exists.

Also support `--self-test --json`. Self-test creates a temporary revisioned single-Change project, records one event with fixed IDs, replays it, and reports checks `EVID01` (revision increments once), `EVID02` (event ID appears once), `EVID03` (environment fingerprint is derived), and `EVID04` (raw output/secret fields are absent). It removes the fixture before exit and never touches the requested repository.

- [ ] **Step 5: Extend evidence-level analysis without breaking history**

In `analyzeEvidenceLevels(records)`, add:

```js
const missingDependencies = records
  .filter((record) => record.schemaVersion === 1 && (!record.changeId || !Number.isInteger(record.stateRevision) || !record.dependencies))
  .map((record) => record.summary || record.claim || record.recordType || '(unknown)')
```

Return `missingDependencies`. Keep historical records lacking `schemaVersion` tolerated as legacy. Update CG09 evidence text so new incomplete records are a downgrade warning; they become a Close blocker only when selected as required current evidence.

- [ ] **Step 6: Add CG13–CG17 to the Close audit**

After CG12 in `scripts/audit-close-gate.mjs`, add:

```text
CG13 — no pending or unrecoverable transaction
CG14 — project state and active Change revision agree
CG15 — derived Change cache matches current source digests
CG16 — current claim-matched evidence belongs to active Change/revision
CG17 — requested Close status does not silently promote evidence
```

Do not remove or renumber CG01–CG12. `auditCloseGate` must be exported so `close-change.mjs` can call the same evaluator rather than reimplementing rules.

- [ ] **Step 7: Gate close-change through the shared consistency evaluator**

Before staging archive writes, call `evaluateCloseConsistency`. On failure, return its valid Core envelope and perform no transaction. On success, include all evidence IDs in `evidenceRefs` and the archive path in `artifactRefs`.

- [ ] **Step 8: Run focused evidence and Close tests**

Run:

```bash
node scripts/audit-core-compatibility.mjs --root . --json
node scripts/audit-evidence-levels.mjs --root . --target . --json
node scripts/audit-close-gate.mjs --self-test --json
node scripts/audit-change-lifecycle.mjs --root . --json
```

Expected: all exit 0; COMP07–COMP13 pass; CG01–CG17 are present in self-test; historical evidence remains readable but cannot masquerade as current revision-aware proof.

- [ ] **Step 9: Stop for review without committing**

Confirm no code path turns `result` into `verified` or `verified` into `accepted`. Do not commit or push.

---

### Task 7: Add the Five-Stage Command Facade While Preserving Every 1.0 Command

**Files:**
- Modify: `scripts/run-gse-command.mjs:93-226,232-593`
- Modify: `scripts/gse.mjs` only if required by a failing forwarding test
- Modify: `scripts/detect-project-stage.mjs`
- Modify: `scripts/audit-command-execution.mjs`
- Modify: `references/commands.md`

- [ ] **Step 1: Add failing command facade checks**

In Lite command audit setup, run:

```js
const frameRun = run('run-gse-command.mjs', ['--root', root, '--target', target, '--command', '/gse frame', '--json'])
const specifyRun = run('run-gse-command.mjs', ['--root', root, '--target', target, '--command', '/gse specify facade-change --level standard', '--json'])
const buildRun = run('run-gse-command.mjs', ['--root', root, '--target', target, '--command', '/gse build', '--json'])
```

Add:

```js
check('CMDX16', '/gse frame routes to current-stage detection and returns a v1 envelope', frame?.coreResult?.stage === 'frame' && frame?.execution?.command?.includes('detect-project-stage.mjs'), '/gse frame'),
check('CMDX17', '/gse specify previews the existing Change route without writes', specify?.coreResult?.stage === 'specify' && !fs.existsSync(path.join(target, '.gse', 'changes', 'facade-change')), '/gse specify'),
check('CMDX18', '/gse build routes to continuation and returns a build envelope', build?.coreResult?.stage === 'build' && build?.execution?.command?.includes('generate-continue-packet.mjs'), '/gse build'),
check('CMDX19', '/gse verify retains validation routing and adds a verify envelope', verify?.coreResult?.stage === 'verify', '/gse verify'),
check('CMDX20', '/gse close remains a readiness check and adds a close envelope', close?.coreResult?.stage === 'close' && !close?.execution?.command?.includes('release'), '/gse close'),
check('CMDX21', 'release remains post-Close and outside the five-stage facade', releaseDryRunReport?.coreResult?.stage === null && releaseDryRunReport?.coreResult?.reasonCode === 'POST_CLOSE_RELEASE', '/gse release'),
```

- [ ] **Step 2: Run command audit and verify the red test**

Run:

```bash
node scripts/audit-command-execution.mjs --root . --profile full --json
```

Expected: nonzero exit; CMDX16–CMDX21 fail while old route diagnostics remain visible.

- [ ] **Step 3: Extend command map without deleting old verbs**

Add command map entries:

```js
frame: { route: 'scripts/detect-project-stage.mjs', purpose: 'Frame through current project discovery and first unmet gate.' },
specify: { route: 'scripts/init-change.mjs', purpose: 'Specify through the existing native Change pack.' },
build: { route: 'scripts/generate-continue-packet.mjs', purpose: 'Build from the accepted current Change and next action.' },
```

Do not rename or remove `continue`, `context`, `stage`, `discover`, `repair`, `change`, `verify`, `close`, `package`, `release`, or `public-release`.

- [ ] **Step 4: Route facade verbs through current 1.0 implementations**

Use the shared `facadeRoute` mapping:

- `frame` executes `detect-project-stage.mjs`;
- `specify` is dry-run by default and uses the same Change ID/level parsing as `change`; only runner-level `--execute` writes;
- `build` executes `generate-continue-packet.mjs` and does not run implementation commands itself;
- `verify` keeps `run-validation-profile.mjs`;
- `close` keeps `audit-close-gate.mjs` and never invokes release.

Attach a top-level `coreResult` to the existing wrapper report. Preserve `project`, `route`, `execution`, and `limits`. Adapt child success/failure deterministically:

```js
const coreResult = createResultEnvelope({
  operationId,
  status: execution.ok ? (verb === 'close' ? 'complete' : 'proceed') : verb === 'verify' ? 'repair' : 'blocked',
  stage: facadeStage,
  reasonCode: execution.ok ? 'READY' : 'LEGACY_ROUTE_FAILED',
  message: execution.ok ? `${facadeStage || verb} route completed.` : `${verb} route requires attention.`,
  changeId: state?.activeChangeId ?? parsedChangeId ?? null,
  stateRevision: state?.stateRevision ?? null,
  diagnostics: childDiagnostics,
  safeToRetry: verb !== 'close' || !execution.ok,
})
```

For `release`, set `stage: null`, `reasonCode: 'POST_CLOSE_RELEASE'`, and retain current execution/authorization behavior.

- [ ] **Step 5: Verify short CLI forwarding**

Run:

```bash
node scripts/gse.mjs frame --target . --json
node scripts/gse.mjs build --target . --json
```

Expected: both return wrapper reports with valid `coreResult`. Modify `scripts/gse.mjs` only if these commands are not already forwarded by `commandFromArgs`.

- [ ] **Step 6: Update the command reference**

Add rows for `/gse frame`, `/gse specify`, and `/gse build`. State explicitly:

```markdown
The five-stage verbs are a compatibility facade. Existing detailed stages remain available through `/gse stage`, and existing commands remain supported. `/gse close` proves verifiable delivery readiness; `/gse release`, `/gse package`, and `/gse public-release` remain separately authorized post-Close flows.
```

Add the read-only helper:

```text
GSE_SKILL_ROOT=/absolute/path/to/gse
PROJECT_ROOT=/absolute/path/to/project
node "$GSE_SKILL_ROOT/scripts/inspect-gse-v1-migration.mjs" --target "$PROJECT_ROOT" --json
```

- [ ] **Step 7: Run facade and legacy command regressions**

Run:

```bash
node scripts/audit-command-execution.mjs --root . --profile lite --json
node scripts/audit-command-execution.mjs --root . --profile full --json
node scripts/audit-stage-orchestrator.mjs --root . --json
```

Expected: all exit 0; CMDX01–CMDX21 pass; detailed 1.0 `current_stage` and `next_stage` remain present.

- [ ] **Step 8: Stop for review without committing**

Compare the command map before/after and verify no legacy command disappeared. Do not commit or push.

---

### Task 8: Wire Foundation Audits into Validation and Package Distribution

**Files:**
- Modify: `scripts/run-validation-profile.mjs:59-108`
- Modify: `scripts/validate-gse.mjs:269-1400`
- Modify: `package.json:17-58`
- Modify: `.gse/project-profile.md`
- Modify: `.gse/quality-gates.md`

- [ ] **Step 1: Add a failing canonical-validation assertion**

Before wiring the files, run:

```bash
node scripts/run-validation-profile.mjs --root . --target . --profile lite --json
node scripts/validate-gse.mjs --root . --profile lite --json
```

Expected current gap: output does not list `audit-core-contracts.mjs`, `audit-core-compatibility.mjs`, or `audit-core-transactions.mjs`; this is a failed acceptance condition even if the old validation exits 0.

- [ ] **Step 2: Add the audits to every validation profile**

Insert at the start of `common` in `scripts/run-validation-profile.mjs`:

```js
['audit-core-contracts.mjs', ['--root', root, '--json']],
['audit-core-compatibility.mjs', ['--root', root, '--json']],
['audit-core-transactions.mjs', ['--root', root, '--json']],
```

In `scripts/validate-gse.mjs`, invoke the same scripts and add checks that require child exit 0 and `summary.failed === 0`. Do not pass by searching source text alone.

- [ ] **Step 3: Include schemas and focused scripts in the package**

Add `"schemas"` to `package.json.files`. Add scripts:

```json
"audit:core": "node scripts/audit-core-contracts.mjs --root . --json",
"audit:compatibility": "node scripts/audit-core-compatibility.mjs --root . --json",
"audit:transactions": "node scripts/audit-core-transactions.mjs --root . --json"
```

Do not change the package version or publish anything in this milestone.

- [ ] **Step 4: Update project-local quality commands**

Add these exact command entries to `.gse/project-profile.md` and `.gse/quality-gates.md`:

```text
node scripts/audit-core-contracts.mjs --root <skill-root> --json
node scripts/audit-core-compatibility.mjs --root <skill-root> --json
node scripts/audit-core-transactions.mjs --root <skill-root> --json
```

State that all three are required before claiming Section 20 foundation behavior. Keep release/public acceptance boundaries unchanged.

- [ ] **Step 5: Run Lite validation**

Run:

```bash
node scripts/run-validation-profile.mjs --root . --target . --profile lite --json
node scripts/validate-gse.mjs --root . --profile lite --json
```

Expected: both exit 0; every new audit appears in `results`; every child has `summary.failed: 0`.

- [ ] **Step 6: Run package-shape smoke without publishing**

Run:

```bash
npm pack --dry-run --json
```

Expected: exit 0; output file list includes all five `schemas/core/v1/*.schema.json`, the profile trigger table, Core modules, three audits, migration inspector, evidence recorder, and fixture manifest. No tarball is published.

- [ ] **Step 7: Run encoding and diff whitespace checks**

Run:

```bash
npm run check:encoding
git diff --check
```

Expected: both exit 0.

- [ ] **Step 8: Stop for review without committing**

Review package contents for secrets, fixture logs, transaction scratch directories, and generated output. None may be included. Do not commit or push.

---

### Task 9: Record Focused GSE Evidence and Run the Final Foundation Gate

**Files:**
- Modify: `.gse/evidence/2026-07-16.md`
- Modify: `.gse/evidence/index.jsonl`
- Verify: all implementation files from Tasks 1–8

This task does not create `.gse/changes/gse-core-foundation/change.json`, add revision fields to the real `.gse/state.json`, or execute a GSE self-migration. Section 21 defers GSE dogfood migration; revision-aware evidence mutation and Close success are proved in temporary fixtures in this milestone.

- [ ] **Step 1: Run the focused Core gates**

Run:

```bash
node scripts/audit-core-contracts.mjs --root . --json
node scripts/audit-core-compatibility.mjs --root . --json
node scripts/audit-core-transactions.mjs --root . --json
```

Expected: every command exits 0 and reports `summary.failed: 0`.

- [ ] **Step 2: Run compatibility regressions**

Run:

```bash
node scripts/audit-stage-orchestrator.mjs --root . --json
node scripts/audit-change-system.mjs --root . --json
node scripts/audit-change-lifecycle.mjs --root . --json
node scripts/audit-evidence-levels.mjs --root . --target . --json
node scripts/audit-command-execution.mjs --root . --profile lite --json
node scripts/test-smoke.mjs --root . --json
```

Expected: every command exits 0 and reports `summary.failed: 0`.

- [ ] **Step 3: Run the canonical Lite gate**

Run:

```bash
node scripts/validate-gse.mjs --root . --profile lite --json
npm run check:encoding
git diff --check
```

Expected: all commands exit 0; canonical validation includes the three foundation audits.

- [ ] **Step 4: Inspect migration against the real GSE repository without writes**

Capture the checksums of current human-authored sources, run inspection, then compare:

```bash
node scripts/inspect-gse-v1-migration.mjs --target . --json
```

Expected: valid Core envelope; every source digest in the report still matches after inspection; no new cache, transaction, lock, or recovery path was written by the inspector.

- [ ] **Step 5: Write concise evidence Markdown**

Append to `.gse/evidence/2026-07-16.md` a section containing:

```markdown
## GSE Core Compatibility Foundation

- Status: verified
- Evidence level: verified-component
- Contract revision: core-v1
- Scope: Core schemas/envelope, profile and lifecycle compatibility, one active Change, migration inspection, revision-aware evidence/Close, and transaction recovery.
- Focused commands: `audit-core-contracts`, `audit-core-compatibility`, `audit-core-transactions`, existing stage/change/evidence/command audits, Lite validation, encoding, and `git diff --check`.
- Result: all focused and compatibility checks passed.
- Limitations: multiple active Changes, DAGs, leases, executable host adapters, complete domain policies, GSE dogfood state migration, deployment, and publication remain outside this milestone.
- Next action: review the Section 20 implementation and authorize GSE dogfood migration or a later architecture increment separately.
```

Do not paste raw command output.

- [ ] **Step 6: Prove the evidence recorder transaction in a temporary fixture**

Run:

```bash
node scripts/record-evidence.mjs --self-test --json
```

Expected: exit 0; `EVID01`–`EVID04` pass, one committed evidence event is visible, state revision increments once, the replay retains the same revision and one event ID, environment fingerprint is derived, raw output/secret fields are absent, and the temporary fixture is removed.

- [ ] **Step 7: Append a legacy-compatible real-repository evidence index record**

Append exactly one JSONL record to `.gse/evidence/index.jsonl` after Step 1–4 pass:

```json
{"date":"2026-07-16","recordType":"core-foundation-validation","status":"verified","evidenceLevel":"verified-component","requiredEvidenceLevel":"verified-component","summary":"GSE Core compatibility foundation passed focused contracts, compatibility, transaction, and Lite validation checks.","evidenceFile":".gse/evidence/2026-07-16.md","commands":["node scripts/audit-core-contracts.mjs --root . --json","node scripts/audit-core-compatibility.mjs --root . --json","node scripts/audit-core-transactions.mjs --root . --json","node scripts/validate-gse.mjs --root . --profile lite --json","npm run check:encoding","git diff --check"],"limitations":["Revision-aware evidence was proved in temporary fixtures; the real GSE repository was inspected but not migrated.","This does not prove host-native support, deployment, publication, or owner acceptance."],"nextAction":"Review the Section 20 implementation and authorize GSE dogfood migration separately."}
```

This legacy-compatible record intentionally has no `schemaVersion`, `transactionId`, or `stateRevision`; it documents current-session validation without pretending that the real GSE repository has already adopted the new transaction state.

- [ ] **Step 8: Re-run Close consistency self-tests after evidence changes**

Run:

```bash
node scripts/audit-close-gate.mjs --self-test --json
node scripts/audit-core-compatibility.mjs --root . --json
```

Expected: both exit 0; CG13–CG17 success and blocker paths pass in temporary fixtures. Do not run `audit-close-gate.mjs --target .` as proof that the unmigrated real repository satisfies revision-aware Close.

- [ ] **Step 9: Perform the final scope audit**

Verify the diff contains none of:

```text
agents/leases.jsonl
tasks.json DAG fields
cross-Change dependency execution
host process invocation
browser/domain blocker implementation
deploy or publish execution
```

Expected: the only multi-Change behavior is a deterministic `blocked` result; release commands remain separate and unchanged in authority.

- [ ] **Step 10: Stop with a verified-but-uncommitted worktree**

Report changed files, commands run, evidence results, and remaining scope. Do not commit, push, create a PR, publish a package, deploy, or repair the missing remote unless the user explicitly authorizes that action.

---

## Final Acceptance Matrix

| Requirement | Machine-checkable proof |
|---|---|
| Core schema/result envelope v1 | `CORE01`–`CORE06` |
| Legacy `block` normalization | `CORE02` |
| Secret-safe structured persistence | `CORE05`, `CORE06`, `TX10` |
| Profile trigger table and task-level mapping | `CORE07`–`CORE10` |
| Five-stage mapping and separate release | `CORE11`, `CORE12`, `CMDX16`–`CMDX21` |
| One active derived revisioned Change | `COMP03`, `COMP04`, `CHG10`, `CHG11` |
| Read-only, byte-preserving 1.0 inspection | `COMP02`, `COMP06`, direct `DRY_RUN_ONLY` test |
| Revision-aware evidence | `COMP07`–`COMP10` |
| Deterministic Close consistency | `COMP11`–`COMP13`, `CG13`–`CG17` |
| Lock and expected revision | `TX01`–`TX03` |
| Complete manifest and commit authority | `TX04`, `TX05` |
| Idempotent transaction/event replay | `TX06`, `CHGLC09` |
| Committed JSONL prefix and truncated tail | `TX07` |
| Pre-marker rollback/post-marker roll-forward | `TX08`, `TX09` |
| Existing 1.0 behavior remains usable | existing stage/change/lifecycle/command/smoke audits all report zero failures |
| Package remains one local dependency-free install | `npm pack --dry-run --json` includes Core, schemas, policy, audits, and fixtures; no service/dependency added |
| Deferred architecture not falsely claimed | final scope audit and explicit `MULTIPLE_ACTIVE_CHANGES_UNSUPPORTED` fixture |

## Plan Self-Review

- **Section 20 coverage:** Every included bullet maps to Tasks 1–9 and the acceptance matrix.
- **Section 21 exclusion:** Multiple Changes, DAGs, leases, executable adapters, context-service integration, and full domain policies are not implemented. The only multiple-Change behavior is an explicit blocker.
- **Compatibility:** Existing Markdown, commands, detailed stages, evidence levels, and separate release flows remain readable and callable.
- **Atomicity:** The manifest records the complete write set; the commit marker is authoritative; gates recover or block before reading partial state.
- **Evidence:** New evidence is dependency/revision-aware; historical evidence is readable but cannot satisfy a new Close claim without sufficient metadata.
- **Safety:** No new dependency, service, destructive migration, deployment, publication, commit, push, PR, or remote mutation is part of this plan.
- **Naming consistency:** `stateRevision`, `activeChangeId`, `changeId`, `transactionId`, `operationId`, `eventId`, `coreResult`, and reason codes are used consistently across tasks.
