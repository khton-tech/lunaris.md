# Vault Manager

## Responsibilities

Required: one active Vault, explicit opening/switching/closing, preparation before
readiness, and lifecycle notifications. Existing: SDK APIs/events/hooks, Logger,
owned filesystem roots, cancellation, and coordinated filesystem closure.
New: `@lunaris/vault` contracts and `@lunaris/vault-manager`, implemented in
`plugins/systems/vault`. No SDK/kernel runtime extensions are needed.

The manager owns product context; the filesystem provider owns portable I/O and
the driver owns native roots/watchers. Global application storage is independent
of the active Vault; see [application storage](application-storage.md).
TOML parsing and `.lunaris` creation belong to the separate [config manager](config.md).
Document state, unsaved-change prompts and product UI are not implemented here.
Durable location selection/restoration is exposed separately through `VaultLocations`.

## Consumer API

Require `api:lunaris.vault@^1.0.0`, declare `vault.access`, and obtain its host grant.
Acquire `ctx.use(Vault)` during activation. Invoke `open()` from a user action;
never await a selection dialog during activation.

| Method | Behavior |
|---|---|
| `current()` | Immutable `{ id, name }` for the active Vault, or `null`. No absolute paths. |
| `open()` | Select and prepare a Vault; replace an existing active Vault after its accepted I/O finishes. Returns `VaultResult<VaultRoot \| null>`. Cancellation returns successful `null`. |
| `close()` | Close the active Vault after its accepted I/O finishes. Returns `VaultResult<null>`. With no active Vault, succeeds without emitting an event. |

`VaultResult<T>` is `{ ok: true, value }` or `{ ok: false, error }`. It preserves
filesystem failures and adds `BUSY`, `PREPARATION_FAILED` and `STOPPED`.
Concurrent transitions, including calls from preparation handlers, return `BUSY`
immediately. A caller may retry after the current transition finishes.

```ts
import { Vault, VaultChanged } from "@lunaris/vault";
import { Filesystem } from "@lunaris/filesystem";

const vaults = ctx.use(Vault);
const fs = ctx.use(Filesystem);
ctx.events.on(VaultChanged, change => {
  // Update context from change.current, including null on close.
});

// Run from a user action after activation.
const opened = await vaults.open();
if (opened.ok && opened.value) {
  const target = { vaultId: opened.value.id, path: "notes/example.md" };
  const read = await fs.readText(target);
}
```

Filesystem use separately requires its API declaration and `filesystem.access`.
Files always receive explicit Vault IDs. Snapshot that ID when work begins;
never look up `current()` again to retarget a pending save after switching.

## Explicit folder selection and opening

Require `api:lunaris.vault-locations@^1.0.0`, declare `vault.access`, and acquire
`ctx.use(VaultLocations)`. `select(ownerSignal)` returns
`VaultResult<FolderLocation | null>` without attaching or preparing a Vault.
The selected `{ reference, label }` is serializable; persist it for recent history.
The reference belongs to the driver and must never be parsed, used as a path, or
logged. The label is presentation text, not authority.

`open(location, { name? })` returns `VaultResult<VaultRoot>` and uses the selected
location without another dialog. Both methods share the existing transition lock;
concurrent selection/open/close returns `BUSY`. Opening attaches a manager-owned
root, prepares it, and replaces the old Vault only on success. Expired locations
return filesystem errors; no implicit fallback or folder creation occurs.

An explicit name is a trimmed, nonempty string of at most 200 UTF-16 code units,
without control characters. It is a display name; no subdirectory is created.
Config Manager persists it in the `lunaris.vault-manager` namespace before
readiness. Without that metadata provider, explicitly named opening fails rather
than claiming to save the name. Omitting the name restores stored metadata or
uses the native folder name. Invalid stored metadata rejects preparation.

`PrepareVault` and `VaultChanged` are now version `1.1.0` (compatible requirement
ranges remain `^1.0.0`). Preparation accepts optional `requestedName` and
`displayName`; handlers must preserve root identity and preceding errors.
Configuration preparation resolves/persists `displayName`; the manager applies it
after hooks complete. Successful `VaultLocations.open` change events include the
immutable location. Legacy `Vault.open()` remains available, but its events have
no persistent location and cannot populate durable recent history.

## Preparation and publication

Require `hook:lunaris.prepare-vault@^1.0.0` and `vault.access` to register an owned
`PrepareVault` handler through `ctx.hooks.register`. The manager runs this waterfall
with `{ vault, error: null }` after selecting the candidate, before closing the old
Vault. It waits for all handlers before publishing the candidate as active.

Handlers may use filesystem APIs with the candidate's explicit ID to prepare
resources. The config manager creates `.lunaris/config.toml` here. Return
the payload unchanged on success, or a new payload with `error: "reason"` to veto.
Preserve a preceding handler's error and never replace the candidate identity.
Handler ordering follows the SDK's priority/plugin-ID rules.

```ts
ctx.hooks.register(PrepareVault, async preparation => {
  if (preparation.error !== null) return preparation;
  // Await initialization through declared SDK services, then return preparation.
  return preparation;
});
```

Preparation rejection/exception or failed selection preserves the active Vault.
The manager releases the rejected candidate. A failed old-root close also
preserves the old context and releases the candidate. Successful preparation can
leave intentional file changes in a rejected candidate; there is no file rollback.

Require `event:lunaris.vault-changed@^1.0.0` and `vault.access` for notifications:

| Kind | Previous | Current |
|---|---|---|
| `opened` | `null` | Ready Vault |
| `switched` | Closed old Vault | Ready new Vault |
| `closed` | Closed Vault | `null` |

Events publish after the state commits and the transition lock is released.
Notifications are asynchronous; API success does not wait for all listeners.
Listeners may request another transition, so inspect payload IDs rather than
assuming the manager still has the state described by an earlier event.
Listener failure follows SDK diagnostics and cannot roll back a committed transition.
Cancellation, rejected preparation and redundant close produce no change event.
Whole-plugin shutdown uses scope cancellation rather than emitting from a closed SDK.

## Closure and lifecycle

During an explicit close/switch, `current()` continues to identify the old Vault
until closure completes. The filesystem provider rejects new work for its closing
ID and awaits accepted operations before releasing its native root and watchers.
Already-closed IDs remain invalid. Closing a root never deletes stored content.

Each attachment owns a child scope. The driver's owned-root contract observes its
cancellation and releases native resources without SDK calls during shutdown.
Late selections after shutdown cannot resurrect context. A stopped preparation
cannot publish readiness. Native selection dialogs cannot be forcibly dismissed;
the user may have to close an outstanding dialog manually.

Consumers must close/switch through Vault Manager. Independently closing its root
through low-level Filesystem bypasses product context; the manager tolerates an
already-closed root on its next close/switch but cannot infer such external closure.

## Composition and verification

The Tauri entrypoint is config manager; Vault Manager starts as its dependency,
receives filesystem access and starts its provider/driver/Logger chain.
Startup opens no dialogs.
Services and platform drivers remain replaceable through SDK host selection.

Run `npm run vault:check` for manager/contracts, affected filesystem/driver/host tests,
type fixtures and dependency boundaries. Run `npm run build --workspace
@lunaris/tauri` for the frontend bundle. `npm run filesystem:check` additionally
checks native storage, formatting and locked Rust compilation. Tests use injected
transports/temp directories and never automate desktop control.


Location APIs (1.1.0) expose `describe(reference)` to refresh a durable location
without attaching a root or preparing Vault data. The native driver returns the
full absolute display path in `label`; `reference` remains opaque authority.
Recent history refreshes legacy labels on listing and recording, retaining saved
labels on recoverable failures. Display paths must never be logged.

## Create a named child Vault

Require `api:lunaris.vault-creation@1.0.0`, declare `vault.access` and call
`ctx.use(VaultCreation).create(parentLocation, name)`. This creates a new direct
child directory of the chosen parent, obtains the child's durable location,
attaches/prepares that child and activates it. The create/select/open/close flows
share the manager transition lock. The name must be a portable single directory
segment of at most 200 UTF-16 code units, with no leading/trailing whitespace.
An existing destination returns ALREADY_EXISTS and is never opened or overwritten.
VaultChanged publishes the child location, so history reopens the child.
Preparation writes configuration only inside the child; it does not prepare the
parent. Failure preserves the active Vault. After successful directory creation,
a later cancellation/preparation/attachment failure can leave the new directory;
there is no unsafe recursive rollback. The user can select it explicitly or use
a different name. Existing VaultLocations.open display-name behavior remains
compatible; the Create UI uses this dedicated creation contract.
# Editor-safe release

BeforeVaultRelease 1.0 runs before the previous root is closed on every close or
switch route. It carries previous, next, nullable FsFailure and onSettled(listener).
Handlers may finish writes while the root is usable and preserve an earlier
failure. Rejection/throw retains the active Vault and releases the uncommitted
candidate. Completion runs on both success and failure, allowing temporary edit
locks to be released. Do not recursively request a Vault transition in a handler.
Forced shutdown and process crashes do not run this product transition guard.

Normal close awaits VaultChanged listeners after releasing the transition lock,
so desktop shutdown can safely stop plugins after the closing notification has
settled. Listeners may still request another transition; they run outside the lock.
Open/switch notification remains asynchronous.
