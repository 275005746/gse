#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

function hasArg(name) {
  return args.includes(name)
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const out = path.resolve(readArg('--out', path.join(root, '.gse', 'acceptance', 'release-status-manifest.json')))
const displayRoot = readArg('--display-root', '<gse-root>')
const jsonOnly = hasArg('--json')
const dryRun = hasArg('--dry-run')
const force = hasArg('--force')

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

function parseJson(result, label) {
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${result.stderr || result.stdout}`)
  }
  try {
    return JSON.parse(result.stdout)
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error.message}`)
  }
}

function audit(scriptName) {
  const result = run(process.execPath, [path.join(root, 'scripts', scriptName), '--root', root, '--json'])
  return { result, data: parseJson(result, scriptName) }
}

function compactRows(rows, status) {
  return rows
    .filter((row) => row.status === status)
    .map((row) => ({ area: row.area, status: row.status, evidence: row.evidence }))
}

function workflowStatus(data, key, fallback = 'unknown') {
  return data.workflows?.[key] ?? data.summary?.[key] ?? fallback
}

let manifest
try {
  const finalReadiness = audit('audit-final-readiness.mjs')
  const publicAcceptance = audit('audit-public-acceptance-readiness.mjs')
  const hostRuntime = audit('audit-host-runtime-invocations.mjs')
  const hostRuntimeDrill = audit('audit-host-runtime-invocation-drill.mjs')

  const matrix = finalReadiness.data.matrix ?? []
  const statusFor = (area) => matrix.find((row) => row.area === area)?.status ?? 'unknown'
  manifest = {
    schemaVersion: 1,
    name: 'gse',
    displayName: 'GSE',
    generatedAt: new Date().toISOString(),
    root: displayRoot,
    claimBoundary: {
      publicAccepted: workflowStatus(finalReadiness.data, 'publicAccepted'),
      finalReadinessMatrix: workflowStatus(finalReadiness.data, 'finalReadinessMatrix'),
      localValidationDoesNotMeanPublicAcceptance: true,
      nativeSlashCommandRequiresHostRecord: true,
      nativeSlashCommandIsOptionalAdapterClaim: true,
    },
    readiness: {
      verified: compactRows(matrix, 'verified'),
      ownerRequired: compactRows(matrix, 'owner-required'),
      externalRequired: compactRows(matrix, 'external-required'),
      notClaimed: compactRows(matrix, 'not-claimed'),
    },
    distribution: {
      localPackage: statusFor('Local install'),
      localInstall: statusFor('Local install'),
      installedValidation: statusFor('Local install'),
      localInstalledCli: statusFor('Local install'),
      remoteInstall: statusFor('URL install'),
      remoteInstalledValidation: statusFor('URL install'),
      remoteInstalledCli: statusFor('URL install'),
      integrityGate: statusFor('URL install'),
      packageSigning: statusFor('Signing'),
      signatureVerification: statusFor('Signing'),
      releaseBundle: 'verified-after-bundle-audit',
      bundleFiles: [
        'release-summary.md',
        'install-commands.md',
        'validation-checklist.md',
        'public-release-record.md',
        'public-acceptance-handoff.md',
        'host-runtime-evidence-handoff.md',
        'release-status-manifest.json',
        'release-owner-action-plan.md',
        'bundle-manifest.json',
      ],
    },
    publicAcceptance: {
      doctor: workflowStatus(publicAcceptance.data, 'publicAcceptanceDoctor'),
      publicAccepted: publicAcceptance.data.summary?.publicAccepted ?? 'unknown',
      pendingGates: publicAcceptance.data.pendingGates ?? [],
      nextCommands: publicAcceptance.data.nextCommands ?? [],
      nextPreflightCommands: publicAcceptance.data.nextPreflightCommands ?? [],
    },
    hostRuntime: {
      recordMechanics: workflowStatus(hostRuntime.data, 'hostRuntimeInvocationRecords'),
      records: hostRuntime.data.inventory?.records ?? 0,
      closeableRecords: hostRuntime.data.inventory?.closeableRecords ?? 0,
      hosts: hostRuntime.data.inventory?.hosts ?? [],
      nativeSlashCommandRecords: hostRuntime.data.inventory?.nativeSlashCommandRecords ?? 0,
      portableTextCommandRecords: hostRuntime.data.inventory?.portableTextCommandRecords ?? 0,
      fixtureDrill: workflowStatus(hostRuntimeDrill.data, 'hostRuntimeInvocationDrill'),
      fixtureNativeSlashCommandRecords: hostRuntimeDrill.data.workflows?.fixtureNativeSlashCommandRecords ?? 0,
      fixturePortableTextCommandRecords: hostRuntimeDrill.data.workflows?.fixturePortableTextCommandRecords ?? 0,
      fixtureEvidenceIsPersistent: false,
    },
    artifacts: {
      releaseBundle: '.gse/release-bundles/gse-release-bundle-v1.0.0/',
      finalAcceptancePacket: '.gse/acceptance/final-acceptance-packet.md',
      publicAcceptanceHandoff: '.gse/acceptance/public-acceptance-handoff.md',
      hostRuntimeEvidenceHandoff: '.gse/acceptance/host-runtime-evidence-handoff.md',
      releaseStatusManifest: '.gse/acceptance/release-status-manifest.json',
      releaseOwnerActionPlan: '.gse/acceptance/release-owner-action-plan.md',
    },
    verificationCommands: [
      'node scripts/validate-gse.mjs --root __GSE__ --json',
      'node scripts/audit-final-readiness.mjs --root __GSE__ --json',
      'node scripts/audit-public-acceptance-readiness.mjs --root __GSE__ --json',
      'node scripts/audit-public-acceptance-command-dry-run-drill.mjs --root __GSE__ --json',
      'node scripts/audit-host-runtime-invocations.mjs --root __GSE__ --json',
      'node scripts/audit-host-runtime-invocation-drill.mjs --root __GSE__ --json',
      'node scripts/audit-release-bundle.mjs --root __GSE__ --json',
      'node scripts/audit-release-owner-action-plan.mjs --root __GSE__ --json',
      'node scripts/audit-distribution.mjs --root __GSE__ --json',
      'node scripts/audit-remote-distribution.mjs --root __GSE__ --json',
    ],
    sourceAudits: {
      finalReadiness: 'node scripts/audit-final-readiness.mjs --root __GSE__ --json',
      publicAcceptance: 'node scripts/audit-public-acceptance-readiness.mjs --root __GSE__ --json',
      hostRuntime: 'node scripts/audit-host-runtime-invocations.mjs --root __GSE__ --json',
      hostRuntimeDrill: 'node scripts/audit-host-runtime-invocation-drill.mjs --root __GSE__ --json',
    },
    limits: [
      'This manifest is generated from local audits and evidence records.',
      'It does not prove optional native slash-command support for any host adapter.',
      'Owner-required and external-required gates remain incomplete until accepted evidence records promote them.',
    ],
  }
} catch (error) {
  console.error(JSON.stringify({ status: 'failed', root, out, error: error.message }, null, 2))
  process.exit(1)
}

if (!dryRun) {
  if (fs.existsSync(out) && !force) {
    console.error(JSON.stringify({ status: 'exists', root, out, error: 'output exists; pass --force to overwrite' }, null, 2))
    process.exit(1)
  }
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
}

const report = {
  status: dryRun ? 'ready' : 'written',
  root,
  out,
  dryRun,
  summary: {
    publicAccepted: manifest.claimBoundary.publicAccepted,
    verifiedRows: manifest.readiness.verified.length,
    ownerRequiredRows: manifest.readiness.ownerRequired.length,
    externalRequiredRows: manifest.readiness.externalRequired.length,
    pendingGates: manifest.publicAcceptance.pendingGates.length,
    nativeSlashCommandRecords: manifest.hostRuntime.nativeSlashCommandRecords,
    portableTextCommandRecords: manifest.hostRuntime.portableTextCommandRecords,
    hostRuntimeInvocationDrill: manifest.hostRuntime.fixtureDrill,
    bundleFiles: manifest.distribution.bundleFiles.length,
  },
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(JSON.stringify(manifest, null, 2))
