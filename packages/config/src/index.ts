import { defineApi, defineEvent } from "@lunaris/sdk";
import type { FsFailure } from "@lunaris/filesystem";

export type ConfigValue = string | number | bigint | boolean | Date | readonly ConfigValue[] | ConfigTable;
export interface ConfigTable { readonly [key: string]: ConfigValue }
export type ConfigTarget = { readonly scope: "global" } | { readonly scope: "vault"; readonly vaultId?: string };
export type ConfigReadOptions = ConfigTarget | { readonly scope: "effective"; readonly vaultId?: string };
export type ConfigFailure = FsFailure | {
  readonly code: "INVALID_TOML" | "INVALID_CONFIG" | "INVALID_VALUE" | "NO_VAULT" | "STOPPED";
  readonly message: string;
};
export type ConfigResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ConfigFailure };
export interface ConfigApi {
  read(pluginId: string, options?: ConfigReadOptions): Promise<ConfigResult<ConfigTable>>;
  get(pluginId: string, key: string, options?: ConfigReadOptions): Promise<ConfigResult<ConfigValue | undefined>>;
  set(pluginId: string, key: string, value: ConfigValue, target: ConfigTarget): Promise<ConfigResult<null>>;
  remove(pluginId: string, key: string, target: ConfigTarget): Promise<ConfigResult<boolean>>;
}
export interface ConfigChange {
  readonly pluginId: string;
  readonly key: string;
  readonly scope: "global" | "vault";
  readonly vaultId: string | null;
  readonly kind: "set" | "removed";
}
export function validPluginId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(value);
}
export function validConfigKey(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !["__proto__", "constructor", "prototype"].includes(value) && !/[\u0000-\u001f\u007f]/.test(value);
}
export const Config = defineApi<ConfigApi>({
  id: "lunaris.config", version: "1.0.0", consumePermission: "config.access",
  validate: value => value !== null && typeof value === "object" &&
    ["read", "get", "set", "remove"].every(name => typeof Object.getOwnPropertyDescriptor(value, name)?.value === "function"),
});
export const ConfigChanged = defineEvent<ConfigChange>({
  id: "lunaris.config-changed", version: "1.0.0", consumePermission: "config.access",
  validate(value) {
    if (value === null || typeof value !== "object") return false;
    const change = value as Partial<ConfigChange>;
    return validPluginId(change.pluginId) && validConfigKey(change.key) &&
      (change.kind === "set" || change.kind === "removed") &&
      ((change.scope === "global" && change.vaultId === null) ||
        (change.scope === "vault" && typeof change.vaultId === "string" && change.vaultId.length > 0));
  },
});

/** Portable namespace backup without knowledge of the provider's storage layout. */
export interface ConfigSnapshotsApi {
  capture(pluginId: string, target: ConfigTarget): Promise<ConfigResult<string>>;
  /** Replace just this namespace atomically with respect to provider operations. */
  restore(pluginId: string, snapshot: string, target: ConfigTarget): Promise<ConfigResult<null>>;
}
export const ConfigSnapshots = defineApi<ConfigSnapshotsApi>({
  id: 'lunaris.config-snapshots', version: '1.0.0', consumePermission: 'config.access',
  validate: value => !!value && typeof value === 'object' && ['capture', 'restore'].every(name => typeof Object.getOwnPropertyDescriptor(value, name)?.value === 'function'),
});
