import type { ContractKind, ErrorCode, PluginDefinition, PluginManifest, PackageResourceFiles } from "@lunaris/sdk";

export type PluginState = "registered" | "resolving" | "starting" | "active" | "stopping" | "stopped" | "failed";

/** Host scheduler: asynchronous callbacks, synchronous idempotent cancellation. */
export interface Scheduler {
  schedule(delayMs: number, callback: () => void): () => void;
}

export interface KernelOptions {
  readonly scheduler: Scheduler;
  readonly activationTimeoutMs?: number;
  readonly stopTimeoutMs?: number;
  readonly diagnosticCapacity?: number;
  readonly initialGrants?: Readonly<Record<string, readonly string[]>>;
  readonly requestPermission?: (request: PermissionRequest) => boolean | Promise<boolean>;
}

export interface PermissionRequest {
  readonly pluginId: string;
  readonly activationId: string;
  readonly permission: string;
}

export interface Diagnostic {
  readonly sequence: number;
  readonly code: ErrorCode;
  readonly pluginId?: string;
  readonly activationId?: string;
  readonly state?: PluginState;
  readonly contractId?: string;
  readonly cause?: { readonly kind: "object" | "value" };
}

export interface PluginSnapshot {
  readonly manifest: PluginManifest;
  readonly state: PluginState;
  readonly activationId?: string;
  readonly ownerId?: string;
  readonly contracts: readonly string[];
  readonly ownedResources: number;
  readonly bindings: readonly { readonly contract: string; readonly providerId?: string; readonly activationId?: string; readonly version?: string }[];
  readonly effectivePermissions: readonly string[];
}

export interface KernelSnapshot {
  readonly plugins: readonly PluginSnapshot[];
  readonly diagnostics: readonly Diagnostic[];
}

/** Privileged host composition surface; never included in plugin context. */
export interface Kernel {
  register(definition: PluginDefinition, options?: { readonly ownerId?: string; readonly resources?: PackageResourceFiles }): void;
  /** Stop the affected graph and remove a registration. No implicit replacement. */
  unregister(pluginId: string): Promise<void>;
  /** Replace the same ID and restart its active graph; restore old code on failure. */
  replace(definition: PluginDefinition, options?: { readonly grants?: readonly string[]; readonly resources?: PackageResourceFiles }): Promise<void>;
  start(pluginId: string): Promise<void>;
  stop(pluginId: string): Promise<void>;
  restart(pluginId: string): Promise<void>;
  selectProvider(consumerId: string, kind: ContractKind, contractId: string, providerId: string): void;
  grant(pluginId: string, permission: string): void;
  revoke(pluginId: string, permission: string): void;
  stopAll(): Promise<void>;
  inspect(): KernelSnapshot;
  /** Trusted host only: raw retained cause; undefined after eviction or for unknown sequences. */
  diagnosticCause(sequence: number): Readonly<{ cause: unknown }> | undefined;
}
