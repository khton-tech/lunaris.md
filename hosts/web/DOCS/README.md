# Browser host

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
