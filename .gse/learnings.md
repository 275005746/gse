# Learnings

## 2026-07-08 - utf8-safe-doc-reading

- Trigger: repeated Chinese documentation and mojibake corrections across GSE target projects
- Summary: Use UTF-8 safe readers before judging Chinese document mojibake
- Occurrences: 3
- Source: AION/MuseFlow/GSE project drills
- Impact: prevents false corruption fixes and accidental encoding churn
- Promotion: third occurrence: project guard, project rule, or quality gate
- Status: learning-note

## 2026-07-08 - windows-shell-syntax

- Trigger: repeated PowerShell command syntax failures on Windows
- Summary: Avoid PowerShell && and use host-appropriate shell syntax on Windows
- Occurrences: 5
- Source: GSE/AION/MuseFlow focused validation runs
- Impact: prevents noisy command failures and misleading verification status
- Promotion: fifth occurrence: script, test, or dedicated skill
- Status: learning-note

## 2026-07-08 - honest-host-tool-claims

- Trigger: repeated subagent/native slash command capability boundary checks
- Summary: Do not claim real subagent dispatch or native host invocation without host evidence
- Occurrences: 3
- Source: GSE final-form host adapter and role fallback work
- Impact: prevents fake delegation, fake native slash-command support, and overclaimed host capability
- Promotion: third occurrence: project guard, project rule, or quality gate
- Status: learning-note
