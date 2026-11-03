import { valid, validRange, satisfies } from "semver";

export function isValidId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(value);
}

export function isExactVersion(value: unknown): value is string {
  return typeof value === "string" &&
    /^\d+\.\d+\.\d+(?:[-+].*)?$/.test(value) && valid(value) !== null;
}

export function isVersionRange(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && validRange(value) !== null;
}

/** Match with standard SemVer prerelease exclusion; malformed inputs never match. */
export function versionSatisfies(version: string, range: string): boolean {
  return isExactVersion(version) && isVersionRange(range) && satisfies(version, range);
}
