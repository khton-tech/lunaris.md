import { defineApi, defineEvent } from "@lunaris/sdk";
import type { CancellationSignal, ContractKind, PluginManifest } from "@lunaris/sdk";
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

/** Host-owned bootstrap policy, read before any enabled package is evaluated. */
export const LimeBootPolicy = defineApi<{ safeMode(): boolean }>({
  id: 'lunaris.lime-boot-policy', version: '1.0.0', consumePermission: 'runtime.manage',
  validate: value => !!value && typeof value === 'object' && typeof Object.getOwnPropertyDescriptor(value, 'safeMode')?.value === 'function',
});

export interface LimeEnvironment { readonly vaultId: string; readonly generation: number }
export interface LimeRuntimeEntry { readonly id: string; readonly state: string; readonly version: string }
export interface LimeDependencyPlan {
  readonly pluginId: string;
  readonly revision: number;
  readonly affected: readonly string[];
  readonly dependencies: readonly {
    readonly kind: ContractKind; readonly id: string; readonly range: string; readonly optional: boolean;
    readonly selected?: string;
    readonly candidates: readonly { readonly id: string; readonly version: string; readonly state: string }[];
  }[];
}
export interface LimeProviderChoice { readonly kind: ContractKind; readonly contractId: string; readonly providerId: string }
export interface LimeRuntimeApi {
  /** Stop/unregister previous environment before binding another one. */
  open(environment: LimeEnvironment): Promise<LimeResult<null>>;
  close(environment: LimeEnvironment): Promise<LimeResult<null>>;
  snapshot(environment: LimeEnvironment): LimeResult<readonly LimeRuntimeEntry[]>;
  plan(environment: LimeEnvironment, id: string): LimeResult<LimeDependencyPlan>;
  selectProvider(environment: LimeEnvironment, id: string, kind: ContractKind, contractId: string, providerId: string, expectedRevision: number): Promise<LimeResult<null>>;
  /** Stop the active affected graph; the opaque checkpoint retains old code/resources. */
  suspend(environment: LimeEnvironment, id: string): Promise<LimeResult<number>>;
  /** Restart the graph retained by the checkpoint; the checkpoint remains until finish. */
  resume(environment: LimeEnvironment, checkpoint: number): Promise<LimeResult<null>>;
  /** Stop candidate work and restore old code while keeping the graph inactive. */
  rollback(environment: LimeEnvironment, checkpoint: number): Promise<LimeResult<null>>;
  finish(environment: LimeEnvironment, checkpoint: number): Promise<LimeResult<null>>;
  register(environment: LimeEnvironment, manifest: PluginManifest, source: ExecutionSource, enabled: boolean): Promise<LimeResult<null>>;
  replace(environment: LimeEnvironment, manifest: PluginManifest, source: ExecutionSource): Promise<LimeResult<null>>;
  enable(environment: LimeEnvironment, id: string): Promise<LimeResult<null>>;
  disable(environment: LimeEnvironment, id: string): Promise<LimeResult<null>>;
  remove(environment: LimeEnvironment, id: string): Promise<LimeResult<null>>;
}
export const LimeRuntime = defineApi<LimeRuntimeApi>({
  id: 'lunaris.lime-runtime', version: '1.0.0', consumePermission: 'runtime.manage',
  validate: value => !!value && typeof value === 'object' && ['open', 'close', 'snapshot', 'plan', 'selectProvider', 'suspend', 'resume', 'rollback', 'finish', 'register', 'replace', 'enable', 'disable', 'remove'].every(name => typeof Object.getOwnPropertyDescriptor(value, name)?.value === 'function'),
});

export interface LimeInstallation {
  readonly id: string;
  readonly version: string;
  readonly digest: string;
  readonly enabled: boolean;
  readonly recoveryRequired: boolean;
  readonly removalPending: boolean;
  readonly manifest?: PluginManifest;
  readonly state: string;
}
export interface LimeSnapshot {
  readonly vaultId: string | null;
  readonly busy: boolean;
  readonly safeMode: boolean;
  readonly error: string | null;
  readonly installations: readonly LimeInstallation[];
}
export interface LimePreview {
  readonly ticket: number;
  readonly manifest: PluginManifest;
  readonly digest: string;
  readonly platformWarning: boolean;
}
export interface LimeApi {
  snapshot(): LimeSnapshot;
  plan(id: string): LimeResult<LimeDependencyPlan>;
  selectProvider(id: string, kind: ContractKind, contractId: string, providerId: string, expectedRevision: number): Promise<LimeResult<null>>;
  preview(): Promise<LimeResult<LimePreview | null>>;
  cancelPreview(ticket: number): void;
  install(ticket: number, enabled?: boolean): Promise<LimeResult<null>>;
  update(ticket: number): Promise<LimeResult<null>>;
  enable(id: string): Promise<LimeResult<null>>;
  disable(id: string): Promise<LimeResult<null>>;
  retry(id: string): Promise<LimeResult<null>>;
  remove(id: string, deleteData: boolean): Promise<LimeResult<null>>;
  /** Explicitly restore the current environment, optionally without evaluating packages. */
  restore(safeMode?: boolean): Promise<LimeResult<null>>;
}
export const Lime = defineApi<LimeApi>({
  id: 'lunaris.lime', version: '1.0.0', consumePermission: 'runtime.manage',
  validate: value => !!value && typeof value === 'object' && ['snapshot', 'plan', 'selectProvider', 'preview', 'cancelPreview', 'install', 'update', 'enable', 'disable', 'retry', 'remove', 'restore'].every(name => typeof Object.getOwnPropertyDescriptor(value, name)?.value === 'function'),
});
export const LimeChanged = defineEvent<LimeSnapshot>({
  id: 'lunaris.lime-changed', version: '1.0.0',
  validate: value => !!value && typeof value === 'object' && Array.isArray((value as LimeSnapshot).installations),
});
