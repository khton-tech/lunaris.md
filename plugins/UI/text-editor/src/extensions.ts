import type { EditorExtension, EditorExtensionsApi } from "@lunaris/editor";
import type { CancellationSignal } from "@lunaris/sdk";
/** Owns contribution lifetimes; the adapter owns CodeMirror compartments. */
export function createExtensions(signal: CancellationSignal, changed: () => void) {
  const entries = new Map<string, EditorExtension>();
  const removers = new Set<() => void>();
  let snapshot: readonly EditorExtension[] = [];
  const publish = () => { snapshot = Object.freeze([...entries.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)); if (!signal.aborted) changed(); };
  const api: EditorExtensionsApi = { register(value, owner) {
    const fail = (code: "INVALID_ARGUMENT" | "ALREADY_REGISTERED" | "CANCELLED", message: string) => ({ ok: false as const, error: { code, message } });
    if (signal.aborted || owner.aborted) return fail("CANCELLED", "Extension owner is closed.");
    if (!value || typeof value.id !== "string" || !value.id.trim() || (value.extension === undefined && value.markdown === undefined)) return fail("INVALID_ARGUMENT", "An ID and contribution are required.");
    if (entries.has(value.id)) return fail("ALREADY_REGISTERED", "Extension ID is already registered.");
    const entry = Object.freeze({ ...value }); let active = true;
    const dispose = () => { if (!active) return; active = false; owner.removeEventListener("abort", dispose); removers.delete(dispose); entries.delete(entry.id); publish(); };
    entries.set(entry.id, entry); removers.add(dispose); owner.addEventListener("abort", dispose, { once: true }); publish();
    return { ok: true, value: { dispose } };
  } };
  signal.addEventListener("abort", () => { for (const remove of [...removers]) remove(); }, { once: true });
  return { api, current: () => snapshot };
}
