# Local server development

Keep `lunaris.md` and `lunaris-server` as sibling directories. No server Git
remote, source copying, container rebuild or web-bundle activation is needed for
normal local development.

## Initial setup

Use the repository-supported Node 26.13+ within major 26 and npm 11. From the main
repository:

```powershell
npm ci
Set-Location ../lunaris-server
npm ci
Copy-Item server.example.json server.local.json
Set-Location ../lunaris.md
npm run dev:server
```

Copy the example only when `server.local.json` does not already exist. Existing
configuration and Vault directories belong to the developer and must be retained.
The launcher reports a missing configuration instead of replacing it.

Open `http://127.0.0.1:3101`. The API runs on `127.0.0.1:3100`; Vite proxies browser
API requests to it. Stop an existing native service on these ports before starting
the combined launcher. Ctrl+C closes the compiler, Vite and API child process.

The launcher can also accept `SERVER_DIRECTORY CONFIG_FILE` positional arguments
after `npm run dev:server --`; both paths may be absolute. Without arguments it
uses the sibling server and its existing local configuration.

## Automatic synchronization

- Shared TypeScript source changes rebuild through project references. After a
  successful compilation, the API restarts with the new SDK/domain/logger output.
- Vite serves the current shared browser application and handles frontend HMR.
- Server source and local policy changes trigger a serialized API restart. The
  previous process releases SQLite ownership before its replacement starts.
- Compilation failures are printed and do not announce a new API as ready. A
  successful correction resumes synchronization automatically.
- Source checkouts and the config file are not rewritten by the launcher.
  Development origin/ports are overridden in memory; absolute storage directories,
  registration policy, retention and other settings are retained.

This workflow covers shared application modules, SDK packages, remote consumers
and native server services/drivers. New product plugins still need normal host
composition through public SDK contracts. Dependency/lockfile or project-reference
changes require the corresponding `npm ci`/launcher restart; the launcher does not
install dependencies while the application is using them. Desktop-specific
changes continue to use the Tauri workflow.

API restarts briefly interrupt requests. Ordinary conditional-save and local-draft
recovery behavior remains in the existing product plugins. HMR can reload the
browser; do not treat in-memory UI state as a durable backup.

## Local integration gate

```powershell
npm run server:check
```

This runs remote client integration, the real server checks, and development
synchronization tests. The latter compile a temporary shared-source probe and run
isolated API/Vite instances on temporary ports with temporary data. They verify a
compile-error/correction cycle, automatic API restart, preserved sessions/notes,
and automatic policy reload. Temporary probes and data are removed afterward.

`npm run ci` also invokes this gate for code checks when the sibling server is
available. For another server location set `LUNARIS_SERVER_DIRECTORY`. Set
`LUNARIS_SERVER_REQUIRED=1` when a runner must fail instead of reporting a missing
server checkout. Documentation-only checks do not launch this gate.

The current GitHub workflow has no server source checkout because the server is
local-only. It explicitly reports the absent server integration; full paired
remote CI remains pending until a source distribution method is chosen. No
remote repository, publication or production updater is configured here.

## Acceptance

Automated validation exercises real HTTP/SQLite/files and the development
supervisor; it does not establish browser rendering/HMR visual acceptance. Manually
open the development URL, register/create a Vault, save a note, change a shared UI
source and check the updated view. Check that pending edits survive the expected
save/draft flow when HMR reloads. Native desktop behavior remains a separate manual
acceptance item.
