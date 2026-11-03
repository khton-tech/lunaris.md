/** Serializable contract kinds; validation is introduced in P2. */
export type ContractKind = "api" | "event" | "hook";

export interface ProvidedContract {
  readonly kind: ContractKind;
  readonly id: string;
  readonly version: string;
}

export interface RequiredContract {
  readonly kind: ContractKind;
  readonly id: string;
  readonly range: string;
  readonly optional?: boolean;
}

/** Metadata shared by plugin definitions and manifest-first loaders. */
export interface PluginManifest {
  readonly manifestVersion: 1;
  readonly id: string;
  readonly version: string;
  readonly engine: string;
  readonly sdk: string;
  readonly entry: string;
  readonly provides: readonly ProvidedContract[];
  readonly requires: readonly RequiredContract[];
  readonly permissions: readonly string[];
  readonly optionalPermissions: readonly string[];
}
