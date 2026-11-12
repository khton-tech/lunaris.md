import type { FilesystemApi, FileTarget, FsFailure, FsResult } from "@lunaris/filesystem";
import type { DraftRecord } from "@lunaris/remote";

export interface SessionDraft {
  load(): Promise<FsResult<DraftRecord | readonly DraftRecord[] | null>>;
  save(text: string, expectedVersion: string, revision: string): Promise<FsResult<null>>;
  remove(revision: string, record?: DraftRecord): Promise<FsResult<null>>;
}

export const AUTOSAVE_DELAY = 1000;
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
  private refreshing: Promise<void> | undefined;
  private refreshAgain = false;
  private closed = false;
  private recovered = false;
  private recoveryRecord: DraftRecord | undefined;
  recoveryCandidates: readonly DraftRecord[] = [];
  private revision = "";
  private draftPending: Promise<FsResult<null>> = Promise.resolve(ok());
  private recoveryWork = 0;
  get hasUnprotectedChanges(): boolean { return (this.dirty && !this.draftSaved) || this.recoveryWork > 0 || this.draftError; }
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
    if (!this.active || !this.loaded || this.loading || this.locks || this.missing || this.recoveryCandidates.length > 0) return;
    if (text === this.text) return;
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
    this.recoveryWork++;
    let notify = false;
    this.draftPending = this.draftPending.then(async () => {
      if (!this.active) return failed("CANCELLED", "Document session closed.");
      // A queued snapshot superseded before storage starts carries no unique data.
      if (this.revision !== revision) return ok();
      const result = await this.draft!.save(text, version, revision);
      if (this.active && this.revision === revision) {
        this.draftSaved = result.ok; this.draftError = !result.ok;
        if (!result.ok) this.log("error", "Cannot persist local recovery draft", result.error);
        notify = true;
      }
      return result;
    }).catch(error => {
      if (this.active && this.revision === revision) { this.draftError = true; this.draftSaved = false; this.log("error", "Local draft storage failed", error); notify = true; }
      return failed("IO_ERROR", "Cannot persist local recovery draft.");
    });
    this.draftPending = this.draftPending.finally(() => { this.recoveryWork--; if (this.active && (notify || this.recoveryWork === 0)) this.changed(); });
    return this.draftPending;
  }
  hold(): () => void {
    this.locks++; this.cancelTimer(); this.changed(); let released = false;
    return () => { if (released) return; released = true; this.locks--; if (this.active) this.changed(); };
  }
  /** Delayed watch echoes must not disable the renderer for an unchanged file. */
  refresh(): Promise<void> {
    if (this.refreshing) { this.refreshAgain = true; return this.refreshing; }
    if (!this.active || !this.loaded || this.dirty || this.saving || this.loading || this.locks || this.recoveryCandidates.length) return Promise.resolve();
    const target = { ...this.target }; const version = this.version; const text = this.text;
    const relevant = () => this.active && !this.dirty && !this.saving && !this.loading && !this.locks &&
      this.target.vaultId === target.vaultId && this.target.path === target.path && this.version === version && this.text === text;
    const work = async () => {
      try {
        const result = await this.fs.readText(target);
        if (!relevant()) return;
        if (!result.ok) {
          this.error = result.error; this.missing = result.error.code === "NOT_FOUND";
          this.log("error", "Cannot check document changes", result.error); this.changed(); return;
        }
        if (this.draft && (this.recoveryWork || this.revision || this.recoveryRecord || this.draftError)) {
          const settled = await this.settleRecovery(false);
          if (!relevant()) return;
          if (!settled.ok) { this.error = settled.error; this.changed(); return; }
        }
        if (result.value.version === version && result.value.text === text && !this.error && !this.missing) return;
        this.text = result.value.text; this.savedText = result.value.text; this.version = result.value.version;
        this.error = null; this.missing = false;
        this.log("info", "Document refreshed"); this.changed();
      } catch (error) {
        if (!relevant()) return;
        this.error = { code: "IO_ERROR", message: "Cannot check document changes." };
        this.log("error", "Cannot check document changes", error); this.changed();
      }
    };
    this.refreshing = work().finally(async () => {
      this.refreshing = undefined;
      if (this.refreshAgain) { this.refreshAgain = false; await this.refresh(); }
    });
    return this.refreshing;
  }
  load(discard = false): Promise<void> {
    if (this.reading) return this.reading;
    if (!this.active || (this.dirty && !discard)) return Promise.resolve();
    this.cancelTimer(); this.loading = true; this.changed();
    const target = { ...this.target };
    const work = async () => {
      try {
        if (!this.active) return;
        if (discard && this.draft) {
          const pending = await this.draftPending;
          if (!pending.ok) { this.error = pending.error; this.draftError = true; return; }
          const acknowledgements: [string, DraftRecord?][] = [];
          if (this.revision) acknowledgements.push([this.revision]);
          if (this.recoveryRecord) acknowledgements.push([this.recoveryRecord.revision, this.recoveryRecord]);
          for (const [revision, record] of acknowledgements) {
            if (!this.active) return;
            const removed = await this.draft.remove(revision, record);
            if (!removed.ok) { this.error = removed.error; this.draftError = true; this.log("error", "Cannot discard local recovery draft", removed.error); return; }
          }
          if (this.missing) this.savedText = this.text;
          this.revision = ""; this.recoveryRecord = undefined; this.recovered = false; this.draftSaved = false; this.draftError = false;
        }
        if (!this.active) return;
        const local = this.draft ? await this.draft.load() : null;
        if (!this.active) return;
        const candidates: readonly DraftRecord[] = local?.ok && local.value ? (Array.isArray(local.value) ? local.value : [local.value as DraftRecord]) : [];
        this.recoveryCandidates = candidates.length > 1 || discard ? candidates : [];
        let draft = !discard && candidates.length === 1 ? candidates[0]! : null;
        if (local && !local.ok) { this.draftError = true; this.log("error", "Cannot load local recovery draft", local.error); }
        if (discard && local && !local.ok) { this.error = local.error; return; }
        if (!this.active) return;
        this.recoveryRecord = draft ?? undefined;
        const result = await this.fs.readText(target);
        if (!this.active || this.target.path !== target.path) return;
        if (!result.ok) {
          if (draft) { this.text = draft.text; this.version = draft.expectedVersion; this.revision = draft.revision; this.loaded = true; this.recovered = true; this.draftSaved = false; void this.persistDraft(); }
          this.error = result.error; this.missing = result.error.code === "NOT_FOUND"; this.log("error", "Cannot read document", result.error); return;
        }
        this.text = result.value.text; this.savedText = result.value.text; this.version = result.value.version;
        this.loaded = true; this.error = null; this.missing = false; this.recovered = false;
        if (draft && this.draft) {
          this.revision = draft.revision;
          if (draft.text === result.value.text) { const removed = await this.draft.remove(draft.revision, draft); if (!removed.ok) { this.draftError = true; this.error = removed.error; } }
          else {
            this.text = draft.text; this.version = draft.expectedVersion; this.recovered = true; this.draftSaved = false; void this.persistDraft();
            if (draft.expectedVersion !== result.value.version) this.error = { code: "CONFLICT", message: "The remote file changed while a local draft was pending." };
            else this.timeout = this.clock.after(() => { this.timeout = undefined; void this.flush(); }, AUTOSAVE_DELAY);
          }
        }
        if (this.recoveryCandidates.length) { this.cancelTimer(); this.error = { code: "CONFLICT", message: "Choose a recovery draft before editing." }; }
        this.recoveryRecord = draft ?? undefined;
        this.log("info", "Document loaded");
      } catch (error) {
        if (this.active) { if (discard) this.draftError = true; this.error = { code: "IO_ERROR", message: "Cannot read document." }; this.log("error", "Document read failed", error); }
      } finally { this.loading = false; this.reading = undefined; if (this.active) this.changed(); }
    };
    this.reading = Promise.resolve().then(work); return this.reading;
  }
  flush(): Promise<FsResult<null>> {
    this.cancelTimer();
    if (this.recoveryCandidates.length) return Promise.resolve(ok());
    if (this.pending) return this.pending;
    if (!this.active) return Promise.resolve(failed("CANCELLED", "Document session is closed."));
    if (!this.dirty) return this.settleRecovery();
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
            await this.draftPending;
            if (!this.active) return failed("CANCELLED", "Document session is closed.");
            const removed = await this.draft.remove(revision);
            if (!removed.ok) { this.error = removed.error; this.draftError = true; this.log("error", "Cannot remove acknowledged recovery draft", removed.error); return removed; }
            if (!this.active) return failed("CANCELLED", "Document session is closed.");
            if (this.recoveryRecord) {
              const recovered = this.recoveryRecord;
              const cleanup = await this.draft.remove(recovered.revision, recovered);
              if (!cleanup.ok) { this.error = cleanup.error; this.draftError = true; return cleanup; }
              this.recoveryRecord = undefined;
            }
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
  selectRecovery(index: number): void {
    if (!this.active || this.loading || this.saving || this.locks) return;
    const record = this.recoveryCandidates[index]; if (!record) return;
    this.loaded = true; this.recoveryRecord = record; this.recoveryCandidates = [];
    this.text = record.text; this.version = record.expectedVersion; this.recovered = true; this.draftSaved = false;
    this.error = { code: "CONFLICT", message: "Recovery selected; review and save explicitly." };
    if (this.draft) void this.persistDraft(); this.changed();
  }
  private async settleRecovery(saveEdits = true): Promise<FsResult<null>> {
    let observed: Promise<FsResult<null>>; let result: FsResult<null>;
    do { observed = this.draftPending; result = await observed; } while (observed !== this.draftPending);
    if (!this.active) return failed("CANCELLED", "Document session is closed.");
    if (!result.ok) return result;
    if (this.dirty) return saveEdits ? this.flush() : ok();
    if (this.draft && (this.revision || this.recoveryRecord)) {
      const revision = this.revision; this.recoveryWork++;
      try {
        const removed = revision ? await this.draft.remove(revision) : ok();
        if (!removed.ok) { this.draftError = true; this.error = removed.error; return removed; }
        if (!this.active) return failed("CANCELLED", "Document session is closed.");
        if (this.recoveryRecord) {
          const record = this.recoveryRecord; const removed = await this.draft.remove(record.revision, record);
          if (!removed.ok) { this.draftError = true; this.error = removed.error; return removed; }
          if (this.recoveryRecord === record) this.recoveryRecord = undefined;
        }
        if (this.revision === revision) { this.revision = ""; this.draftError = false; this.draftSaved = false; }
      } catch (error) { this.draftError = true; this.log("error", "Cannot settle recovery cleanup", error); return failed("IO_ERROR", "Cannot remove obsolete recovery draft."); }
      finally { this.recoveryWork--; if (this.active) this.changed(); }
      if (this.revision !== "") return this.settleRecovery(saveEdits);
    }
    return result;
  }
  dispose(): void { this.closed = true; this.cancelTimer(); }
}
