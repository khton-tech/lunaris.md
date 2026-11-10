export { isValidId, isExactVersion, isVersionRange, versionSatisfies } from "./versions.js";
export { validateManifest } from "./validation.js";

export interface ManifestDiagnostic {
  readonly code: "MANIFEST_INVALID" | "VERSION_INCOMPATIBLE";
  readonly pluginId?: string;
  readonly path: string;
  readonly message: string;
}

export type ManifestValidationResult =
  | { readonly ok: true; readonly manifest: PluginManifest }
  | { readonly ok: false; readonly diagnostics: readonly ManifestDiagnostic[] };

export interface HostVersions {
  readonly engineVersion: string;
  readonly sdkVersion: string;
}

/** Serializable contract kinds shared across installed package copies. */
export type ContractKind = "api" | "event" | "hook";

/** Deployment targets; viewport size is independent of the selected target. */
export type PluginTarget = "web" | "windows" | "macos" | "linux" | "android" | "ios";
/** Unadapted plugins may run, but are not ready for normal use on this target. */
export type PluginTargetSupport = "supported" | "unadapted" | "unsupported";
export type PluginTargets = Readonly<Partial<Record<PluginTarget, PluginTargetSupport>>>;

/** Coarse author-declared compatibility; never an activation permission. */
export type PluginPlatform = "desktop" | "web" | "mobile";
export type PluginPlatforms = "universal" | readonly PluginPlatform[];
export interface PluginMetadata {
  readonly name: string;
  readonly author: string;
  readonly description: string;
  readonly platforms: PluginPlatforms;
  /** BCP 47 tags; the first tag is the metadata fallback language. */
  readonly languages: readonly string[];
  readonly repository?: string;
  readonly translations?: Readonly<Record<string, { readonly name?: string; readonly description?: string }>>;
  /** Inert display data; never HTML, commands or executable URLs. */
  readonly fields?: readonly { readonly label: string; readonly value: string }[];
}

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
  /** Missing targets are undeclared, never implicitly supported. Metadata only. */
  readonly targets?: PluginTargets;
  /** Optional for legacy built-ins; required by the LUP package format. */
  readonly metadata?: PluginMetadata;
  readonly provides: readonly ProvidedContract[];
  readonly requires: readonly RequiredContract[];
  readonly permissions: readonly string[];
  readonly optionalPermissions: readonly string[];
}
