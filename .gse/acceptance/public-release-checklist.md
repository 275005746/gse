# GSE Public Release Checklist

Generated: 2026-07-09T04:59:54.947Z
Source manifest: `.gse/acceptance/release-status-manifest.json`

## Boundary

- Public accepted: verified
- Pending owner/external gates: 0
- This checklist is an execution runway. It does not publish, approve, or accept a release by itself.
- A gate is complete only after real accepted evidence is recorded and final readiness is re-audited.

## Runway

### 01. Prepare the release bundle

- Gate: local preparation
- Status: verified locally before public handoff
- Run `/gse release` as a dry-run before writing a bundle.
- Run `/gse release --execute --out <bundle>` only for the bundle that will be handed off.
- Keep `npm publish --dry-run`, tarball install, checksum, provenance, and signing evidence attached to the bundle.

### 02. Publish and configure the public repository

- Gate: local preparation
- Status: verified locally before public handoff
- Create or update the public repository.
- Enable issues, pull requests, visible security policy, branch protection, required checks, review before merge, conversation resolution, force-push restriction, and deletion restriction.

### 03. Approve the public security contact

- Gate: local preparation
- Status: verified locally before public handoff
- Choose the owner-approved vulnerability disclosure path.
- Make the contact public and ensure the security policy points to it.

### 04. Run public CI on the release commit

- Gate: local preparation
- Status: verified locally before public handoff
- Run the public workflow on the release commit.
- Record the public run URL, commit SHA, branch, required checks, and successful conclusion.

### 05. Publish the registry package

- Gate: local preparation
- Status: verified locally before public handoff
- Publish only after the public repository and CI evidence are available.
- Record package URL, version, artifact digest, publication date, and installability proof.

### 06. Publish or submit marketplace listing

- Gate: local preparation
- Status: verified locally before public handoff
- Submit the marketplace/catalog listing after registry or package installability is proven.
- Record listing URL, approval/publication status, review date, version, and installability proof.

### 07. Record native slash-command evidence

- Gate: local preparation
- Status: verified locally before public handoff
- Use a real host runtime that supports native slash commands.
- Record transcript, screenshot, host log, or equivalent proof that does not rely on portable text routing.

### 08. Record other host runtime invocation evidence

- Gate: local preparation
- Status: verified locally before public handoff
- Use each claimed non-native host runtime directly.
- Record accepted evidence without generated-pointer-only proof.

## Final Verification

- `node scripts/run-gse-command.mjs --root <gse-root> --target <gse-root> --command "/gse probe --public-repo-url __PUBLIC_REPO_URL__ --security-contact-url __SECURITY_CONTACT_URL__ --public-ci-run-url __PUBLIC_CI_RUN_URL__ --registry-package-url __REGISTRY_PACKAGE_URL__ --marketplace-url __MARKETPLACE_LISTING_URL__ --native-host-evidence __NATIVE_HOST_EVIDENCE__ --other-host-evidence __OTHER_HOST_EVIDENCE__" --json`
- `node scripts/validate-gse.mjs --root <gse-root> --json`
- `node scripts/audit-final-readiness.mjs --root <gse-root> --json`
- `node scripts/audit-public-acceptance-readiness.mjs --root <gse-root> --json`
- `node scripts/audit-public-acceptance-command-dry-run-drill.mjs --root <gse-root> --json`
- `node scripts/audit-host-runtime-invocations.mjs --root <gse-root> --json`
- `node scripts/audit-host-runtime-invocation-drill.mjs --root <gse-root> --json`
- `node scripts/audit-release-bundle.mjs --root <gse-root> --json`
- `node scripts/audit-release-owner-action-plan.mjs --root <gse-root> --json`
- `node scripts/audit-distribution.mjs --root <gse-root> --json`
- `node scripts/audit-remote-distribution.mjs --root <gse-root> --json`
- `node scripts/audit-public-acceptance-readiness.mjs --root <gse-root> --json`
- `node scripts/audit-final-readiness.mjs --root <gse-root> --json`
- `node scripts/audit-release-bundle.mjs --root <gse-root> --json`

## Stop Conditions

- Stop if any evidence value is a placeholder, local path, example URL, or private-only URL.
- Stop if public CI did not run against the release commit.
- Stop if a host invocation only proves generated pointer files or portable text routing while claiming native slash-command support.
- Stop if public acceptance is still `not-accepted` after recording evidence; rerun the readiness doctor and fix the named gate.
