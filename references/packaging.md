# Packaging And Distribution

Use this document when preparing GSE for another Agent, another repository, or a versioned distribution channel.

GSE has two distinct distribution paths:

1. **Agent Skill source**: the public GitHub repository, whose root `SKILL.md` is the portable entrypoint.
2. **CLI package**: the npm package `@t275005746/gse`, which exposes the `gse` command.

A Skill directory or catalog may provide discovery for the GitHub source. Directory indexing, catalog acceptance, host-native loading, and npm publication are separate claims and require their own external evidence.

## Public source and Skill entrypoint

Canonical source:

```text
https://github.com/275005746/gse
```

The source entrypoint is:

```text
SKILL.md
```

To install the source for a host-specific Skill loader:

```text
git clone https://github.com/275005746/gse.git
```

The host chooses the directory in which Skills are loaded. A generated `.claude/`, `.codex/`, or other adapter file is only a pointer unless the host records runtime evidence.

## npm CLI distribution

The published CLI package is:

```text
https://www.npmjs.com/package/@t275005746/gse
```

Install it with:

```text
npm install -g @t275005746/gse
gse status --target .
```

Node.js 18 or newer is required. Verify package metadata and clean installation with:

```text
node <skill>/scripts/audit-npm-package-metadata.mjs --root <skill> --json
node <skill>/scripts/audit-npm-tarball-install.mjs --root <skill> --json
node <skill>/scripts/audit-npm-publish-dry-run.mjs --root <skill> --json
npm pack --dry-run --json
```

These checks prove package shape, contents, and installation behavior. They do not publish a new version or prove Skill-directory indexing.

## Local package handoff

For a file-based handoff or installed-copy test:

```text
node <skill>/scripts/package-gse.mjs --root <skill> --out <package-dir> --label <release-label>
node <skill>/scripts/install-gse.mjs --source <package-dir> --target <install-skill-dir>
node <install-skill-dir>/scripts/validate-gse.mjs --root <install-skill-dir> --skip-skill-validator --skip-distribution --skip-completion-readiness
```

This proves local packaging and installation only. It does not prove remote publication, catalog inclusion, host-native loading, or public acceptance.

## Release validation

Before declaring a version ready for distribution, run the profile that matches the claim:

```text
node <skill>/scripts/validate-gse.mjs --root <skill> --profile lite --json
node <skill>/scripts/validate-gse.mjs --root <skill> --profile release --json
```

Use `lite` for routine development and `release` for a release-sensitive claim. Do not label a local result `accepted` without an owner or external record.

Generate and audit the versioned release bundle with:

```text
node <skill>/scripts/generate-release-bundle.mjs --root <skill> --label <release-label> --out <bundle-dir> --force --json
node <skill>/scripts/audit-release-bundle.mjs --root <skill> --json
```

The bundle collects current package and acceptance artifacts; it does not create missing external evidence.

## Discovery metadata

The canonical local discovery metadata is:

```text
assets/marketplace/gse-listing.json
```

Despite the historical directory name, this file is host-neutral Agent Skill discovery metadata. Its local audit proves only that the description and entrypoints are internally consistent:

```text
node <skill>/scripts/audit-marketplace-discovery.mjs --root <skill> --json
```

It does not submit GSE to a catalog, create an index record, prove marketplace approval, or prove public search visibility.

## What must never be packaged

Do not package temporary output, command logs, screenshots, secrets, generated caches, `.learnings/`, host credentials, or local absolute paths. Release manifests must describe the package without exposing the packager's machine.


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
