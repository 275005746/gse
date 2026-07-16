# Spec Workflow

Use specs to prevent agents from implementing vague intent.

## Discovery Before Promotion

When the user starts with a natural-language goal rather than accepted requirements, use `/gse discover` before opening a formal change:

```text
node <gse-skill>/scripts/run-gse-command.mjs --target <project-root> --command "/gse discover <intent>" --execute --json
node <gse-skill>/scripts/run-gse-command.mjs --target <project-root> --command "/gse discover --session <session-id> --select <path-id> --promote" --json
node <gse-skill>/scripts/run-gse-command.mjs --target <project-root> --command "/gse discover --session <session-id> --select <path-id> --promote" --execute --json
```

The first command interprets the goal and constraints, surfaces unknowns, and compares three paths by cost, benefit, and risk. The second previews exact Goal/Spec artifacts for the selected path. Only the third writes `.gse/changes/<change-id>/` and updates `.gse/goal-map.md`.

Keep these states distinct:

```text
discovery output -> selected path -> promotion preview -> promoted Goal/Spec
```

Discovery output is planning guidance. Promotion records an explicit user choice; it does not prove implementation, product value, market validity, or user acceptance.

## Markdown Fallback

Create `.gse/changes/<change-id>/` with:

```text
brief.md       # why and user outcome
spec.md        # behavior and acceptance
design.md      # approach, state, risk, privacy
tasks.md       # verifiable slices
evidence.md    # proof and verification
review.md      # review findings and closure
execution-quality-pack.md # skills, tool routing, quality gates, evidence, closure
```

Portable helper:

```text
node <gse-skill>/scripts/init-change.mjs --target <project-root> --change-id <change-id> --level lite|standard|enterprise
```

Close and archive helper:

```text
node <gse-skill>/scripts/close-change.mjs --target <project-root> --change-id <change-id> --status result|verified|accepted
```

Closing a change moves `.gse/changes/<change-id>/` to `.gse/archive/<date>-<change-id>/` and appends a `change-archive` record to `.gse/evidence/index.jsonl`.

## Optional External Workflow Adapters

Use external workflow tools only when the current project already has them and they materially reduce risk. GSE change packs remain the portable default.

## Spec Quality Checklist

- User outcome is explicit.
- Non-goals are explicit.
- Acceptance is testable.
- Error and recovery behavior is covered for risky paths.
- Privacy and permission boundaries are stated when relevant.
- Evidence type is known before implementation.
- Execution skills, tool routing, selected quality gates, and review closure are explicit for Standard and Enterprise work.
