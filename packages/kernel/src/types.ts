import type { ContractKind, ErrorCode, PluginDefinition, PluginManifest } from "@lunaris/sdk";

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
  readonly contracts: readonly string[];
  readonly ownedResources: number;
  readonly bindings: readonly { readonly contract: string; readonly providerId?: string; readonly activationId?: string; readonly version?: string }[];
}

export interface KernelSnapshot {
  readonly plugins: readonly PluginSnapshot[];
  readonly diagnostics: readonly Diagnostic[];
}

/** P3 host surface; dependency selection and grant management arrive at later gates. */
export interface Kernel {
  register(definition: PluginDefinition): void;
  start(pluginId: string): Promise<void>;
  stop(pluginId: string): Promise<void>;
  restart(pluginId: string): Promise<void>;
  selectProvider(consumerId: string, kind: ContractKind, contractId: string, providerId: string): void;
  stopAll(): Promise<void>;
  inspect(): KernelSnapshot;
}
