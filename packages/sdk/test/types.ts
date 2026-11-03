import type { Disposable, PluginManifest } from "@lunaris/sdk";
// @ts-expect-error Private package paths must not resolve.
import type { Disposable as PrivateDisposable } from "@lunaris/sdk/src/index.js";

const resource: Disposable = { async dispose() {} };
void resource;
// @ts-expect-error Disposers must return void or Promise<void>.
const invalid: Disposable = { dispose: () => "unreleased" };
declare const manifest: PluginManifest;
// @ts-expect-error The context cannot turn manifest metadata mutable.
manifest.permissions.push("example.write");
void invalid;
