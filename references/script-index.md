# GSE Script Index

Use this as the detailed script router after `SKILL.md` and `references/commands.md` identify the workflow.

## Daily Project Operation

- Short CLI wrapper: `node <skill>/scripts/gse.mjs status --target <project-root> --json`
- Context health: `node <skill>/scripts/audit-context-health.mjs --target <project-root> --json`
- Bounded checkpoint: `node <skill>/scripts/generate-context-checkpoint.mjs --target <project-root> --json|--execute`
- Short continuation packet: `node <skill>/scripts/generate-continue-packet.mjs --target <project-root> --brief|--profile default|--doctor`
- Current-stage advice: `node <skill>/scripts/detect-project-stage.mjs --target <project-root> --intent "<request>" --json`
- Goal discovery packet: `node <skill>/scripts/generate-goal-discovery-packet.mjs --target <project-root> --intent "<goal>" --json`
- Selected-path Goal/Spec promotion: `node <skill>/scripts/promote-goal-discovery.mjs --target <project-root> --session <session-id> --select <path-id> --promote --json`
- Portable command runner: `node <skill>/scripts/run-gse-command.mjs --target <project-root> --command "/gse continue"`
- State/evidence repair doctor: `node <skill>/scripts/run-gse-command.mjs --target <project-root> --command "/gse repair" --json`
- Direct repair audit: `node <skill>/scripts/audit-state-repair.mjs --target <project-root> --json`
- Document hygiene audit: `node <skill>/scripts/audit-document-hygiene.mjs --target <project-root> --json`
- Canonical goal source compaction dry-run: `node <skill>/scripts/compact-canonical-goal-source.mjs --target <project-root> --dry-run --json`
- Validation profile runner: `node <skill>/scripts/run-validation-profile.mjs --target <project-root> --profile lite|standard|enterprise|release`
- Close readiness check: `node <skill>/scripts/audit-close-gate.mjs --target <project-root>`
- Project guard preflight: `node <skill>/scripts/audit-project-guards.mjs --target <project-root> --json`
- Existing project state/index update: `node <skill>/scripts/update-project-state.mjs --target <project-root>`
- Change spec pack: `node <skill>/scripts/init-change.mjs --target <project-root> --change-id <id> --level lite|standard|enterprise`

## GSE Skill Development

- Repository agent entrypoint audit: `node <skill>/scripts/audit-agent-entrypoint.mjs --root <skill> --json`
- Project capability registry audit: `node <skill>/scripts/audit-project-capability-registry.mjs --root <skill> --target <project-root> --json`
- Consolidated validator with profile routing: `node <skill>/scripts/validate-gse.mjs --root <skill> --profile lite|standard|enterprise|release|full --json`
- Command execution audit: `node <skill>/scripts/audit-command-execution.mjs --root <skill> --profile lite|full`
- Goal discovery and promotion audit: `node <skill>/scripts/audit-goal-discovery.mjs --root <skill> --json`
- Capability execution matrix audit: `node <skill>/scripts/audit-capability-execution-matrix.mjs --root <skill> --json`
- Target hardening drills: `node <skill>/scripts/audit-target-hardening-drills.mjs --root <skill> --aion-target <project-root> --museflow-target <project-root> --json`
- Maintenance cadence audit: `node <skill>/scripts/audit-maintenance-cadence.mjs --root <skill> --json`
- Maintenance snapshot: `node <skill>/scripts/generate-maintenance-snapshot.mjs --root <skill> --target <project-root> --installed-root <installed-skill-dir> --execute --json`
- Installed package smoke: `node <skill>/scripts/generate-maintenance-snapshot.mjs --root <installed-skill-dir> --target <installed-skill-dir> --package-smoke --skip-release-bundle --json`
- Installed sync audit: `node <skill>/scripts/audit-installed-sync.mjs --root <skill> --installed-root <installed-skill-dir> --json`
- Session sync record audit: `node <skill>/scripts/audit-session-sync.mjs --root <skill> --json`

## Evidence And Release

- Conservative evidence-level backfill: `node <skill>/scripts/backfill-evidence-levels.mjs --root <project-root> --json`
- Historical evidence review queue: `node <skill>/scripts/audit-evidence-review-queue.mjs --root <skill> --target <project-root> --json`
- UI/browser evidence policy audit: `node <skill>/scripts/audit-ui-browser-evidence-policy.mjs --root <skill> --target <project-root> --json`
- GSE owner/external action list: `node <skill>/scripts/run-gse-command.mjs --target <skill> --command "/gse owner-actions" --json --compact`
- Owner/external live evidence probe: `node <skill>/scripts/run-gse-command.mjs --target <skill> --command "/gse probe --public-repo-url <url>" --json`
- Release bundle dry-run/write route: `node <skill>/scripts/run-gse-command.mjs --target <skill> --command "/gse release" --json`
- Package dry-run/write route: `node <skill>/scripts/run-gse-command.mjs --target <skill> --command "/gse package" --json`
- Install dry-run/write route: `node <skill>/scripts/run-gse-command.mjs --target <skill> --command "/gse install --source <package-dir> --install-target <install-skill-dir>" --json`
- Public release checklist route: `node <skill>/scripts/run-gse-command.mjs --target <skill> --command "/gse public-release" --json`
- Learning capture route: `node <skill>/scripts/run-gse-command.mjs --target <project-root> --command "/gse learn --summary <lesson>" --execute --json`
- Learning drift audit: `node <skill>/scripts/audit-learning-drift.mjs --root <skill> --target <project-root> --json`
- Public release record: `node <skill>/scripts/record-public-release.mjs --root <project-root> --license-status owner-required`
- Release bundle: `node <skill>/scripts/generate-release-bundle.mjs --root <skill> --label <release-label> --out <bundle-dir>`
- Owner/external gate kit: `node <skill>/scripts/generate-owner-external-gate-kit.mjs --root <skill-or-project>`
