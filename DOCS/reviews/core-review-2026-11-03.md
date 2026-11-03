# Core review — 2026-11-03

## Decision

The current core passes its existing automated checks, but it is not ready to be treated as a stable lifecycle foundation. This review confirms **four defects: two P1 lifecycle defects and two P2 compatibility/diagnostic defects**. No P0 defect was confirmed.

R1 and R2 should block declaring the lifecycle stable and building plugins that rely on dependable resource shutdown. R3 should be resolved before relying on independently evolving contract packages. R4 does not block ordinary single-realm development, but leaves an observability gap for hosts integrating multiple JavaScript realms.

These are review gates based on the reproduced behavior, not evidence that all development must stop. The findings can be addressed within the current kernel and SDK contracts; no missing SDK function requiring plugin-side workarounds was established. Production code was not modified by this review.

## Evidence and scope

- Reviewed source revision: `b8fe25a6f3a11ec229ebea8b69b5f2d1600c7dae`.
- Review date: November 3, 2026, Asia/Yekaterinburg.
- Environment: Windows, Node `26.13.0`, npm `11.20.0`.
- Working tree was clean before the review. Deliverables are isolated on `docs/core-review-2026-11-03`; no merge was performed.
- Primary manual scope: all `packages/kernel/src` modules, the SDK context/plugin/token/data interfaces, manifest validation and version matching, and development-host composition/loading.
- Existing tests were inspected to establish coverage. Historical review documents and previous review scripts were not used as evidence or as a checklist.
- New reproduction: [`tools/scripts/audit-core-2026-11-03.mjs`](../../tools/scripts/audit-core-2026-11-03.mjs). Its plugin interactions use public SDK contexts; kernel management is exercised through the public host API.

Validation performed:

| Command | Result |
| --- | --- |
| `npm run check -- kernel` | Passed: 218 tests, zero skipped; build, boundaries, and type fixtures |
| `npm run check -- manifest sdk` | Passed: 268 tests, zero skipped; includes affected kernel, host, CLI, and test-kit consumers |
| `node tools/scripts/audit-core-2026-11-03.mjs` | Four expected invariants violated; exit status 1 |

The 218-test run is a subset of the subsequent 268-test run; these counts must not be added. The audit command deliberately returns a nonzero status while defects remain. It is a separate focused regression probe, not part of the normal check runner. Run `npm run build` before using it after source changes.

## Findings

### R1 — P1: closing the root scope leaves an unrecoverable active state for `start()`

**Source:** [`kernel.ts:153`](../../packages/kernel/src/kernel.ts#L153), [`kernel.ts:161`](../../packages/kernel/src/kernel.ts#L161), [`scope.ts:106`](../../packages/kernel/src/scope.ts#L106).

**Trigger:** Start a plugin, call and await its public `context.scope.dispose()`, then call `kernel.start(pluginId)`.

**Observed:** Disposal closes the activation signal and removes its publications, but leaves the registration state `active`. `#activate()` returns immediately for this state without checking whether the scope is closed. The second `start()` resolves successfully without invoking activation again. The reproduction records `starts=1`, `state=active`, and `aborted=true`.

**Expected:** A successful `start()` must leave a live activation. Following completed root disposal, starting again should create a fresh activation, just as starting a stopped plugin does.

**Impact:** Host state inspection reports a running plugin whose SDK operations throw `SCOPE_CLOSED`. Retrying start cannot recover it. Required consumers cannot bind to the closed provider, and applications that use `start()` to reconcile desired running state can remain unavailable indefinitely. An explicit host `restart()` is a recovery path, but the successful `start()` result conceals that recovery is required.

**Cause:** The root scope's close callback releases contracts and schedules dependent shutdown, but does not transition the owning registration out of `active`. The resolver already distinguishes live active scopes, whereas `#activate()` uses only the state string.

**Required change:** Keep root-scope disposal and registration lifecycle state consistent. Serialize completed root disposal with later starts, and only treat an activation as idempotently started when its scope is open. Do not merely remove the early return while permitting a new activation to overlap unfinished cleanup.

**Acceptance:** After awaited root disposal, inspection must not report a live active registration. A subsequent successful start must increment the activation count, provide a new activation ID, and expose an open signal and working API. Cover both a leaf plugin and a provider with required consumers, including asynchronous cleanup.

### R2 — P1: public root disposal destroys provider resources before required consumers finish

**Source:** [`scope.ts:130`](../../packages/kernel/src/scope.ts#L130), [`scope.ts:109`](../../packages/kernel/src/scope.ts#L109), [`kernel.ts:165`](../../packages/kernel/src/kernel.ts#L165), [`kernel.ts:230`](../../packages/kernel/src/kernel.ts#L230).

**Trigger:** Start a consumer bound to a required provider. Give the consumer an asynchronous disposer, then call `providerContext.scope.dispose()`.

**Observed:** The provider's own disposal work is queued before its close callback schedules consumer shutdown. Provider teardown executes while consumer cleanup is still pending. A simple completed-cleanup trace is `provider, consumer`; the focused probe additionally holds consumer cleanup behind an explicit gate and observes that provider teardown has already run.

**Expected:** Required consumers must finish their cleanup, or reach their enforced cleanup deadline, before provider resources are released. Awaiting root disposal should include the dependent shutdown outcome.

**Impact:** Consumers may still own work backed by a resource that has already been destroyed: a storage session, UI rendering target, driver connection, or another provider-owned handle. The same dependency graph has different shutdown semantics depending on whether the host calls `kernel.stop()` or the plugin uses its public root scope. API guards invalidating calls do not ensure safe disposal of previously allocated resources.

**Cause:** Normal `#stop()` waits for dependent operations before disposing the provider scope. Root `OwnedScope.dispose()` directly drains owned resources; its `onClose` callback starts `#stopDependents()` without awaiting the result. R1 concerns state and restartability; R2 concerns resource ordering and can remain even after fixing the state string.

**Required change:** Route disposal of an active root scope through dependency-aware lifecycle coordination, while retaining a distinct internal scope cleanup operation to avoid recursive disposal. Child scope disposal should remain local. Define how root disposal behaves during activation and from callbacks so the fix does not introduce a queue waiting on itself. Propagate dependent cleanup failures to the awaiting caller.

**Acceptance:** With a consumer disposer held pending, the provider disposer must not run. After releasing the consumer, the order must be `consumer, provider`. Repeat for a dependency chain, a consumer cleanup rejection, and a consumer cleanup timeout; provider cleanup must still be attempted according to the existing bounded-stop policy.

### R3 — P2: API acquisition accepts a provider older than the requested token

**Source:** [`access.ts:56`](../../packages/kernel/src/access.ts#L56), [`access.ts:88`](../../packages/kernel/src/access.ts#L88), [`api.ts:55`](../../packages/kernel/src/api.ts#L55), [`tokens.ts:111`](../../packages/sdk/src/tokens.ts#L111).

**Trigger:** A provider publishes `audit.contract@1.0.0`. A consumer declares range `^1.0.0` and calls `context.use()` with the `audit.contract@1.2.0` token. Both versions individually satisfy the manifest range.

**Observed:** Acquisition succeeds. Compatibility checks compare the major version and permission metadata, but do not reject the older implementation version. A method introduced by the 1.2 contract is absent from the returned handle, although the TypeScript return type promises the newer interface. Calling it fails with an ordinary `TypeError` instead of a contract acquisition error. The probe verifies that the original 1.0 method works, then fails because acquiring the 1.2 token does not throw.

**Expected:** A token representing a newer required API must not silently bind to an older implementation that can lack its additions. The manifest range alone does not establish this directional compatibility.

**Impact:** Contract-package upgrades can compile and start successfully, then fail only when a newly added method is used. Custom token validators can detect missing methods if supplied, but validators are optional in the public SDK and cannot be assumed as the baseline version check.

**Required change:** Define and enforce directional compatibility between the consumed token version and the actual bound provider version. At minimum, reject a provider older than the requested token at acquisition; preserve supported newer-provider/older-consumer behavior and the declared manifest range. Apply the resulting policy consistently to events and hooks rather than relying only on a major-string comparison. Use the existing version utility layer or extend it explicitly if a comparison helper is needed.

**Acceptance:** Provider 1.0/token 1.2 is rejected before returning a handle; provider 1.2/token 1.0 remains usable when the range permits it. Add cases for prereleases and 0.x contracts according to an explicit compatibility policy. The reproduction confirms the API case; it does not independently prove all dispatch variants.

### R4 — P2: rejected Promise values from another realm bypass API failure diagnostics

**Source:** [`api.ts:65`](../../packages/kernel/src/api.ts#L65).

**Trigger:** An API method returns a rejected Promise created in another JavaScript realm. The probe creates it with Node's `vm.runInNewContext()` and also calls an equivalent method returning a native Promise as a control.

**Observed:** Both rejections reach the caller correctly, but only the native rejection creates `API_CALL_FAILED`. The recorded count is one instead of two.

**Expected:** Asynchronous API failure diagnostics must not depend on which realm constructed a Promise. A foreign Promise is a valid asynchronous method result.

**Impact:** A host using multiple realms can lose API error records even when callers handle the rejection. This is an observability defect, not evidence of swallowed caller errors or an authorization bypass. The current development host does not itself create these realms; the failure requires an API implementation returning such a value.

**Cause:** `result instanceof Promise` checks against the kernel realm's constructor. Foreign Promise instances fail that check, so the diagnostic rejection handler is never attached.

**Required change:** Observe supported asynchronous results without relying on realm-local `instanceof`. Preserve synchronous method results, original rejection values, and the existing permission/lifecycle guards. Decide explicitly whether arbitrary thenables are included in the supported contract.

**Acceptance:** Native and foreign rejected Promises each create exactly one diagnostic and preserve the original rejection. Synchronous success/failure and ordinary asynchronous success must retain their existing behavior.

## Architecture and continuation requirements

The code already separates dependency indexing/resolution, lifecycle orchestration, scopes, API mediation, dispatch, permissions, and diagnostics. Public host management is separate from plugin contexts. The SDK provides contract tokens, provider/consumer APIs, events, hooks, resource ownership, cancellation, and permission requests. The development host supplies the platform scheduler and module loading. These existing components are sufficient places to address the confirmed defects; introducing another provider abstraction or parallel lifecycle engine is unnecessary.

The most immediate architectural inconsistency is that the root resource scope is both a plugin-accessible disposable and an entry point that bypasses the kernel's dependency-aware stop path. Resolve that ownership boundary first. Then make token-version compatibility explicit and repair Promise diagnostics.

Recommended order:

1. Address R1 and R2 together, with separate regression assertions for liveness and cleanup ordering.
2. Resolve R3 before treating contract minor-version upgrades as safe across interchangeable providers.
3. Address R4 before accepting diagnostics coverage for hosts using multiple realms.
4. Rerun the focused audit and affected package checks. All four probe assertions should pass after fixes, rather than changing them to accept the defective behavior.

No new plugin or subsystem was implemented. No SDK-only implementation blocker requiring a new callable API was demonstrated. Root disposal and token compatibility need a clear behavioral contract, and that contract should be documented alongside the implementation changes.

## Limits

This is a source review supported by existing tests and four new deterministic probes, not a proof that other defects are absent. It does not certify native drivers, Web/Capacitor/Tauri integration, UI behavior, isolation of hostile JavaScript, filesystem race resistance, or large-graph performance. No desktop automation was used. Suggested acceptance cases beyond the four probes remain requirements for the future fixes, not tests claimed to have run during this review.
