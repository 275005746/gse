#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { TextDecoder } from 'node:util'
import { spawnSync } from 'node:child_process'

const root = path.resolve(process.cwd())
const decoder = new TextDecoder('utf-8', { fatal: true })
const textExtensions = new Set([
  '.md',
  '.json',
  '.jsonl',
  '.mjs',
  '.js',
  '.ts',
  '.tsx',
  '.yml',
  '.yaml',
  '.txt',
  '.svg',
  '.html',
  '.css',
  '.xml',
])

function gitFiles() {
  const result = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', windowsHide: true })
  if ((result.status ?? 1) !== 0) {
    throw new Error((result.stderr || result.stdout || 'git ls-files failed').trim())
  }
  return (result.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function isTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return textExtensions.has(ext) || filePath === 'package.json' || filePath === 'README' || filePath.endsWith('.md')
}

const files = gitFiles().filter(isTextFile)
const issues = []

for (const file of files) {
  const fullPath = path.join(root, file)
  const buffer = fs.readFileSync(fullPath)
  try {
    decoder.decode(buffer)
  } catch (error) {
    issues.push({ file, issue: 'invalid-utf8', detail: error.message })
    continue
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    issues.push({ file, issue: 'bom', detail: 'UTF-8 BOM present' })
  }
}

const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: {
    status: issues.length === 0 ? 'passed' : 'failed',
    passed: files.length - issues.length,
    failed: issues.length,
    total: files.length,
  },
  issues,
}

console.log(JSON.stringify(report, null, 2))
if (issues.length > 0) process.exit(1)
