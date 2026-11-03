# Kernel lifecycle and owned resources

P3 implements `createKernel`, registration, dependency-free activation, API staging, stop/retry/restart, cancellation, deadlines and bounded diagnostics. Consumers, provider selection and API handles are P4; event/hook dispatch P5; effective grants P6. See [the SDK reference](../reference/sdk.md) for plugin declarations and [execution decisions](../decisions/0002-lifecycle-execution.md) for constraints.

## Host setup

A host imports `createKernel` from `@lunaris/kernel` and supplies a `Scheduler`:

```ts
const kernel = createKernel({
  scheduler, // schedule(delayMs, callback): () => void
  activationTimeoutMs: 5000,
  stopTimeoutMs: 5000,
  diagnosticCapacity: 100
});
kernel.register(pluginDefinition);
await kernel.start(pluginDefinition.manifest.id);
const snapshot = kernel.inspect();
await kernel.stopAll();
```

The scheduler is a host responsibility, never given to plugins. Its callback runs asynchronously, once; its cancellation function is synchronous, idempotent and nonthrowing. Tests use a manually advanced scheduler with explicit synchronization. Native timers belong in a future host adapter; there is no Node/DOM import or timer-global dependency in the kernel. All durations must be positive finite numbers and capacity a positive safe integer. Missing/invalid configuration throws `LIFECYCLE_INVALID`.

Registration invokes the shared SDK definition/manifest validation and checks engine/SDK compatibility against runtime versions 0.1.0. It never invokes activation. Duplicate IDs fail atomically. Each kernel has its own registry, scopes, queues, activation counter and diagnostics. There is no singleton registry or required logger/command service.

## Transitions and transactions

`registered → resolving → starting → active → stopping → stopped`. Resolution/activation/stop failures end in `failed`. `start` on an active plugin is idempotent. `stop` on registered/stopped is idempotent and leaves that state unchanged. Each start from registered/stopped/failed creates a fresh scope and activation ID. `restart` stops first and starts only if stop succeeds. After a stop failure, explicit `start` from failed can create a new activation while a noncooperative old cleanup may still run; old scopes remain closed.

Management transitions queue per plugin. Simultaneous starts execute activation once; stop requested during start runs after activation settles or reaches its deadline. Synchronous calls to management from activation, abort listeners or disposers reject `LIFECYCLE_REENTRANT`. Arbitrary asynchronous host-closure self-waits cannot be attributed portably; deadlines bound them. Plugins must use SDK context, never capture host management APIs.

`ctx.provide` validates declarations, API method-only object shape, optional validator and canonical metadata. It stages registrations privately; inspection lists them only after activation succeeds. Metadata is checked again against active providers at commit so concurrent starts cannot publish conflicting metadata. A failed activation closes the scope, clears staging and runs rollback under the stop deadline. Consumers cannot access implementations in P3. Early restricted providers are denied; declaring a permission does not grant it.

P3 rejects required capabilities with `PROVIDER_MISSING` before activation because the graph resolver is not implemented yet. Optional API requirements bind absent. Event/hook operations validate declarations then reject `CONTRACT_UNAVAILABLE`. `permissions.has` returns false for declared names; optional requests return false; undeclared requests reject. These restrictions are explicit delivery boundaries, not functioning P4–P6 services.

## Ownership and cancellation

All API registrations belong to the root scope. `scope.own(resource)` owns an external `Disposable`; `scope.child()` creates an independently closable child. A disposable method's receiver is preserved. The same object owned multiple times within an activation is disposed once by the kernel. Registration disposables are themselves idempotent: an old disposed registration cannot remove a replacement registration with the same key.

Stop closes SDK access and clears publications first, then aborts the root and children, then runs the activation-returned teardown and all owned resources in reverse ownership order. Normal cleanup awaits each asynchronous disposer before the next. Children clean their own resources at their position in the parent order. Failures are aggregated and do not prevent remaining resources from being attempted. A disposed child is removed from its parent's ownership slots.

`scope.dispose()` closes/aborts immediately and shares its promise across concurrent external calls. Calling it on a parent from a directly executing child disposer is rejected as recursion. Calling it manually closes SDK access/publications but does not itself change host lifecycle state; use host stop/restart to transition state.

Abort listeners run in subscription order from a snapshot. Removed pending listeners are skipped; new listeners after abort are ignored; duplicate listeners are registered once. Listener throws/rejected promises are diagnosed and isolated from other listeners/cleanup. Cancellation listeners do not replace owned disposers and do not make stop fail by themselves. `signal.throwIfAborted()` throws the cancellation reason. Listeners are released after abort.

Late `scope.own` attempts disposal immediately and throws `SCOPE_CLOSED`. A disposable returned after an activation timeout is disposed immediately as well. Failed late cleanup/invalid teardown and late activation rejections are observed and diagnosed with the original activation ID. Stale contexts cannot publish into later activations.

## Deadlines and inspection

Activation timeout closes SDK access and reports `ACTIVATION_TIMEOUT`; rollback then gets its own stop deadline. Stop timeout reports `STOP_TIMEOUT` and attempts all remaining cleanup without waiting on a noncooperative disposer. A timeout cannot interrupt synchronous JavaScript or prove an external resource has released. Late cleanup may still settle or fail. The host scheduler must continue running for deadlines to fire.

`inspect()` returns frozen snapshots sorted by stable plugin ID. Each plugin snapshot contains its immutable manifest, state, last activation ID, committed API contract keys and `ownedResources`. The counter includes queued/in-flight ownership slots and nested children, including child-scope ownership entries themselves. It returns to zero after cooperative cleanup; a hanging disposer remains counted. After an explicit retry, inspection describes the new activation, while diagnostics preserve failures from the old one.

Diagnostics retain the newest configured number of entries with monotonic sequence, stable code, plugin/activation/state and contract ID when known. Inspection includes only a generic object/value cause category: no thrown-object traversal, error message, arguments, implementation or payload. Raw causes remain in the bounded internal history and returned runtime errors. `stopAll` attempts every registered plugin in reverse stable ID order and aggregates errors; P4 will extend shutdown to reverse dependency order.

Run `npm run check -- kernel` for public-boundary lifecycle/scope/deadline tests and negative host type fixtures. Tests use deferred promises and the manual scheduler, with no arbitrary sleeps or product UI.
