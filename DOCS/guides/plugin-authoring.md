# Independent plugin authoring

Supported toolchain: Node >=26.13.0 <27, npm >=11 <12, SDK/kernel/CLI 0.1.0,
LUP format 1. Tool packages are currently private; use the prepared local packed
distribution. Preparing it is not package registry publication.

Maintainers prepare the distribution with `npm run toolchain:build`; output is
`dist/lime-toolchain`. `npm run lime:dx` rehearses installation and authoring in a
temporary directory using packed artifacts and the npm cache, without checkout
links. It validates build, tests, packaging, inspection and dev shutdown.

## Bootstrap and the first package

In the supplied toolchain directory run:

```sh
npm install --ignore-scripts
npm exec -- lunaris-core create-plugin ./projects/my-plugin --id author.my-plugin
cd projects/my-plugin
npm install --ignore-scripts
npm run check
npm test
npm run pack
```

The generated project includes versioned SDK tarballs, a manifest, TypeScript
entry, focused test, English developer/agent guidance and npm scripts. Tarball
dependencies are inside the project; no source-checkout file links or absolute
CLI imports are generated. The installed parent toolchain supplies lunaris-core.
Ordinary third-party npm dependencies may require a network connection or cache.

`check` builds types and validates the declared entry/manifest. `pack` bundles all
static JavaScript/JSON imports plus optional assets/ into a new
`<plugin-id>-<version>.lup`; existing output is never overwritten. Increment the
manifest version for an update, or supply a new output explicitly:

```sh
lunaris-core pack . ./another-output.lup
lunaris-core inspect-package ./another-output.lup
```

Inspection never evaluates package code. Install through Settings / Third-party
plugins / Add plugin, inspect metadata and confirm. Updates select a new package
with the same ID; removal offers managed-data/settings retention. No registry
download or permission-selection dialog is introduced by the installer.

## Public imports and declarations

Use `definePlugin`, `defineApi`, `defineEvent`, `defineHook`, ownership and typed
contexts from `@lunaris/sdk`. Every product plugin requires `Logger` from
`@lunaris/logging` and logs through `ctx.use(Logger)` with ctx.pluginId as source.
No direct console, host/native bridge or private implementation imports.

Run `lunaris-core contracts` for the installed SDK package catalog. Add a public
contract dependency without editing bundler configuration:

```sh
lunaris-core add-contract @lunaris/components
lunaris-core add-contract @lunaris/active-screen
npm install --ignore-scripts
```

The command copies the matching versioned archive into tools/vendor and updates
package.json/overrides. Only SDK packages are available through add-contract;
host/kernel/tool packages are not plugin authoring APIs. Declare every consumed or
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
| @lunaris/components | Views; custom data/callback UI with shared controls and vector viewport |
| @lunaris/active-screen | ActiveScreen; register/select a novel application screen |
| @lunaris/localization | Localization, LocaleChanged; English-first localized UI |
| @lunaris/themes | Themes, ThemeChanged; semantic theme data |
| @lunaris/editor | EditorExtensions; cooperative editor contributions; host-object adapters must be verified before isolated use |

## Lifetime, dependencies and UI

Activation receives pluginId, activationId, signal, scope and declared SDK services.
Registrations belong to their signal. Own other resources with ctx.scope.own or a
child scope; release them on stop. Do not use SDK handles after scope closure.
Required dependencies start before consumers. Optional availability is fixed for
an activation; lost handles do not silently revive. Register shared contracts in
one public package; bundled copies share token metadata rather than object identity.

Novel screens use Views.register({ id, render(props) }, ctx.signal), returning
ViewNode data. Register that componentId with ActiveScreen and select explicitly.
Nodes support text, rows/columns/responsive grids, buttons, input/textarea,
themed select, checkbox and SVG drawing shapes. Actions receive typed values or
sanitized pointer/key data, never host DOM/framework events. Use localization for
visible labels. Containers own geometry/surfaces; embedded views remain transparent.
Raw React/Mantine/DOM rendering in consuming plugins is unsupported.

Store settings with Config using the plugin ID and explicit Vault scope. File
operations use `{ vaultId, path }`, with paths relative to that captured Vault.
Managed plugin data belongs under `.lunaris/plugins/data/<plugin-id>/`; deleting
managed data does not remove arbitrary documents the plugin created elsewhere.
Capture the Vault before an async operation and honor cancellation; never redirect
old work into a newly selected Vault. Global application storage and raw native
management are unavailable in installed code.

## Diagnostics and current limits

CLI failures have stable codes and nonzero exit status. Headless `inspect`/`dev`
activate trusted Node code; do not use them as a sandbox for unknown packages.
The development host supplies replaceable logging and retains bounded original
records without corrupting JSON output. Installed code uses a separate QuickJS
interpreter with memory/turn/transfer limits. Await/callbacks and owned cleanup are
bridged; arbitrary host class instances are not. Package assets need supported
resource contracts: `ctx.resources.text('assets/file.json')` reads bounded UTF-8
text, and `ctx.resources.read(path, offset, length)` reads up to 16 KiB of binary
data per call. Only this package's captured assets are available. These are not
host resource URLs; renderer media roles need explicit adapters.

Run `npm run core -- dev . --live` for a headless QuickJS session. After editing
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
Keep migrations within those locations to benefit from rollback. Native dialogs,
WebView execution, viewport geometry and visual
acceptance have not been established by Node tests alone.

If a needed SDK operation or adapter is unavailable, describe the required public
contract rather than importing private implementations or inventing an API. Read
the actual installed package exports/declarations and generated project AGENTS.md.
