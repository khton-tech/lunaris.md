# Host registry mutations

`Kernel` from `@lunaris/kernel` now exposes `unregister(pluginId): Promise<void>`
and `replace(definition, { grants? }?): Promise<void>`. These are privileged host operations;
neither Kernel nor its implementation is exposed through PluginContext.

Both operations reserve an exclusive registry mutation boundary synchronously.
The host must await outstanding lifecycle operations before invoking them. Pending
operations or concurrent registry/lifecycle/selection/grant mutations reject with
`LIFECYCLE_INVALID`; callers can inspect/diagnose while a mutation runs. Direct
plugin callback reentry rejects with `LIFECYCLE_REENTRANT`. The future Lime
management adapter must serialize requests and validate environment/revision before
calling this host API. This kernel primitive does not itself implement that adapter.

Unregistration stops the plugin and its transitively bound active consumers,
including optional consumers, using existing required-consumer cleanup ordering.
It removes the registration, dependency index, effective grants and selections
owned by or pointing to that ID. Consumers remain stopped. A subsequent start
resolves against the remaining registry; stale handles remain invalid. Cleanup
failure retains the registration and reports `CLEANUP_FAILED` for recovery.

Replacement validates candidate metadata/host compatibility before stopping code.
It requires an existing registration of exactly that ID. It stops the affected
bound graph, registers new code, preserves still-declared effective grants and
compatible consumer selection keys, then restarts the previously active graph.
Optional consumers restart too; their old handles never rebind silently. Unrelated
services keep their activation identities. Previously inactive plugins remain
inactive. Changed requirements resolve under the standard dependency rules.

On activation/resolution failure it closes the candidate graph, restores previous
code, effective grants and selections, and restarts previously active consumers
with fresh scopes. The call still rejects with `ACTIVATION_FAILED` after successful
rollback. Candidate cleanup or rollback failure reports `CLEANUP_FAILED` and
recovery-required text; no false successful rollback is returned. Kernel diagnostics
retain original activation/cleanup causes under existing bounded retention.

An explicit grants option is copied/validated before any stop and installed before
candidate activation. This lets a no-prompt host apply newly declared permissions
on update. It cannot include undeclared/duplicate permissions. Omission preserves
only previous effective grants still declared by the candidate; revoked initial
grants never reappear. Replacement can drop an initial permission without failing
new registration, and rollback restores the previous exact grant set.

These operations do not reverse arbitrary data/native effects, terminate host
JavaScript or enforce built-in identity policy. The package manager must reject
built-in collisions before invoking them; execution and Vault boundaries remain
separate prerequisites. The public design is [Lime runtime boundary](../design/lime-runtime.md).

Targeted regression coverage includes required/optional consumer recovery,
unrelated activation preservation, stale handles, rollback, dependency-index and
selection removal, concurrent operations, pending activation, cleanup failure and
revoked initial grants.

## Active provider changes

`rebindProvider(consumerId, kind, contractId, providerId)` validates the matching
registered provider before stopping anything. It reserves a registry mutation,
stops the consumer and its active required/optional dependents, changes the explicit
selection and restarts the previously active graph. Provider implementations and
unrelated active services retain their activations. Existing handles remain revoked.
An unchanged explicit selection is a no-op. A stopped consumer stays stopped.

If candidate activation fails, the operation stops the attempted consumer graph,
restores the exact prior selection map and restarts the prior active graph. It
rejects with `ACTIVATION_FAILED` after successful rollback; rollback/cleanup failure
rejects with `CLEANUP_FAILED` and requires recovery. Normal dependency startup can
leave a newly started provider ready even when its consumer fails; this operation
does not uninstall providers or reverse external data effects. Concurrent/reentrant
management follows the same rejection policy as replacement.

`selectProvider` remains available for inactive composition. This kernel contract
does not persist choices or enforce Vault revisions: Lime's public runtime and
registry own those requirements before exposing a product action.

## Host lifecycle ownership

`register(definition, { ownerId })` adds a trusted host lifecycle dependency without
changing the package's public manifest. The owner must already be registered and
must differ from the child. Starting a child starts its owner first; ownership
cycles participate in normal dependency-cycle detection. Stopping/unregistering an
owner stops its children before owner cleanup. Owner replacement includes active
children in the restarted graph. Snapshots expose `ownerId` for diagnostics.

Unregistering an owner leaves stopped child registrations; starting them reports
`PROVIDER_MISSING` until an owner is registered again. Ownership edges survive
owner replacement/re-registration and are removed with the child. SDK contexts
cannot assign or modify this metadata. Execution hosts must register loaded
definitions with their execution driver as owner, so guest cleanup runs while its
interpreter is still available. A loaded definition that captures a specific driver
activation must be regenerated when switching execution-driver implementations;
ownership alone does not rebind private factory closures.
