# Packaging And Maintenance

Use this when preparing GSE itself for handoff, update, local installation, or a versioned internal release.

Use `references/adoption-recipes.md` for applying or updating GSE inside a target project after the skill package itself is validated.

This is a packaging readiness guide, not a registry publication process. Do not claim marketplace distribution, host plugin support, signing, open-source license acceptance, or v1.0 acceptance unless that evidence exists. Use `references/public-release.md` before public GitHub, marketplace, catalog, registry, or external package handoff.

## Package Boundary

The GSE skill package includes:

- `package.json` as Node package metadata for local packing, CLI bin exposure, and future registry handoff.
- `SKILL.md` as the small entrypoint.
- `CHANGELOG.md` as the public-release change history and unsupported-claims boundary.
- `CONTRIBUTING.md`, `SECURITY.md`, and `SUPPORT.md` as public repository collaboration, vulnerability-reporting, and support boundaries.
- `.github/workflows/validate-gse.yml` as the portable GitHub Actions validation template for public repository use.
- `.github/PULL_REQUEST_TEMPLATE.md` and `.github/ISSUE_TEMPLATE/` as evidence-first public collaboration templates.
- `references/` as progressive-disclosure guidance.
- `scripts/` as repeatable audits, generators, discovery, validation, and forward-test probes.
- `assets/templates/` as reusable project artifacts.
- `assets/marketplace/` as portable discovery metadata for catalogs and marketplaces.
- `examples/` as lightweight adoption fixtures.
- `agents/openai.yaml` as optional host UI metadata.
- `.gse/` as the GSE self-development source of truth.

Do not package temporary output, command logs, screenshots, secrets, generated cache folders, `.learnings/`, or host-specific local credentials.

Generated package and release manifests must not expose the packager's local absolute source path. Keep local paths in command output only, not in distributable metadata.

## Version And Release Label

GSE currently uses an internal readiness label rather than a published semver package.

Release labels should use this format until a real package manager or registry exists:

```text
gse-internal-YYYY-MM-DD-N
```

Increment `N` for multiple release candidates on the same day.

Use semver only after there is a maintained distribution channel and backward-compatibility policy.

## Release Validation Gate

Before handing off or calling a GSE package release-ready, run:

```text
node <skill>/scripts/validate-gse.mjs --root <skill> --profile release --json
```

The release is not ready if validation fails, if release/distribution checks are skipped unexpectedly, or if a required evidence gate is only `result` when the release level requires `verified` or `accepted`. Use `--profile full` or omit `--profile` only when the historical consolidated validator itself is the claim; routine CI and daily development should use `--profile lite` or `scripts/run-validation-profile.mjs`.

`validate-gse.mjs` currently covers structural self-audit, project bootstrap smoke, fixture adoption, existing-repo adoption, host adapter generation, compatibility matrix, documented fixture forward-test, fresh-session readiness, local package/install distribution audit, remote URL distribution integrity audit, package signing and verification audit, release trust policy, public release metadata, release bundle generation, open-source repository readiness, CI workflow readiness, public collaboration templates, marketplace discovery metadata, host UI invocation readiness, skill metadata validation, and BOM scanning.

## Distribution Audit Profiles

Before public handoff or registry preparation, verify Node package metadata:

```text
node <skill>/scripts/audit-npm-package-metadata.mjs --root <skill> --json
node <skill>/scripts/audit-npm-tarball-install.mjs --root <skill> --json
node <skill>/scripts/audit-npm-publish-dry-run.mjs --root <skill> --json
npm pack --dry-run --json
```

The metadata audit proves package metadata and dry-run pack contents. The tarball install audit creates a real local npm tarball, installs it into a clean temporary consumer project, runs the installed `gse` bin, and runs an installed README audit. The publish dry-run audit checks npm publication metadata, CLI bin preservation, required runtime files, integrity fields, and harmful metadata auto-correction warnings. These checks do not publish to npm, reserve a package name, verify a public repository, or prove registry approval.

Use the right distribution profile for the claim:

```text
node <skill>/scripts/audit-distribution.mjs --root <skill> --profile smoke
node <skill>/scripts/audit-remote-distribution.mjs --root <skill> --profile smoke
node <skill>/scripts/validate-gse.mjs --root <skill> --profile release --distribution-profile smoke
```

`smoke` verifies package creation, install, installed entrypoints, CLI status, remote URL install, and remote integrity/tamper behavior. It skips the nested installed-copy `validate-gse` run.

Use `full` before release, package handoff, install/update claims, or when the installed copy itself must be validated:

```text
node <skill>/scripts/validate-gse.mjs --root <skill> --distribution-profile full
```

## CI Workflow Template

GSE includes a GitHub Actions workflow template at `.github/workflows/validate-gse.yml`.

The template runs:

```text
node scripts/validate-gse.mjs --root . --profile lite --json
node scripts/audit-final-readiness.mjs --root . --json
node scripts/audit-final-acceptance-packet.mjs --root . --json
```

Run the local CI readiness audit with:

```text
node <skill>/scripts/audit-ci-readiness.mjs --root <skill>
```

This verifies the workflow file, trigger coverage, Node setup, validation commands, and final-readiness boundary checks. It does not prove a real public GitHub Actions run, branch protection, required status checks, or marketplace CI policy.

## Release Bundle

Use a release bundle when handing GSE to another host, another repository, or a maintainer who needs the install commands, validation checklist, public-release record, and unsupported-claims boundary in one directory:

```text
node <skill>/scripts/generate-release-bundle.mjs --root <skill> --label <release-label> --out <bundle-dir>
```

For a focused bundle check, run:

```text
node <skill>/scripts/audit-release-bundle.mjs --root <skill>
```

This verifies that the bundle contains a release summary, install commands, validation checklist, public-release record, handoff files, manifest, and owner action plan. The bundle generator creates a fresh release status manifest and owner action plan during bundle creation instead of trusting stale cached acceptance files. The audit writes to an isolated temporary directory so it does not mutate the canonical release bundle path during validation. It still does not publish GSE, choose a license, approve a marketplace listing, or prove host-native slash-command support.

## Release Status Manifest

Use the release status manifest when another host, CI job, marketplace checklist, or maintainer needs a machine-readable summary of GSE readiness:

```text
node <skill>/scripts/generate-release-status-manifest.mjs --root <skill> --out <skill>/.gse/acceptance/release-status-manifest.json --force
node <skill>/scripts/audit-release-status-manifest.mjs --root <skill>
```

The manifest summarizes verified rows, owner-required rows, external-required rows, install/distribution status, public acceptance gates, host runtime evidence counts, host runtime fixture drill status, and verification commands. It is generated from current audits and records; it does not create owner decisions, external publication, public CI, marketplace approval, or native slash-command evidence.

## Release Owner Action Plan

Use the owner action plan when a human owner or maintainer needs the next concrete public-release actions grouped by responsible party:

```text
node <skill>/scripts/generate-release-owner-action-plan.mjs --root <skill> --force --json
node <skill>/scripts/audit-release-owner-action-plan.mjs --root <skill> --json
node <skill>/scripts/audit-release-owner-action-plan-drill.mjs --root <skill> --json
```

The plan is generated from `.gse/acceptance/release-status-manifest.json`. It groups pending gates by project owner, repository owner, external CI, external registry, external marketplace, and host runtime. It includes the record command and required evidence for each gate. It does not select a license, configure a repository, run public CI, publish a package, approve a marketplace listing, or prove native slash-command support.

The drill runs the plan path in a temporary fixture: it generates the manifest and plan, creates accepted fixture records for every owner/external gate family, verifies final readiness promotes to `publicAccepted: verified`, verifies the public acceptance doctor reports zero pending gates, and then removes the fixture. This proves the workflow mechanics without claiming real public acceptance.

## Local Package And Install

Use this path before claiming GSE can be copied or installed outside its current development folder:

```text
node <skill>/scripts/package-gse.mjs --root <skill> --out <package-dir> --label <release-label>
node <skill>/scripts/install-gse.mjs --source <package-dir> --target <install-skill-dir>
node <install-skill-dir>/scripts/validate-gse.mjs --root <install-skill-dir> --skip-skill-validator --skip-distribution --skip-completion-readiness
```

For a one-command local distribution proof, run:

```text
node <skill>/scripts/audit-distribution.mjs --root <skill>
```

This proves file-based packaging, install, and installed-copy validation. It still does not prove registry publication, remote-machine install, signing, shell completion, or marketplace discovery.

## Remote URL Install And Integrity

GSE packages include a `gse-package-manifest.json` with `sha256` hashes for packaged files.

Install from a URL-shaped package source with:

```text
node <skill>/scripts/install-gse.mjs --source-url <file-or-http-package-url> --target <install-skill-dir>
```

Run the focused remote distribution audit with:

```text
node <skill>/scripts/audit-remote-distribution.mjs --root <skill>
```

This starts a temporary HTTP package source, installs from `--source-url`, validates the installed copy, then tampers with a package file to verify the integrity gate fails. It proves URL install and manifest integrity behavior locally. It still does not prove public registry publication, trusted signing, marketplace discovery, or remote-machine network conditions.

## Signing And Verification

Use Ed25519 signing when a package needs tamper evidence beyond raw file hashes:

```text
node <skill>/scripts/sign-gse-package.mjs --package <package-dir> --private-key <private.pem> --public-key <public.pem>
node <skill>/scripts/verify-gse-package.mjs --package <package-dir> --public-key <public.pem>
node <skill>/scripts/install-gse.mjs --source <package-dir> --target <install-skill-dir> --public-key <public.pem>
```

For local audit keys only:

```text
node <skill>/scripts/sign-gse-package.mjs --package <package-dir> --private-key <private.pem> --public-key <public.pem> --generate-key
```

Run the focused signing audit with:

```text
node <skill>/scripts/audit-signing.mjs --root <skill>
```

This proves signing mechanics, signature verification, signed install, and tamper rejection. It does not prove maintainer identity, public key custody, transparency logs, marketplace trust, or a production release policy.

For public or shared releases, also complete `references/release-trust.md` and `assets/templates/release-trust-record.md`. This is the Release Trust record for the package. A package can be signed and verified without being trusted; trusted release status requires owner acceptance, public key fingerprint publication, custody rules, rotation policy, and revocation path.

For public open-source releases, also complete `references/public-release.md` and `assets/templates/public-release-record.md`. GSE must not choose a license by guessing; accepted public release requires an owner-selected license or an explicit `not-public` decision.

## Marketplace Discovery

Use `references/marketplace-discovery.md` and `assets/marketplace/gse-listing.json` when preparing a public listing, catalog entry, plugin page, or marketplace submission.

Run:

```text
node <skill>/scripts/audit-marketplace-discovery.mjs --root <skill> --json
```

This verifies local discovery metadata and search-language fit. It does not prove marketplace approval, public search indexing, registry publication, maintainer identity, or host-native installation.

## Release Notes

Use `references/release.md` as the general release policy. For GSE skill releases, keep notes short:

```text
Release label:
Date:
Readiness: not ready | result | verified | accepted
Changed:
Validation:
Compatibility impact:
Migration or rollback:
Known risks:
Follow-up slices:
```

Rules:

- Link to `.gse/evidence/YYYY-MM-DD.md` instead of pasting long command output.
- Separate user-facing workflow changes from internal script/refactoring changes.
- Mark unavailable or unverified host tools honestly.
- Keep true fresh-session acceptance separate from fresh-session readiness.

## Install Or Update Handoff

For a local handoff, provide:

- Skill path: `<install-skill-dir>` or the target install path.
- Release label or date.
- Validation command and latest result.
- Evidence log path.
- Known residual risks.
- Next slice from `.gse/current-slice.md`.

For project-local GSE updates or release-readiness changes, use `assets/templates/update-release-acceptance-record.md` to preserve local decisions, changed files, commands run, rollback notes, owner gate, accepted-by status, and residual risks.

If copying GSE to another machine or host, run validation after copy and record the result in that environment. Host-specific capabilities remain `unknown` until checked there.

## Rollback

For low-risk GSE documentation/script changes, rollback is file-level revert of the touched artifacts plus re-running `validate-gse.mjs`.

For scaffold, generator, or template changes that may affect downstream projects, also record:

- Which generated files or adapters may need regeneration.
- Whether existing project `.gse/` folders are compatible.
- Whether host adapters need manual review.

## Readiness Status

- `result`: packaging notes or release artifacts exist.
- `verified`: `validate-gse.mjs` passes and release notes identify residual risks.
- `accepted`: required owner, fresh-session, release policy, or distribution gate accepts the release.

Do not call a release accepted only because local validation passed unless the current release policy explicitly says local validation is sufficient.
