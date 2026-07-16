# GSE Owner / External Gate Verification Commands

Run these commands after attaching real owner/external records:

```bash
node scripts/run-gse-command.mjs --root __GSE__ --target __GSE__ --command "/gse probe --public-repo-url __PUBLIC_REPO_URL__ --security-contact-url __SECURITY_CONTACT_URL__ --public-ci-run-url __PUBLIC_CI_RUN_URL__ --registry-package-url __REGISTRY_PACKAGE_URL__ --marketplace-url __MARKETPLACE_LISTING_URL__ --native-host-evidence __NATIVE_HOST_EVIDENCE__ --other-host-evidence __OTHER_HOST_EVIDENCE__" --json
node scripts/audit-public-acceptance-readiness.mjs --root __GSE__ --json
node scripts/audit-public-acceptance-command-dry-run-drill.mjs --root __GSE__ --json
node scripts/audit-final-readiness.mjs --root __GSE__ --json
node scripts/audit-final-acceptance-packet.mjs --root __GSE__ --json
node scripts/audit-release-owner-action-plan.mjs --root __GSE__ --json
node scripts/audit-host-runtime-invocations.mjs --root __GSE__ --json
node scripts/audit-owner-external-gate-kit.mjs --root __GSE__ --json
node scripts/validate-gse.mjs --root __GSE__ --json
node scripts/audit-close-gate.mjs --target __GSE__ --json
```

Acceptance rule: every pending gate must have accepted real evidence and final readiness must report `publicAccepted: verified`. Local fixture drills, pointer adapters, and generated handoff files do not count as external acceptance.
