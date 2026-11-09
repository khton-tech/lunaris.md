import { validPath } from "@lunaris/filesystem";
import type { FilesystemApi, FileInfo, FsResult } from "@lunaris/filesystem";

export interface Entry { id: string; name: string; kind: FileInfo["kind"]; children?: Entry[] }
export type ExplorerDraft = { form: { kind: "file" | "folder"; parent: string; initialName?: string } | { kind: "delete"; paths: string[] } | null; name: string };
export const parentPath = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));
const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const inside = (path: string, parent: string) => path === parent || path.startsWith(`${parent}/`);
export const topLevel = (paths: readonly string[]) => [...new Set(paths)].filter(path => !paths.some(other => other !== path && inside(path, other)));

/** Portable, controlled tree state; no renderer or platform dependencies. */
export class ExplorerModel {
  readonly directories = new Map<string, readonly FileInfo[]>();
  readonly expanded = new Set<string>();
  selection: string[] = [];
  clipboard: { paths: string[]; cut: boolean } | null = null;
  draft: ExplorerDraft = { form: null, name: "" };
  busy = false; loading = 0; error = ""; degraded = false;
  sortDirection: "asc" | "desc" = "asc";
  expanding = false;
  private scans = new Map<string, number>();
  private sequence = 0;
  constructor(readonly vaultId: string, private fs: FilesystemApi, private alive: () => boolean,
    private changed: () => void, private log: (level: "info" | "warn" | "error", message: string, error?: unknown) => void, private relocated?: (source: string, destination: string) => Promise<void>) {}
  get active(): boolean { return this.alive(); }
  tree(path = "", ancestors = new Set<string>()): Entry[] {
    if (ancestors.has(path)) return [];
    const next = new Set(ancestors).add(path);
    return [...(this.directories.get(path) ?? [])].filter(item => item.kind !== "directory" || !basename(item.path).startsWith("."))
      .sort((a, b) => Number(b.kind === "directory") - Number(a.kind === "directory") || basename(a.path).localeCompare(basename(b.path)) * (this.sortDirection === "asc" ? 1 : -1))
      .map(item => ({ id: item.path, name: basename(item.path), kind: item.kind, ...(item.kind === "directory" ? { children: this.tree(item.path, next) } : {}) }));
  }
  private target(path: string) { return { vaultId: this.vaultId, path }; }
  private check<T>(result: FsResult<T>): T {
    if (!result.ok) { this.error = result.error.code; throw result.error; }
    return result.value;
  }
  async load(path: string): Promise<void> {
    if (!this.active || !validPath(path, true)) return;
    const version = ++this.sequence; this.scans.set(path, version); this.loading++; this.changed();
    try {
      const result = await this.fs.list(this.target(path));
      if (!this.active || this.scans.get(path) !== version) return;
      if (!result.ok) {
        if (result.error.code === "NOT_FOUND" || result.error.code === "NOT_DIRECTORY") {
          this.forget(path);
        }
        this.check(result);
      } else {
        const present = new Map(result.value.map(item => [item.path, item.kind]));
        for (const previous of this.directories.get(path) ?? []) {
          if (present.get(previous.path) !== previous.kind) this.forget(previous.path);
        }
        this.directories.set(path, result.value);
        // A removed or replaced directory must not resurrect stale cached descendants.
        for (const cached of this.directories.keys()) {
          if (cached && parentPath(cached) === path && present.get(cached) !== "directory") this.forget(cached);
        }
      }
    } catch (error) {
      if (this.active) { if (!this.error) this.error = "IO_ERROR"; this.log("error", "Cannot list explorer directory", error); }
    } finally { this.loading--; if (this.active) this.changed(); }
  }
  private forget(path: string): void {
    this.scans.set(path, ++this.sequence);
    for (const scanned of this.scans.keys()) if (inside(scanned, path)) this.scans.set(scanned, ++this.sequence);
    for (const cached of this.directories.keys()) if (inside(cached, path)) this.directories.delete(cached);
    for (const expanded of this.expanded) if (inside(expanded, path)) this.expanded.delete(expanded);
    this.selection = this.selection.filter(selected => !inside(selected, path));
  }
  async refresh(): Promise<void> {
    this.error = "";
    await this.load("");
    // Refresh parents before children: removed directories invalidate cached descendants.
    for (const path of [...this.directories.keys()].filter(Boolean).sort((a, b) => a.split("/").length - b.split("/").length)) {
      if (!this.active) break;
      if (this.directories.has(path)) await this.load(path);
    }
  }
  toggle(path: string, open: boolean): void {
    if (!this.active) return;
    if (open) { this.expanded.add(path); if (!this.directories.has(path)) void this.load(path); }
    else this.expanded.delete(path);
    this.changed();
  }
  sort(direction: "asc" | "desc"): void {
    if (!this.active || this.busy) return;
    this.sortDirection = direction; this.changed();
    this.log("info", `Explorer sort changed: ${direction}`);
  }
  async expandAll(): Promise<void> {
    if (!this.active || this.busy || this.expanding) return;
    this.expanding = true; this.changed();
    try {
      const queue = [""]; const visited = new Set<string>();
      for (let index = 0; index < queue.length && this.active; index++) {
        const path = queue[index]!;
        if (visited.has(path)) continue;
        visited.add(path);
        if (path) this.expanded.add(path);
        if (!this.directories.has(path)) await this.load(path);
        if (!this.active) return;
        for (const entry of this.directories.get(path) ?? []) {
          if (entry.kind === "directory" && parentPath(entry.path) === path && !basename(entry.path).startsWith(".")) queue.push(entry.path);
        }
      }
      if (this.active) this.log(this.error ? "warn" : "info", this.error ? "Explorer folders partially expanded" : "Explorer folders expanded");
    } finally { this.expanding = false; if (this.active) this.changed(); }
  }
  select(paths: readonly string[]): void {
    if (!this.active || JSON.stringify(paths) === JSON.stringify(this.selection)) return;
    this.selection = paths.filter(path => validPath(path)); this.changed();
  }
  buffer(paths: readonly string[], cut: boolean): void {
    if (!this.active || this.busy) return;
    this.clipboard = { paths: topLevel(paths.filter(path => validPath(path))), cut }; this.changed();
  }
  private async mutate(work: () => Promise<void>): Promise<boolean> {
    if (!this.active || this.busy) return false;
    this.busy = true; this.error = ""; this.changed(); let success = false;
    try { await work(); success = this.active; if (success) this.log("info", "Explorer operation completed"); }
    catch (error) { if (this.active) { if (!this.error) this.error = "IO_ERROR"; this.log("error", "Explorer operation failed", error); } }
    finally { if (this.active) { await this.refreshAfterMutation(); this.busy = false; this.changed(); } }
    return success;
  }
  private async refreshAfterMutation(): Promise<void> { const error = this.error; await this.refresh(); if (error) this.error = error; }
  private name(parent: string, name: string): string {
    if (!validPath(parent, true) || !validPath(name) || name.includes("/")) { this.error = "INVALID_PATH"; throw new Error("A portable single-segment name is required."); }
    return parent ? `${parent}/${name}` : name;
  }
  create(parent: string, name: string, directory: boolean): Promise<boolean> {
    return this.mutate(async () => {
      const path = this.name(parent, name);
      this.check(directory ? await this.fs.createDirectory(this.target(path)) : await this.fs.writeText(this.target(path), "", { mode: "create" }));
      if (this.active) {
        if (parent) { this.expanded.add(parent); if (!this.directories.has(parent)) this.directories.set(parent, []); }
        this.selection = [path];
      }
    });
  }
  rename(path: string, name: string): Promise<boolean> {
    return this.mutate(async () => {
      const destination = this.name(parentPath(path), name);
      if (path === destination) return;
      this.check(await this.fs.move(this.target(path), this.target(destination), false));
      if (this.active) await this.remap(path, destination);
    });
  }
  private async remap(source: string, destination: string): Promise<void> {
    const map = (path: string) => inside(path, source) ? destination + path.slice(source.length) : path;
    const expanded = [...this.expanded].map(map);
    this.selection = this.selection.map(map);
    for (const path of [...this.directories.keys()]) if (inside(path, source)) { this.directories.delete(path); this.scans.set(path, ++this.sequence); }
    this.expanded.clear(); for (const path of expanded) this.expanded.add(path);
    // Reload expanded descendants after their names change.
    for (const path of expanded) if (inside(path, destination)) this.directories.set(path, []);
    if (this.clipboard) this.clipboard.paths = this.clipboard.paths.map(map);
    await this.relocated?.(source, destination);
  }
  transfer(paths: readonly string[], destination: string, copy: boolean): Promise<boolean> {
    return this.mutate(async () => {
      const sources = topLevel(paths);
      if (!validPath(destination, true) || sources.some(path => !validPath(path) || inside(destination, path))) {
        this.error = "INVALID_PATH"; throw new Error("Transfers into descendants are forbidden.");
      }
      const completed: string[] = []; const failed: string[] = []; const failures: unknown[] = [];
      for (const source of sources) {
        if (!this.active) break;
        const target = this.name(destination, basename(source));
        if (!copy && source === target) { completed.push(source); continue; }
        try {
          this.check(await this.fs[copy ? "copy" : "move"](this.target(source), this.target(target), false));
          completed.push(target); if (this.active && !copy) await this.remap(source, target);
        } catch (error) { failed.push(source); failures.push(error); }
      }
      if (this.active) {
        this.selection = completed;
        if (destination) { this.expanded.add(destination); if (!this.directories.has(destination)) this.directories.set(destination, []); }
        if (!copy && this.clipboard?.cut) this.clipboard = failed.length ? { paths: failed, cut: true } : null;
      }
      if (failures.length) { if (completed.length) this.error = "PARTIAL_FAILURE"; throw new AggregateError(failures, "Some transfers failed; completed items were retained."); }
    });
  }
  paste(destination: string): Promise<boolean> {
    const buffer = this.clipboard;
    return buffer ? this.transfer([...buffer.paths], destination, !buffer.cut) : Promise.resolve(false);
  }
  remove(paths: readonly string[]): Promise<boolean> {
    return this.mutate(async () => {
      const failures: unknown[] = []; let completed = 0;
      for (const path of topLevel(paths)) {
        if (!this.active) break;
        try { this.check(await this.fs.remove(this.target(path), true)); if (this.active) { this.forget(path); completed++; } }
        catch (error) { failures.push(error); }
      }
      if (failures.length) { if (completed) this.error = "PARTIAL_FAILURE"; throw new AggregateError(failures, "Some deletions failed."); }
    });
  }
}
