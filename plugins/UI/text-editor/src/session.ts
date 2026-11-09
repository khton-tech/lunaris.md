import type { FilesystemApi, FileTarget, FsFailure, FsResult } from "@lunaris/filesystem";
import type { DraftRecord } from "@lunaris/remote";

export interface SessionDraft {
  load(): Promise<FsResult<DraftRecord | null>>;
  save(text: string, expectedVersion: string, revision: string): Promise<FsResult<null>>;
  remove(revision: string): Promise<FsResult<null>>;
}

export const AUTOSAVE_DELAY = 2000;
const ok = (): FsResult<null> => ({ ok: true, value: null });
const failed = (code: FsFailure["code"], message: string): FsResult<null> => ({ ok: false, error: { code, message } });
export interface Timer {
  after(callback: () => void, delay: number): unknown;
  cancel(handle: unknown): void;
}
const timer: Timer = { after: (callback, delay) => setTimeout(callback, delay), cancel: handle => clearTimeout(handle as ReturnType<typeof setTimeout>) };

/** A document buffer outlives its renderer. No SDK access is made after closure. */
export class DocumentSession {
  text = ""; savedText = ""; version = "";
  loaded = false; loading = false; saving = false; locks = 0; missing = false;
  error: FsFailure | null = null;
  private timeout: unknown;
  private pending: Promise<FsResult<null>> | undefined;
  private reading: Promise<void> | undefined;
  private closed = false;
  private recovered = false;
  private revision = "";
  private draftPending: Promise<FsResult<null>> = Promise.resolve(ok());
  draftSaved = false;
  draftError = false;
  constructor(public target: FileTarget, private readonly fs: FilesystemApi,
    private readonly alive: () => boolean, private readonly changed: () => void,
    private readonly log: (level: "info" | "warn" | "error", message: string, error?: unknown) => void,
    private readonly clock: Timer = timer, private readonly draft?: SessionDraft) {}
  get dirty(): boolean { return this.loaded && (this.recovered || this.text !== this.savedText); }
  get active(): boolean { return !this.closed && this.alive(); }
  cancelTimer(): void { if (this.timeout !== undefined) this.clock.cancel(this.timeout); this.timeout = undefined; }
  edit(text: string): void {
    if (!this.active || !this.loaded || this.loading || this.locks || this.missing) return;
    this.text = text; this.cancelTimer();
    if (this.draft) void this.persistDraft();
    // A conflict requires an explicit recovery decision, not repeated autosaves.
    if (this.dirty && !this.error) this.timeout = this.clock.after(() => { this.timeout = undefined; void this.flush(); }, AUTOSAVE_DELAY);
    this.changed();
  }
  persistDraft(): Promise<FsResult<null>> {
    if (!this.draft || !this.active) return Promise.resolve(failed("UNSUPPORTED", "Local recovery is unavailable."));
    const text = this.text; const version = this.version; const revision = `${Date.now()}:${Math.random()}`;
    this.revision = revision; this.draftSaved = false;
    this.draftPending = this.draftPending.then(async () => {
      if (!this.active) return failed("CANCELLED", "Document session closed.");
      const result = await this.draft!.save(text, version, revision);
      if (this.active && this.revision === revision) {
        this.draftSaved = result.ok; this.draftError = !result.ok;
        if (!result.ok) this.log("error", "Cannot persist local recovery draft", result.error);
        this.changed();
      }
      return result;
    }).catch(error => {
      if (this.active) { this.draftError = true; this.draftSaved = false; this.log("error", "Local draft storage failed", error); this.changed(); }
      return failed("IO_ERROR", "Cannot persist local recovery draft.");
    });
    return this.draftPending;
  }
  hold(): () => void {
    this.locks++; this.cancelTimer(); this.changed(); let released = false;
    return () => { if (released) return; released = true; this.locks--; if (this.active) this.changed(); };
  }
  /** Delayed watch echoes must not disable the renderer for an unchanged file. */
  async refresh(): Promise<void> {
    if (!this.active || !this.loaded || this.dirty || this.saving || this.loading || this.locks) return;
    const target = { ...this.target }; const version = this.version; const text = this.text;
    const relevant = () => this.active && !this.dirty && !this.saving && !this.loading && !this.locks &&
      this.target.vaultId === target.vaultId && this.target.path === target.path && this.version === version && this.text === text;
    try {
      const result = await this.fs.readText(target);
      if (!relevant()) return;
      if (result.ok && result.value.version === version && result.value.text === text) return;
    } catch (error) {
      if (!relevant()) return;
      this.log("error", "Cannot check document changes", error);
    }
    // A real change or read failure uses the normal authoritative reload path.
    if (relevant()) await this.load();
  }
  load(discard = false): Promise<void> {
    if (this.reading) return this.reading;
    if (!this.active || (this.dirty && !discard)) return Promise.resolve();
    this.cancelTimer(); this.loading = true; this.changed();
    const target = { ...this.target };
    const work = async () => {
      try {
        if (!this.active) return;
        const local = this.draft ? await this.draft.load() : null;
        if (!this.active) return;
        let draft = local?.ok ? local.value : null;
        if (local && !local.ok) { this.draftError = true; this.log("error", "Cannot load local recovery draft", local.error); }
        if (discard && draft && this.draft) { await this.draft.remove(draft.revision); draft = null; this.recovered = false; this.draftSaved = false; }
        if (!this.active) return;
        const result = await this.fs.readText(target);
        if (!this.active || this.target.path !== target.path) return;
        if (!result.ok) {
          if (draft) { this.text = draft.text; this.version = draft.expectedVersion; this.revision = draft.revision; this.loaded = true; this.recovered = true; this.draftSaved = true; }
          this.error = result.error; this.missing = result.error.code === "NOT_FOUND"; this.log("error", "Cannot read document", result.error); return;
        }
        this.text = result.value.text; this.savedText = result.value.text; this.version = result.value.version;
        this.loaded = true; this.error = null; this.missing = false; this.recovered = false;
        if (draft && this.draft) {
          this.revision = draft.revision;
          if (draft.text === result.value.text) await this.draft.remove(draft.revision);
          else {
            this.text = draft.text; this.version = draft.expectedVersion; this.recovered = true; this.draftSaved = true;
            if (draft.expectedVersion !== result.value.version) this.error = { code: "CONFLICT", message: "The remote file changed while a local draft was pending." };
            else this.timeout = this.clock.after(() => { this.timeout = undefined; void this.flush(); }, AUTOSAVE_DELAY);
          }
        }
        this.log("info", "Document loaded");
      } catch (error) {
        if (this.active) { this.error = { code: "IO_ERROR", message: "Cannot read document." }; this.log("error", "Document read failed", error); }
      } finally { this.loading = false; this.reading = undefined; if (this.active) this.changed(); }
    };
    this.reading = Promise.resolve().then(work); return this.reading;
  }
  flush(): Promise<FsResult<null>> {
    this.cancelTimer();
    if (this.pending) return this.pending;
    if (!this.active) return Promise.resolve(failed("CANCELLED", "Document session is closed."));
    if (!this.dirty) return Promise.resolve(ok());
    if (this.missing) return Promise.resolve(failed("NOT_FOUND", "The document was removed."));
    this.saving = true; this.changed();
    const work = async (): Promise<FsResult<null>> => {
      try {
        while (this.active && this.dirty) {
          const text = this.text; const target = { ...this.target };
          const preserving = this.draft ? this.persistDraft() : null;
          const revision = this.revision;
          if (preserving) await preserving;
          if (!this.active) return failed("CANCELLED", "Document session is closed.");
          const result = await this.fs.writeText(target, text, { mode: "replace", expectedVersion: this.version });
          if (!this.active) return failed("CANCELLED", "Document session is closed.");
          if (!result.ok) {
            this.error = result.error; this.missing = result.error.code === "NOT_FOUND";
            this.log(result.error.code === "CONFLICT" ? "warn" : "error", "Cannot save document; buffer retained", result.error); return result;
          }
          this.savedText = text; this.version = result.value.version; this.error = null; this.recovered = false;
          if (this.draft) {
            await this.draft.remove(revision);
            if (!this.active) return failed("CANCELLED", "Document session is closed.");
            if (this.dirty) await this.persistDraft(); else this.draftSaved = false;
          }
        }
        if (!this.active) return failed("CANCELLED", "Document session is closed.");
        this.log("info", "Document saved"); return ok();
      } catch (error) {
        if (this.active) { this.error = { code: "IO_ERROR", message: "Cannot save document." }; this.log("error", "Document save failed; buffer retained", error); }
        return failed("IO_ERROR", "Cannot save document.");
      } finally { this.saving = false; this.pending = undefined; if (this.active) this.changed(); }
    };
    this.pending = Promise.resolve().then(work); return this.pending;
  }
  dispose(): void { this.closed = true; this.cancelTimer(); }
}
