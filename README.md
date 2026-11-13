# Lunaris

Lunaris is a Markdown workspace with a plugin runtime and public TypeScript SDK.
The browser and Tauri desktop app use the same product plugins and application host.
The separate `lunaris-server` repository runs the HTTP API, manages accounts and
Vaults, and serves versioned browser builds.

```sh
npm ci
npm run build
```

Use Node 26.13 or later within major 26 and npm 11. See the
[development commands](DOCS/guides/contributing.md) for targeted checks.

| Task | Command or guide |
| --- | --- |
| Run the browser and server together with live reload | `npm run dev:server` · [local server development](DOCS/guides/server-development.md) |
| Run the desktop app | `npm run tauri:dev` · [Tauri setup](DOCS/guides/tauri-host.md) |
| Build a standalone server delivery | `npm run server:artifacts -- ../lunaris-artifacts` · [server artifacts](DOCS/guides/server-development.md#standalone-delivery) |
| Develop an installable plugin | `npm run toolchain:build` · [independent plugin authoring](DOCS/guides/plugin-authoring.md) |
| Learn the runtime and public SDK | [first-plugin quickstart](DOCS/quickstart/first-plugin.md) · [SDK reference](DOCS/reference/sdk.md) |

`packages/` contains the kernel, SDK, contracts and CLI. `hosts/application/`
composes the product, with browser and Tauri entry points under `hosts/`.
Built-in UI, services and drivers live under `plugins/`.
