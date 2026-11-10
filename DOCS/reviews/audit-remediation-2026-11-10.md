# Audit remediation status

Date: 2026-11-10, Asia/Yekaterinburg.
Client branch: fix/audit-2026-11-09. Paired server branch: fix/audit-remote-limits.
No merge, deployment or real-user-data operation was performed.

Sources: [system audit](system-audit-2026-11-09.md), [deep code audit](deep-code-audit-2026-11-09.md), and [server readiness](server-readiness-2026-11-09.md).
The Owner authorized the remaining fixes, including SDK contract changes, after the initial R3 correction. The earlier contract-blocked status is superseded by this implementation.

## Implementation and integration

| Finding | Correction and public-contract integration |
| --- | --- |
| R1 | Host keeps operation failures local and tolerates unused optional-provider failures. Both product compositions install a public-SDK Vault preservation gate before fatal abort. Refusal/failure retains live buffers, records APPLICATION_RECOVERY_BLOCKED and blocks destructive relaunch; successful preservation is recorded before teardown. |
| R2 | Drafts/DraftStorage 2.0 provide list and writer-specific load/save/remove. Saving requires an independent random 128-bit writer identity. IndexedDB schema 2 retains legacy records. Editor, drafts provider, storage, DocumentProtection and navigation are connected; competing candidates require explicit public Mantine-role selection, and selected content is copied to the new writer. Unselected records survive acknowledgement. |
| R3 | Editor and File Explorer liveness recognize SDK endpoint retirement while consumer scope is open. Background rejections are observed; unrelated permission failures propagate to explicit awaiters. |
| R4 | Discard waits for queued saves and confirms durable deletion before acknowledging. Result failures, thrown failures and failed queued persistence retain buffers and actionable errors. Failed post-save cleanup remains protected and retryable. |
| R5 | Workspace no longer intercepts document-wide Tab. Embedded forms and sibling views retain native traversal; CodeMirror keeps its own Tab behavior. |
| R6 | Trusted extensions can exclude built-ins, replace same-ID providers and specify kernel provider selections. Explicit extension grants take precedence. Required dependency validation still applies; the existing Files profile remains required for standard Vault navigation. |
| R7 | JSON and plain 5xx failures remain offline; ordinary business refusals do not imply loss of connectivity. Existing ConnectionChanged consumers receive the corrected classification. |
| R8 | Shared protocol defines a conservative 1 MiB raw UTF-8/binary content ceiling and separate 16 MiB encoded file-request ceiling. Client rejects excessive content before JSON array expansion, transport checks the envelope, and per-source capabilities expose the ceiling. Paired server advertises limits and enforces writes, HTTP admission and oversized disk reads. Smaller/incomplete advertised limits are incompatible; legacy protocol-1 servers use the documented conservative client ceiling. |
| R9 | Config initializes storage only. Vault persistence owns display-name policy through Config and PrepareVault. Public VAULT_METADATA_NAMESPACE retains the existing namespace without rewriting data; replacement Vault providers can consume the same public preparation contract. |
| R10 | Buffer cleanliness no longer proves recovery convergence. Clean flush waits for snapshots and removes obsolete recovery records before close; pending/failed recovery work remains protected. |
| R11 | Connection generation and ownership are established before publication. Superseded calls return cancellation, and old owners cannot retire replacements. Generation is rechecked after discovery/status publication, including reentrant connection changes. |
| R12 | Observation suppression, pending release and successful release are separate. Concurrent releases share work; failed releases retry the driver instead of reporting false success. Router and native driver contracts remain unchanged. Native explicit unwatch already retries the underlying request; automatic native/session cleanup remains its safety net. |
| L1 | Documentation states that only synchronous recursive disposal is detected directly; indirect asynchronous self-waits rely on cleanup deadlines. A public-kernel regression verifies STOP_TIMEOUT and retained pending-resource diagnostics. |

All twelve findings have implementations and automated regression coverage. No new plugin integration is knowingly outstanding for these corrections. This does not certify native visual behavior or Linux deployment.

## Verification

- Original R3 baseline reproduced: remote:check had 51 passes and one unhandled PROVIDER_UNAVAILABLE rejection. Its initial correction restored 52/52.
- Latest paired npm run server:check passed: 66 client/server tests with shared browser/desktop builds, public type fixtures and boundaries; 24 server source syntax checks and 21 server tests; three automatic development synchronization tests. No skipped server tests.
- Targeted checks passed for transport, filesystem provider, application host, Config/Vault persistence, editor, storage, drafts and Mantine, including affected consumers. Counts overlap and must not be added.
- Latest focused editor persistence regressions: 20 passed, including delayed-write/undo, delayed discard, failed/throwing discard, competing recovery selection and retryable acknowledgement cleanup.
- node tools/scripts/system-review.mjs: 24 desired-behavior regressions passed.
- node tools/scripts/deep-review.mjs: five desired-behavior regressions passed. Both scripts now verify corrected behavior; the original audit evidence remains historical at its cited revisions.
- UI localization: 18 bilingual catalogs, 349 messages, matching keys and parameters.
- Production npm run web:build passed. Vite retains its large-chunk warning (approximately 1.54 MB minified JavaScript); bundle splitting was outside this remediation.
- Documentation links and whitespace validation passed before final status commit.

## Remaining manual acceptance

- Workspace: Tab/Shift+Tab through Settings, Explorer create/rename and account forms, plus CodeMirror indentation. Check visible focus and opened controls.
- Two disposable real browser tabs: edit one file independently, go offline, restart and select competing recovery candidates. Confirm unselected drafts remain available, discard does not return, and undo followed by close does not restore obsolete text.
- Recovery choices inside real Workspace: both themes, long Russian previews, narrow/short windows and keyboard focus. Mantine owns only embedded controls; Workspace retains outer geometry and surfaces. Composed DOM/behavior tests pass; native appearance and geometry remain unverified.
- Server readiness: Docker is unavailable in this environment. Earlier permission/admission/development-workflow fixes are recorded in the server audit; Linux/root/nonmatching-UID container operation, actual installation/update and backup/restore still need the documented Docker smoke/manual checks.

No desktop automation was used. No manual acceptance or Docker execution is claimed complete.
