# GSE Maintenance Cadence

GSE final form requires recurring checks, not only one-time release proof. This cadence keeps gap-audit coverage, drift detection, security review, forward testing, and target-project drills visible while host-native slash-command evidence remains an external gate.

## Cadence Table

| Area | Trigger | Minimum Cadence | Evidence | Command |
|---|---|---|---|---|
| Gap audit | Non-trivial GSE capability change | Monthly or before release | `.gse/gap-audits/` entry or roadmap update | `node scripts/audit-final-form-roadmap.mjs --root . --json` |
| Drift audit | Project guard, learning, adapter, command, or state model changes | Weekly or before close | Learning drift and state freshness output | `node scripts/audit-learning-drift.mjs --root . --target . --json` |
| Dependency and security review | Release, install, package, registry, CI, or external input changes | Monthly or before release | Release trust, CI readiness, and public acceptance outputs | `node scripts/audit-release-trust.mjs --root . --json` |
| Forward test | Non-trivial routing, command, scaffold, validation, or package change | Before release and after major workflow changes | Fixture or fresh-session forward-test evidence | `node scripts/forward-test-gse.mjs --root . --json` |
| Target-project hardening drill | GSE adoption, continue, close, host capability, or learning behavior changes | Weekly or before public release | Read-only target drill output | `node scripts/audit-target-hardening-drills.mjs --root . --json` |
| Public acceptance doctor | Public release, registry, marketplace, host, or owner evidence changes | Before release or public claim | Pending owner/external gate report | `node scripts/audit-public-acceptance-readiness.mjs --root . --json` |
| Command runner smoke | `/gse` command routing, portable command wrapper, or short-entry behavior changes | Every command-router change | Portable runner output from `scripts/run-gse-command.mjs` | `node scripts/run-gse-command.mjs --root . --target . --command "/gse maintenance" --json --compact` |
| Installed skill sync | Any capability upgrade shipped from source to installed skill | Every capability upgrade | Installed-copy hash comparison and command smoke from `scripts/audit-installed-sync.mjs` | `node scripts/audit-installed-sync.mjs --root . --installed-root <installed-skill-dir> --json` |
| Active session sync | Any capability upgrade that should reach active GSE-using sessions | Every capability upgrade when active sessions exist | Honest sent, archived, unavailable, failed, or skipped records from `scripts/record-session-sync.mjs` plus `scripts/audit-session-sync.mjs` | `node scripts/audit-session-sync.mjs --root . --require-installed --require-thread <thread-id> --json` |

## Maintenance Snapshot

Use a snapshot when the goal is to prove that the recurring checks actually ran, not only that the cadence is documented.

```powershell
node scripts/generate-maintenance-snapshot.mjs --root . --target . --installed-root <installed-skill-dir> --execute --json
```

The canonical output is `.gse/maintenance/latest-maintenance-snapshot.json` plus a Markdown sibling. Without `--installed-root`, the installed-sync row is package-only and must not be used as installed-copy freshness proof.

For an installed package smoke, use package mode so source-worktree-only roadmap and release-bundle freshness checks do not become false blockers:

```powershell
node scripts/generate-maintenance-snapshot.mjs --root <installed-skill-dir> --target <installed-skill-dir> --package-smoke --skip-release-bundle --json
```

Package smoke proves the installed copy can run the maintenance command set. The source repository remains responsible for canonical roadmap, release bundle, and installed-root freshness evidence.

## Close Rule

Maintenance evidence is not a substitute for native host evidence, public CI, marketplace approval, or owner acceptance. It only proves that GSE has a repeatable upkeep loop and that remaining external gates stay visible.

Before claiming a maintenance-sensitive slice complete, run:

```powershell
node scripts/audit-maintenance-cadence.mjs --root . --json
node scripts/generate-maintenance-snapshot.mjs --root . --target . --installed-root <installed-skill-dir> --execute --json
node scripts/audit-maintenance-snapshot.mjs --root . --json
node scripts/run-gse-command.mjs --root . --target . --command "/gse maintenance" --json --compact
node scripts/audit-installed-sync.mjs --root . --installed-root <installed-skill-dir> --json
node scripts/audit-session-sync.mjs --root . --json
node scripts/run-validation-profile.mjs --target . --profile lite --json
```
