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

Defaults: 32 MiB interpreter memory, 256 KiB stack, 100 ms per guest turn.
Configuration caps are 128 MiB, 1 MiB stack and 1000 ms. Transfer data is bounded
to 1 MiB UTF-16 code units and nesting depth 64. Cancellation from the owner or
driver revokes the realm. Reentrant execution fails explicitly. Closure during a
host callback defers VM disposal until that turn unwinds. Each realm releases its
module handles, interpreter context/runtime and callbacks on disposal.

The interrupt handler bounds guest bytecode execution, not arbitrary time spent
inside a trusted host callback or every interpreter builtin. A synchronous host
operation must be bounded. This is not a hard real-time watchdog; browser/native
recovery and Worker supervision remain integration work. Memory limits cover the
guest runtime, not all host WASM/module/transfer allocations.

Implementation dependency: pinned `quickjs-emscripten` 0.32.0. See its
[runtime and memory/interrupt documentation](https://github.com/justjake/quickjs-emscripten).
This preserves synchronous data calls without evaluating plugin code in the host's
JavaScript global environment. It does not make arbitrary host-object proxies safe.

## Integration status

Node tests run the actual WASM interpreter through public Kernel/SDK composition:
module containment, missing globals/native imports, synchronous capability calls,
captured identity, revocation, guest-loop interruption and transfer validation.
No desktop control tools are used. Browser/Tauri WASM delivery/CSP and native
authority acceptance are unverified. This driver is not yet in product composition.

Still required: authenticated SDK broker, async/callback/resource bridges, scoped
renderer contract for arbitrary viewports, generation-bound Vault/Config adapters,
package loader, Lime runtime management and safe-mode host composition. In
particular this low-level JSON facade is not a replacement for the complete SDK
authoring surface, and full extension parity is not yet established. Do not give
third-party manifests the privileged execution-management token automatically.
