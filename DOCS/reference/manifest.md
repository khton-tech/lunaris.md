# Manifest validation

Implemented in P2 by `@lunaris/manifest`. The field schema is specified in [the public boundary](core-boundary.md#manifest). `validateManifest(input, versions?)` returns an immutable success snapshot or immutable field diagnostics; it never imports the entry or executes activation.

```ts
import { validateManifest } from "@lunaris/manifest";
const result = validateManifest(parsedJson, {
  engineVersion: "0.1.0", sdkVersion: "0.1.0"
});
if (!result.ok) {
  // Report diagnostic.code, diagnostic.pluginId and diagnostic.path.
}
```

Without the optional host versions, only schema/range syntax is checked. Hosts must supply their actual engine/SDK versions before registration/loading. `MANIFEST_INVALID` indicates malformed metadata; `VERSION_INCOMPATIBLE` indicates an invalid/incompatible supplied host version. There is no default grant or entry evaluation in validation.

The validator accepts plain data objects (including null-prototype objects) and dense arrays. Accessors, unknown fields, duplicate declarations, duplicate/overlapping permissions and nonserializable field values fail. Returned arrays/entries are copied and frozen; modifying the source cannot alter a validated manifest. Arbitrary proxy traps are not a security boundary; inspection exceptions return a root diagnostic. Actual filesystem and symlink containment belongs to the future development loader.

Exact versions reject `v` prefixes, whitespace and incomplete forms; build metadata is preserved. Ranges and prerelease matching use pinned [`node-semver`](https://github.com/npm/node-semver#readme) semantics. `versionSatisfies` returns false for malformed input and does not opt into all prereleases. ID/version/range helpers are public so SDK/runtime validation shares these rules.

Run `npm run check -- manifest` for the validator, affected consumers and negative type fixtures.

## Deployment targets

Optional `targets` records the author's support assessment per deployment target:

```json
"targets": { "web": "supported", "android": "unadapted", "ios": "unsupported" }
```

Keys are `web`, `windows`, `macos`, `linux`, `android` and `ios`. `web` means
the browser deployment, including mobile browsers; native wrappers use their OS
target. Window width, input capabilities and responsive layout are independent.
`supported` means adapted for normal use; `unadapted` means the plugin may run
but needs adaptation/acceptance; `unsupported` means it cannot be used on that
target. Missing entries (and legacy manifests without `targets`) mean undeclared,
never implicitly supported. Do not mark targets supported without verification.

This is advisory metadata, preserved by validation, SDK definitions and runtime
manifest snapshots. It does not grant capabilities, select a driver or prevent
activation. Future host/catalog policies must resolve the actual deployment target
explicitly and distinguish undeclared support from unsupported support. No mobile
host or mobile-only plugins are introduced by this contract.

The public SDK exports `PluginTarget`, `PluginTargetSupport` and `PluginTargets`.
Declarations are validated as plain data and copied into an immutable snapshot.
