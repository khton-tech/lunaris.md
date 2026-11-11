# Lime host runtime

`LimeRuntime` from `@lunaris/lime` is the host-backed management API. Its
runtime.manage permission is internal composition authority; the isolated SDK
broker denies it. Lime receives this API rather than a Kernel instance.

All operations capture `{ vaultId, generation }`. Opening a new environment first
unregisters the previous managed graph; generation must strictly increase. Stale
environment calls fail with STALE. Built-in/host IDs cannot be replaced. Mutations
are serialized after the requesting SDK callback unwinds.

`register`, `replace`, `enable`, `disable`, `remove`, `close` and `snapshot` manage
isolated package definitions. Disabled packages remain outside the kernel registry
and cannot start implicitly as dependencies. Required and optional declared
permissions are granted before activation; native authority remains restricted by
the execution broker. Updates preserve code/resource rollback through the kernel.

## Dependency planning and selection

`plan(environment, pluginId)` returns immutable data:

- `revision`: runtime revision, invalidated by adapter mutations and observed host
  registry/lifecycle/binding/grant changes;
- `affected`: the target and its currently active required/optional consumers,
  transitively including lifecycle-owned children;
- `dependencies`: direct declared requirements with kind/ID/range/optional flag,
  explicit or currently bound selection, and compatible candidates with provided
  version and runtime state. Disabled installed candidates are included explicitly.

`selectProvider(environment, pluginId, kind, contractId, providerId, revision)`
rejects stale plans with STALE and incompatible choices with CONFLICT before
changing the graph. Only managed consumers can be changed. A disabled consumer can
remember a compatible disabled provider, but enabling it does not implicitly start
that provider: enable the chosen provider first. A registered consumer can bind
only to a registered provider. Active changes use Kernel.rebindProvider with its
affected-consumer restart and rollback semantics. Failed changes do not overwrite
the remembered selection. Disable/enable retains choices within the environment;
remove/close clears them.

Integration status: the public runtime adapter and actual QuickJS graph tests cover
planning, immutable candidate data, disabled-provider behavior, successful rebind
and stale confirmations, including changes initiated outside the adapter. Kernel
tests separately cover failed rebind rollback and optional dependents. Persisting
choices in the Lime installation registry and product settings controls remain
subsequent integration work; this API alone does not claim those are complete.
Plans currently disclose direct requirements and active affected consumers rather
than a full prospective graph. Other management operations still use environment
generation without an expected plan revision.

## Host ownership and recovery bootstrap

`createLimeRuntime(kernel, builtinIds)` is exported by `@lunaris/application-host`.
It creates lunaris.lime-runtime-adapter, requiring Logger, Vault and PluginExecution.
Guest ownership produces guest -> adapter -> execution/root cleanup order. Failed
starts remain registered/failed for explicit retry. The adapter logs original
failures, and kernel diagnostics retain their causes. Explicit runtime close must
precede Vault release; a scope disposer does not invoke kernel management while
host shutdown owns that queue. Durable installations belong to the Lime engine.

ApplicationDefinition.pluginRuntime enables protected adapter/policy composition.
HostSession creates LimeBootPolicy before entrypoints start, capturing the current
safe-mode choice. The policy is an essential host entrypoint and cannot silently
disappear while safe mode is requested. It is independent of product Logger,
Settings, Components and filesystem replacement. Installed code cannot consume
its runtime.manage facade through the guest SDK broker.

HostSession.startSafeMode respects the running application's save gate, tears down
the old session and starts with the host-owned policy already set. The independent
recovery shell exposes Open without third-party plugins in browser and desktop
hosts. The engine registers/inspects installed packages but does not evaluate them
until explicit resume. Enabled preferences remain intact. Cleanup-unsafe/frozen
host recovery retains the documented process-restart limitation.

Production browser bundling includes one release-sync QuickJS WASM asset. Tauri
CSP permits WebAssembly compilation through wasm-unsafe-eval; host JavaScript
unsafe-eval, arbitrary frames and objects remain blocked. Bundling/CSP source tests
do not establish native dialog, WebView, filesystem or visual acceptance.
