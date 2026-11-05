# Application configuration directory

## Responsibilities

Required: persistent files outside any user-selected Vault, without platform paths
in plugins. Existing: filesystem operations, native capability confinement,
SDK permissions, cancellation and Logger. New: owned-root and application-directory
contracts. No SDK/kernel runtime changes. No config manager or TOML files are created.

`ApplicationDirectory` is provided by the filesystem provider and delegates to
`ApplicationDirectoryDriver`. Drivers are replaceable through SDK provider selection.
The Tauri host supplies its platform config directory; absolute paths never cross
the plugin boundary. Directory creation is lazy. See
[Tauri's path resolver](https://docs.rs/tauri/latest/tauri/path/struct.PathResolver.html#method.app_config_dir).

## Consumer usage

Require `api:lunaris.application-directory@^1.0.0` and
`api:lunaris.filesystem@^1.0.0`; declare and obtain host grants for
`filesystem.app-config` and `filesystem.access`, respectively.

```ts
import { ApplicationDirectory, Filesystem } from "@lunaris/filesystem";

const directory = ctx.use(ApplicationDirectory);
const fs = ctx.use(Filesystem);
const opened = await directory.openConfig(ctx.signal);
if (opened.ok) {
  const file = { vaultId: opened.value.id, path: "settings.toml" };
  const contents = await fs.readText(file);
  // NOT_FOUND is expected before the first write. No config format is imposed.
}
```

`openConfig(ownerSignal)` returns `FsResult<VaultRoot>`. The legacy names
`VaultRoot` and `FileTarget.vaultId` identify filesystem root capabilities;
an application root never becomes the active product Vault. Each call returns a
separate attachment to the same persistent directory. Closing an attachment
releases resources, not stored files. No selection dialog is needed.

`FilesystemRoots.selectVault(ownerSignal)` returns owned user-selected roots and
requires `filesystem.access`. Use `ctx.signal` or a child scope signal. The legacy
`Filesystem.selectVault()` remains available for low-level driver-session ownership.

## Durable folder locations

`FilesystemLocations` (`api:lunaris.filesystem-locations@1.0.0`) delegates to
`FilesystemLocationsDriver` and requires `filesystem.access`. Product UI should
use the higher-level `VaultLocations` API instead.

- `select(ownerSignal)` returns `FsResult<FolderLocation | null>` after a user
  selection. It does not attach a root or create Vault files. Cancellation is null.
- `attach(location, ownerSignal)` returns a new owned `VaultRoot` for ordinary
  filesystem operations. Late attachment after cancellation is released.
- `FolderLocation` contains an opaque serializable `reference` and a display
  `label`. A session root ID is never a persistent reference. Providers snapshot
  inputs and log only operation/error classifications.

The Tauri driver records canonical selected paths in individual atomic JSON files
under the host's application directory, `folder-locations-v1/`. A versioned hash
reference identifies each record. Re-selecting the same canonical path deduplicates
it; restarting the host does not invalidate it. Attach validates the reference,
record digest and canonical target, then opens a fresh capability. Unknown or moved
locations return `NOT_FOUND`; changed/corrupt records return `CONFLICT`; an
unsupported host returns `UNSUPPORTED`. Native paths do not cross the plugin API.
These are cooperative local capabilities, not isolation against hostile plugins
with application-config access. OS bookmark/permission restoration for other
targets belongs in their replacement drivers; no unsupported target is emulated.

## Closing and errors

`Filesystem.closeVault(id)` immediately blocks new operations, waits for all
provider-accepted operations (including dialogs/watches), then closes the native
root. Explicit IDs prevent context switches from redirecting writes. Concurrent
closes share a release. Failed releases permit retry and resume operations;
closed IDs return `VAULT_CLOSED`.

Owner cancellation requests a coordinated close inside the driver. Late selection results are closed
before returning `VAULT_CLOSED`. The driver owns signal subscriptions and waits for
automatic releases before ending its native session. Session shutdown releases
remaining native roots/watches independently. No closed SDK
handles are invoked from cleanup. Native dialogs may require manual dismissal.
Automatic release failures are retained for independent kernel cleanup diagnostics,
so cleanup never depends on a Logger that may already be stopping.

The separate application-directory SDK permission authorizes root acquisition;
ordinary filesystem access authorizes later I/O using that ID. This does not isolate
hostile same-window code. Only the host determines the platform directory.
Missing host support returns `UNSUPPORTED`; native access/creation failures return
normal `FsResult` errors. Existing path validation, write modes, conflict detection
and capability confinement apply to application roots.

## Verification

`npm run filesystem:check` runs targeted provider/driver/host and native tests,
type fixtures, boundaries, formatting, host compilation and frontend build.
Tests use temporary directories and injected transports; no windows/dialogs open
and no files are written into the user's actual application directory.
