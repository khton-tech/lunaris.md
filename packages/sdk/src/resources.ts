import type { CancellationSignal } from './context.js';
import { LunarisError } from './errors.js';

export type PackageResourceFiles = Readonly<Record<string, readonly number[]>>;
export interface PackageResources {
  /** Canonical package assets only; no host paths or resource URLs. */
  list(): readonly { readonly path: string; readonly byteLength: number }[];
  /** Read a bounded copy. The default and maximum chunk is 16 KiB. */
  read(path: string, offset?: number, length?: number): readonly number[];
  /** Decode a complete UTF-8 asset of at most 64 KiB; malformed UTF-8 fails. */
  text(path: string): string;
}

/** Host/execution adapter utility: capture bytes before activation, bind to its signal. */
export function capturePackageResources(files: PackageResourceFiles = {}): (signal: CancellationSignal) => PackageResources {
  const fail = (message: string): never => { throw new LunarisError('VALIDATION_FAILED', message); };
  const entries = Object.entries(files); const aliases = new Set<string>(); const captured = new Map<string, Uint8Array>(); let total = 0;
  if (entries.length > 512) fail('Too many package resources.');
  for (const [name, input] of entries) {
    if (name.length > 240 || !name.startsWith('assets/') || !/^[a-zA-Z0-9_.\/-]+$/.test(name) || name.split('/').some(part => !part || part === '.' || part === '..' || part.endsWith('.') || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) || aliases.has(name.toLowerCase())) fail('Invalid or aliased package resource path.');
    if (!Array.isArray(input) || input.length > 16 * 1024 * 1024 || (total += input.length) > 32 * 1024 * 1024) fail('Invalid package resource bytes or size.');
    for (const byte of input) if (!Number.isInteger(byte) || byte < 0 || byte > 255) fail('Invalid package resource byte.');
    aliases.add(name.toLowerCase()); captured.set(name, new Uint8Array(input));
  }
  for (const name of aliases) if ([...aliases].some(other => other !== name && other.startsWith(name + '/'))) fail('Conflicting package resource paths.');
  const listing = Object.freeze([...captured].sort(([a], [b]) => a < b ? -1 : 1).map(([path, bytes]) => Object.freeze({ path, byteLength: bytes.length })));
  return signal => {
    const active = (): void => { if (signal.aborted) throw new LunarisError('SCOPE_CLOSED', 'Package resource activation is closed.'); };
    const file = (name: string): Uint8Array => { active(); const bytes = captured.get(name); if (!bytes) fail('Package resource not found.'); return bytes!; };
    return Object.freeze({
      list() { active(); return listing; },
      read(name: string, offset = 0, length = 16384) {
        const bytes = file(name);
        if (!Number.isSafeInteger(offset) || offset < 0 || offset > bytes.length || !Number.isSafeInteger(length) || length < 0 || length > 16384) fail('Invalid package resource range.');
        return Object.freeze(Array.from(bytes.subarray(offset, offset + length)));
      },
      text(name: string) {
        const bytes = file(name); if (bytes.length > 65536) fail('Text resource exceeds 64 KiB; use chunked reads.');
        // URI decoding specifies strict UTF-8 and is available in isolated ECMAScript runtimes.
        try { return decodeURIComponent(Array.from(bytes, byte => '%' + byte.toString(16).padStart(2, '0')).join('')).replace(/^\uFEFF/, ''); }
        catch { return fail('Package resource is not valid UTF-8.'); }
      },
    });
  };
}
