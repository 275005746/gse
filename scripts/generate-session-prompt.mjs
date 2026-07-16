#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { findCanonicalGoalSource } from './canonical-goal-source.mjs'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const jsonOnly = args.includes('--json')
const selfTest = args.includes('--self-test') || !args.includes('--target')
const targetArg = readArg('--target')

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '') : ''
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return { exists: false, ok: false, data: null, error: 'missing' }
  try {
    return { exists: true, ok: true, data: JSON.parse(readText(filePath)), error: '' }
  } catch (error) {
    return { exists: true, ok: false, data: null, error: error.message }
  }
}

function exists(target, relativePath) {
  return fs.existsSync(path.join(target, relativePath))
}

function firstMatch(text, regex) {
  const match = text.match(regex)
  return match ? match[1].trim() : ''
}

function cleanInlineValue(value) {
  return String(value || '').trim().replace(/[.。:：]+$/, '').trim()
}

function findCanonicalPlan(target, state) {
  return findCanonicalGoalSource(target, state)
}

function createFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-session-prompt-'))
  fs.mkdirSync(path.join(dir, '.gse', 'evidence'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Rules\n\nUse concise evidence.\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'README.md'), '# GSE\n\nCanonical plan: `docs/productization-architecture.md`.\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'project-profile.md'), '# Project Profile\n\n- Product/system name: Fixture Product\n- Focused test: npm test\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'goal-map.md'), '# Goal Map\n\nCanonical product goal source: `docs/productization-architecture.md`.\n\nThis file is a GSE execution projection. Canonical product goal source wins if this projection conflicts with product roadmap, architecture, PRD, or vision docs.\n\n## Current Focus\n\n- Priority: P0\n- Active slice: Make fixture continue.\n- Next action: Run focused fixture smoke.\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'quality-gates.md'), '# Quality Gates\n\n## Universal\n\n- Evidence required.\n', 'utf8')
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'docs', 'productization-architecture.md'), '# Canonical Plan\n\n## Next action\n\nRun fixture.\n', 'utf8')
  fs.writeFileSync(
    path.join(dir, '.gse', 'state.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        projectName: 'fixture-product',
        mode: 'standard',
        canonicalGoalSource: 'docs/productization-architecture.md',
        canonicalPlan: 'docs/productization-architecture.md',
        phase: 'execute',
        currentSlice: {
          id: 'fixture-001',
          outcome: 'Make fixture continue.',
          status: 'planned',
          nextAction: 'Run focused fixture smoke.',
        },
        toolStatuses: {
          browser: 'unknown',
          lsp: 'unknown',
          mcp: 'unknown',
          subagents: 'unknown',
          ci: 'unknown',
        },
        lastEvidence: '.gse/evidence/index.jsonl',
        residualRisks: ['Fixture risk.'],
      },
      null,
      2,
    ) + '\n',
    'utf8',
  )
  fs.writeFileSync(
    path.join(dir, '.gse', 'evidence', 'index.jsonl'),
    JSON.stringify({
      date: '2026-07-06',
      recordType: 'slice',
      status: 'result',
      summary: 'Fixture initialized.',
      evidenceFile: '.gse/evidence/2026-07-06.md',
      commands: ['fixture'],
      nextAction: 'Run focused fixture smoke.',
    }) + '\n',
    'utf8',
  )
  return dir
}

function generatePrompt(target) {
  const resolvedTarget = path.resolve(target)
  const stateResult = readJson(path.join(resolvedTarget, '.gse', 'state.json'))
  const state = stateResult.ok ? stateResult.data : null
  const goalMap = readText(path.join(resolvedTarget, '.gse', 'goal-map.md'))
  const profile = readText(path.join(resolvedTarget, '.gse', 'project-profile.md'))
  const canonicalPlan = findCanonicalPlan(resolvedTarget, state)
  const warnings = []
  if (!exists(resolvedTarget, '.gse')) warnings.push('missing .gse directory')
  if (!stateResult.exists) warnings.push('missing .gse/state.json')
  else if (!stateResult.ok) warnings.push('invalid .gse/state.json: ' + stateResult.error)
  if (!exists(resolvedTarget, '.gse/evidence/index.jsonl')) warnings.push('missing .gse/evidence/index.jsonl')
  if (!exists(resolvedTarget, '.gse/project-profile.md')) warnings.push('missing .gse/project-profile.md')
  if (!exists(resolvedTarget, '.gse/goal-map.md')) warnings.push('missing .gse/goal-map.md')
  if (canonicalPlan && !exists(resolvedTarget, canonicalPlan)) warnings.push('canonical product goal source missing: ' + canonicalPlan)

  const projectName = cleanInlineValue(
    state?.projectName ||
    firstMatch(profile, /Product\/system name:\s*([^\n]+)/i) ||
    path.basename(resolvedTarget),
  )
  const activeSlice =
    state?.currentSlice?.outcome ||
    firstMatch(goalMap, /Active slice:\s*([^\n]+)/i) ||
    'Read the goal map and choose the next verifiable slice.'
  const nextAction =
    state?.currentSlice?.nextAction ||
    firstMatch(goalMap, /Next action:\s*([^\n]+)/i) ||
    'Continue with the smallest verifiable GSE slice.'
  const phase = state?.phase || 'unknown'
  const status = state?.currentSlice?.status || 'unknown'
  const residualRisks = Array.isArray(state?.residualRisks) ? state.residualRisks.slice(0, 3) : []

  const lines = [
    `Use GSE to continue ${projectName}.`,
    '',
    `Project root: ${resolvedTarget}`,
    'Read in order: project rules, .gse/README.md, .gse/state.json, .gse/project-profile.md' + (canonicalPlan ? `, ${canonicalPlan}` : '') + ', .gse/goal-map.md as the GSE execution projection, .gse/quality-gates.md.',
    `Canonical product goal source: ${canonicalPlan || 'not discovered'}.`,
    'Conflict rule: canonical product goal source wins; correct .gse/goal-map.md if its projection drifts.',
    `Current phase/status: ${phase} / ${status}.`,
    `Current slice: ${activeSlice}`,
    `Next action: ${nextAction}`,
  ]
  if (residualRisks.length) lines.push(`Known risks: ${residualRisks.join('; ')}`)
  if (warnings.length) lines.push(`GSE doctor warnings to handle first: ${warnings.join('; ')}`)
  lines.push('Execute one verifiable slice, record evidence, update state/index/docs, and do not claim completion without the close gate.')

  return {
    target: resolvedTarget,
    generatedAt: new Date().toISOString(),
    summary: {
      status: warnings.length ? 'warning' : 'passed',
      warnings: warnings.length,
      promptLines: lines.length,
    },
    state: {
      exists: stateResult.exists,
      valid: stateResult.ok,
      phase,
      currentSliceStatus: status,
    },
    canonicalPlan,
    canonicalGoalSource: canonicalPlan,
    goalMapRole: 'gse-execution-projection',
    warnings,
    prompt: lines.join('\n'),
  }
}

const target = selfTest ? createFixture() : targetArg
const report = generatePrompt(target)

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(report.prompt + '\n')
