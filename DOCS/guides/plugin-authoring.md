# Independent plugin authoring

[Plugin recipes](plugin-recipes.md) cover persisted settings, custom screens,
shared contracts, provider replacement, Workspace layouts, changes to existing
UI, and plugin-owned system operations.

Supported toolchain: Node >=26.13.0 <27, npm >=11 <12, SDK/kernel/CLI 0.1.0,
LUP format 1. Tool packages are currently private; use the prepared local packed
distribution. Preparing it is not package registry publication.

Use `lunaris-plugin-sdk-0.1.0-equal-plugins-ai.7z` with the Web or Windows
application built from the shared plugin runtime. The npm packages keep their
0.1.0 versions. The archive contains the local SDK and CLI packages, an npm
lockfile, the full developer reference, and example sources. The application
is distributed separately. Start from the archive root to browse `DOCS/` and
`examples/`. See [AI-assisted plugin development](ai-assisted-development.md)
for the bundled project instructions and skills.

Maintainers build the distribution with
`npm run toolchain:archive -- equal-plugins-ai` and the `7z` command on PATH.
`npm run toolchain:build` prepares the unpackaged distribution at
`dist/lime-toolchain`. Run `npm run lime:dx -- <archive>` to verify a packed
installation, project generation, build, tests, LUP inspection and development
shutdown in a temporary directory outside the checkout. This check uses the local
npm cache.

## Bootstrap and the first package

Extract the archive, open its root directory and run:

```sh
npm ci --ignore-scripts
npm exec -- lunaris-core create-plugin ./projects/my-plugin --id author.my-plugin
cd projects/my-plugin
npm install --ignore-scripts
npm run check
npm test
npm run pack
```

For an unpackaged toolchain directory without a lockfile, use
`npm install --ignore-scripts` for the first command.

When upgrading an existing project from an earlier 0.1.0 archive, generate a new
project with the same plugin ID inside the new toolchain. Move your source,
manifest changes and assets into the new project and add your contract
dependencies again. Older vendored tarballs can have the same file names as the
new ones. The CLI reports `TOOLCHAIN_CONFLICT` if those files have different
contents. Increment the plugin's manifest version when packaging an update for
an existing installation.

The generated project includes versioned SDK tarballs, a manifest, TypeScript
entry, focused test, English developer guidance, `AGENTS.md`, local skills and
npm scripts. Tarball dependencies are inside the project. No absolute CLI or
source-checkout file links are generated. The installed parent toolchain supplies
lunaris-core.
Ordinary third-party npm dependencies may require a network connection or cache.

`check` builds types and validates the declared entry/manifest. `pack` bundles all
static JavaScript/JSON imports plus optional assets/ into a new
`<plugin-id>-<version>.lup`; existing output is never overwritten. Increment the
manifest version for an update, or supply a new output explicitly:

```sh
npm run core -- pack . ./another-output.lup
npm run core -- inspect-package ./another-output.lup
```

Inspection never evaluates package code. Open a Vault, go to Settings → Plugins
and choose Add plugin in the Install from file row. Review the metadata and runtime
notice, then install and start the package or choose Install disabled. The
latter keeps the package inert until enabled, so you can configure its upstream
provider first.
For an update, select a package with the same ID and a newer plugin version.
Removal can retain package settings and managed data.

## Application execution model

Built-in and installed plugins on a given application platform share one
execution realm, SDK and permission policy. The standard Web and Tauri
compositions grant a plugin's declared permissions before activating it. The user
decides which packages to run. SDK declarations and activation scopes mediate
SDK use, and the shared JavaScript environment also exposes the capabilities of
the application's page. Disposing a scope cleans up resources the plugin owns.
It cannot undo arbitrary changes or external effects the plugin made.

Web and Tauri both support SDK access to the rendered application DOM.
Windows Tauri also provides `NativeProcesses`. A plugin can package its own
Windows executable to implement a system operation and publish a new SDK
contract. The helper runs with the user's OS rights. There is no additional
plugin class or trust tier. On a host without the process provider, a required
dependency on it prevents activation. Use an optional requirement and
`ctx.optional(NativeProcesses)` if the plugin can operate without it.

## Public imports and declarations

Use `definePlugin`, `defineApi`, `defineEvent`, `defineHook`, ownership and typed
contexts from `@lunaris/sdk`. Every product plugin requires `Logger` from
`@lunaris/logging` and logs through `ctx.use(Logger)` with ctx.pluginId as source.
No direct console, host/native bridge or private implementation imports.

Run `npm run core -- contracts` for the installed SDK package catalog. Add a public
contract dependency without editing bundler configuration:

```sh
npm run core -- add-contract @lunaris/components
npm run core -- add-contract @lunaris/active-screen
npm install --ignore-scripts
```

The command copies the matching versioned archive into tools/vendor and updates
package.json/overrides. Only SDK packages are available through add-contract;
host/kernel/tool packages are outside the authoring API. Declare every consumed or
provided token's kind, ID and compatible version/range in manifest.json. Imports
and a token object do not grant a declaration. Keep exported and file manifests
identical. Tooling validates before entry evaluation and the installed loader
compares metadata again before activation.

Useful contract packages and exported tokens:

| Package | Tokens / responsibility |
| --- | --- |
| @lunaris/logging | Logger; operation outcomes and original errors |
| @lunaris/config | Config, ConfigChanged; plugin namespace and Vault-scoped settings |
| @lunaris/filesystem | Filesystem, FilesystemObservation; explicit Vault-relative targets |
| @lunaris/vault | Vault, VaultChanged; active root identity |
| @lunaris/settings | Settings; owned categories/groups/items/sections |
| @lunaris/components | Views and ViewSurfaces for new UI, [ApplicationDom](../reference/application-dom.md) for extending the existing rendered UI |
| @lunaris/execution | [NativeProcesses](../reference/native-processes.md) for packaged Windows helpers |
| @lunaris/active-screen | ActiveScreen; register/select a novel application screen |
| @lunaris/workspace | Workspace, WorkspaceLayout; contribute to regions or provide a replacement layout |
| @lunaris/localization | Localization, LocaleChanged; English-first localized UI |
| @lunaris/themes | Themes, ThemeChanged; semantic theme data |
| @lunaris/editor | EditorExtensions; cooperative editor contributions |

## Lifetime, dependencies and UI

Activation receives pluginId, activationId, signal, scope and declared SDK services.
Registrations belong to their signal. Own other resources with ctx.scope.own or a
child scope; release them on stop. Do not use SDK handles after scope closure.
Required dependencies start before consumers. Optional availability is fixed for
an activation; lost handles do not silently revive. Register shared contracts in
one public package; bundled copies share token metadata rather than object identity.
Independent packages can export their own typed APIs, events and hooks with the
SDK. Each participating manifest declares the shared tokens. Package authors
control protocol versions and validators. The host resolves providers and checks
permissions across package boundaries.

Novel screens use Views.register({ id, render(props) }, ctx.signal), returning
ViewNode data. Register that componentId with ActiveScreen and select explicitly.
Nodes support text, rows/columns/responsive grids, buttons, input/textarea,
themed select, checkbox and SVG drawing shapes. Actions receive typed values or
sanitized pointer/key data, never host DOM/framework events. Use localization for
visible labels. Containers own geometry/surfaces; embedded views remain transparent.
For changes to existing UI, use ApplicationDom and own the inserted nodes and
observers in the activation scope. Selectors bound to existing markup can need
updates when that markup changes. On Windows, NativeProcesses lets a plugin
implement a new OS operation in its own executable and expose the result
through a plugin-defined SDK contract. Both contracts are available to installed
and built-in plugins on the same platform.

To rearrange Workspace while retaining its existing features, provide
`WorkspaceLayout` and return a portable tree of rows, columns and named regions.
Other packages can register a view for one of those regions through `Workspace`.
To provide a separate working interface, register a declarative view and mount it
through `ViewSurfaces` in a new slot under the product root. Mount ownership and
view ownership each end the surface when their signal aborts.

Use Config with the plugin ID and an explicit Vault scope for settings that
belong to the current Vault. File operations use `{ vaultId, path }` with paths
relative to that captured Vault.
Managed plugin data belongs under `.lunaris/plugins/data/<plugin-id>/`; deleting
managed data does not remove arbitrary documents the plugin created elsewhere.
Capture the Vault before an async operation and honor cancellation; never redirect
old work into a newly selected Vault. Use declared SDK providers for any
application-wide or native operations your plugin needs.

## Select a composition in the application

Use a Lunaris build that supports Vault composition and the contracts your
manifest declares. Earlier builds may share the same base SDK version while
lacking individual contracts or their providers. Review the dependency plan in
the package preview before installing.

Manage built-in consumers through the [Lime composition API](../reference/lime-runtime.md#vault-composition).
Read the current profile and revision with `Lime.composition()`. Submit provider
bindings and related disabled built-ins in one `Lime.applyComposition()` call.
The profile belongs to the current Vault. An empty profile restores default
bindings and enables built-ins.

Use Install disabled when the package needs an explicit upstream provider before
activation. Set that dependency in its installed package Details and then enable
it. This lets a decorator require and provide the same compatible contract while
delegating to a separate provider.

The user controls the profile. If the working interface hides Settings, use
Ctrl+Shift+F8 (Cmd+Shift+F8 on macOS) to restart in safe mode. In the browser,
the `safe-mode=1` URL query parameter also starts with host defaults. Safe mode
skips installed packages for recovery. Restart the application process if a
shared-realm side effect survives scope cleanup.

## Diagnostics and current limits

CLI failures have stable codes and nonzero exit status. Headless `inspect` and
`dev` without `--live` activate code in Node. Use `inspect-package` for metadata
inspection without activation. The development host retains bounded original
log records while keeping JSON output machine-readable.

Use `ctx.resources.text('assets/file.json')` for bounded UTF-8 assets and
`ctx.resources.read(path, offset, length)` for binary chunks up to 16 KiB.
`ctx.resources` exposes only the activation's captured package assets.
An asset path is a package key. DOM images and other renderers need bytes or
a URL in a form supported by the renderer.

Run `npm run core -- dev . --live` for a headless QuickJS session. It is a
development tool outside the application's plugin model. Test DOM and native
process behavior in the application. After editing
TypeScript, run the project build again and enter `reload` in the session.
Reload bundles all project roots before applying changes. Each changed package
replaces its code and restarts its affected consumers. If activation fails, the
CLI reports the runtime snapshot after the kernel attempts rollback. Enter
`stop` to release the session. Each live session owns a disposable, in-memory
Vault. The public Vault and Filesystem APIs support reading, writing, inspecting
and removing files in that session. Data survives a code reload and is discarded
when the session stops. The development driver caps files at 128 KiB and storage
at 16 MiB. Directory operations, native pickers, watches and application Vault
attachment are unavailable in this host.
Updates back up the package's managed directory and Vault Config namespace.
Keep migrations within those locations to benefit from rollback. Use focused
`@lunaris/test` fixtures for SDK dependencies after adding contracts to the
starter. Check native dialogs, WebView rendering and OS events manually in the
target application.

If a needed SDK operation or adapter is unavailable, describe the required public
contract rather than importing private implementations or inventing an API. Read
the actual installed package exports/declarations and generated project AGENTS.md.
