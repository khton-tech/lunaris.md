# Core public boundary (design contract)

Status: accepted P0 specification. This page specifies the intended 0.1 API; it does not claim a runtime exists. Implementation status is tracked only in [the plan](../CoreImplementationPlan.md).

## Manifest

`PluginManifest` has required fields `manifestVersion: 1`, `id`, `version`, `engine`, `sdk`, `entry`, `provides`, `requires`, `permissions`, `optionalPermissions`. Unknown fields are rejected. Empty lists are explicit. IDs are lowercase dot-separated segments matching `[a-z][a-z0-9-]*` with at least two segments. Versions are full SemVer. `engine` and `sdk` are nonempty valid SemVer ranges. `entry` starts with `./`, identifies JavaScript inside the package root, and contains no backslash, URL, query, fragment, empty, `.` or `..` segment after the prefix. The local loader additionally checks real-path containment including symlinks before import.

`provides` entries: `{ kind: "api" | "event" | "hook", id: string, version: string }`.
`requires` entries: `{ kind, id, range: string, optional?: boolean }` (default false).
Permission IDs follow the same ID grammar. Lists have no duplicates; required and optional permissions are disjoint. Permissions are atomic names, with no wildcards, implicit hierarchy or URL parsing in 0.1. Names do not imply grants. A contract can declare separate `providePermission` and `consumePermission` names; any operation needing them requires declaration and an effective host grant. Shared contract packages define this metadata, not consumers.

`validateManifest(input: unknown, versions?: HostVersions)` returns `{ ok: true, manifest: PluginManifest }` or `{ ok: false, diagnostics: readonly ManifestDiagnostic[] }`. Optional host versions enable engine/SDK compatibility checks; hosts must supply actual versions before loading. Invalid objects are never executed. Validation copies data; caller mutation must not change registered metadata. Diagnostics identify code, plugin ID when valid and JSON-style field path. Schema validation is shared by the host and CLI, never reimplemented in a plugin.

## SDK surface

The following signatures are the design target; exact exported TypeScript declarations are introduced in P2. `MaybePromise<T>` means `T | Promise<T>`. `Disposable.dispose(): MaybePromise<void>` is idempotent. `CancellationSignal` exposes `aborted`, `reason`, `throwIfAborted()`, `addEventListener("abort", listener, { once? })` and `removeEventListener("abort", listener)`, with zero-argument listeners. It is structurally consumable by platform adapters; the core does not import DOM types. Platform APIs requiring native `AbortSignal` use a host/driver adapter rather than a cast in plugin code.

```ts
definePlugin({ manifest, activate }): PluginDefinition
// activate(context): MaybePromise<void | Disposable>
defineApi<T extends object>(metadata): ApiToken<T>
defineEvent<T>(metadata): EventToken<T>
defineHook<T>(metadata): HookToken<T>
// metadata = { id, version, providePermission?, consumePermission?, validate? }
// Event/hook validators return boolean; API validation checks implementation shape.
```

Tokens contain serializable identity metadata and phantom type information. Objects and validators need not share identity across installed package copies. Metadata is immutable. API implementations expose methods only; each method keeps its synchronous or asynchronous return shape, preserves the implementation receiver, and passes calls through the gateway. Non-method values, nested objects and callable API roots are unsupported and rejected. Exceptions/rejections from provider methods propagate unchanged after diagnostic capture. Validation never converts sync methods into promises.

```ts
interface PluginContext {
  readonly pluginId: string;
  readonly activationId: string;
  readonly signal: CancellationSignal;
  readonly scope: ResourceScope;
  provide<T extends object>(token: ApiToken<T>, implementation: T): Disposable;
  use<T extends object>(token: ApiToken<T>): T;
  optional<T extends object>(token: ApiToken<T>): T | undefined;
  readonly events: {
    on<T>(token: EventToken<T>, listener: (payload: Readonly<T>) => MaybePromise<void>): Disposable;
    emit<T>(token: EventToken<T>, payload: Readonly<T>): Promise<void>;
  };
  readonly hooks: {
    register<T>(token: HookToken<T>, handler: (value: T) => MaybePromise<T>, options?: { priority?: number }): Disposable;
    run<T>(token: HookToken<T>, value: T): Promise<T>;
  };
  readonly permissions: {
    has(permission: string): boolean;
    request(permission: string): Promise<boolean>;
  };
}
interface ResourceScope {
  readonly signal: CancellationSignal;
  own<T extends Disposable>(resource: T): T;
  child(): ResourceScope;
  dispose(): Promise<void>;
}
```

All registrations are automatically owned; `scope.own` is for external resources. A child is owned by its parent and can close independently. Disposal closes/aborts first, then awaits reverse-order cleanup, continuing and aggregating failures. `own` on a closed scope immediately attempts disposal and throws `SCOPE_CLOSED`; an asynchronous disposal failure goes to diagnostics. Cleanup is never silently detached. The activation-returned disposable runs before other owned resources. Calling `scope.dispose` closes SDK access; hosts still own plugin state transitions. Do not await a parent scope's disposal from its own disposer; reject recursive disposal as `LIFECYCLE_REENTRANT`.

Every use/optional/registration/dispatch checks manifest declarations, token metadata and scope. `use` requires a non-optional requirement; `optional` requires an optional requirement. Optional availability is fixed at activation. An absent optional returns undefined. A present handle whose provider is lost throws `PROVIDER_UNAVAILABLE`, including for optional consumers. No rebinding occurs. Tokens do not grant host operations, registry access, logger or commands.

An event/hook provider advertises it in `provides`; no explicit publish registration is needed. Activation commits its endpoint. Subscribers and hook handlers declare `requires`. During activation SDK registrations are staged; calls to committed dependencies are allowed, but emitting/running a provider's own uncommitted endpoint fails with `CONTRACT_UNAVAILABLE`. This prevents side effects through half-started providers.

## Host management API

`createKernel(options?)` returns a separate `Kernel` interface from `@lunaris/kernel`:

```ts
register(definition: PluginDefinition): void;
start(pluginId: string): Promise<void>;
stop(pluginId: string): Promise<void>;
restart(pluginId: string): Promise<void>;
stopAll(): Promise<void>;
inspect(): KernelSnapshot;
selectProvider(consumerId: string, kind: ContractKind, contractId: string, providerId: string): void;
grant(pluginId: string, permission: string): void;
revoke(pluginId: string, permission: string): void;
```

Options: positive finite activation/stop deadlines (default 5000 ms each), positive integer diagnostic capacity (default 100), initial grant map, and an optional asynchronous permission request callback receiving plugin ID, activation ID and permission. Default request result is false. Callback failure diagnoses `PERMISSION_REQUEST_FAILED` and rejects the request; callback approval only grants if the requesting activation is still current/open. A revocation generation prevents an older pending request from restoring a revoked grant. Host grant operations reject undeclared permissions. Provider selection can change only while the affected consumer is inactive, and must match its declared requirement. Snapshots copy/freeze state, selected providers, effective grants and bounded diagnostics without implementations, payloads or raw host objects.

Registration validates metadata and definition without invoking activation. No unregister or implicit replacement in 0.1. Failed registration leaves the registry unchanged. Starting an active plugin and stopping a stopped/registered plugin are idempotent. Repeated queued starts coalesce through state checks; stop queued during start runs after completion or deadline. Activation cannot call host management through SDK. If a host closure nevertheless reenters an in-progress management transition, reject `LIFECYCLE_REENTRANT` rather than deadlock. Required dependencies start first; optional providers already registered are selected and started too when resolvable, but their failure leaves the optional binding absent. Required cycles fail with the dependency path; optional cycle-closing edges bind absent and are diagnosed. Failed consumer activation leaves already committed dependencies running until explicitly stopped.

States: registered → resolving → starting → active → stopping → stopped. Resolution/start failures become failed. Stop on failed still performs any outstanding cleanup and retains failure evidence. Retry starts from failed; restart stops first then starts with a fresh activation ID and scope. Stopping a provider first closes/stops required consumers in reverse graph order; optional consumers remain active with invalid handles. Stop failure aggregates diagnostics and ends in failed, with all scopes closed. Timeouts close the scope and invalidate SDK access but cannot terminate JavaScript. Late activation-returned disposables are disposed immediately; a never-settling disposer cannot block disposal attempts for remaining resources beyond the stop deadline.

## Dispatch and error categories

Events snapshot subscriptions at dispatch start, in registration order. Before each invocation check current scope, provider availability and permissions: unsubscribed/closed entries are skipped. Each listener is awaited sequentially; listener failures are diagnosed and dispatch continues. Payload validation or caller authorization failure rejects emission before listeners. Nested emissions run immediately with a new snapshot; authors must avoid infinite recursion. Readonly payload types do not provide runtime deep isolation.

Hooks sort by ascending finite priority (default 0), then plugin ID, then registration order. Each handler receives the previous output; no handlers returns the original input. Validate input and each output when a validator exists. Failure rejects the pipeline and records a diagnostic; check cancellation, effective permissions and scope between handlers. Removing/closing a pending handler skips it. Nested runs start independent pipelines. Already-running callbacks are not forcibly interrupted by stop or revocation.

Stable code categories: `MANIFEST_INVALID`, `VERSION_INCOMPATIBLE`, `PLUGIN_DUPLICATE`, `PLUGIN_NOT_FOUND`, `LIFECYCLE_INVALID`, `LIFECYCLE_REENTRANT`, `ACTIVATION_FAILED`, `ACTIVATION_TIMEOUT`, `STOP_TIMEOUT`, `CLEANUP_FAILED`, `SCOPE_CLOSED`, `CONTRACT_UNDECLARED`, `CONTRACT_METADATA_CONFLICT`, `CONTRACT_UNAVAILABLE`, `PROVIDER_MISSING`, `PROVIDER_AMBIGUOUS`, `PROVIDER_UNAVAILABLE`, `DEPENDENCY_CYCLE`, `PERMISSION_DENIED`, `PERMISSION_REQUEST_FAILED`, `VALIDATION_FAILED`, `EVENT_LISTENER_FAILED`, `HOOK_FAILED`. Public runtime errors carry code and safe context; diagnostics additionally contain lifecycle state, activation ID, contract ID and cause where available. Payloads/arguments are omitted. Raw causes are retained internally; inspect returns safe cause summaries, not arbitrary error objects. A bounded ring retains the newest diagnostics and never calls a logger plugin.
