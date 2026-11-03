import type { PluginManifest } from "@lunaris/manifest";
// @ts-expect-error Private package paths must not resolve.
import type { PluginManifest as PrivateManifest } from "@lunaris/manifest/src/index.js";

const manifest: PluginManifest = {
  manifestVersion: 1, id: "example.hello", version: "0.1.0",
  engine: "^0.1.0", sdk: "^0.1.0", entry: "./dist/plugin.js",
  provides: [], requires: [], permissions: [], optionalPermissions: [],
};
// @ts-expect-error Manifest metadata is readonly.
manifest.id = "example.other";
// @ts-expect-error Only the declared schema version is supported.
const invalid: PluginManifest = { ...manifest, manifestVersion: 2 };
void invalid;
