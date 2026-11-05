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
Recent history, restoration, document state, unsaved-change prompts and product UI
are not implemented here.

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
