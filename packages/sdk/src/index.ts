export type {
  ContractKind,
  PluginManifest,
  ProvidedContract,
  RequiredContract,
} from "@lunaris/manifest";

export type { CancellationSignal, Disposable, MaybePromise, PluginContext, ResourceScope } from "./context.js";
export type { PluginDefinition } from "./plugin.js";
export { definePlugin } from "./plugin.js";
export type { ErrorCode, ErrorContext } from "./errors.js";
export { LunarisError } from "./errors.js";
export type { ApiToken, ApiMethods, ContractToken, DeclarationRole, EventToken, HookToken, TokenMetadata, TypedToken } from "./tokens.js";
export { defineApi, defineEvent, defineHook, contractKey, assertCompatibleTokens, assertDeclaration } from "./tokens.js";
