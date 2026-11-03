import type { ContractToken, PluginDefinition, RequiredContract } from "@lunaris/sdk";
import type { OwnedScope } from "./scope.js";
import type { PluginState } from "./types.js";

export const requirementKey = (contract: { readonly kind: string; readonly id: string }): string => `${contract.kind}:${contract.id}`;
export interface ApiEntry {
  readonly token: ContractToken;
  readonly implementation: object;
  readonly methods: ReadonlyMap<PropertyKey, (...args: never[]) => unknown>;
}
export interface Binding {
  readonly requirement: RequiredContract;
  readonly provider: Registration;
  readonly activation: Activation;
  readonly version: string;
}
export interface Activation {
  readonly id: string;
  readonly scope: OwnedScope;
  readonly apis: Map<string, ApiEntry>;
  readonly tokens: Map<string, ContractToken>;
  readonly bindings: Map<string, Binding | undefined>;
}
export interface Registration {
  readonly definition: PluginDefinition;
  state: PluginState;
  tail: Promise<void>;
  pending?: number;
  activation?: Activation;
}
export function context(record: Registration, activation = record.activation) {
  return { pluginId: record.definition.manifest.id, state: record.state,
    ...(activation ? { activationId: activation.id } : {}) };
}
