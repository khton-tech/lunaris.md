import { validateManifest } from "@lunaris/manifest";
import type { HostVersions, PluginManifest } from "@lunaris/manifest";
import { sha256 } from "@noble/hashes/sha2.js";

export const LUP_LIMITS = Object.freeze({ archiveBytes: 32 * 1024 * 1024, fileBytes: 16 * 1024 * 1024, manifestBytes: 64 * 1024, entries: 512, pathBytes: 240 });
export class LupError extends Error {
  constructor(readonly code: "LUP_INVALID" | "LUP_LIMIT" | "LUP_PATH" | "LUP_MANIFEST", message: string) { super(message); this.name = "LupError"; }
}
export interface LupEntry { readonly path: string; readonly data: Uint8Array }
export interface InspectedLup {
  readonly formatVersion: 1;
  readonly manifest: PluginManifest;
  readonly digest: string;
  readonly byteLength: number;
  readonly paths: readonly string[];
  /** Fresh copies preserve the inspected package's exact byte identity. */
  read(path: string): Uint8Array | undefined;
  bytes(): Uint8Array;
}
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const fail = (code: LupError['code'], message: string): never => { throw new LupError(code, message); };

/** A portable subset prevents Windows device/ADS aliases and cross-host path changes. */
export function validLupPath(path: string): boolean {
  return path.length > 0 && encoder.encode(path).length <= LUP_LIMITS.pathBytes && /^[A-Za-z0-9_./-]+$/.test(path) &&
    path.split('/').every(part => part !== '' && part !== '.' && part !== '..' && !part.endsWith('.') &&
      !/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part));
}

function checkPaths(paths: readonly string[]): void {
  const seen = new Set<string>();
  for (const path of paths) {
    if (!validLupPath(path)) fail('LUP_PATH', 'A package path is not portable or escapes its root.');
    const folded = path.toLowerCase();
    if (seen.has(folded)) fail('LUP_PATH', 'Duplicate or case-aliased package paths.');
    seen.add(folded);
  }
  for (const path of seen) {
    const parts = path.split('/'); parts.pop();
    while (parts.length) { if (seen.has(parts.join('/'))) fail('LUP_PATH', 'A package file is also used as a directory.'); parts.pop(); }
  }
}

/** LUP v1 is a bounded, uncompressed file-only container; no executable inspection. */
export function inspectLup(input: Uint8Array, versions?: HostVersions): InspectedLup {
  if (input.byteLength > LUP_LIMITS.archiveBytes) fail('LUP_LIMIT', 'Package exceeds the archive byte limit.');
  const bytes = new Uint8Array(input);
  if (bytes.length < 8 || bytes[0] !== 76 || bytes[1] !== 85 || bytes[2] !== 80 || bytes[3] !== 1) fail('LUP_INVALID', 'Expected LUP format version 1.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(4, true);
  if (count < 2 || count > LUP_LIMITS.entries) fail('LUP_LIMIT', 'Invalid package entry count.');
  const files = new Map<string, Uint8Array>(); let offset = 8;
  for (let index = 0; index < count; index++) {
    if (offset + 6 > bytes.length) fail('LUP_INVALID', 'Truncated package entry header.');
    const pathSize = view.getUint16(offset, true); const size = view.getUint32(offset + 2, true); offset += 6;
    if (!pathSize || pathSize > LUP_LIMITS.pathBytes || size > LUP_LIMITS.fileBytes) fail('LUP_LIMIT', 'Package entry exceeds a size limit.');
    if (offset + pathSize + size > bytes.length) fail('LUP_INVALID', 'Truncated package entry.');
    let path: string;
    try { path = decoder.decode(bytes.subarray(offset, offset + pathSize)); } catch { return fail('LUP_PATH', 'Invalid UTF-8 package path.'); }
    offset += pathSize;
    // Do not overwrite duplicates before the complete path policy is applied.
    if (files.has(path)) fail('LUP_PATH', 'Duplicate package path.');
    files.set(path, bytes.subarray(offset, offset + size)); offset += size;
  }
  if (offset !== bytes.length) fail('LUP_INVALID', 'Trailing bytes after package entries.');
  checkPaths([...files.keys()]);
  const manifestBytes = files.get('manifest.json');
  if (!manifestBytes || manifestBytes.length > LUP_LIMITS.manifestBytes) fail('LUP_MANIFEST', 'Missing or oversized manifest.json.');
  let raw: unknown;
  try { raw = JSON.parse(decoder.decode(manifestBytes)); } catch { return fail('LUP_MANIFEST', 'Malformed manifest.json.'); }
  const checked = validateManifest(raw, versions);
  if (!checked.ok || !checked.manifest.metadata) return fail('LUP_MANIFEST', 'Package requires a valid compatible manifest with display metadata.');
  const manifest = checked.manifest;
  if (!files.has(manifest.entry.slice(2))) fail('LUP_MANIFEST', 'Manifest entry is absent from the package.');
  const digest = [...sha256(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return Object.freeze({ formatVersion: 1, manifest, digest, byteLength: bytes.length, paths: Object.freeze([...files.keys()].sort()),
    read: (path: string) => files.get(path)?.slice(), bytes: () => bytes.slice(),
  });
}

/** Deterministic encoder shared with the inspector used by the installer. */
export function packLup(entries: readonly LupEntry[], versions?: HostVersions): Uint8Array {
  if (entries.length < 2 || entries.length > LUP_LIMITS.entries) fail('LUP_LIMIT', 'Invalid package entry count.');
  checkPaths(entries.map(entry => entry.path));
  const sorted = [...entries].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  let size = 8;
  for (const entry of sorted) {
    if (!(entry.data instanceof Uint8Array) || entry.data.length > LUP_LIMITS.fileBytes) fail('LUP_LIMIT', 'Invalid or oversized entry data.');
    size += 6 + encoder.encode(entry.path).length + entry.data.length;
  }
  if (size > LUP_LIMITS.archiveBytes) fail('LUP_LIMIT', 'Package exceeds the archive byte limit.');
  const bytes = new Uint8Array(size); bytes.set([76, 85, 80, 1]); const view = new DataView(bytes.buffer); view.setUint32(4, sorted.length, true);
  let offset = 8;
  for (const entry of sorted) {
    const path = encoder.encode(entry.path); view.setUint16(offset, path.length, true); view.setUint32(offset + 2, entry.data.length, true); offset += 6;
    bytes.set(path, offset); offset += path.length; bytes.set(entry.data, offset); offset += entry.data.length;
  }
  inspectLup(bytes, versions);
  return bytes;
}
