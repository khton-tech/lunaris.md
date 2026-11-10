# Audit remediation status and SDK blockers

Date: 2026-11-10, Asia/Yekaterinburg.
Branch: fix/audit-2026-11-09. No merge or deployment performed.

Sources: [system audit](system-audit-2026-11-09.md), [deep code audit](deep-code-audit-2026-11-09.md), and [server readiness](server-readiness-2026-11-09.md).

## Completed: R3 preference shutdown safety

Editor and File Explorer preference liveness checks now recognize SDK endpoint retirement even while their own consumer scope remains open. Background loads have rejection observers; explicit ready callers still receive unexpected failures. Permission denial is not classified as normal retirement.

Integration: both consumers use the existing public SDK isSdkUnavailable contract and scoped Logger. Config, Vault, Settings and kernel contracts are unchanged. No additional plugin integration is required for this correction. No visual behavior was changed or manually accepted.

Validation:

- Before the fix, remote:check reproduced the audited unhandled PROVIDER_UNAVAILABLE rejection: 51 passed, 1 failed.
- After the fix, npm run remote:check passed all 52 tests, including the real server delayed-read shutdown scenario, shared browser/desktop builds, type fixtures and boundaries.
- node --test --test-reporter=dot tools/scripts/preferences-retirement.test.mjs: four regressions passed, covering both consumers, retirement with an open consumer scope, and propagation/logging of unrelated permission failures.
- Both existing preference test files: five tests passed.

## Required SDK decision: R2 writer-safe recovery

Development stops at this contract gap under AGENTS.md Strict SDK Dependency. Current Drafts/DraftStorage expose one load result per document and unconditional replacement. Plugins cannot safely express multiple recovery candidates through that API. R4/R10 must be reviewed alongside the approved ownership policy, with separate regressions.

Proposed minimal public contract, to approve before implementation:

1. Keep DraftKey as document identity. Add a required opaque writerId to DraftRecord; identify a durable record by document plus writerId. Each editor session allocates a fresh writer identity; identity is stored with the record so recovery survives restart.
2. Replace singular load with list(key): Promise<FsResult<readonly DraftRecord[]>>. Never silently choose among competing writers. Preserve revision and updatedAt metadata for recovery selection.
3. save(record) replaces only that writer's record. remove(key, writerId, revision) removes only that writer's acknowledged revision. Another writer and newer revisions survive. A missing exact record is an idempotent success.
4. Bump Drafts and DraftStorage major versions and update all declarations, providers, consumers, validators, fixtures and documentation together. These are shared SDK contracts, not private storage extensions.
5. Migrate the existing IndexedDB draft store transactionally into writer-specific records with a reserved legacy writer identity. Do not drop legacy drafts. Coordinate schema upgrades with other tabs and report blocked upgrades explicitly.
6. Editor recovery must expose all candidates through public UIKit roles and require explicit selection when candidates compete. Discard must acknowledge durable removal. Session close protection must include unsettled recovery writes/removals even when text equals disk. No SDK work may be scheduled after disposal.

Required integration: remote contracts, drafts provider, browser storage, editor DocumentSession/recovery, DocumentProtection and browser navigation. Acceptance: two independent hosts, restart, ambiguous recovery, exact revision acknowledgements, failed discard, delayed save then undo, Vault close and page-close protection. No implementation or integration of this proposal is claimed.

## Required protocol decision: R8 remote limits

Before changing remote plugins, extend public ServerInfo with explicit limits for raw UTF-8 text bytes, binary bytes and the encoded file-request body. Define byte units, envelope overhead and server enforcement; advertise limits conservatively and apply them per source. Client transport must measure/reject excessive requests before materializing large JSON byte arrays. Server HTTP admission remains authoritative.

Required integration: server information/HTTP policy, shared remote contract validation/version compatibility, transport, remote filesystem capabilities, router and callers. Acceptance must cover text escaping, multibyte UTF-8, binary array expansion, envelope overhead and exact boundaries. Old servers must receive a documented compatibility outcome rather than an unlimited-looking fallback. This proposal is not implemented.

## Outstanding findings

R1, R2, R4-R12 and L1 remain open. R3 is fixed as described above; analogous File Explorer liveness was corrected without claiming its original failure was reproduced. The server-readiness report already records prior remediation of its four original findings; Docker/Linux execution and manual acceptance remain pending, not newly certified by this work.
