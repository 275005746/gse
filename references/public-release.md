# Public Release Metadata

Use this gate when GSE, a project-local GSE scaffold, or a GSE-derived package is prepared for public GitHub, marketplace, catalog, registry, or external handoff.

Public release metadata is not a substitute for legal review, maintainer approval, CI, or marketplace approval. It makes the release state auditable so agents do not claim public readiness from local tests alone.

## Required Metadata

Before a public release can be called accepted, record:

- Release name or version.
- Release date or intended release window.
- Distribution channel: GitHub repository, package registry, marketplace/catalog, internal handoff, or direct archive.
- License decision: license identifier, license file path, and who approved it.
- Changelog or release notes path.
- Install/update instructions path.
- Verification commands and latest result.
- Signing or integrity policy.
- Public CI run: public workflow run URL, commit SHA, required checks, result, and acceptance evidence.
- Public security contact: owner-approved disclosure path and policy update evidence.
- Public repository settings: issues, PRs, security policy visibility, branch protection, and required checks.
- Public channel publication: registry package, GitHub release, marketplace, or catalog evidence when any public channel is claimed.
- Community/support channel: optional maintainer support, sponsorship, affiliate, or related-service link, if owner-approved.
- Known risks and unsupported claims.
- Owner acceptance or explicit reason acceptance is still pending.

## License Decision

GSE must not choose a license by guessing. If the project has no approved license, record `owner-required` and keep public release acceptance pending.

For the GSE skill itself, the owner-approved mainstream open-source default is MIT. See `references/open-source-defaults.md`. This default does not imply public repository, CI, registry, marketplace, or host runtime acceptance until those external records exist.

Minimum license record:

```text
License status: owner-required | selected | not-public
SPDX identifier:
License file:
Approved by:
Decision date:
Notes:
```

Use `assets/templates/public-release-record.md` when a release needs a compact owner-facing decision record.

Use `scripts/record-public-release.mjs` to create a project-local record without hand-editing the template:

```bash
node <skill>/scripts/record-public-release.mjs --root <skill-or-project> --license-status owner-required --json
```

For `--license-status selected`, the command requires `--spdx`, `--license-file`, `--approved-by`, `--decision-date`, and `--evidence-status accepted`. This keeps license acceptance from being implied by a partially filled record.

For `--license-status not-public`, the command requires `--approved-by` and `--decision-date`. Use this when the owner explicitly decides the package is not approved for public open-source release yet.

Run `scripts/audit-public-release-decision.mjs --root <skill-or-project>` to verify that the owner-required, selected-license, and not-public decision paths behave correctly. The audit uses a temporary fixture for selected-license success and does not choose a license for the real project.

## Public Release Checklist

Use the generated checklist when the owner needs the public-release work in execution order instead of grouped by responsibility:

```bash
node <skill>/scripts/generate-public-release-checklist.mjs --root <skill-or-project> --force --json
node <skill>/scripts/audit-public-release-checklist.mjs --root <skill-or-project> --json
```

The checklist is a runway, not an acceptance record. It keeps the order explicit: release bundle, public repository settings, security contact, public CI, registry publication, marketplace listing, native slash-command evidence, other host runtime evidence, then final readiness audits.

## Public CI Run

Local CI workflow files are not proof that public CI has run. If GSE is claimed to have public CI evidence, record the real public workflow run.

Use `assets/templates/public-ci-run-record.md` for a compact record, or generate one with:

```bash
node <skill>/scripts/record-public-ci-run.mjs --root <skill-or-project> --run-status pending --json
```

For `--run-status accepted`, the command requires repository URL, workflow name, workflow file, run URL, commit SHA, branch, required checks, evidence owner, evidence date, evidence URL or run id, `--run-conclusion success`, `--evidence-status accepted`, `--accepted-by`, `--accepted-at`, `--proves-public-ci-run true`, and `--proves-required-checks true`.

Run `scripts/audit-public-ci-run.mjs --root <skill-or-project>` to verify pending and accepted CI run record mechanics. The audit uses temporary fixture evidence and does not run GitHub Actions.

## Public Security Contact

GSE must not invent a public vulnerability disclosure address. If the owner has not approved a public security contact, keep the contact status pending and do not claim public release acceptance.

Use `assets/templates/public-security-contact-record.md` for a compact record, or generate one with:

```bash
node <skill>/scripts/record-public-security-contact.mjs --root <skill-or-project> --contact-status pending --json
```

For `--contact-status accepted`, the command requires a public contact type and value, owner evidence, evidence date, evidence URL or run id, `--is-public true`, `--security-policy-updated true`, `--accepted-by`, `--accepted-at`, and `--evidence-status accepted`.

Run `scripts/audit-public-security-contact.mjs --root <skill-or-project>` to verify pending and accepted record mechanics. The audit uses temporary fixture evidence and does not create a real public security contact.

## Public Repository Settings

Public repository settings are external evidence. Local files can define the required shape, but they do not prove that a public GitHub repository has issues, pull requests, security policy visibility, branch protection, or required checks configured.

Use `assets/templates/public-repository-settings-record.md` for a compact record, or generate one with:

```bash
node <skill>/scripts/record-public-repository-settings.mjs --root <skill-or-project> --settings-status pending --json
```

For `--settings-status verified`, the command requires a public repository URL, evidence owner, evidence date, evidence URL or run id, enabled issues/PRs/security policy, branch protection, required status checks, review-before-merge, conversation resolution, force-push restriction, deletion restriction, and required check names.

For `--settings-status accepted`, the command also requires `--accepted-by`, `--accepted-at`, and `--evidence-status accepted`.

Run `scripts/audit-public-repository-settings.mjs --root <skill-or-project>` to verify the pending, verified, and accepted record mechanics. The audit uses temporary fixture evidence and does not configure a real public repository.

## Public Channel Publication

Discovery metadata, local packages, release bundles, and URL-install smokes are not public publication. If GSE is claimed to be published through a registry, marketplace, catalog, or GitHub release, record the real channel evidence.

Use `assets/templates/public-channel-publication-record.md` for a compact record, or generate one with:

```bash
node <skill>/scripts/record-public-channel-publication.mjs --root <skill-or-project> --publication-status pending --json
```

For `--publication-status accepted`, the command requires channel type, channel name, channel URL, version, owner evidence, evidence date, evidence URL or run id, review status `approved` or `published`, `--accepted-by`, `--accepted-at`, and `--evidence-status accepted`.

For package registry claims, accepted evidence also requires `--artifact-digest` and `--proves-registry-publication true`. For marketplace or catalog claims, accepted evidence requires `--proves-marketplace-approval true`.

Run `scripts/audit-public-channel-publication.mjs --root <skill-or-project>` to verify pending, registry-publication, and marketplace-approval record mechanics. The audit uses temporary fixture evidence and does not publish to a real channel.

## Community And Support Links

Community links are not release channels. They can help users find support or related maintainer services, but they do not prove registry publication, marketplace approval, public CI, security disclosure, or host runtime support.

For GSE, GateHub (`https://gatehub.top/`) is the current owner-candidate community/support link. Use `references/community-channels.md` before adding it to a public repository, release note, or listing.

## Changelog Policy

Use the project convention first. If none exists, keep a `CHANGELOG.md` with:

- user-facing changes,
- operator or maintainer changes,
- breaking changes,
- migration and rollback notes,
- verification evidence,
- known limits and unsupported claims.

Do not paste long command output, private reasoning, secrets, provider payloads, or screenshots into a changelog. Link to evidence files instead.

## Acceptance Levels

- `result`: metadata files exist but are not verified.
- `verified`: metadata files, scripts, changelog policy, and owner-decision placeholders are structurally checked.
- `accepted`: owner license decision, release channel, verification evidence, and required approvals are recorded.

Do not mark `accepted` when the release is only locally validated.

## Integration

- Use `references/open-source-defaults.md` for the mainstream public release preset.
- Use `references/community-channels.md` for optional maintainer support, sponsorship, affiliate, or related-service links.
- Run `scripts/audit-public-release-metadata.mjs --root <skill-or-project>` before public handoff.
- Run `scripts/audit-public-release-decision.mjs --root <skill-or-project>` before claiming release-decision mechanics are complete.
- Use `scripts/record-public-release.mjs --root <skill-or-project>` to write the release decision record.
- Run `scripts/audit-public-ci-run.mjs --root <skill-or-project>` before claiming public CI run record mechanics are complete.
- Use `scripts/record-public-ci-run.mjs --root <skill-or-project>` to write public CI run evidence.
- Run `scripts/audit-public-security-contact.mjs --root <skill-or-project>` before claiming security contact record mechanics are complete.
- Use `scripts/record-public-security-contact.mjs --root <skill-or-project>` to write the public security contact evidence record.
- Run `scripts/audit-public-repository-settings.mjs --root <skill-or-project>` before claiming repository settings record mechanics are complete.
- Use `scripts/record-public-repository-settings.mjs --root <skill-or-project>` to write the repository settings evidence record.
- Run `scripts/audit-public-channel-publication.mjs --root <skill-or-project>` before claiming public channel publication record mechanics are complete.
- Use `scripts/record-public-channel-publication.mjs --root <skill-or-project>` to write public registry, marketplace, catalog, or release publication evidence.
- Run `scripts/validate-gse.mjs --root <skill>` before publishing the GSE skill itself.
- Use `references/release.md` for release-level gates and rollback guidance.
- Use `references/release-trust.md` for signing, public key custody, and artifact trust.
- Use `references/marketplace-discovery.md` when preparing marketplace or catalog metadata.
