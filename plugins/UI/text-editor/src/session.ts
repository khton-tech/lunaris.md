import type { FilesystemApi, FileTarget, FsFailure, FsResult } from "@lunaris/filesystem";

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
  constructor(public target: FileTarget, private readonly fs: FilesystemApi,
    private readonly alive: () => boolean, private readonly changed: () => void,
    private readonly log: (level: "info" | "warn" | "error", message: string, error?: unknown) => void,
    private readonly clock: Timer = timer) {}
  get dirty(): boolean { return this.loaded && this.text !== this.savedText; }
  get active(): boolean { return !this.closed && this.alive(); }
  cancelTimer(): void { if (this.timeout !== undefined) this.clock.cancel(this.timeout); this.timeout = undefined; }
  edit(text: string): void {
    if (!this.active || !this.loaded || this.loading || this.locks || this.missing) return;
    this.text = text; this.cancelTimer();
    // A conflict requires an explicit recovery decision, not repeated autosaves.
    if (this.dirty && !this.error) this.timeout = this.clock.after(() => { this.timeout = undefined; void this.flush(); }, AUTOSAVE_DELAY);
    this.changed();
  }
  hold(): () => void {
    this.locks++; this.cancelTimer(); this.changed(); let released = false;
    return () => { if (released) return; released = true; this.locks--; if (this.active) this.changed(); };
  }
  load(discard = false): Promise<void> {
    if (this.reading) return this.reading;
    if (!this.active || (this.dirty && !discard)) return Promise.resolve();
    this.cancelTimer(); this.loading = true; this.changed();
    const target = { ...this.target };
    const work = async () => {
      try {
        if (!this.active) return;
        const result = await this.fs.readText(target);
        if (!this.active || this.target.path !== target.path) return;
        if (!result.ok) { this.error = result.error; this.missing = result.error.code === "NOT_FOUND"; this.log("error", "Cannot read document", result.error); return; }
        this.text = result.value.text; this.savedText = result.value.text; this.version = result.value.version;
        this.loaded = true; this.error = null; this.missing = false;
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
          const result = await this.fs.writeText(target, text, { mode: "replace", expectedVersion: this.version });
          if (!this.active) return failed("CANCELLED", "Document session is closed.");
          if (!result.ok) {
            this.error = result.error; this.missing = result.error.code === "NOT_FOUND";
            this.log(result.error.code === "CONFLICT" ? "warn" : "error", "Cannot save document; buffer retained", result.error); return result;
          }
          this.savedText = text; this.version = result.value.version; this.error = null;
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
