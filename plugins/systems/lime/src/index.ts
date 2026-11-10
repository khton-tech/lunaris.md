import { definePlugin } from "@lunaris/sdk";
import { Logger } from "@lunaris/logging";
import { Filesystem } from "@lunaris/filesystem";
import { Config } from "@lunaris/config";
import { Vault, VaultLifecycle } from "@lunaris/vault";
import { Lime, LimeChanged, LimePackagePicker, LimeRuntime } from "@lunaris/lime";
import { activateLime } from "./service.js";

export function createLime(options: { readonly platform: 'desktop' | 'web' | 'mobile' }) {
  return definePlugin({ manifest: { manifestVersion: 1, id: 'lunaris.lime', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './dist/index.js',
    provides: [{ kind: 'api', id: Lime.id, version: Lime.version }, { kind: 'event', id: LimeChanged.id, version: LimeChanged.version }],
    requires: [Logger, Filesystem, Config, Vault, VaultLifecycle, LimePackagePicker, LimeRuntime].map(token => ({ kind: token.kind, id: token.id, range: '^1.0.0' })),
    permissions: ['vault.access', 'filesystem.access', 'config.access', 'runtime.manage'], optionalPermissions: [],
  }, activate(ctx) { return activateLime(ctx, options.platform); } });
}
