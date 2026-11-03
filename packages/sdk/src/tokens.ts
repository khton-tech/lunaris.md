import { isExactVersion, isValidId, validateManifest, versionSatisfies } from "@lunaris/manifest";
import type { ContractKind, PluginManifest } from "@lunaris/manifest";
import { readDataObject } from "./data.js";
import { LunarisError } from "./errors.js";

export interface TokenMetadata {
  readonly id: string;
  readonly version: string;
  readonly providePermission?: string;
  readonly consumePermission?: string;
  readonly validate?: (value: unknown) => boolean;
}

export interface ContractToken extends TokenMetadata {
  readonly kind: ContractKind;
}

declare const tokenType: unique symbol;

/** Invariance prevents TypeScript from widening incompatible token payloads. */
export interface TypedToken<K extends ContractKind, T> extends ContractToken {
  readonly kind: K;
  readonly [tokenType]?: (value: T) => T;
}

export type ApiToken<T extends object> = TypedToken<"api", T>;
export type EventToken<T> = TypedToken<"event", T>;
export type HookToken<T> = TypedToken<"hook", T>;
export type ApiMethods<T> = { [K in keyof T]: (...args: never[]) => unknown };

const metadataFields = ["id", "version", "providePermission", "consumePermission", "validate"];

function normalizeToken(input: unknown): ContractToken {
  const data = readDataObject(input, ["kind", ...metadataFields], "CONTRACT_METADATA_CONFLICT");
  if (data.kind !== "api" && data.kind !== "event" && data.kind !== "hook") {
    throw new LunarisError("CONTRACT_METADATA_CONFLICT", "Unknown contract kind.");
  }
  if (!isValidId(data.id) || !isExactVersion(data.version)) {
    throw new LunarisError("CONTRACT_METADATA_CONFLICT", "Invalid contract ID or exact version.");
  }
  for (const key of ["providePermission", "consumePermission"] as const) {
    if (Object.hasOwn(data, key) && !isValidId(data[key])) {
      throw new LunarisError("CONTRACT_METADATA_CONFLICT", "Invalid contract permission.", { contractId: data.id, path: `$.${key}` });
    }
  }
  if (Object.hasOwn(data, "validate") && typeof data.validate !== "function") {
    throw new LunarisError("CONTRACT_METADATA_CONFLICT", "Contract validator must be a function.", { contractId: data.id });
  }
  return Object.freeze({ ...data }) as unknown as ContractToken;
}

function createToken<K extends ContractKind, T>(kind: K, metadata: TokenMetadata): TypedToken<K, T> {
  const data = readDataObject(metadata, metadataFields, "CONTRACT_METADATA_CONFLICT");
  return normalizeToken({ ...data, kind }) as TypedToken<K, T>;
}

export function defineApi<T extends ApiMethods<T>>(
  metadata: TokenMetadata & (T extends (...args: never[]) => unknown ? never : unknown),
): ApiToken<T> {
  return createToken("api", metadata);
}

export function defineEvent<T>(metadata: TokenMetadata): EventToken<T> {
  return createToken("event", metadata);
}

export function defineHook<T>(metadata: TokenMetadata): HookToken<T> {
  return createToken("hook", metadata);
}

/** Canonical identity survives duplicate SDK/contract package objects. */
export function contractKey(token: ContractToken): string {
  const checked = normalizeToken(token);
  return `${checked.kind}:${checked.id}@${checked.version}`;
}

/** Stateless check used by hosts when a canonical contract key is seen again. */
export function assertCompatibleTokens(left: ContractToken, right: ContractToken): void {
  const a = normalizeToken(left);
  const b = normalizeToken(right);
  if (contractKey(a) !== contractKey(b) || a.providePermission !== b.providePermission || a.consumePermission !== b.consumePermission) {
    throw new LunarisError("CONTRACT_METADATA_CONFLICT", "Contract identity or permission metadata differs.", { contractId: a.id });
  }
}

export type DeclarationRole = "provide" | "require" | "optional" | "consume";

/** Validate a registration/access declaration before any runtime publication. */
export function assertDeclaration(manifest: PluginManifest, token: ContractToken, role: DeclarationRole): void {
  const result = validateManifest(manifest);
  if (!result.ok) {
    throw new LunarisError("MANIFEST_INVALID", "Invalid plugin manifest.", {}, { cause: result.diagnostics });
  }
  const checked = normalizeToken(token);
  const metadata = result.manifest;
  const context = { pluginId: metadata.id, contractId: checked.id };
  let declared = false;
  if (role === "provide") {
    declared = metadata.provides.some(entry => entry.kind === checked.kind && entry.id === checked.id && entry.version === checked.version);
  } else if (role === "consume" || role === "require" || role === "optional") {
    declared = metadata.requires.some(entry => entry.kind === checked.kind && entry.id === checked.id &&
      versionSatisfies(checked.version, entry.range) &&
      (role === "consume" || (role === "optional" ? entry.optional === true : entry.optional !== true)));
  }
  if (!declared) throw new LunarisError("CONTRACT_UNDECLARED", "Contract or version is not declared for this operation.", context);
  const permission = role === "provide" ? checked.providePermission : checked.consumePermission;
  if (permission && !metadata.permissions.includes(permission) && !metadata.optionalPermissions.includes(permission)) {
    throw new LunarisError("PERMISSION_DENIED", "Contract permission is not declared.", context);
  }
}
