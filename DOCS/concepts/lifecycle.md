# Kernel lifecycle and owned resources

P3–P6 implement `createKernel`, registration, dependency resolution, scoped APIs, events/hooks, permissions, stop/retry/restart, cancellation, deadlines and bounded diagnostics. See [contracts](contracts.md), [dispatch](dispatch.md) and [permissions](permissions.md) for the added behavior. See [the SDK reference](../reference/sdk.md) for plugin declarations and [execution decisions](../decisions/0002-lifecycle-execution.md) for constraints.

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

`ctx.provide` validates declarations, API method-only object shape, optional validator and canonical metadata. It stages registrations privately; inspection lists them only after activation succeeds. Metadata is checked again against active providers at commit so concurrent starts cannot publish conflicting metadata. A failed activation closes the scope, clears staging and runs rollback under the stop deadline. Every advertised API must actually be published before activation commits. Consumers access only scoped method handles. Restricted operations require effective host grants; declaring a permission does not grant it.

Resolve required/optional dependencies before execution, start selected providers before consumers and retain fixed bindings per activation. Missing/incompatible/ambiguous dependencies and cycles fail predictably. Event/hook endpoints commit automatically with their owner; staged owners cannot emit/run. Permission policy defaults to denial, supports explicit host grants/optional requests, and rechecks revoked access on every mediated operation.

## Ownership and cancellation

All API registrations belong to the root scope. `scope.own(resource)` owns an external `Disposable`; `scope.child()` creates an independently closable child. A disposable method's receiver is preserved. The same object owned multiple times within an activation is disposed once by the kernel. Registration disposables are themselves idempotent: an old disposed registration cannot remove a replacement registration with the same key.

Stop closes SDK access and clears publications first, then aborts the root and children, then runs the activation-returned teardown and all owned resources in reverse ownership order. Normal cleanup awaits each asynchronous disposer before the next. Children clean their own resources at their position in the parent order. Failures are aggregated and do not prevent remaining resources from being attempted. A disposed child is removed from its parent's ownership slots.

`scope.dispose()` closes/aborts immediately and shares its promise across concurrent external calls. Calling it on a parent from a directly executing child disposer is rejected as recursion. Calling it manually closes SDK access/publications but does not itself change host lifecycle state; use host stop/restart to transition state.

Abort listeners run in subscription order from a snapshot. Removed pending listeners are skipped; new listeners after abort are ignored; duplicate listeners are registered once. Listener throws/rejected promises are diagnosed and isolated from other listeners/cleanup. Cancellation listeners do not replace owned disposers and do not make stop fail by themselves. `signal.throwIfAborted()` throws the cancellation reason. Listeners are released after abort.

Late `scope.own` attempts disposal immediately and throws `SCOPE_CLOSED`. A disposable returned after an activation timeout is disposed immediately as well. Failed late cleanup/invalid teardown and late activation rejections are observed and diagnosed with the original activation ID. Stale contexts cannot publish into later activations.

## Deadlines and inspection

Activation timeout closes SDK access and reports `ACTIVATION_TIMEOUT`; rollback then gets its own stop deadline. Stop timeout reports `STOP_TIMEOUT` and attempts all remaining cleanup without waiting on a noncooperative disposer. A timeout cannot interrupt synchronous JavaScript or prove an external resource has released. Late cleanup may still settle or fail. The host scheduler must continue running for deadlines to fire.

`inspect()` returns frozen snapshots sorted by stable plugin ID. Each plugin snapshot contains its immutable manifest, state, last activation ID, committed contract keys, fixed provider bindings, effective grants and `ownedResources`. The counter includes queued/in-flight ownership slots and nested children, including child-scope ownership entries themselves. It returns to zero after cooperative cleanup; a hanging disposer remains counted. After an explicit retry, inspection describes the new activation, while diagnostics preserve failures from the old one.

Diagnostics retain the newest configured number of entries with monotonic sequence, stable code, plugin/activation/state and contract ID when known. Inspection includes only a generic object/value cause category: no thrown-object traversal, error message, arguments, implementation or payload. Raw causes remain in the bounded internal history and returned runtime errors. `stopAll` attempts every registered plugin with required consumers before providers and reverse stable ID tie breaks, aggregating errors. A `restart` is a stop followed by a fresh graph start; independent host requests can interleave between those operations.

Run `npm run check -- kernel` for public-boundary lifecycle/scope/deadline tests and negative host type fixtures. Tests use deferred promises and the manual scheduler, with no arbitrary sleeps or product UI.

### Pending graph operations (core review repairs)

A start reserves all affected plugin queues synchronously before dependency work
begins. A later stop of the root waits for that start, including dependency
preparation. Selection changes are rejected while a lifecycle operation is queued.
Stops also reserve their complete required-consumer graph synchronously, including
consumers whose starts are still pending. A running provider stop awaits only
already reserved consumer stops; it never appends work behind a future start while
holding the provider queue. Shared descendants are reserved once per stop request.
Sibling queues can drain independently; required consumers complete before their
provider cleanup. Reservations use reverse stable ID traversal.
`stopAll` reserves all stops before yielding and waits for the lifecycle queues
present at invocation before closing admission. Later operations queue behind those
reserved stops; shutdown is not a permanent registry lock.

A provider enters `stopping` before awaiting required consumers. Its scope closes
after those consumers drain, but its endpoint is unavailable throughout this
phase, including to other callers. A new required consumer cannot commit against
it. Consumer cleanup already runs with its own SDK scope closed.

Active plugins are leaves for startup execution: repeated start does not walk or
revive lost optional bindings. Explicit restart resolves dependencies afresh.
Consumer API validators receive a frozen mediated method facade; provider-side
validators still inspect their own implementation. Retained facade methods keep
all permission, publication and activation checks.

### Trusted host diagnostic detail

`kernel.diagnosticCause(sequence)` explicitly retrieves a frozen `{ cause: unknown }`
wrapper for a retained diagnostic. It returns `undefined` for an unknown or evicted
sequence, including invalid numeric values. A retained entry without a cause has
`{ cause: undefined }`. Detail uses the same bounded history and monotonic sequence
as `inspect().diagnostics`; there is no second retention buffer or persistence.
The returned cause is the original value by identity, with no property access,
serialization, cloning or sanitization. Retrieval is privileged and opt-in per
sequence, available only on the host kernel, never on plugin context.

A trusted host may inspect ordinary Error message/stack/cause or correlate error
identity. Raw causes can contain secrets, payloads or hostile proxies. The host
must apply its own access controls and redaction before logging or displaying
detail; kernel snapshots continue exposing only object/value categories. Hosts
that retain returned values extend their lifetime themselves. No mandatory logger
plugin or automatic export is introduced.

### Immutable metadata and lookup costs

SDK declaration caching applies only to immutable manifests created by the local
`definePlugin` factory and locally normalized tokens. Untrusted or shallow-frozen
manifests and mutable tokens still receive defensive validation. Kernel snapshots
of validated token metadata are reused only for frozen data tokens. Authorization,
activation identity, scope, provider availability and publication identity remain
dynamic checks on every mediated call; no permission decision is cached.

The kernel keeps one canonical immutable metadata record per committed contract,
with activation owners, and indexes dispatch subscriptions and providers by kind/ID.
Admission and commit reject conflicting metadata; commit validates the complete
transaction before publishing it. Per-call metadata comparison is constant-time
in the number of consumers. Scope closure releases ownership and the last owner
removes the canonical record. Canonical records omit validator closures; each
boundary still applies its own validator. Subscription disposal removes empty
buckets. Candidate lists retain version
filtering and sorted IDs. Dependency-free roots and idle active roots avoid graph
construction. Other roots traverse an incrementally indexed closure of all possible
outgoing dependencies, including optional edges and unselected/version-incompatible
candidates. Global sorted optional-edge decisions are preserved: no edge outside
this closed set can be reached from inside it or change its cycle decisions.
Incoming-only consumers and disconnected graphs are excluded. Late registrations
update existing consumers' potential edges. A densely connected relevant graph
can still be expensive; the index does not promise constant cost for every topology.

`node --expose-gc tools/scripts/benchmark-core.mjs <output.json>` records public API,
event and hook workloads across unrelated registry/subscription counts and manifest
sizes, plus isolated roots, chains, diamonds and optional cycles. V8 allocation
sampling uses a 32 KiB interval including collected objects; these are statistical
estimates, not exact allocation totals. Retained heap deltas after GC are separate
and can be negative. Instrumented timings include the benchmark caller and profiler;
compare equivalent runs, not uninstrumented historical samples. No production
latency budget or cross-platform guarantee is inferred from these local samples.
