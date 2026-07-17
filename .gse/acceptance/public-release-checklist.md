# GSE Public Release Checklist

Generated: 2026-07-17T14:08:18.272Z
Source manifest: `.gse/acceptance/release-status-manifest.json`

## Boundary

- Public accepted: not-accepted
- Pending owner/external gates: 3
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

- Gate: Public registry publication
- Status: external-required
- Required evidence: Real registry package URL, version, digest, publication date, verification command, and accepted evidence.
- Publish only after the public repository and CI evidence are available.
- Record package URL, version, artifact digest, publication date, and installability proof.

Preflight:

```text
node scripts/record-public-channel-publication.mjs --root <gse-root> --publication-status accepted --channel-type package-registry --channel-name __REGISTRY_NAME__ --channel-url __REGISTRY_PACKAGE_URL__ --version __VERSION__ --artifact-digest __DIGEST__ --review-status published --evidence-owner __OWNER__ --evidence-date __YYYY_MM_DD__ --evidence-url __REGISTRY_PACKAGE_URL__ --verification-result passed --accepted-by __OWNER__ --accepted-at __YYYY_MM_DD__ --proves-registry-publication true --proves-channel-installability true --evidence-status accepted --force --dry-run --json
```

Record accepted evidence:

```text
node scripts/record-public-channel-publication.mjs --root <gse-root> --publication-status accepted --channel-type package-registry --channel-name __REGISTRY_NAME__ --channel-url __REGISTRY_PACKAGE_URL__ --version __VERSION__ --artifact-digest __DIGEST__ --review-status published --evidence-owner __OWNER__ --evidence-date __YYYY_MM_DD__ --evidence-url __REGISTRY_PACKAGE_URL__ --verification-result passed --accepted-by __OWNER__ --accepted-at __YYYY_MM_DD__ --proves-registry-publication true --proves-channel-installability true --evidence-status accepted --force
```

### 06. Publish or submit marketplace listing

- Gate: Marketplace approval
- Status: external-required
- Required evidence: Real marketplace or catalog listing URL, approval/publication status, review date, and accepted evidence.
- Submit the marketplace/catalog listing after registry or package installability is proven.
- Record listing URL, approval/publication status, review date, version, and installability proof.

Preflight:

```text
node scripts/record-public-channel-publication.mjs --root <gse-root> --publication-status accepted --channel-type marketplace --channel-name __MARKETPLACE_NAME__ --channel-url __MARKETPLACE_LISTING_URL__ --version __VERSION__ --review-status approved --evidence-owner __OWNER__ --evidence-date __YYYY_MM_DD__ --evidence-url __MARKETPLACE_LISTING_URL__ --verification-result passed --accepted-by __OWNER__ --accepted-at __YYYY_MM_DD__ --proves-marketplace-approval true --proves-channel-installability true --evidence-status accepted --force --dry-run --json
```

Record accepted evidence:

```text
node scripts/record-public-channel-publication.mjs --root <gse-root> --publication-status accepted --channel-type marketplace --channel-name __MARKETPLACE_NAME__ --channel-url __MARKETPLACE_LISTING_URL__ --version __VERSION__ --review-status approved --evidence-owner __OWNER__ --evidence-date __YYYY_MM_DD__ --evidence-url __MARKETPLACE_LISTING_URL__ --verification-result passed --accepted-by __OWNER__ --accepted-at __YYYY_MM_DD__ --proves-marketplace-approval true --proves-channel-installability true --evidence-status accepted --force
```

### 07. Record native slash-command evidence

- Gate: local preparation
- Status: verified locally before public handoff
- Use a real host runtime that supports native slash commands.
- Record transcript, screenshot, host log, or equivalent proof that does not rely on portable text routing.

### 08. Record other host runtime invocation evidence

- Gate: Other host runtime invocation
- Status: external-required
- Required evidence: Real runtime invocation record for each claimed host, including evidence URL/path, accepted status, and no generated-pointer dependency.
- Use each claimed non-native host runtime directly.
- Record accepted evidence without generated-pointer-only proof.

Preflight:

```text
node scripts/record-host-invocation.mjs --root <gse-root> --host __HOST__ --host-version __VERSION_OR_UNKNOWN__ --project gse --adapter-path __HOST_ADAPTER_OR_RUNTIME_ENTRYPOINT__ --invocation-method __HOST_UI_COMMAND_RUNTIME_BRIDGE_PLUGIN_COMMAND_AGENT_COMMAND__ --command "/gse continue" --status accepted --evidence-owner __OWNER__ --evidence __THREAD_TRANSCRIPT_SCREENSHOT_TERMINAL_OUTPUT_OR_HOST_LOG__ --verification-command "node scripts/audit-final-readiness.mjs --root <gse-root> --json" --native-slash-command false --portable-text-command false --generated-pointer false --owner-acceptance-required false --force --dry-run --json
```

Record accepted evidence:

```text
node scripts/record-host-invocation.mjs --root <gse-root> --host __HOST__ --host-version __VERSION_OR_UNKNOWN__ --project gse --adapter-path __HOST_ADAPTER_OR_RUNTIME_ENTRYPOINT__ --invocation-method __HOST_UI_COMMAND_RUNTIME_BRIDGE_PLUGIN_COMMAND_AGENT_COMMAND__ --command "/gse continue" --status accepted --evidence-owner __OWNER__ --evidence __THREAD_TRANSCRIPT_SCREENSHOT_TERMINAL_OUTPUT_OR_HOST_LOG__ --verification-command "node scripts/audit-final-readiness.mjs --root <gse-root> --json" --native-slash-command false --portable-text-command false --generated-pointer false --owner-acceptance-required false --force
```

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
