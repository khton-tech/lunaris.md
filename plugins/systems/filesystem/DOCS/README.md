# Filesystem provider

Also provides `api:lunaris.filesystem-locations@1.1.0`: `select(ownerSignal)`
and `attach(location, ownerSignal)`, delegating through
`api:lunaris.filesystem-locations-driver@1.1.0`. Selection does not attach/prepare
a Vault; attachment retains driver-owned cancellation. See
[durable locations](../../../../DOCS/reference/application-storage.md#durable-folder-locations).

Provides `api:lunaris.filesystem@1.0.0` and
`event:lunaris.filesystem-changed@1.0.0`. Requires the corresponding driver
API/event and Logger through SDK contracts. The host must grant
`filesystem.access`. Imports only SDK and shared contract packages.

Consumers use `ctx.use(Filesystem)` with explicit `{ vaultId, path }` targets.
API methods: `capabilities`, `selectVault`, `closeVault`, `pickFile`,
`pickDirectory`, `pickSaveLocation`, `readText`, `readFile`, `writeText`,
`writeFile`, `stat`, `list`, `createDirectory`, `remove`, `move`, `copy`,
`watch`, `unwatch`. Async methods return typed `FsResult` values.

The provider validates relative paths/write policy, snapshots write inputs,
logs operation outcomes/failures without contents, and forwards driver events
through an SDK-owned subscription. Expected domain failures do not throw through
the SDK. The driver owns native resources; this provider does not maintain an
active-Vault singleton or call SDK handles from cleanup disposers.

Also provides `api:lunaris.filesystem-roots@1.0.0` with `selectVault(ownerSignal)`
and `api:lunaris.application-directory@1.0.0` with `openConfig(ownerSignal)`.
Both return opaque root IDs usable with existing filesystem methods. Roots close
when the owner's signal aborts, including late dialog results. Closing rejects new
operations and awaits accepted operations before releasing the driver root.
Explicit close detaches ownership; driver shutdown releases remaining roots.

Application directory consumers require `filesystem.app-config` in addition to
`filesystem.access` for subsequent I/O. This provider now requires the
`ApplicationDirectoryDriver` API and both permissions. See the
[application directory reference](../../../../DOCS/reference/application-storage.md).

See the [complete API and lifecycle reference](../../../../DOCS/reference/filesystem.md).
Run `npm run filesystem:check` from the repository root.


Location APIs (1.1.0) expose `describe(reference)` to refresh a durable location
without attaching a root or preparing Vault data. The native driver returns the
full absolute display path in `label`; `reference` remains opaque authority.
Recent history refreshes legacy labels on listing and recording, retaining saved
labels on recoverable failures. Display paths must never be logged.

Provides `api:lunaris.filesystem-observation@1.0.0` for consumer-owned watches. See [owned observations](../../../../DOCS/reference/filesystem.md#owned-observations).

Provides `api:lunaris.directory-locations@1.0.0`; requires the matching directory-locations-driver API. `create(parent, name, owner)` exclusively creates a direct child and returns its durable location. See [child directory locations](../../../../DOCS/reference/application-storage.md#child-directory-locations).
