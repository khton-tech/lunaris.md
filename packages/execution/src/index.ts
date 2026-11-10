import { defineApi } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";

/** Only explicit data crosses this lowest-level boundary. No host object references. */
export type ExecutionValue = null | boolean | number | string | readonly ExecutionValue[] | { readonly [key: string]: ExecutionValue };
export interface ExecutionIdentity {
  readonly pluginId: string;
  readonly activationId: string;
  readonly vaultId: string;
  readonly generation: number;
}
export interface ExecutionSource {
  readonly entry: string;
  /** Canonical package-relative names mapped to complete source text. */
  readonly modules: Readonly<Record<string, string>>;
}
export interface ExecutionLimits {
  readonly memoryBytes?: number;
  readonly stackBytes?: number;
  readonly turnMilliseconds?: number;
}
export interface ExecutionCapability {
  /** A selected public operation name, never an ambient arbitrary-object proxy. */
  readonly name: string;
  invoke(identity: ExecutionIdentity, args: readonly ExecutionValue[]): ExecutionValue;
}
export interface ExecutionRealm {
  /** Call a named entry-module export synchronously. Async SDK bridging is separate. */
  call(name: string, args: readonly ExecutionValue[]): ExecutionValue;
  dispose(): void;
}
export interface PluginExecutionApi {
  /** Trusted host ingress. The owner revokes execution and every future capability call. */
  create(identity: ExecutionIdentity, source: ExecutionSource, capabilities: readonly ExecutionCapability[], owner: CancellationSignal, limits?: ExecutionLimits): Promise<ExecutionRealm>;
}
export const PluginExecution = defineApi<PluginExecutionApi>({
  id: "lunaris.plugin-execution", version: "1.0.0", consumePermission: "runtime.manage",
  validate: value => !!value && typeof value === "object" && typeof Object.getOwnPropertyDescriptor(value, "create")?.value === "function",
});
