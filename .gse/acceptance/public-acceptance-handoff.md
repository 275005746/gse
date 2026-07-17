# GSE Public Acceptance Handoff

Generated: 2026-07-17T14:08:16.226Z
Root: <gse-root>
Release label: unreleased

## Purpose

Give the owner and future agents one executable checklist for public acceptance. This handoff does not choose a license, publish a package, configure a repository, approve a marketplace listing, or prove optional host-native slash-command support.

## Fast Path

- Portable `/gse` command execution is the core command path.
- Native slash-command evidence is optional per host adapter, not a GSE core completion gate.
- Do not treat portable text-command records or generated pointers as native proof for a host adapter.

## Current Boundary

- Public accepted: not-accepted
- Pending owner/external gates: 3
- Source of truth: `scripts/audit-public-acceptance-readiness.mjs` and `references/final-readiness.md`

## Execution Order

### 5. Public channel - Public registry publication

- Current status: external-required
- Responsible party: external registry
- Current evidence: no public registry publication record is claimed
- Required evidence: Real registry package URL, version, digest, publication date, verification command, and accepted evidence.
- Record command:

```bash
node scripts/record-public-channel-publication.mjs --root __GSE__ --publication-status accepted --channel-type package-registry --channel-name __REGISTRY_NAME__ --channel-url __REGISTRY_PACKAGE_URL__ --version __VERSION__ --artifact-digest __DIGEST__ --review-status published --evidence-owner __OWNER__ --evidence-date __YYYY_MM_DD__ --evidence-url __REGISTRY_PACKAGE_URL__ --verification-result passed --accepted-by __OWNER__ --accepted-at __YYYY_MM_DD__ --proves-registry-publication true --proves-channel-installability true --evidence-status accepted --force
```

- Preflight command:

```bash
node scripts/record-public-channel-publication.mjs --root __GSE__ --publication-status accepted --channel-type package-registry --channel-name __REGISTRY_NAME__ --channel-url __REGISTRY_PACKAGE_URL__ --version __VERSION__ --artifact-digest __DIGEST__ --review-status published --evidence-owner __OWNER__ --evidence-date __YYYY_MM_DD__ --evidence-url __REGISTRY_PACKAGE_URL__ --verification-result passed --accepted-by __OWNER__ --accepted-at __YYYY_MM_DD__ --proves-registry-publication true --proves-channel-installability true --evidence-status accepted --force --dry-run --json
```

- Promotion rule: create a real accepted record, then re-run `node scripts/audit-final-readiness.mjs --root __GSE__ --json` and `node scripts/audit-public-acceptance-readiness.mjs --root __GSE__ --json`.

### 6. Marketplace or catalog - Marketplace approval

- Current status: external-required
- Responsible party: external marketplace
- Current evidence: references/marketplace-discovery.md
- Required evidence: Real marketplace or catalog listing URL, approval/publication status, review date, and accepted evidence.
- Record command:

```bash
node scripts/record-public-channel-publication.mjs --root __GSE__ --publication-status accepted --channel-type marketplace --channel-name __MARKETPLACE_NAME__ --channel-url __MARKETPLACE_LISTING_URL__ --version __VERSION__ --review-status approved --evidence-owner __OWNER__ --evidence-date __YYYY_MM_DD__ --evidence-url __MARKETPLACE_LISTING_URL__ --verification-result passed --accepted-by __OWNER__ --accepted-at __YYYY_MM_DD__ --proves-marketplace-approval true --proves-channel-installability true --evidence-status accepted --force
```

- Preflight command:

```bash
node scripts/record-public-channel-publication.mjs --root __GSE__ --publication-status accepted --channel-type marketplace --channel-name __MARKETPLACE_NAME__ --channel-url __MARKETPLACE_LISTING_URL__ --version __VERSION__ --review-status approved --evidence-owner __OWNER__ --evidence-date __YYYY_MM_DD__ --evidence-url __MARKETPLACE_LISTING_URL__ --verification-result passed --accepted-by __OWNER__ --accepted-at __YYYY_MM_DD__ --proves-marketplace-approval true --proves-channel-installability true --evidence-status accepted --force --dry-run --json
```

- Promotion rule: create a real accepted record, then re-run `node scripts/audit-final-readiness.mjs --root __GSE__ --json` and `node scripts/audit-public-acceptance-readiness.mjs --root __GSE__ --json`.

### 8. Cross-host evidence - Other host runtime invocation

- Current status: external-required
- Responsible party: host runtime
- Current evidence: 0 verified/accepted host record(s), 0 portable text record(s)
- Required evidence: Real runtime invocation record for each claimed host, including evidence URL/path, accepted status, and no generated-pointer dependency.
- Record command:

```bash
node scripts/record-host-invocation.mjs --root __GSE__ --host __HOST__ --host-version __VERSION_OR_UNKNOWN__ --project gse --adapter-path __HOST_ADAPTER_OR_RUNTIME_ENTRYPOINT__ --invocation-method __HOST_UI_COMMAND_RUNTIME_BRIDGE_PLUGIN_COMMAND_AGENT_COMMAND__ --command "/gse continue" --status accepted --evidence-owner __OWNER__ --evidence __THREAD_TRANSCRIPT_SCREENSHOT_TERMINAL_OUTPUT_OR_HOST_LOG__ --verification-command "node scripts/audit-final-readiness.mjs --root __GSE__ --json" --native-slash-command false --portable-text-command false --generated-pointer false --owner-acceptance-required false --force
```

- Preflight command:

```bash
node scripts/record-host-invocation.mjs --root __GSE__ --host __HOST__ --host-version __VERSION_OR_UNKNOWN__ --project gse --adapter-path __HOST_ADAPTER_OR_RUNTIME_ENTRYPOINT__ --invocation-method __HOST_UI_COMMAND_RUNTIME_BRIDGE_PLUGIN_COMMAND_AGENT_COMMAND__ --command "/gse continue" --status accepted --evidence-owner __OWNER__ --evidence __THREAD_TRANSCRIPT_SCREENSHOT_TERMINAL_OUTPUT_OR_HOST_LOG__ --verification-command "node scripts/audit-final-readiness.mjs --root __GSE__ --json" --native-slash-command false --portable-text-command false --generated-pointer false --owner-acceptance-required false --force --dry-run --json
```

- Promotion rule: create a real accepted record, then re-run `node scripts/audit-final-readiness.mjs --root __GSE__ --json` and `node scripts/audit-public-acceptance-readiness.mjs --root __GSE__ --json`.

## Final Verification

Run these commands after owner/external records are attached:

```bash
node scripts/audit-public-acceptance-readiness.mjs --root __GSE__ --json
node scripts/audit-final-readiness.mjs --root __GSE__ --json
node scripts/audit-final-acceptance-packet.mjs --root __GSE__ --json
node scripts/validate-gse.mjs --root __GSE__ --json
node scripts/audit-close-gate.mjs --target __GSE__ --json
```

## Anti-Overclaim

- Do not claim public release acceptance until the final readiness matrix returns `publicAccepted: verified`.
- Do not claim marketplace availability without a real marketplace or catalog record.
- Do not claim native slash-command support from portable text-command routing.
- Do not claim support for a host without a host runtime invocation record for that host.
- Keep this handoff updated when final-readiness gates change.

## Next Action

Start with the public security contact, then attach public repository, CI, publication, and host runtime evidence as those systems become available. Record native slash-command evidence first when the host supports it.
