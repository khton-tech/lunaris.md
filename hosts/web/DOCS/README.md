# Browser host

For integrated local server development, run `npm run dev:server` from the main
repository after installing both repositories' dependencies and creating the
sibling server's `server.local.json`. Open `http://127.0.0.1:3101`.
Shared TypeScript compiles on save; Vite handles browser changes; the API restarts
after successful compilation or server-source/configuration changes. A serialized
restart releases the SQLite ownership lock before starting another API process.
The launcher uses a development-only origin/port override in memory and preserves
the config file, storage paths and policy. Stop any existing service on 3100/3101
first. Type errors are reported; failed builds are not announced as ready.
Dependency/lockfile changes still require `npm ci` and relaunching the command.
Use this workflow for local development; it does not deploy source edits to a
production server. API restarts interrupt requests; browser appearance and HMR
state preservation still require manual acceptance.

Run `npm run build --workspace @lunaris/web` to produce hosts/web/web-dist.
`npm run dev --workspace @lunaris/web` runs at port 3101 and proxies /api to 3100;
set the development server publicOrigin to http://127.0.0.1:3101 for browser writes.
Use HTTPS for network deployment so persistent browser storage and Web Crypto are
available. localhost is suitable for native development without Docker.

The host composes the same product modules as Tauri through application-host.
There is no Tauri IPC/native filesystem/window code in this composition. The
server serves the built bundle and API on one origin; browser credentials use
HttpOnly cookies and never enter product plugins.

LUNARIS_BUILD_ID generates immutable /bundles/<id>/ asset paths.
LUNARIS_FEATURES selects editor/files/settings entrypoints. The server's bundle
workflow pins the source revision and lockfile hash, packages the output and
activates it separately. Do not edit these build variables from untrusted input.

`node --test tools/scripts/remote-integration.test.mjs` requires the sibling server
checkout and tests real HTTP/SQLite/files, composed browser Workspace/CodeMirror,
offline local drafts, reopen/recovery and conditional remote saving. It uses JSDOM
for behavior, not appearance; native rendering, focus and geometry remain manual.

Production bundles compare their build ID with the active server release every
minute. A Mantine update notice closes the Vault through normal save/draft guards
before reloading. The browser navigation driver queries DocumentProtection before
unload and warns only when edits lack remote persistence and an acknowledged local
draft. Pending storage is never presented as durable recovery.

The files feature is required in the current profile because File Explorer owns
Vault switching. Editor/settings entrypoints may be selected by the administrator.
Creation through the account UI immediately opens/prepares the new Vault, following
the established local creation flow.
