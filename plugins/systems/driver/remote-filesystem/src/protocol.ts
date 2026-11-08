import { validPath } from "@lunaris/filesystem";
function version(value: unknown): boolean { return typeof value === "string" && value.length > 0; }
function info(input: unknown): boolean {
  const value = input as { path: string; kind: string; size: number; modifiedAt: number | null } | null;
  return !!value && validPath(value.path, true) && ["file", "directory", "other", "symlink"].includes(value.kind) &&
    Number.isSafeInteger(value.size) && value.size >= 0 && (value.modifiedAt === null || Number.isFinite(value.modifiedAt));
}
/** Reject malformed receipts before the editor can lose its conditional version. */
export function validFileResponse(operation: string, input: unknown): boolean {
  const value = input as { text?: unknown; data?: unknown; version?: unknown } | null;
  switch (operation) {
    case "readText": return !!value && typeof value.text === "string" && version(value.version);
    case "readFile": return !!value && Array.isArray(value.data) && value.data.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255) && version(value.version);
    case "writeText": case "writeFile": return !!value && version(value.version);
    case "stat": return info(input);
    case "list": return Array.isArray(input) && input.every(info);
    case "createDirectory": case "remove": case "move": case "copy": return input === null;
    default: return false;
  }
}
