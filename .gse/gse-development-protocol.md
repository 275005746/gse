# GSE Development Protocol

This file governs changes to the GSE skill itself.

## Purpose

GSE development must be proactive. When improving this skill, do not wait for users to discover missing workflow requirements through manual testing.

## Required Loop For GSE Changes

1. Read `SKILL.md`, `.gse/goal-map.md`, and `.gse/current-slice.md`.
2. Classify the change as wording, reference, template, script, scaffold, adapter, validation, or release.
3. Decide the lightest task level that proves the claim: Lite, Standard, or Enterprise.
4. Separate verified facts, design judgments, assumptions, and open questions.
5. Prefer scripts/templates over prose when the behavior should be repeatable.
6. Validate the changed behavior with focused checks.
7. Update local state or evidence artifacts when the change affects them.
8. Keep public-facing docs focused on GSE capabilities, limits, and verification.

## Design Bar

A GSE change should improve at least one of these:

- New-agent startup success.
- Long-project continuity.
- Requirement completeness before implementation.
- Evidence quality.
- Tool efficiency without hard prerequisites.
- Cross-agent portability.
- Failure prevention or recovery.
- Learning reuse.

## Anti-Patterns

- Adding process because it sounds professional but does not prevent a real failure.
- Copying a tool-specific folder layout as the portable source of truth.
- Treating optional tools as required.
- Claiming a capability without verification evidence.
- Letting GSE become only documentation with no scripts, templates, or validation.
