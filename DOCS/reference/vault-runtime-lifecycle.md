# Awaited Vault runtime lifecycle

Version 1.1 adds optional finite `settlementOrder` (default 0). Settlement runs
in ascending order, preserving registration order for ties. Runtime services use
0; product preparation uses 100 so runtime contributions exist before the prepared
workspace is exposed. Release/save guards retain their original ordering and
semantics. NaN and infinite orders are rejected. Version 1.0 consumers remain
compatible. See [product preparation](startup.md#awaited-product-preparation-2026-11-11).

`VaultLifecycle` 1.0 from `@lunaris/vault` is provided by Vault Manager.
Consumers require `vault.access`. `register(participant, owner)` installs an owned
participant with an ID, `beforeRelease(previous, next)` and
`settled(previous, current)` methods. Duplicate IDs return BUSY. Owner cancellation
removes the registration/listeners. No private filesystem or kernel object is passed.

The existing BeforeVaultRelease save-guard hook runs first. If any guard vetoes or
throws, runtime participants are not stopped. After all guards accept, participants
are awaited in registration order before closing the old native root. A failed
beforeRelease result prevents root release. Preparation still runs against the
candidate before this phase; preparation failure leaves old runtime untouched.

Settlement is awaited under the transition lock whenever a root changes or runtime
release was attempted. Initial open calls it with previous=null, current=new root;
successful close uses current=null. A failed old-root close or participant release
settles against the retained old root, allowing its runtime to recover. A settlement
failure is logged with the original error; it does not falsely roll back a root
already committed. The runtime participant must expose its own degraded state and
retry/recovery behavior. Plugins are not evaluated by this lifecycle contract itself.

Callbacks must not recursively transition Vaults: those calls return BUSY. Settlement
completes before the normal release listeners unlock and before detached VaultChanged
notifications. Ordinary VaultChanged subscribers retain their existing reentrant
notification behavior. Whole-host shutdown remains kernel dependency/scope ownership;
participants are not invoked after their SDK scopes close.

Targeted tests prove awaited initial readiness, runtime stop before root closure,
save-veto preservation, failed native release recovery and participant removal.
Lime registration into this contract remains separate engine integration work.
