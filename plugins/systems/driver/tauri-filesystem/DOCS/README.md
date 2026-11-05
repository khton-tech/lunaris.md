# Tauri filesystem driver

Provides `api:lunaris.filesystem-driver@1.0.0` and
`event:lunaris.filesystem-driver-changed@1.0.0`; requires Logger and the host grant
`filesystem.native`. All inter-plugin communication uses SDK contracts. Tauri IPC
is confined to `src/native.ts`; native implementations live in `native/`.

The default definition uses the native bridge. `createTauriFilesystemDriver(native)`
accepts an injectable request transport for tests. The first verified target is
Windows x64. No native dialog is opened during activation.

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
