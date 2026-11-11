# QuickJS execution driver

Purpose: execute package JavaScript in a separate interpreter heap instead of the
host JS realm. `@lunaris/quickjs-execution` exports the product driver definition
`lunaris.quickjs-execution`. It requires Logger and logs readiness, realm creation
and creation failures through its SDK context; cleanup uses kernel diagnostics.

## Public contract

The driver provides `PluginExecution` 1.0 from `@lunaris/execution`. Trusted host
consumers declare that API and `runtime.manage`. `create(identity, source,
capabilities, owner, limits?)` returns a realm with synchronous `call(exportName,
args)` and idempotent `dispose()`. Identity contains plugin ID, activation ID,
Vault ID and a positive generation. It is captured/frozen before evaluation.
No events or hooks are subscribed by this driver.

The guest receives no host JS object. The explicit guest facade is
`lunaris.call(operationName, ...jsonArguments)`; only supplied operations exist.
Each host callback receives the captured principal and copied JSON data. Functions,
DOM elements, promises and native handles are not transfer values. The host broker
must authenticate and bind operations before supplying them; this driver does not
infer filesystem or Config authority from method names or guest-provided IDs.

Modules are a captured package-relative map. Relative imports normalize inside
that map; missing, remote, Node and native modules fail. The entry's named exports
are callable. Entry evaluation and exported results must currently be synchronous.
The caller must use validated committed package assets; this low-level driver does
not inspect LUP, compare manifests or register definitions in the kernel.

`load(manifest, source, environment, owner, limits?)` returns a host PluginDefinition
without evaluating package code. Register it with
`kernel.register(definition, { ownerId: "lunaris.quickjs-execution" })`. Activation
creates a fresh realm, compares exported metadata with the inspected manifest,
then invokes the package's activate function through the SDK bridge. Its realm
cleanup is owned before guest resources, so guest cleanup runs first. Lifecycle
ownership ensures the execution driver stops after its loaded plugins.

The bridge supports synchronous/async method calls, callbacks, token validators,
events/hooks and owned scopes through interpreter-local function references.
Host promises become guest promises and guest jobs run under the same turn limit.
BigInt and Date use explicit tagged data. Cancellation signals keep live state and
round-trip only their own opaque signal reference; no native object is transferred.
Transfer handles are limited to 8192 per side. Two-sided weak proxy reclamation
releases unreachable callback handles; one-shot host promise subscriptions release
immediately. Whole-realm disposal remains the final ownership boundary. A real
interpreter stress test exceeds the pool size with 12000 transient callbacks and
4500 async calls, then verifies full shutdown. GC timing itself is nondeterministic.
SDK errors expose stable classifications without raw host paths;
original provider errors remain in kernel diagnostics.

Config calls are bound to the captured Vault and package namespace; global Config
and foreign-root filesystem targets fail. Raw native/application-storage/runtime
management contracts are denied. Logger attribution is forced to the package ID.
These wrappers cover the named providers, not every future provider or transitive
host service. All additional host-backed contracts require an authority review.
Real DOM elements and arbitrary host class instances require explicit adapters
and cannot be transferred by this bridge. Public Views/ActiveScreen now supports
custom layouts, controls and vector viewports using data/callbacks without DOM
transfer; see [the view contract](../../../../../DOCS/reference/views.md).

Defaults: 32 MiB interpreter memory, 256 KiB stack, 100 ms per guest turn.
Configuration caps are 128 MiB, 1 MiB stack and 1000 ms. Transfer data is bounded
to 1 MiB UTF-16 code units and nesting depth 64. Cancellation from the owner or
driver revokes the realm. Reentry is bounded to 32 nested turns, sharing the outer
deadline so synchronous validators/callbacks cannot reset their budget. Closure during a
host callback defers VM disposal until that turn unwinds. Each realm releases its
module handles, interpreter context/runtime and callbacks on disposal.

The interrupt handler bounds guest bytecode execution, not arbitrary time spent
inside a trusted host callback or every interpreter builtin. A synchronous host
operation must be bounded. This is not a hard real-time watchdog; browser/native
recovery and Worker supervision remain integration work. Memory limits cover the
guest runtime, not all host WASM/module/transfer allocations.

Implementation dependencies: pinned `quickjs-emscripten-core` and the separate
release-sync WASM variant at 0.32.0; debug/asyncify variants are not bundled. See its
[runtime and memory/interrupt documentation](https://github.com/justjake/quickjs-emscripten).
This preserves synchronous data calls without evaluating plugin code in the host's
JavaScript global environment. It does not make arbitrary host-object proxies safe.

## Integration status

Node tests run the actual WASM interpreter through public Kernel/SDK composition:
module containment, missing globals/native imports, synchronous capability calls,
captured identity, revocation, guest-loop interruption and transfer validation.
No desktop control tools are used. The shared browser/Tauri product composition
now includes this driver. Production web bundling verifies one 503 KiB release
WASM asset; real WebView/browser CSP execution and native authority acceptance
remain unverified. Tauri CSP permits wasm-unsafe-eval for the built-in interpreter,
while ordinary host unsafe-eval, arbitrary frames and objects remain forbidden.

The SDK adapter delivers captured `assets/` through `ctx.resources`; the host and
guest use the same bounded reader semantics, without a host path or URL. Capture
happens before queued activation. Update rollback restores the old byte snapshot.
Public declarative Views/viewport, awaited Vault orchestration, Lime loading,
runtime management and host safe-mode composition are implemented separately.
Still required: complete host-contract authority review and native/WebView
acceptance. Full extension parity is not yet established. Do not give third-party
code the privileged execution-management API through the broker.
