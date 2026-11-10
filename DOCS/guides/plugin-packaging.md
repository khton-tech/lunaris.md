# Build and inspect a local plugin package

Implemented commands in the existing `lunaris-core` executable:

```sh
lunaris-core pack ./my-plugin ./my-plugin-1.0.0.lup
lunaris-core inspect-package ./my-plugin-1.0.0.lup
```

In a source checkout, build the CLI and use `node packages/cli/dist/bin.js` in
place of `lunaris-core`. These commands do not establish an externally published
toolchain; registry publication remains separately authorized work.

Build TypeScript first so `manifest.json` points to an existing `.js`/`.mjs`
entry. Add required [display metadata](../reference/plugin-metadata.md).
`pack` validates the local manifest, bundles the entry and all statically imported
JavaScript/JSON dependencies into one ESM file at its declared package path, and
includes regular files from the project's optional `assets/` tree. No user bundler
configuration/plugin is loaded. No package code is evaluated during build/inspection.
Source project node_modules need not be installed by the package recipient.

The neutral-platform bundle rejects unresolved native/Node/external static imports.
Private public-package subpaths remain constrained by package exports. Dynamic
imports/computed globals can still exist in guest code; execution must enforce
its own module/authority boundary. Packaging is not a sandbox or a code trust test.
SDK dependencies are bundled; token metadata works across package copies.

The output uses the shared [LUP v1 codec](../reference/lup.md), validates the
result again and writes exclusively to a new filename. Existing output is never
overwritten. Asset symlinks, non-files, root escapes and format limits fail the
command. Move resources under `assets/` and refer to portable relative paths.
An asset existing in a container does not itself provide a runtime resource URL;
the execution/resource adapter remains responsible for that integration.

Both commands print a concise JSON result containing code, plugin ID, version,
digest, byte length and entry count. Inspection additionally prints manifest and
paths. Expected failures have stable codes and exit status 1, without raw causes.
Notable codes: `PACKAGE_METADATA_REQUIRED`, `PACKAGE_BUILD_FAILED`,
`PACKAGE_EXTERNAL_IMPORT`, `PACKAGE_SYMLINK`, `PACKAGE_PATH`,
`PACKAGE_ASSET_KIND`, `PACKAGE_WRITE_FAILED` and shared `LUP_*` codes.
The existing `inspect` command still activates trusted development directories;
use `inspect-package` for an inert package preview.

Integration status: CLI/codec package build and inert inspection are implemented
and tested together. UI install/update, live host attachment, portable external
scaffolding and installed-plugin SDK execution remain Lime work in progress.
