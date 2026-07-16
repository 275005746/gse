#!/usr/bin/env node
import { auditDocumentHygiene } from './document-hygiene.mjs'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const target = readArg('--target', readArg('--root', process.cwd()))
const jsonOnly = args.includes('--json')
const report = auditDocumentHygiene(target)

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else {
  console.log('# GSE Document Hygiene')
  console.log('')
  console.log('Target: ' + report.target)
  console.log('Status: ' + report.summary.status)
  console.log('Issues: ' + report.summary.issues)
  for (const item of report.issues) console.log(`- [${item.severity}] ${item.file}: ${item.problem}`)
}

if (report.summary.status === 'failed') process.exit(1)
