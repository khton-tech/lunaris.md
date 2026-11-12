import type { DocumentContentApi, DocumentRange } from "@lunaris/active-document";
import type { FileTarget, FsResult } from "@lunaris/filesystem";
import type { DocumentSession } from "./session.js";

interface Host {
  alive(): boolean;
  buffers(): readonly DocumentSession[];
  read(target: FileTarget): ReturnType<DocumentContentApi["read"]>;
  open(target: FileTarget): Promise<FsResult<null>>;
  current(): DocumentSession | null;
  transact(session: DocumentSession, range: DocumentRange, insert?: string): boolean;
}
const same = (a: FileTarget, b: FileTarget) => a.vaultId === b.vaultId && a.path === b.path;
const fail = (code: "CANCELLED" | "CONFLICT" | "INVALID_ARGUMENT" | "UNSUPPORTED", message: string): FsResult<null> => ({ ok: false, error: { code, message } });
/** Keep navigation, stale-result checks and edits together across asynchronous transitions. */
export function createDocumentContent(host: Host): DocumentContentApi {
  async function act(target: FileTarget, range: DocumentRange, expectedText: string, insert?: string): Promise<FsResult<null>> {
    if (!Number.isSafeInteger(range.from) || !Number.isSafeInteger(range.to) || range.from < 0 || range.to < range.from || range.to > expectedText.length)
      return fail("INVALID_ARGUMENT", "Invalid document range.");
    if (!host.alive()) return fail("CANCELLED", "Document provider stopped.");
    const opened = await host.open(target);
    if (!opened.ok) return opened;
    if (!host.alive()) return fail("CANCELLED", "Document provider stopped.");
    const session = host.current();
    if (!session || !same(session.target, target)) return fail("CONFLICT", "Active document changed.");
    if (!session.loaded || session.loading) await session.load();
    if (!host.alive() || !session.active) return fail("CANCELLED", "Document provider stopped.");
    if (host.current() !== session || !same(session.target, target) || session.text !== expectedText)
      return fail("CONFLICT", "The source changed. Refresh the results.");
    if (!session.loaded || session.loading || session.locks || session.missing || session.recoveryCandidates.length)
      return fail("CONFLICT", "Document is unavailable or requires recovery.");
    if (!host.transact(session, range, insert)) return fail("UNSUPPORTED", "The editor view is unavailable.");
    return { ok: true, value: null };
  }
  return {
    buffers: () => host.buffers().filter(s => s.active && s.loaded && !s.missing).map(s => ({ target: { ...s.target }, text: s.text, version: s.version })),
    async read(target) {
      const session = host.buffers().find(s => same(s.target, target) && s.active && s.loaded && !s.missing);
      return session ? { ok: true, value: { text: session.text, version: session.version } } : host.read(target);
    },
    reveal: (target, range, expectedText) => act(target, range, expectedText),
    replace: (target, range, insert, expectedText) => act(target, range, expectedText, insert),
  };
}
