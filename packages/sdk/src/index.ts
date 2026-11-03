export type {
  ContractKind,
  PluginManifest,
  ProvidedContract,
  RequiredContract,
} from "@lunaris/manifest";

export type MaybePromise<T> = T | Promise<T>;

/** A resource whose owner may release it more than once safely. */
export interface Disposable {
  dispose(): MaybePromise<void>;
}
