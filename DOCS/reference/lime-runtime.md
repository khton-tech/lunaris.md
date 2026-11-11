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
tests separately cover failed rebind rollback and optional dependents. The Lime
engine persists choices in its Vault registry and restores them before startup.
The Settings Details panel consumes the plan with themed candidate menus and an
explicit Apply action; native visual acceptance remains pending.
The plan includes a prospective graph of every reachable compatible provider.
It lists each provider once, including disabled providers and the requirements of
each candidate. An empty candidate list indicates a missing compatible provider.
Lime previews substitute the candidate manifest without registering or evaluating
it. Install and update confirmations reject a changed graph revision. The graph
describes alternatives, while the kernel resolves actual bindings on activation.

## Update checkpoints

`suspend(environment, id)` stops the target and its active affected consumers, then
returns an opaque environment-owned checkpoint number. It retains the original
definition/resource snapshot, exact grants, target choices and previously active
IDs. Disabled packages remain unevaluated. While a checkpoint exists, ordinary
runtime mutations are rejected; replace is permitted only for its target. Host
composition must also avoid direct competing kernel lifecycle calls.

`replace` changes the stopped target without activating it. `resume(environment,
checkpoint)` starts the retained active graph against the current target definition.
The checkpoint remains available if activation fails. `rollback(environment,
checkpoint)` stops candidate work and restores original code/grants/choices while
leaving it inactive; the manager can restore durable managed data before resuming
old code. `finish` releases the retained checkpoint. Environment close/reopen
revokes every checkpoint; they are not portable recovery journals.

Actual isolated tests cover failed candidate activation, old resource restoration
before resume, dependent pause/resume, unrelated activation preservation, mutation
exclusion, stale generations and disabled updates. Durable data backup/journaling
is the engine's next integration; checkpoints alone do not provide data rollback.

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
