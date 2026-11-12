import { validPath } from "@lunaris/filesystem";
import type { FilesystemApi, FileInfo, FsResult } from "@lunaris/filesystem";

export interface Entry { id: string; name: string; kind: FileInfo["kind"]; children?: Entry[] }
export type ExplorerDraft = { form: { kind: "file" | "folder"; parent: string; initialName?: string } | { kind: "delete"; paths: string[] } | null; name: string };
interface Scan { path: string; version: number; mutation: number; result: FsResult<readonly FileInfo[]>; error?: unknown }
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
  private mutation = 0;
  private idle: Promise<void> = Promise.resolve();
  private needsRecovery = false;
  private snapshot: { sort: "asc" | "desc"; entries: Entry[] } | undefined;
  constructor(readonly vaultId: string, private fs: FilesystemApi, private alive: () => boolean,
    private changed: () => void, private log: (level: "info" | "warn" | "error", message: string, error?: unknown) => void, private relocated?: (source: string, destination: string) => Promise<void>) {}
  get active(): boolean { return this.alive(); }
  tree(path = "", ancestors = new Set<string>()): Entry[] {
    if (!path && !ancestors.size) {
      if (!this.snapshot || this.snapshot.sort !== this.sortDirection) this.snapshot = { sort: this.sortDirection, entries: this.buildTree("", ancestors) };
      return this.snapshot.entries;
    }
    return this.buildTree(path, ancestors);
  }
  private buildTree(path: string, ancestors: Set<string>): Entry[] {
    if (ancestors.has(path)) return [];
    const next = new Set(ancestors).add(path);
    return [...(this.directories.get(path) ?? [])].filter(item => item.kind !== "directory" || !basename(item.path).startsWith("."))
      .sort((a, b) => Number(b.kind === "directory") - Number(a.kind === "directory") || basename(a.path).localeCompare(basename(b.path)) * (this.sortDirection === "asc" ? 1 : -1))
      .map(item => ({ id: item.path, name: basename(item.path), kind: item.kind, ...(item.kind === "directory" ? { children: this.buildTree(item.path, next) } : {}) }));
  }
  private target(path: string) { return { vaultId: this.vaultId, path }; }
  private check<T>(result: FsResult<T>): T {
    if (!result.ok) { this.error = result.error.code; throw result.error; }
    return result.value;
  }
  private async scan(path: string): Promise<Scan> {
    const version = ++this.sequence; this.scans.set(path, version);
    const mutation = this.mutation;
    try {
      return { path, version, mutation, result: await this.fs.list(this.target(path)) };
    } catch (error) {
      return { path, version, mutation, result: { ok: false, error: { code: "IO_ERROR", message: "Cannot list explorer directory." } }, error };
    }
  }
  private current(scan: Scan): boolean { return this.active && this.scans.get(scan.path) === scan.version && scan.mutation === this.mutation; }
  private missingDirectory(path: string): boolean {
    for (let current = path; current; current = parentPath(current)) {
      const entries = this.directories.get(parentPath(current));
      if (entries && !entries.some(item => item.path === current && item.kind === "directory")) return true;
    }
    return false;
  }
  private apply(scan: Scan): boolean {
    if (!this.current(scan)) return false;
    this.scans.delete(scan.path);
    const { path, result } = scan;
    if (!result.ok) {
      if (result.error.code === "NOT_FOUND" || result.error.code === "NOT_DIRECTORY") this.forget(path);
      this.error = result.error.code;
      this.needsRecovery = true;
      this.log("error", "Cannot list explorer directory", scan.error ?? result.error);
      return true;
    }
    const present = new Map(result.value.map(item => [item.path, item.kind]));
    const previous = this.directories.get(path);
    // Content/mtime changes do not affect the explorer's names-and-kinds view.
    let changed = !previous || previous.length !== result.value.length || previous.some(item => present.get(item.path) !== item.kind);
    if (changed) {
      for (const item of previous ?? []) if (present.get(item.path) !== item.kind) this.forget(item.path);
      this.directories.set(path, result.value);
    }
    // A removed or replaced directory must not resurrect stale cached descendants.
    for (const cached of this.directories.keys()) if (cached && parentPath(cached) === path && present.get(cached) !== "directory") { this.forget(cached); changed = true; }
    if (changed) this.snapshot = undefined;
    return changed;
  }
  async load(path: string, background = false): Promise<void> {
    if (!this.active || !validPath(path, true)) return;
    const cached = this.directories.has(path); let waited = false;
    while (this.busy) { waited = true; await this.idle; if (!this.active) return; }
    if (waited && ((!cached && this.directories.has(path)) || this.missingDirectory(path))) return;
    if (!background) { this.loading++; this.changed(); }
    let changed = false;
    try {
      let scan = await this.scan(path);
      while (this.active && scan.mutation !== this.mutation) {
        while (this.busy) { await this.idle; if (!this.active) return; }
        if ((!cached && this.directories.has(path)) || this.missingDirectory(path)) return;
        scan = await this.scan(path);
      }
      changed = this.apply(scan);
    }
    finally { if (!background) this.loading--; if (this.active && (!background || changed)) this.changed(); }
  }
  private forget(path: string): void {
    this.snapshot = undefined;
    for (const scanned of this.scans.keys()) if (inside(scanned, path)) this.scans.delete(scanned);
    for (const cached of this.directories.keys()) if (inside(cached, path)) this.directories.delete(cached);
    for (const expanded of this.expanded) if (inside(expanded, path)) this.expanded.delete(expanded);
    this.selection = this.selection.filter(selected => !inside(selected, path));
  }
  async refresh(background = false, paths?: readonly string[], mutation = false): Promise<boolean> {
    if (!this.active || (this.busy && !mutation)) return false;
    const version = this.mutation; const previousError = this.error;
    const requestedPaths = this.needsRecovery ? undefined : paths;
    const requested = [...new Set(requestedPaths ?? ["", ...this.directories.keys()])].filter(path => validPath(path, true))
      .sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
    if (!background) { this.loading++; this.changed(); }
    const scans = new Map<string, Scan>();
    const absent = new Set<string>();
    try {
      for (const path of requested) {
        if (!this.active || version !== this.mutation) return false;
        if ([...absent].some(parent => inside(path, parent))) continue;
        // Stage parents first, skipping descendants they have already removed.
        const parent = scans.get(parentPath(path));
        if (path && parent && ((!parent.result.ok && ["NOT_FOUND", "NOT_DIRECTORY"].includes(parent.result.error.code)) ||
          (parent.result.ok && !parent.result.value.some(item => item.path === path && item.kind === "directory")))) { absent.add(path); continue; }
        if (path && !this.directories.has(path) && requestedPaths === undefined) continue;
        scans.set(path, await this.scan(path));
      }
      if (!this.active || version !== this.mutation) return false;
      // Retry the complete cache if another load failed during a targeted scan.
      if (this.needsRecovery && requestedPaths !== undefined) return false;
      const applicable = [...scans.values()].filter(scan => this.current(scan));
      if (!applicable.length) return true;
      this.error = ""; this.needsRecovery = false;
      let changed = false;
      // Publish the complete scan together, without intermediate tree snapshots.
      for (const scan of applicable) changed = this.apply(scan) || changed;
      if (background && (changed || this.error !== previousError)) this.changed();
      return true;
    } finally {
      for (const scan of scans.values()) if (this.scans.get(scan.path) === scan.version) this.scans.delete(scan.path);
      if (!background) this.loading--; if (this.active && !background) this.changed();
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
    if (!this.active || this.expanding) return;
    while (this.busy) { await this.idle; if (!this.active) return; }
    if (this.expanding) return;
    this.expanding = true; this.changed();
    try {
      const queue = [""]; const visited = new Set<string>(); let version = this.mutation;
      for (let index = 0; index < queue.length && this.active; index++) {
        const path = queue[index]!;
        if (visited.has(path)) continue;
        visited.add(path);
        if (path) this.expanded.add(path);
        if (!this.directories.has(path)) await this.load(path);
        if (!this.active) return;
        if (version !== this.mutation) { queue.splice(0, queue.length, ""); visited.clear(); index = -1; version = this.mutation; continue; }
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
  private async mutate(paths: readonly string[], work: () => Promise<void>): Promise<boolean> {
    if (!this.active || this.busy) return false;
    this.mutation++; this.scans.clear(); this.busy = true; this.error = ""; this.changed(); let success = false;
    let release = () => {}; this.idle = new Promise<void>(resolve => { release = resolve; });
    try { await work(); success = this.active; if (success) this.log("info", "Explorer operation completed"); }
    catch (error) { if (this.active) { if (!this.error) this.error = "IO_ERROR"; this.log("error", "Explorer operation failed", error); } }
    finally {
      try {
        if (this.active) {
          this.mutation++; const error = this.error;
          await this.refresh(true, [...paths, ...[...this.expanded].filter(path => !this.directories.has(path))], true);
          if (error) this.error = error;
        }
      } finally { this.busy = false; release(); if (this.active) this.changed(); }
    }
    return success;
  }
  private name(parent: string, name: string): string {
    if (!validPath(parent, true) || !validPath(name) || name.includes("/")) { this.error = "INVALID_PATH"; throw new Error("A portable single-segment name is required."); }
    return parent ? `${parent}/${name}` : name;
  }
  create(parent: string, name: string, directory: boolean): Promise<boolean> {
    return this.mutate([parent], async () => {
      const path = this.name(parent, name);
      this.check(directory ? await this.fs.createDirectory(this.target(path)) : await this.fs.writeText(this.target(path), "", { mode: "create" }));
      if (this.active) {
        if (parent) { this.expanded.add(parent); if (!this.directories.has(parent)) this.directories.set(parent, []); }
        this.selection = [path];
      }
    });
  }
  rename(path: string, name: string): Promise<boolean> {
    return this.mutate([parentPath(path)], async () => {
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
    const moved = this.directories.get(parentPath(source))?.find(item => item.path === source);
    const cached = [...this.directories];
    for (const [path, entries] of cached) {
      if (inside(path, source)) { this.directories.delete(path); this.scans.delete(path); }
      const children = entries.filter(item => item.path !== source).map(item => ({ ...item, path: map(item.path) }));
      if (path === parentPath(destination) && moved) children.push({ ...moved, path: destination });
      this.directories.set(map(path), children);
    }
    this.snapshot = undefined;
    this.expanded.clear(); for (const path of expanded) this.expanded.add(path);
    if (this.clipboard) this.clipboard.paths = this.clipboard.paths.map(map);
    await this.relocated?.(source, destination);
  }
  transfer(paths: readonly string[], destination: string, copy: boolean): Promise<boolean> {
    const sources = topLevel(paths);
    return this.mutate([destination, ...sources.map(parentPath)], async () => {
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
    const sources = topLevel(paths);
    return this.mutate(sources.map(parentPath), async () => {
      const failures: unknown[] = []; let completed = 0;
      for (const path of sources) {
        if (!this.active) break;
        try { this.check(await this.fs.remove(this.target(path), true)); if (this.active) { this.forget(path); completed++; } }
        catch (error) { failures.push(error); }
      }
      if (failures.length) { if (completed) this.error = "PARTIAL_FAILURE"; throw new AggregateError(failures, "Some deletions failed."); }
    });
  }
}
