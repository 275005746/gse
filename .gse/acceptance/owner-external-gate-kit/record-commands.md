# GSE Owner / External Gate Record Commands

## 06-marketplace-approval - Marketplace approval

- Responsible party: external marketplace
- Current status: external-required
- Required evidence: Real marketplace or catalog listing URL, approval/publication status, review date, and accepted evidence.

```bash
node scripts/record-public-channel-publication.mjs --root __GSE__ --publication-status accepted --channel-type marketplace --channel-name __MARKETPLACE_NAME__ --channel-url __MARKETPLACE_LISTING_URL__ --version __VERSION__ --review-status approved --evidence-owner __OWNER__ --evidence-date __YYYY_MM_DD__ --evidence-url __MARKETPLACE_LISTING_URL__ --verification-result passed --accepted-by __OWNER__ --accepted-at __YYYY_MM_DD__ --proves-marketplace-approval true --proves-channel-installability true --evidence-status accepted --force
```

Preflight command:

```bash
node scripts/record-public-channel-publication.mjs --root __GSE__ --publication-status accepted --channel-type marketplace --channel-name __MARKETPLACE_NAME__ --channel-url __MARKETPLACE_LISTING_URL__ --version __VERSION__ --review-status approved --evidence-owner __OWNER__ --evidence-date __YYYY_MM_DD__ --evidence-url __MARKETPLACE_LISTING_URL__ --verification-result passed --accepted-by __OWNER__ --accepted-at __YYYY_MM_DD__ --proves-marketplace-approval true --proves-channel-installability true --evidence-status accepted --force --dry-run --json
```

## 08-other-host-runtime-invocation - Other host runtime invocation

- Responsible party: host runtime
- Current status: external-required
- Required evidence: Real runtime invocation record for each claimed host, including evidence URL/path, accepted status, and no generated-pointer dependency.

```bash
node scripts/record-host-invocation.mjs --root __GSE__ --host __HOST__ --host-version __VERSION_OR_UNKNOWN__ --project gse --adapter-path __HOST_ADAPTER_OR_RUNTIME_ENTRYPOINT__ --invocation-method __HOST_UI_COMMAND_RUNTIME_BRIDGE_PLUGIN_COMMAND_AGENT_COMMAND__ --command "/gse continue" --status accepted --evidence-owner __OWNER__ --evidence __THREAD_TRANSCRIPT_SCREENSHOT_TERMINAL_OUTPUT_OR_HOST_LOG__ --verification-command "node scripts/audit-final-readiness.mjs --root __GSE__ --json" --native-slash-command false --portable-text-command false --generated-pointer false --owner-acceptance-required false --force
```

Preflight command:

```bash
node scripts/record-host-invocation.mjs --root __GSE__ --host __HOST__ --host-version __VERSION_OR_UNKNOWN__ --project gse --adapter-path __HOST_ADAPTER_OR_RUNTIME_ENTRYPOINT__ --invocation-method __HOST_UI_COMMAND_RUNTIME_BRIDGE_PLUGIN_COMMAND_AGENT_COMMAND__ --command "/gse continue" --status accepted --evidence-owner __OWNER__ --evidence __THREAD_TRANSCRIPT_SCREENSHOT_TERMINAL_OUTPUT_OR_HOST_LOG__ --verification-command "node scripts/audit-final-readiness.mjs --root __GSE__ --json" --native-slash-command false --portable-text-command false --generated-pointer false --owner-acceptance-required false --force --dry-run --json
```

