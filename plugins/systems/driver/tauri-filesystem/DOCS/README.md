# Tauri filesystem driver

Also provides `api:lunaris.filesystem-locations-driver@1.1.0` with `select(owner)`
and `attach(location, owner)`. Native `selectLocation` persists an opaque reference
without attaching/preparing a Vault; `attachLocation` restores a registered folder
without a dialog. The native registry lives in the application config directory;
Authority-bearing paths remain native; labels expose display paths only. Owner cancellation releases late attachments. See
[location persistence and errors](../../../../../DOCS/reference/application-storage.md#durable-folder-locations).

Provides `api:lunaris.filesystem-driver@1.0.0` and
`event:lunaris.filesystem-driver-changed@1.0.0`; requires Logger and the host grant
`filesystem.native`. All inter-plugin communication uses SDK contracts. Tauri IPC
is confined to `src/native.ts`; native implementations live in `native/`.

The default definition uses the native bridge. `createTauriFilesystemDriver(native)`
accepts an injectable request transport for tests. The first verified target is
Windows x64. No native dialog is opened during activation.

Also provides `api:lunaris.application-directory-driver@1.0.0`, whose
`openConfig(ownerSignal)` attaches a fresh root at the trusted host's application config
directory, creating it when needed. It returns only an opaque root ID/name and
shares normal filesystem I/O, confinement and session cleanup. The host supplies
`app.path().app_config_dir()` through `Backend::with_config_directory`;
callers cannot provide absolute paths. Without host support it returns `UNSUPPORTED`.

`api:lunaris.filesystem-roots-driver@1.0.0` exposes `selectVault(ownerSignal)`.
Owned selection/config roots close through the raw native transport when their
owner aborts, after accepted driver operations finish. This remains safe while
SDK dependencies stop. Automatic cleanup failures are retained and reported through
independent kernel cleanup diagnostics; cleanup never uses Logger. Late selections
are retired, and explicit close detaches the owner's subscription.

The callable API has the same methods as the provider: `capabilities`,
`selectVault`, `closeVault`, `pickFile`, `pickDirectory`, `pickSaveLocation`,
`readText`, `readFile`, `writeText`, `writeFile`, `stat`, `list`,
`createDirectory`, `remove`, `move`, `copy`, `watch`, `unwatch`.

`watch` owns a native watcher until explicit `unwatch`, Vault closure or driver
shutdown. Native notifications emit `DriverFileChanged` via the SDK; no SDK event
is consumed by this driver. Late callbacks are filtered after closure. Native
session cleanup is scope-owned and does not call Logger or closed SDK handles.

The host must register `filesystem_request`, manage the native backend and grant
the matching Tauri command permission only to the intended local window. This
does not isolate hostile JavaScript running in that trusted window.

See the [API, guarantees, limits and manual acceptance](../../../../../DOCS/reference/filesystem.md).
Run `npm run filesystem:check` from the repository root. Native dialogs and their
visual behavior require manual acceptance; tests never open them.


Location APIs (1.1.0) expose `describe(reference)` to refresh a durable location
without attaching a root or preparing Vault data. The native driver returns the
full absolute display path in `label`; `reference` remains opaque authority.
Recent history refreshes legacy labels on listing and recording, retaining saved
labels on recoverable failures. Display paths must never be logged.

Provides `api:lunaris.filesystem-observation-driver@1.0.0` for provider-owned native observations. Cancellation releases even late-created watches without invoking consumer SDK handles; explicit unwatch and root closure detach ownership. See [owned observations](../../../../../DOCS/reference/filesystem.md#owned-observations).

Provides `api:lunaris.directory-locations-driver@1.0.0`, using native `createLocation`. This creates a direct child with exclusive capability-relative mkdir and registers its durable reference. Cancellation never falls back to attaching the parent; pre-existing children are preserved.
# Source routing

The driver additionally provides LocalFilesystemBackend API and its changed event.
This flat, SDK-mediated contract reuses the same native session, owned roots and
watches as the legacy driver APIs. A host may compose Filesystem Router above it
without importing this implementation into a consumer. Legacy composition remains
supported. Host selection must route the filesystem provider consistently; merely
registering both legacy drivers and router does not establish integration.

