#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const targetArg = readArg('--target')
const jsonOnly = args.includes('--json')

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '') : ''
}

function exists(target, relativePath) {
  return fs.existsSync(path.join(target, relativePath))
}

function check(id, label, ok, evidence, severity = 'hard', recommendation = '') {
  return {
    id,
    label,
    status: ok ? 'passed' : severity === 'soft' ? 'warning' : 'failed',
    severity,
    evidence,
    recommendation,
  }
}

function includesAll(text, phrases) {
  const normalized = text.toLowerCase()
  return phrases.every((phrase) => normalized.includes(phrase.toLowerCase()))
}

export function auditToolFallbackPolicy(target) {
  const resolvedTarget = path.resolve(target)
  const toolAdapters = readText(path.join(root, 'references', 'tool-adapters.md'))
  const router = readText(path.join(root, 'references', 'router.md'))
  const modelRouting = readText(path.join(root, 'references', 'model-routing.md'))
  const hostAdapters = readText(path.join(root, 'references', 'host-adapters.md'))
  const compatibility = readText(path.join(root, 'references', 'compatibility.md'))
  const designBasis = readText(path.join(root, 'references', 'design-basis.md'))
  const projectProfile = readText(path.join(root, 'references', 'project-profile.md'))
  const initProject = readText(path.join(root, 'scripts', 'init-project.mjs'))
  const updateProjectState = readText(path.join(root, 'scripts', 'update-project-state.mjs'))
  const generateCommandAdapter = readText(path.join(root, 'scripts', 'generate-command-adapter.mjs'))
  const generateContinuePacket = readText(path.join(root, 'scripts', 'generate-continue-packet.mjs'))

  const checks = [
    check(
      'TFP01',
      'tool adapters keep optional tools non-blocking and portable',
      includesAll(toolAdapters, [
        'few hard requirements',
        'tools enhance the workflow when available',
        'use markdown fallback when optional tools are unavailable',
      ]),
      'references/tool-adapters.md',
      'hard',
      'Keep markdown fallback available when a tool is missing.',
    ),
    check(
      'TFP02',
      'router keeps optional tools on the markdown fallback path',
      includesAll(router, [
        'use markdown fallback when optional tools are unavailable',
        'do not treat optional tools as hard prerequisites',
      ]),
      'references/router.md',
      'hard',
      'Route around missing tools instead of blocking the slice.',
    ),
    check(
      'TFP03',
      'model routing preserves a portable fallback path',
      includesAll(modelRouting, [
        'preserve a portable fallback path',
        'fallback policy',
      ]),
      'references/model-routing.md',
      'hard',
      'Keep provider and tool fallback policy in project profile docs.',
    ),
    check(
      'TFP04',
      'host adapters keep .gse as the source of truth and unknown capability claims explicit',
      includesAll(hostAdapters, [
        '.gse/` is the portable source of truth',
        'host-specific folders are adapters',
        'document it as `unknown`',
      ]),
      'references/host-adapters.md',
      'hard',
      'Keep host/tool capability claims evidence-gated in the portable layer.',
    ),
    check(
      'TFP05',
      'project profile records fallback policy and model/tool ids',
      includesAll(projectProfile, [
        'model routing',
        'fallback policy',
        'model/tool ids',
      ]),
      'references/project-profile.md',
      'hard',
      'Keep the project-approved fallback path visible in profile docs.',
    ),
    check(
      'TFP06',
      'generated command adapters keep unsupported host claims unknown until evidence exists',
      includesAll(generateCommandAdapter, [
        'unknown until',
        'current host records evidence',
        'skill/text-command pointer',
      ]),
      'scripts/generate-command-adapter.mjs',
      'hard',
      'Do not let generated adapters become runtime proof.',
    ),
    check(
      'TFP07',
      'project bootstrap and state update keep commands and host tools unknown until verified',
      includesAll(initProject, ['project commands and host tools are unknown until verified in this repository']) &&
        includesAll(updateProjectState, ['project-specific tool statuses remain unknown until verified']),
      'scripts/init-project.mjs and scripts/update-project-state.mjs',
      'hard',
      'Leave capability status unknown until the project records it.',
    ),
    check(
      'TFP08',
      'continue packet surfaces fallback policy as a compact preflight concern',
      includesAll(generateContinuePacket, [
        'toolfallbackpolicy',
        'host capabilities',
        'optional tools',
      ]),
      'scripts/generate-continue-packet.mjs',
      'soft',
      'Expose the fallback policy in /gse continue so future sessions can see the boundary.',
    ),
  ]

  const passed = checks.filter((item) => item.status === 'passed').length
  const failed = checks.length - passed

  return {
    target: resolvedTarget,
    generatedAt: new Date().toISOString(),
    summary: {
      status: failed === 0 ? 'passed' : 'failed',
      passed,
      failed,
      total: checks.length,
    },
    workflows: {
      optionalToolFallbackPolicy: failed === 0 ? 'verified' : 'failed',
    },
    checks,
    limits: [
      'This audit verifies portable fallback policy and claim boundaries.',
      'It does not prove actual browser, MCP, LSP, subagent, or CI availability.',
    ],
  }
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isCli) {
  const report = auditToolFallbackPolicy(targetArg ?? root)
  if (jsonOnly) console.log(JSON.stringify(report, null, 2))
  else console.log(JSON.stringify(report, null, 2))
  if (report.summary.status === 'failed') process.exit(1)
}
