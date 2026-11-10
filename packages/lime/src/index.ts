import { defineApi } from "@lunaris/sdk";
import type { CancellationSignal, PluginManifest } from "@lunaris/sdk";
import type { ExecutionSource } from "@lunaris/execution";

export type LimeFailure = { readonly code: "CANCELLED" | "BUSY" | "NO_VAULT" | "STALE" | "INVALID_PACKAGE" | "STORAGE_FAILED" | "RUNTIME_FAILED" | "NOT_FOUND" | "CONFLICT" | "UNSUPPORTED"; readonly message: string };
export type LimeResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: LimeFailure };
export interface LimePackagePickerApi {
  /** Only the explicitly selected file is readable. Cancellation returns successful null. */
  pick(owner: CancellationSignal): Promise<LimeResult<Uint8Array | null>>;
}
export const LimePackagePicker = defineApi<LimePackagePickerApi>({
  id: 'lunaris.lime-package-picker', version: '1.0.0', consumePermission: 'runtime.manage',
  validate: value => !!value && typeof value === 'object' && typeof Object.getOwnPropertyDescriptor(value, 'pick')?.value === 'function',
});

export interface LimeEnvironment { readonly vaultId: string; readonly generation: number }
export interface LimeRuntimeEntry { readonly id: string; readonly state: string; readonly version: string }
export interface LimeRuntimeApi {
  /** Stop/unregister previous environment before binding another one. */
  open(environment: LimeEnvironment): Promise<LimeResult<null>>;
  close(environment: LimeEnvironment): Promise<LimeResult<null>>;
  snapshot(environment: LimeEnvironment): LimeResult<readonly LimeRuntimeEntry[]>;
  register(environment: LimeEnvironment, manifest: PluginManifest, source: ExecutionSource, enabled: boolean): Promise<LimeResult<null>>;
  replace(environment: LimeEnvironment, manifest: PluginManifest, source: ExecutionSource): Promise<LimeResult<null>>;
  enable(environment: LimeEnvironment, id: string): Promise<LimeResult<null>>;
  disable(environment: LimeEnvironment, id: string): Promise<LimeResult<null>>;
  remove(environment: LimeEnvironment, id: string): Promise<LimeResult<null>>;
}
export const LimeRuntime = defineApi<LimeRuntimeApi>({
  id: 'lunaris.lime-runtime', version: '1.0.0', consumePermission: 'runtime.manage',
  validate: value => !!value && typeof value === 'object' && ['open', 'close', 'snapshot', 'register', 'replace', 'enable', 'disable', 'remove'].every(name => typeof Object.getOwnPropertyDescriptor(value, name)?.value === 'function'),
});
