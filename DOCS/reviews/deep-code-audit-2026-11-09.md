# Deep code audit: concurrency and persistence

Date: 2026-11-09, Asia/Yekaterinburg.
Baseline: `8af70e2` on `feat/maiami-night-theme`; product source is unchanged from the first audit's `a08d719`.
The working tree was clean before this follow-up. No product fix, merge, deployment or real-user-data operation was performed.

This follows the [first system audit](system-audit-2026-11-09.md). UI appearance and interaction acceptance are excluded at the Owner's request. The editor is inspected here as a persistence subsystem.

## Result

**Three additional defects were reproduced: one P1 and two P2.** Their IDs continue the first report, giving twelve actionable findings across both reviews. An additional kernel defensive limitation was reproduced and is listed separately because it requires a plugin to violate an explicit disposal rule.

| ID | Priority | Observation | Evidence |
| --- | --- | --- | --- |
| R10 | P1 | Undo to saved text allows clean close while an obsolete draft survives and is recovered | Deterministic DocumentSession probe with a delayed storage operation |
| R11 | P2 | Concurrent connections both use the second server; the first owner can retire the second connection | Public SDK transport, two independent child scopes, recorded fake HTTP URLs |
| R12 | P2 | Failed unwatch becomes a false success on retry without releasing the watcher | Observation coordinator with an injected transient driver failure |
| L1 | Defensive limitation | Async recursive disposal is not rejected as reentrant and falls through to timeout | Actual public kernel with virtual deadline |

The [new probe script](../../tools/scripts/deep-review.mjs) asserts observed faulty behavior. Exit zero confirms these observations; it does not certify product health. It uses no live network, native watches, real document files or persistent browser database.

## R10 — P1: undo to a clean buffer does not settle the recovery queue

Sources: [dirty predicate](../../plugins/UI/text-editor/src/session.ts#L37), [draft queue](../../plugins/UI/text-editor/src/session.ts#L48), [clean flush fast path](../../plugins/UI/text-editor/src/session.ts#L130), [disposal](../../plugins/UI/text-editor/src/session.ts#L163), [DocumentProtection](../../plugins/UI/text-editor/src/index.ts#L47), [browser close guard](../../plugins/systems/driver/browser-navigation/src/index.ts#L10).

Reproduction:

1. Load disk text `original`, version `v1`.
2. Edit to `temporary edit`. Its durable draft write begins but has not completed.
3. Undo/change back to `original`. The correct replacement draft is queued behind the first write.
4. `dirty` is now false; `dirty && !draftSaved` is false. `flush()` returns success immediately without awaiting the draft queue.
5. Dispose the session. Release the delayed first write. It stores `temporary edit`; the queued replacement sees an inactive session and returns CANCELLED without replacing it.
6. Open a fresh session: `temporary edit` is recovered as dirty against the still-matching `v1`, and normal autosave is eligible to write it back.

This is **not** the first report's two-tab overwrite (R2), nor failed explicit discard (R4). It needs one session, ordinary edit/undo and a successful but delayed storage write. No storage failure is injected. The current text being equal to disk is incorrectly treated as proof that durable recovery state is also settled.

The probe executes `flush()` before disposing, so adding a normal flush call to close is not sufficient by itself. Real browser scheduling may vary; the ordering is reproduced deterministically rather than presented as a recorded browser crash.

Impact: previously undone text can reappear and subsequently replace the saved document. The browser protection predicate does not describe this pending recovery work, and normal Vault release uses the same clean-flush path.

Required correction: distinguish buffer cleanliness from recovery-state convergence. Serialize removal/replacement of obsolete drafts behind in-flight saves, and do not declare a session safe until the final recovery state is durable. Define how browser unload is guarded while that work is pending. Do not bypass the Drafts SDK contract or rely on async work continuing after scope shutdown.

Owners/integration: DocumentSession, editor DocumentProtection, Drafts/DraftStorage and browser-navigation. Acceptance must include a delayed old write, undo-to-original, normal Vault close, page-close protection and reopen; the obsolete text must never be the sole recovery candidate. Review this together with R2/R4, while retaining distinct regression cases.

## R11 — P2: concurrent connect calls mix origins and cancellation ownership

Sources: [connect transition](../../plugins/systems/driver/server-transport/src/index.ts#L68), [owner registration and epoch capture](../../plugins/systems/driver/server-transport/src/index.ts#L70), [account facade](../../plugins/systems/account-session/src/index.ts#L31).

`connect(A, ownerA)` mutates shared `address` and retires the epoch, then awaits AccountSessionChanged publication. Before it installs its owner listener or captures its version, `connect(B, ownerB)` can replace the same state. Both continuations subsequently use B's address and capture B's epoch. The earlier call is not recognized as stale.

The probe starts both calls in the same turn and observes:

- Both return success.
- Both HTTP requests target `https://b.invalid/api/v1/server`; no request targets A.
- ConnectionStatus identifies B.
- Disposing ownerA clears B's connection even though ownerB remains open.

Only the final `unbindOwner` closure is retained, leaving the earlier owner callback attached until that owner aborts. Its callback unconditionally clears the current address rather than checking whether it still owns that connection generation.

The bundled account screen's busy flag reduces exposure from that screen. It does not serialize the public service for multiple plugin consumers, and the AccountSession facade has no global connection queue. This is therefore a service contract race, not a claim that two clicks in the existing busy form reproduce it.

Required correction: establish an operation generation and owner binding before the first await; use an immutable per-operation origin; recheck the generation after publication and before committing. A superseded owner's cancellation must not mutate a newer connection. Alternatively serialize connection requests with an explicitly documented cancellation policy. Reuse existing SDK cancellation signals.

Owners/integration: server-transport and account-session; verify consumers of AccountSessionChanged/ConnectionChanged and remote filesystem epoch guards. Acceptance: overlapping A/B connection attempts yield either explicit cancellation or serialized success, never a successful A result obtained from B, and cancelling A leaves B intact.

## R12 — P2: a failed watcher release cannot be retried

Sources: [observation unwatch](../../plugins/systems/filesystem/src/observation.ts#L14), [public filesystem forwarding](../../plugins/systems/filesystem/src/index.ts#L116). The native driver has its own end-of-session safety net, which does not make a still-live session's release successful.

The coordinator puts an ID in `retired`, detaches its owner listener and deletes the entry **before** awaiting the driver's removal result. If removal returns IO_ERROR, the public operation correctly reports that first failure. A second `unwatch` sees the retired ID and immediately returns success without calling the driver.

The probe models a driver that fails once and would succeed on retry. Observed result: first call fails, second reports success, driver called once, modeled native resource still active. This is a focused coordinator unit reproduction, not an injected failure in a live OS watcher.

Impact: watcher/handle resources may remain active for the lifetime of the Vault or driver session. Events are suppressed, masking the outstanding resource. Repeated transient failures can accumulate resources, and callers cannot recover through the same API despite receiving success on retry.

Required correction: separate event suppression, release-in-progress and successfully released states. Share an in-flight release promise; retain retryable bookkeeping on failure. A repeated call must retry or preserve the failure, not falsely acknowledge release. Keep owner cancellation and closed-scope behavior safe.

Owners/integration: filesystem provider observation coordinator, filesystem-router and native/remote watcher drivers. Review the native observation release helper's similar forget-before-remove policy as well; it is not counted as another independently reproduced defect here. Acceptance: first failure then retry invokes the driver twice and releases exactly once; concurrent releases do not duplicate native disposal; retired events remain suppressed.

## L1 — recursive cleanup protection only covers the synchronous callback portion

Sources: [invocation flag](../../packages/kernel/src/scope.ts#L128), [disposal guard](../../packages/kernel/src/scope.ts#L143), [documented prohibition](../reference/core-boundary.md#sdk-surface).

An owned disposer executing `await Promise.resolve(); await ctx.scope.dispose()` creates a self-wait. `#invoking` is cleared as soon as the async function returns its Promise, so the later call receives the existing disposal promise rather than a `LIFECYCLE_REENTRANT` rejection.

The public-kernel probe confirms that stopping reaches STOP_TIMEOUT, the plugin becomes failed, and an owned pending resource remains visible. The deadline does prevent the host stop operation from hanging forever. The probe leaves only an unreachable Promise cycle, not a real timer or native resource.

**Classification:** a verified defensive/documentation limitation, not an ordinary valid-plugin lifecycle failure. The repository explicitly prohibits awaiting a scope's disposal from its own disposer. Do not inflate this into another P1 kernel defect or claim arbitrary async JavaScript can be terminated.

Action: state precisely that synchronous recursion is detected while indirect asynchronous self-waits rely on cleanup deadlines. Add a regression for this diagnostic/timeout behavior and explain the valid teardown pattern: a disposer cleans its own resources and never awaits the containing scope. A broader async ownership-tracking redesign requires evidence of real need; it should not block the three bounded fixes above.

## Additional paths inspected and conclusions

- Kernel resolver/index, access gateways, permission epochs, scope teardown and diagnostics: no additional valid-caller permission bypass or contract-version defect established. This does not extend the trust model beyond a single trusted JavaScript realm.
- Filesystem root coordination, mutation guards and native operation code: roots track in-flight calls; native writes use temporary files and version checks. Native directory copy is explicitly documented as non-transactional, so partial copy on failure was not filed as a new atomicity bug. External-process races remain within the documented optimistic-concurrency boundary.
- Config serialization and queued writes: unsafe keys/accessors are rejected, writes carry expected versions, and external conflicts remain failures. No new reproduced lost-update case established for Config itself.
- Vault lifecycle, active-document transitions and history: inspected asynchronous transition/persistence ownership. Generic hanging hooks remain the liveness risk already recorded in the first report, not a duplicate new finding.
- Server disk/catalog/accounts/HTTP: inspected conditional writes, path checks, authentication admission, catalog transitions and cleanup. Disk reads and binary JSON materialization remain synchronous and unbounded for externally populated large files. This warrants bounded-memory transport work and measurement; no resource-exhaustion experiment was performed, and this overlaps the first report's remote limits issue rather than adding a separately proven vulnerability.
- Other preference `alive()` checks still resemble R3 from the first report. They were not relabeled as new independent failures without reproductions.

## Verification and limits

- `node tools/scripts/deep-review.mjs`: all three new defect observations and L1 confirmed.
- `node tools/scripts/audit.mjs --docs-only`: 65 documentation files, local file links passed.
- Existing targeted tests: **52 passed**, command below. These pass despite the new observations; they do not cover the reproduced orderings.
- No product source changed; probes execute the existing built modules corresponding to unchanged source. The first report's failing real-server shutdown gate remains unresolved; passing these targeted tests does not supersede that result.

```powershell
node --test --test-reporter=dot packages/kernel/test/scopes.test.mjs packages/kernel/test/root-disposal.test.mjs plugins/systems/driver/server-transport/test/transport.test.mjs plugins/systems/filesystem/test/provider.test.mjs plugins/UI/text-editor/test/session.test.mjs plugins/systems/driver/browser-storage/test/storage.test.mjs
```

Recommended implementation order: resolve R10 alongside R2/R4 data preservation, then R11 session ownership, then R12 watcher release bookkeeping. Keep R3's failing integration test as a required completion gate. No additional public SDK surface was demonstrated necessary for R11/R12; any writer-safe draft contract changes remain subject to the R2 SDK design gate.
