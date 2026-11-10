# Lime host runtime adapter

`createLimeRuntime(kernel, builtinIds)` is a trusted composition helper exported
by `@lunaris/application-host`. It creates `lunaris.lime-runtime-adapter`, which
requires Logger and PluginExecution, and provides `LimeRuntime` 1.0 from
`@lunaris/lime`. Only the host passes Kernel to the helper; consuming product
plugins receive the public token, never a kernel object or private host module.
The adapter itself needs the internal `runtime.manage` grant. The same permission
is required to consume its API and must not be granted to installed package code.

The adapter serializes all mutations after the SDK invocation unwinds, avoiding
synchronous lifecycle reentry. `open({ vaultId, generation })` closes/unregisters
the previous environment and requires a strictly increasing positive generation.
`close(environment)` releases the captured environment. Every operation compares
its captured Vault/generation with the current environment; stale requests fail.
Inputs to load/replace are captured before the asynchronous queue runs.

`register(environment, manifest, source, enabled)` defers package evaluation until
enabled activation, rejects collisions with protected/registered IDs and registers
the definition as owned by the adapter. The adapter depends on the execution
driver, producing guest -> adapter -> execution cleanup ordering. Required manifest
permissions receive automatic internal grants; the execution broker still denies
raw host management/native authority. Failed starts remain registered/failed for
inspection and explicit retry/removal; registration failure is not reported as an
active package. `enable`, `disable`, `replace` and `remove` operate on managed IDs
only. Successful code rollback still returns a failed replacement result.

`snapshot(environment)` returns immutable ID/version/state entries for managed
plugins only. LimeResult failures include STALE, NOT_FOUND, CONFLICT and
RUNTIME_FAILED. Original failures are logged with the adapter's source and retained
by kernel diagnostics. Environment/successful operation milestones use info.

Explicit runtime close must precede Vault root release. The adapter does not run
kernel management from a scope disposer; host shutdown already owns that queue.
It does not persist installations, enabled choices, package bytes, provider choices
or failed runtime snapshots. These belong to Lime and its Vault integration.

Integration tests run actual Kernel + adapter + QuickJS against public contracts,
covering enable/disable, replacement and code rollback, built-in collisions,
Vault generations and whole-host cleanup. The adapter is not yet installed in
normal product composition. Registry persistence, Vault transition coordination,
safe-mode entry, provider-choice planning/revisions and full native/browser
authority acceptance remain outstanding; this is not the completed Lime engine.
