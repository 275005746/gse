import fs from 'node:fs'
import path from 'node:path'

function slash(value) {
  return value.replace(/\\/g, '/')
}

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '') : ''
}

function exists(target, relativePath) {
  return fs.existsSync(path.join(target, relativePath))
}

function listFiles(dir) {
  const files = []
  function visit(itemPath) {
    if (!fs.existsSync(itemPath)) return
    const stat = fs.statSync(itemPath)
    if (stat.isDirectory()) {
      const name = path.basename(itemPath)
      if (['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.turbo'].includes(name)) return
      for (const child of fs.readdirSync(itemPath)) visit(path.join(itemPath, child))
      return
    }
    if (stat.isFile()) files.push(itemPath)
  }
  visit(dir)
  return files
}

function addCandidate(candidates, relativePath, reason = 'discovered') {
  const normalized = slash(String(relativePath || '').trim()).replace(/^\.\//, '')
  if (!normalized || !/\.md$/i.test(normalized)) return
  if (normalized === '.gse/goal-map.md') return
  if (!candidates.some((item) => item.relativePath === normalized)) {
    candidates.push({ relativePath: normalized, reason })
  }
}

const strongPattern = /(?:architecture|productization|roadmap|product[-_ ]?plan|prd|vision|goal[-_ ]?map|goals?|strategy|north[-_ ]?star|目标|路线|路标|架构|产品|规划|计划|愿景|蓝图)/i
const weakPattern = /(?:readme|overview|context|spec|design|adr|需求|说明)/i

function scoreCandidate(relativePath, text) {
  const base = path.basename(relativePath).toLowerCase()
  const normalized = relativePath.toLowerCase()
  let score = 0
  if (normalized.startsWith('docs/')) score += 3
  if (!normalized.includes('/')) score += 1
  if (strongPattern.test(relativePath)) score += 6
  if (weakPattern.test(relativePath)) score += 2
  if (normalized.startsWith('.gse/')) score -= 2
  if (/release-bundles|fixtures|tmp|cache|generated|archive/.test(normalized)) score -= 8
  if (/^(roadmap|prd|vision|architecture|product|product-plan|goal-map|goals?)\.md$/i.test(base)) score += 5
  if (/^#\s+.*(?:roadmap|prd|vision|architecture|goal|目标|路线|架构|产品|规划|愿景)/im.test(text)) score += 4
  if (/canonical product goal source|north star|product outcome|用户目标|产品目标/i.test(text)) score += 3
  return score
}

export function findCanonicalGoalSources(target, state = null) {
  const candidates = []
  if (state?.canonicalGoalSource) addCandidate(candidates, state.canonicalGoalSource, 'state.canonicalGoalSource')
  if (state?.canonicalPlan) addCandidate(candidates, state.canonicalPlan, 'state.canonicalPlan')

  const texts = [
    readText(path.join(target, '.gse', 'README.md')),
    readText(path.join(target, '.gse', 'project-profile.md')),
    readText(path.join(target, '.gse', 'goal-map.md')),
    readText(path.join(target, '.gse', 'state.json')),
  ].join('\n')

  const explicitRegex = /(?:Canonical (?:product )?(?:goal source|plan)|canonicalGoalSource|canonicalPlan|Source):\s*`?([^`"\n]+\.md)`?/gi
  for (const match of texts.matchAll(explicitRegex)) addCandidate(candidates, match[1], 'explicit')

  const referencedRegex = /(?:docs|doc|design|specs?)\/[A-Za-z0-9._/-]*?(?:architecture|productization|roadmap|product[-_]?plan|prd|vision|goal[-_]?map|goals?|strategy)[A-Za-z0-9._/-]*?\.md/gi
  for (const match of texts.matchAll(referencedRegex)) addCandidate(candidates, match[0], 'referenced')

  const discovered = []
  const scanned = new Set()
  for (const scanRoot of ['docs', 'doc', 'design', 'specs']) {
    const fullRoot = path.join(target, scanRoot)
    if (!fs.existsSync(fullRoot)) continue
    for (const filePath of listFiles(fullRoot)) {
      const relativePath = slash(path.relative(target, filePath))
      if (scanned.has(relativePath) || !/\.md$/i.test(relativePath)) continue
      scanned.add(relativePath)
      if (relativePath.startsWith('.git/') || relativePath.startsWith('node_modules/')) continue
      if (relativePath.startsWith('.gse/')) continue
      const text = readText(filePath).slice(0, 12000)
      const score = scoreCandidate(relativePath, text)
      if (score >= 6) discovered.push({ relativePath, reason: 'scanned', score })
    }
  }
  if (fs.existsSync(target)) {
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      if (!entry.isFile() || !/\.md$/i.test(entry.name)) continue
      const relativePath = entry.name
      if (scanned.has(relativePath)) continue
      scanned.add(relativePath)
      const text = readText(path.join(target, relativePath)).slice(0, 12000)
      const score = scoreCandidate(relativePath, text)
      if (score >= 6) discovered.push({ relativePath, reason: 'scanned', score })
    }
  }

  discovered
    .sort((a, b) => b.score - a.score || a.relativePath.localeCompare(b.relativePath))
    .slice(0, 5)
    .forEach((item) => addCandidate(candidates, item.relativePath, item.reason))

  return candidates.map((item) => ({ ...item, exists: exists(target, item.relativePath) }))
}

export function findCanonicalGoalSource(target, state = null) {
  const sources = findCanonicalGoalSources(target, state)
  return sources.find((item) => item.exists)?.relativePath || sources[0]?.relativePath || ''
}

export function hasGoalMapProjectionBoundary(goalMapText, canonicalSources) {
  const existingSources = canonicalSources.filter((item) => item.exists)
  if (existingSources.length === 0) return true
  const lower = String(goalMapText || '').toLowerCase()
  const declaresProjection = lower.includes('gse execution projection') || lower.includes('execution projection')
  const referencesCanonicalSource = existingSources.some((item) => goalMapText.includes(item.relativePath))
  const conflictBoundary = lower.includes('canonical product goal source wins') || lower.includes('conflicts are resolved in favor of the canonical')
  const triageBoundary =
    lower.includes('canonical product goal source') &&
    lower.includes('state.json') &&
    lower.includes('evidence') &&
    lower.includes('learnings')
  return declaresProjection && referencesCanonicalSource && conflictBoundary && triageBoundary
}
