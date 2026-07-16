# Execution Quality Pack

Use this when a change needs explicit execution skills, tool routing, quality gates, and review boundaries.

## Task Profile

- Level: lite | standard | enterprise
- Change type:
- User-visible impact:
- Data/security/release impact:

## Required Skills Or Roles

| Role / Skill | Purpose | Required | Evidence |
|---|---|---|---|
| Coordinator | Scope, final judgment, integration | yes | plan/state/evidence |
| Code Locator | Files, symbols, existing tests | when code changes | search/LSP notes |
| Builder | Bounded implementation | when files change | diff + focused check |
| QA / Verification | Focused proof | yes | command/browser/API smoke |
| Reviewer | Spec, quality, architecture, security | risk-based | review notes |

## Tool Routing

| Tool | Use When | Status | Fallback |
|---|---|---|---|
| rg / rg --files | Code and doc location | recommended | shell listing |
| LSP / index | Large or typed codebase | unknown | rg + existing tests |
| Browser / Playwright | UI or user-visible flow | unknown | component/API smoke plus notes |
| Change pack | Capability/API/state contract change | recommended | .gse/changes/ markdown |
| Lifecycle state | Full lifecycle change | recommended | GSE phase/status files |
| Role plan | Complex staged execution/review | recommended | GSE roles + quality gates |
| Subagents | Parallel bounded work | unknown | sequential role execution |

## Quality Gates Selected

```text
Universal:
Code:
UI:
API/state:
Security/privacy:
Performance/cost:
Resilience/recovery:
Release/operations:
```

## Evidence Plan

```text
Focused command:
Browser/API smoke:
Manual inspection:
Not run and why:
Evidence status: result | verified | accepted | not ready
```

## Review And Closure

- Spec compliance:
- Code quality:
- Architecture/ownership:
- Residual risk:
- Close gate command:
- Next action:

