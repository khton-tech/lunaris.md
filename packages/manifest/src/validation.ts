import { isExactVersion, isValidId, isVersionRange, versionSatisfies } from "./versions.js";
import { isLanguageTag } from "./languages.js";
import type {
  ContractKind, HostVersions, ManifestDiagnostic, ManifestValidationResult,
  PluginManifest, PluginMetadata, PluginPlatform, PluginTarget, PluginTargetSupport, ProvidedContract, RequiredContract,
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
    fields(record, ["manifestVersion", "id", "version", "engine", "sdk", "entry", "targets", "metadata", "provides", "requires", "permissions", "optionalPermissions"], "$");
    if (record.manifestVersion !== 1) issue("$.manifestVersion", "Expected manifest version 1.");
    if (!pluginId) issue("$.id", "Expected a canonical dotted lowercase ID.");
    if (!isExactVersion(record.version)) issue("$.version", "Expected full strict SemVer.");
    for (const key of ["engine", "sdk"] as const) {
      if (!isVersionRange(record[key])) issue(`$.${key}`, "Expected a nonempty SemVer range.");
    }
    if (!isEntry(record.entry)) issue("$.entry", "Expected a contained ./ JavaScript entry path.");

    let metadata: PluginMetadata | undefined;
    if (Object.hasOwn(record, "metadata")) {
      const item = dataRecord(record.metadata);
      if (!item) issue("$.metadata", "Expected a metadata data object.");
      else {
        fields(item, ["name", "author", "description", "platforms", "languages", "repository", "translations", "fields"], "$.metadata");
        const text = (value: unknown, path: string, max: number): string => {
          if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) {
            issue(path, `Expected nonempty display text of at most ${max} characters without control characters.`);
            return "";
          }
          return value;
        };
        const name = text(item.name, "$.metadata.name", 120);
        const author = text(item.author, "$.metadata.author", 120);
        const description = text(item.description, "$.metadata.description", 2000);
        const platforms: PluginPlatform[] = [];
        if (item.platforms !== "universal") {
          for (const [i, platform] of list(item.platforms, "$.metadata.platforms").entries()) {
            if (!["desktop", "web", "mobile"].includes(platform as string) || platforms.includes(platform as PluginPlatform)) issue(`$.metadata.platforms[${i}]`, "Expected a unique desktop, web or mobile platform.");
            else platforms.push(platform as PluginPlatform);
          }
          if (!platforms.length) issue("$.metadata.platforms", "Declare universal or at least one platform.");
        }
        const language = isLanguageTag;
        const languages: string[] = [];
        for (const [i, tag] of list(item.languages, "$.metadata.languages").entries()) {
          if (!language(tag) || languages.some(existing => existing.toLowerCase() === tag.toLowerCase())) issue(`$.metadata.languages[${i}]`, "Expected a unique BCP 47 language tag.");
          else languages.push(tag);
        }
        if (!languages.length || languages.length > 64) issue("$.metadata.languages", "Declare 1 to 64 languages.");
        if (item.repository !== undefined) {
          const valid = typeof item.repository === "string" && item.repository.length <= 2048 &&
            /^https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?:\/[^\s\\#?@\u0000-\u001f\u007f]*)?$/i.test(item.repository);
          if (!valid) issue("$.metadata.repository", "Expected an HTTPS repository URL with a DNS hostname and no credentials, port, query or fragment.");
        }
        const translations: Record<string, { readonly name?: string; readonly description?: string }> = Object.create(null) as Record<string, { readonly name?: string; readonly description?: string }>;
        if (item.translations !== undefined) {
          const localized = dataRecord(item.translations);
          if (!localized) issue("$.metadata.translations", "Expected a language-keyed data object.");
          else for (const [tag, value] of Object.entries(localized)) {
            const path = `$.metadata.translations.${tag}`;
            if (!language(tag) || !languages.some(existing => existing.toLowerCase() === tag.toLowerCase())) issue(path, "Translation language must be declared.");
            const translation = dataRecord(value);
            if (!translation) { issue(path, "Expected a translation data object."); continue; }
            fields(translation, ["name", "description"], path);
            translations[tag] = Object.freeze({
              ...(translation.name === undefined ? {} : { name: text(translation.name, `${path}.name`, 120) }),
              ...(translation.description === undefined ? {} : { description: text(translation.description, `${path}.description`, 2000) }),
            });
          }
        }
        const customFields: { readonly label: string; readonly value: string }[] = [];
        if (item.fields !== undefined) {
          const entries = list(item.fields, "$.metadata.fields");
          if (entries.length > 16) issue("$.metadata.fields", "At most 16 display fields are allowed.");
          for (const [i, value] of entries.entries()) {
            const path = `$.metadata.fields[${i}]`; const field = dataRecord(value);
            if (!field) { issue(path, "Expected a display field data object."); continue; }
            fields(field, ["label", "value"], path);
            customFields.push(Object.freeze({ label: text(field.label, `${path}.label`, 80), value: text(field.value, `${path}.value`, 500) }));
          }
        }
        metadata = Object.freeze({ name, author, description, platforms: item.platforms === "universal" ? "universal" : Object.freeze(platforms), languages: Object.freeze(languages),
          ...(typeof item.repository === "string" ? { repository: item.repository } : {}),
          ...(item.translations === undefined ? {} : { translations: Object.freeze(translations) }),
          ...(item.fields === undefined ? {} : { fields: Object.freeze(customFields) }),
        });
      }
    }

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
      ...(metadata === undefined ? {} : { metadata }),
      provides: Object.freeze(provides), requires: Object.freeze(requires),
      permissions: Object.freeze(requiredPermissions), optionalPermissions: Object.freeze(optionalPermissions),
    });
    return Object.freeze({ ok: true, manifest });
  } catch {
    issue("$", "Metadata could not be inspected as serializable data.");
    return Object.freeze({ ok: false, diagnostics: Object.freeze(diagnostics) });
  }
}
