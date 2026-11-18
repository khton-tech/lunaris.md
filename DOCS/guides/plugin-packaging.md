# Build and inspect a local plugin package

From the toolchain directory, after building the plugin's TypeScript entry:

```sh
npm exec -- lunaris-core pack ./projects/my-plugin ./my-plugin-1.0.0.lup
npm exec -- lunaris-core inspect-package ./my-plugin-1.0.0.lup
```

In a source checkout, build the CLI and use `npm run core -- <command>`.
For portable packed tools and project generation, follow
[independent authoring](plugin-authoring.md). Registry publication remains separate.

Build TypeScript first so `manifest.json` points to an existing `.js`/`.mjs`
entry. Add required [display metadata](../reference/plugin-metadata.md).
`pack` validates the local manifest, bundles the entry and all statically imported
JavaScript/JSON dependencies into one ESM file at its declared package path, and
includes regular files from the project's optional `assets/` tree. No user bundler
configuration/plugin is loaded. No package code is evaluated during build/inspection.
Source project node_modules need not be installed by the package recipient.

Use package exports and bundle your static JavaScript dependencies. The
neutral-platform build rejects unresolved Node, native and external static
imports. The application loads the single bundled entry as an ESM module.
Relative dynamic imports from that entry are unsuitable for loading files
included as assets. Read those files via `ctx.resources`. SDK token metadata
works across separately bundled package copies.

The output uses the shared [LUP v1 codec](../reference/lup.md), validates the
result again and writes exclusively to a new filename. Existing output is never
overwritten. Omitting the output selects `<plugin-id>-<version>.lup` inside the
project. Asset symlinks, non-files, root escapes and format limits fail the
command. Move resources under `assets/` and refer to portable relative paths.
Installed code reads its own assets through [ctx.resources](../reference/package-resources.md).
An asset existing in a container does not itself provide a runtime resource URL.

On Windows, place a compatible helper executable under `assets/` and declare
`api:lunaris.native-processes@^1.0.0` to use
[NativeProcesses](../reference/native-processes.md). The SDK starts the helper
only when the plugin calls it during execution. The helper's binary bytes are
part of the LUP's inspected identity. A portable plugin can declare this
dependency optional and check availability on hosts without a provider. Use
manifest `targets` to state actual platform support.

Both commands print a concise JSON result containing code, plugin ID, version,
digest, byte length and entry count. Inspection additionally prints manifest and
paths. Expected failures have stable codes and exit status 1, without raw causes.
Notable codes: `PACKAGE_METADATA_REQUIRED`, `PACKAGE_BUILD_FAILED`,
`PACKAGE_EXTERNAL_IMPORT`, `PACKAGE_SYMLINK`, `PACKAGE_PATH`,
`PACKAGE_ASSET_KIND`, `PACKAGE_WRITE_FAILED` and shared `LUP_*` codes.
Use `inspect-package` for an inert package preview. The `inspect` command
activates development directories in Node.

Open Settings → Plugins in a Vault and choose Add plugin in the third-party
list. Preview and installation in the disabled state leave the entry
unevaluated. After activation, Lime loads the entry in the same JavaScript
environment as the application.
The user selects the package to run. SDK checks apply to both built-in and
installed packages, and packaging validates format and identity without making
claims about the safety of executable code.
