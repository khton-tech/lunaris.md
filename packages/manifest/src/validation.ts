import { isExactVersion, isValidId, isVersionRange, versionSatisfies } from "./versions.js";
import type {
  ContractKind, HostVersions, ManifestDiagnostic, ManifestValidationResult,
  PluginManifest, PluginTarget, PluginTargetSupport, ProvidedContract, RequiredContract,
} from "./index.js";

/** Inspect data descriptors before reading values; manifest accessors are not metadata. */
function dataRecord(input: unknown): Record<string, unknown> | undefined {
  if (input === null || typeof input !== "object") return undefined;
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const record: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (typeof key !== "string" || !descriptor || !("value" in descriptor) || !descriptor.enumerable) return undefined;
    record[key] = descriptor.value;
  }
  return record;
}

function dataArray(input: unknown): input is unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return false;
  if (Reflect.ownKeys(input).length !== input.length + 1) return false;
  for (let index = 0; index < input.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return false;
  }
  return true;
}

function isEntry(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith("./") || !/\.(?:js|mjs)$/.test(value)) return false;
  if (/[\\:?#%\s\u0000-\u001f\u007f]/.test(value)) return false;
  return value.slice(2).split("/").every(segment => segment !== "" && segment !== "." && segment !== "..");
}

/** Validate without evaluating an entry point, returning an immutable metadata snapshot. */
export function validateManifest(input: unknown, versions?: HostVersions): ManifestValidationResult {
  const diagnostics: ManifestDiagnostic[] = [];
  let pluginId: string | undefined;
  function issue(path: string, message: string, code: ManifestDiagnostic["code"] = "MANIFEST_INVALID") {
    diagnostics.push(Object.freeze({ code, ...(pluginId === undefined ? {} : { pluginId }), path, message }));
  }
  function fields(record: Record<string, unknown>, allowed: readonly string[], path: string) {
    for (const key of Object.keys(record)) {
      if (!allowed.includes(key)) issue(`${path}.${key}`, "Unknown field.");
    }
  }
  function list(value: unknown, path: string): unknown[] {
    if (dataArray(value)) return value;
    issue(path, "Expected a dense data array.");
    return [];
  }
  try {
    const record = dataRecord(input);
    if (!record) {
      issue("$", "Expected a plain serializable data object.");
      return Object.freeze({ ok: false, diagnostics: Object.freeze(diagnostics) });
    }
    if (isValidId(record.id)) pluginId = record.id;
    fields(record, ["manifestVersion", "id", "version", "engine", "sdk", "entry", "targets", "provides", "requires", "permissions", "optionalPermissions"], "$");
    if (record.manifestVersion !== 1) issue("$.manifestVersion", "Expected manifest version 1.");
    if (!pluginId) issue("$.id", "Expected a canonical dotted lowercase ID.");
    if (!isExactVersion(record.version)) issue("$.version", "Expected full strict SemVer.");
    for (const key of ["engine", "sdk"] as const) {
      if (!isVersionRange(record[key])) issue(`$.${key}`, "Expected a nonempty SemVer range.");
    }
    if (!isEntry(record.entry)) issue("$.entry", "Expected a contained ./ JavaScript entry path.");

    let targets: Readonly<Partial<Record<PluginTarget, PluginTargetSupport>>> | undefined;
    if (Object.hasOwn(record, "targets")) {
      const declarations = dataRecord(record.targets);
      if (!declarations) issue("$.targets", "Expected a target support data object.");
      else {
        fields(declarations, ["web", "windows", "macos", "linux", "android", "ios"], "$.targets");
        const snapshot: Partial<Record<PluginTarget, PluginTargetSupport>> = {};
        for (const [target, support] of Object.entries(declarations)) {
          if (!["supported", "unadapted", "unsupported"].includes(support as string)) {
            issue(`$.targets.${target}`, "Expected supported, unadapted or unsupported.");
          } else if (["web", "windows", "macos", "linux", "android", "ios"].includes(target)) {
            snapshot[target as PluginTarget] = support as PluginTargetSupport;
          }
        }
        targets = Object.freeze(snapshot);
      }
    }

    function contracts(value: unknown, role: "provides"): ProvidedContract[];
    function contracts(value: unknown, role: "requires"): RequiredContract[];
    function contracts(value: unknown, role: "provides" | "requires"): (ProvidedContract | RequiredContract)[] {
      const result: (ProvidedContract | RequiredContract)[] = [];
      const seen = new Set<string>();
      for (const [index, item] of list(value, `$.${role}`).entries()) {
        const path = `$.${role}[${index}]`;
        const declaration = dataRecord(item);
        if (!declaration) { issue(path, "Expected a contract data object."); continue; }
        fields(declaration, role === "provides" ? ["kind", "id", "version"] : ["kind", "id", "range", "optional"], path);
        const validKind = ["api", "event", "hook"].includes(declaration.kind as string);
        if (!validKind) issue(`${path}.kind`, "Expected api, event or hook.");
        if (!isValidId(declaration.id)) issue(`${path}.id`, "Expected a canonical contract ID.");
        if (validKind && isValidId(declaration.id)) {
          const key = `${declaration.kind as string}:${declaration.id}`;
          if (seen.has(key)) issue(path, "Duplicate contract kind/ID.");
          seen.add(key);
        }
        if (role === "provides") {
          if (!isExactVersion(declaration.version)) issue(`${path}.version`, "Expected full strict SemVer.");
          else if (validKind && isValidId(declaration.id)) {
            result.push(Object.freeze({ kind: declaration.kind as ContractKind, id: declaration.id, version: declaration.version }));
          }
        } else {
          if (!isVersionRange(declaration.range)) issue(`${path}.range`, "Expected a nonempty SemVer range.");
          if (Object.hasOwn(declaration, "optional") && typeof declaration.optional !== "boolean") issue(`${path}.optional`, "Expected a boolean.");
          if (validKind && isValidId(declaration.id) && isVersionRange(declaration.range)) {
            result.push(Object.freeze({ kind: declaration.kind as ContractKind, id: declaration.id, range: declaration.range,
              ...(typeof declaration.optional === "boolean" ? { optional: declaration.optional } : {}) }));
          }
        }
      }
      return result;
    }
    const provides = contracts(record.provides, "provides");
    const requires = contracts(record.requires, "requires");
    function permissions(value: unknown, key: string): string[] {
      const result: string[] = [];
      for (const [index, permission] of list(value, `$.${key}`).entries()) {
        if (!isValidId(permission)) issue(`$.${key}[${index}]`, "Expected an atomic dotted permission ID.");
        else if (result.includes(permission)) issue(`$.${key}[${index}]`, "Duplicate permission.");
        else result.push(permission);
      }
      return result;
    }
    const requiredPermissions = permissions(record.permissions, "permissions");
    const optionalPermissions = permissions(record.optionalPermissions, "optionalPermissions");
    for (const [index, permission] of optionalPermissions.entries()) {
      if (requiredPermissions.includes(permission)) issue(`$.optionalPermissions[${index}]`, "Permission is already required.");
    }
    if (versions) {
      for (const [field, version] of [["engine", versions.engineVersion], ["sdk", versions.sdkVersion]] as const) {
        if (!isExactVersion(version) || (isVersionRange(record[field]) && !versionSatisfies(version, record[field]))) {
          issue(`$.${field}`, `Host ${field} version is invalid or incompatible.`, "VERSION_INCOMPATIBLE");
        }
      }
    }
    if (diagnostics.length) return Object.freeze({ ok: false, diagnostics: Object.freeze(diagnostics) });
    const manifest: PluginManifest = Object.freeze({
      manifestVersion: 1, id: pluginId!, version: record.version as string,
      engine: record.engine as string, sdk: record.sdk as string, entry: record.entry as string,
      ...(targets === undefined ? {} : { targets }),
      provides: Object.freeze(provides), requires: Object.freeze(requires),
      permissions: Object.freeze(requiredPermissions), optionalPermissions: Object.freeze(optionalPermissions),
    });
    return Object.freeze({ ok: true, manifest });
  } catch {
    issue("$", "Metadata could not be inspected as serializable data.");
    return Object.freeze({ ok: false, diagnostics: Object.freeze(diagnostics) });
  }
}
