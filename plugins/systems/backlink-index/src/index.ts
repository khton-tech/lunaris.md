import { definePlugin } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { Backlinks, BacklinksChanged, NoteLinks, NoteLinksChanged } from "@lunaris/backlinks";
import { anchorRange } from "./anchor.js";
import type { MentionGroup, BacklinksSnapshot } from "@lunaris/backlinks";
import { DocumentContent, DocumentContentChanged } from "@lunaris/active-document";
import { Filesystem, FilesystemObservation, FileChanged, failure, validPath } from "@lunaris/filesystem";
import { Vault, VaultChanged } from "@lunaris/vault";
import { creationPath, createLinkResolver, parseNote, title, mention, unlinked } from "./markdown.js";
import type { ParsedNote } from "./markdown.js";
import type { FileInfo, FileTarget } from "@lunaris/filesystem";
import manifest from "../manifest.json" with { type: "json" };

interface Entry { note: ParsedNote; modifiedAt: number | null; size: number }
interface QuerySource { readonly entry: Entry; readonly linked: MentionGroup | undefined; readonly plain: MentionGroup | undefined }
interface Query { readonly names: readonly string[]; sources: Map<string, QuerySource>; snapshot?: BacklinksSnapshot | undefined }
const parentPath = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));
const within = (path: string, root: string) => !root || path === root || path.startsWith(root + "/");
function hasAncestor(path: string, paths: { has(path: string): boolean }): boolean {
  let parent = parentPath(path);
  while (parent) {
    if (paths.has(parent)) return true;
    parent = parentPath(parent);
  }
  return false;
}
const hidden = (path: string) => path.split("/").some(part => part.startsWith("."));
const markdown = (file: FileInfo) => file.kind === "file" && /\.md$/i.test(file.path);
export default definePlugin({ manifest, activate(ctx) {
  const logger = scopeLogger(ctx.use(Logger), ctx.signal); const fs = ctx.use(Filesystem);
  const observation = ctx.use(FilesystemObservation); let observer = ctx.scope.child();
  const vaults = ctx.use(Vault); const documents = ctx.use(DocumentContent);
  let vaultId = vaults.current()?.id ?? null; let entries = new Map<string, Entry>();
  let completeNotePaths: Set<string> | undefined; let directories = new Set<string>();
  let resolveLink = createLinkResolver([]);
  let resolveListedLink = createLinkResolver([]);
  let state: BacklinksSnapshot["state"] = "loading"; let failures = 0; let generation = 0;
  const queries = new Map<string, Query>();
  let pending: Promise<void> | undefined; let again = false; let timer: ReturnType<typeof setTimeout> | undefined;
  let observationRevision = 0;
  let watch: { vaultId: string; id: string } | undefined;
  const dirty = new Map<string, "modified" | "structural">();
  let fullScan: "metadata" | "force" | undefined = "metadata";
  const alive = (id: string | null, epoch: number) => !ctx.signal.aborted && vaultId === id && generation === epoch;
  function emit(): void {
    if (ctx.signal.aborted) return;
    void ctx.events.emit(BacklinksChanged, { vaultId }).catch(error => { if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot publish backlink changes", { error }); });
  }
  function emitPaths(): void {
    if (ctx.signal.aborted) return;
    void ctx.events.emit(NoteLinksChanged, { vaultId }).catch(error => { if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot publish note catalog changes", { error }); });
  }
  function invalidate(): void { for (const query of queries.values()) query.snapshot = undefined; }
  function buffers(): boolean {
    if (ctx.signal.aborted) return false;
    let changed = false;
    for (const buffer of documents.buffers()) if (buffer.target.vaultId === vaultId) {
      const old = entries.get(buffer.target.path);
      if (old && old.note.text !== buffer.text) { entries.set(buffer.target.path, { ...old, note: parseNote(buffer.text) }); changed = true; }
    }
    if (changed) invalidate();
    return changed;
  }
  function requestFullScan(force = false): void {
    if (force || !fullScan) fullScan = force ? "force" : "metadata";
  }
  async function scan(): Promise<void> {
    if (!vaultId || ctx.signal.aborted) return;
    const id = vaultId; const epoch = generation;
    const changes = new Map(dirty); dirty.clear();
    const requested = fullScan; fullScan = undefined;
    if (!requested && !changes.size) return;
    const forceRead = requested === "force" || state === "degraded";
    let next = new Map<string, Entry>(); const notePaths = new Set<string>(); const nextDirectories = new Set<string>();
    let failed = 0;
    let listingComplete = true;
    async function updateNote(file: FileInfo, force: boolean): Promise<void> {
      notePaths.add(file.path);
      const old = entries.get(file.path);
      if (old && !force && file.modifiedAt !== null && file.modifiedAt === old.modifiedAt && file.size === old.size) {
        next.set(file.path, old); return;
      }
      const read = await documents.read({ vaultId: id, path: file.path });
      if (!alive(id, epoch)) return;
      if (read.ok) {
        const note = old?.note.text === read.value.text ? old.note : parseNote(read.value.text);
        next.set(file.path, old && old.note === note && old.modifiedAt === file.modifiedAt && old.size === file.size ? old : { note, modifiedAt: file.modifiedAt, size: file.size });
      } else {
        failed++; if (old) next.set(file.path, old);
        logger.warn(ctx.pluginId, "Cannot read backlink source", { error: read.error });
      }
    }
    async function walk(path: string): Promise<void> {
      if (!alive(id, epoch)) return;
      const listed = await fs.list({ vaultId: id, path });
      if (!alive(id, epoch)) return;
      if (!listed.ok) {
        listingComplete = false;
        failed++; logger.warn(ctx.pluginId, "Cannot list backlink sources", { error: listed.error });
        for (const [key, entry] of entries) if (within(key, path)) next.set(key, entry);
        return;
      }
      nextDirectories.add(path);
      for (const file of listed.value) {
        if (!alive(id, epoch)) return;
        if (hidden(file.path)) continue;
        if (file.kind === "directory") await walk(file.path);
        else if (markdown(file)) await updateNote(file, forceRead || changes.has(file.path) || hasAncestor(file.path, changes));
      }
    }
    function removePath(path: string): void {
      next.delete(path); notePaths.delete(path);
      if (!nextDirectories.has(path)) return;
      for (const directory of nextDirectories) if (within(directory, path)) nextDirectories.delete(directory);
      for (const note of notePaths) if (within(note, path)) { next.delete(note); notePaths.delete(note); }
    }
    async function reconcile(knownNotes: ReadonlySet<string>): Promise<"content" | "structure" | undefined> {
      const structural = new Set<string>();
      const modified: string[] = [];
      for (const [path, kind] of changes) {
        if (kind === "modified" && knownNotes.has(path)) { modified.push(path); continue; }
        let child = path;
        // If a parent was created in the same burst, start at the first unknown child.
        while (!directories.has(parentPath(child))) child = parentPath(child);
        structural.add(child);
      }
      for (const path of modified) {
        if (structural.has(path) || hasAncestor(path, structural)) continue;
        const stat = await fs.stat({ vaultId: id, path });
        if (!alive(id, epoch)) return;
        if (stat.ok && markdown(stat.value) && stat.value.path === path) await updateNote(stat.value, true);
        else structural.add(path);
        if (!alive(id, epoch)) return;
      }
      if (!structural.size) return "content";

      // Clone membership only for structural changes. Content-only batches stage
      // just their changed notes and leave the catalog and resolvers in place.
      const updated = next;
      next = new Map(entries);
      for (const [path, entry] of updated) next.set(path, entry);
      for (const path of knownNotes) notePaths.add(path);
      for (const path of directories) nextDirectories.add(path);
      const listings = new Map<string, readonly FileInfo[]>();
      for (const path of structural) {
        if (hasAncestor(path, structural)) continue;
        const parent = parentPath(path);
        let children = listings.get(parent);
        if (!children) {
          const listed = await fs.list({ vaultId: id, path: parent });
          if (!alive(id, epoch) || !listed.ok) return;
          children = listed.value; listings.set(parent, children);
        }
        const file = children.find(child => child.path === path);
        removePath(path);
        if (file?.kind === "directory") await walk(path);
        else if (file && markdown(file)) await updateNote(file, true);
        if (!alive(id, epoch) || !listingComplete) return;
      }
      return "structure";
    }
    try {
      const partial = !requested && state === "ready" && completeNotePaths && directories.has("") && await reconcile(completeNotePaths);
      if (!alive(id, epoch)) return;
      if (!partial) {
        next.clear(); notePaths.clear(); nextDirectories.clear(); failed = 0; listingComplete = true;
        await walk(""); if (!alive(id, epoch)) return;
      }
      let changed = failed !== failures || state !== (failed ? "degraded" : "ready");
      let catalogChanged = false;
      if (partial === "content") {
        for (const [path, entry] of next) if (entry !== entries.get(path)) { entries.set(path, entry); changed = true; }
      } else {
        catalogChanged = listingComplete !== (completeNotePaths !== undefined) || listingComplete &&
          (completeNotePaths?.size !== notePaths.size || [...completeNotePaths].some(path => !notePaths.has(path)));
        const pathsChanged = next.size !== entries.size || [...next.keys()].some(path => !entries.has(path));
        changed ||= pathsChanged || [...next].some(([path, entry]) => entries.get(path) !== entry);
        completeNotePaths = listingComplete ? notePaths : undefined;
        directories = nextDirectories;
        if (catalogChanged) resolveListedLink = createLinkResolver([...(completeNotePaths ?? [])]);
        if (pathsChanged) { resolveLink = createLinkResolver([...next.keys()]); queries.clear(); }
        entries = next;
      }
      changed = buffers() || changed; failures = failed; state = failed ? "degraded" : "ready";
      if (changed) { invalidate(); emit(); }
      if (catalogChanged) emitPaths();
      logger.debug(ctx.pluginId, "Backlink index refreshed", { data: { files: entries.size, failures } });
    } catch (error) {
      if (!alive(id, epoch)) return;
      const hadCatalog = completeNotePaths !== undefined; completeNotePaths = undefined;
      failures++; state = "degraded"; invalidate(); logger.error(ctx.pluginId, "Backlink indexing failed", { error }); emit();
      if (hadCatalog) emitPaths();
    }
  }
  async function refresh(): Promise<void> {
    if (pending) { again = true; return pending; }
    pending = (async () => { do { again = false; await scan(); } while (again && !ctx.signal.aborted); })();
    try { await pending; } finally { pending = undefined; }
  }
  function schedule(): void {
    if (ctx.signal.aborted || timer !== undefined) return;
    timer = setTimeout(() => { timer = undefined; void refresh(); }, 180);
  }
  function query(target: FileTarget, excludedPaths: readonly string[] = []): BacklinksSnapshot {
    if (target.vaultId !== vaultId) return { state: "ready", failures: 0, linked: [], unlinked: [] };
    buffers(); const cacheKey = JSON.stringify([target.path, excludedPaths]);
    let cached = queries.get(cacheKey); if (cached?.snapshot) return cached.snapshot;
    const targetNote = entries.get(target.path);
    const names = targetNote ? [title(target.path), ...targetNote.note.aliases] : [];
    if (!cached || names.length !== cached.names.length || names.some((name, index) => name !== cached!.names[index])) {
      cached = { names, sources: new Map() };
      if (queries.size >= 32) queries.clear(); queries.set(cacheKey, cached);
    }
    const linked: MentionGroup[] = []; const plain: MentionGroup[] = [];
    const sources = new Map<string, QuerySource>();
    for (const [path, entry] of entries) {
      if (path === target.path) continue;
      const previous = cached.sources.get(path);
      if (previous?.entry === entry) {
        sources.set(path, previous);
        if (previous.linked) linked.push(previous.linked);
        if (previous.plain) plain.push(previous.plain);
        continue;
      }
      const source = { vaultId: target.vaultId, path }; const note = entry.note;
      const matches = note.links.filter(link => resolveLink(link, path) === target.path).map(link => mention(note.text, link.from, link.to));
      const linkedGroup = matches.length ? { source, text: note.text, modifiedAt: entry.modifiedAt, mentions: matches } : undefined;
      if (linkedGroup) linked.push(linkedGroup);
      const excluded = excludedPaths.some(p => p && (path === p || path.startsWith(p.replace(/\/$/, "") + "/")));
      let plainGroup: MentionGroup | undefined;
      if (!excluded && targetNote) {
        const matches = unlinked(note, names);
        if (matches.length) { plainGroup = { source, text: note.text, modifiedAt: entry.modifiedAt, mentions: matches }; plain.push(plainGroup); }
      }
      sources.set(path, { entry, linked: linkedGroup, plain: plainGroup });
    }
    const snapshot = { state, failures, linked, unlinked: plain };
    cached.sources = sources; cached.snapshot = snapshot; return snapshot;
  }
  ctx.provide(NoteLinks, {
    parse: text => parseNote(text).links,
    missingTargets(source, links) {
      const paths = completeNotePaths;
      if (source.vaultId !== vaultId || !paths) return [];
      return links.filter(link => {
        const candidate = creationPath(link, source.path);
        return validPath(candidate) && !candidate.split("/").some(part => part.startsWith("."))
          && !resolveListedLink(link, source.path);
      }).map(link => link.from);
    },
    async resolve(source, link, options) {
      const epoch = generation;
      if (source.vaultId !== vaultId) return { ok: false, error: { code: "VAULT_CLOSED", message: "The source Vault is no longer active." } };
      const cancelled = () => failure("CANCELLED", "Link navigation cancelled.");
      let path = resolveLink(link, source.path);
      if (!path) { requestFullScan(); await refresh(); path = resolveLink(link, source.path); }
      if (!alive(source.vaultId, epoch)) return cancelled();
      let created = false;
      if (!path && options && link.wiki) {
        path = creationPath(link, source.path);
        if (!validPath(path) || path.split("/").some(part => part.startsWith("."))) return failure("INVALID_PATH", "The wikilink does not name a valid note path.");
        const current = await documents.read(source);
        if (!alive(source.vaultId, epoch)) return cancelled();
        if (!current.ok) return current;
        if (current.value.text !== options.createFromSource) return failure("CONFLICT", "The source changed before the note could be created.");

        const parent = parentPath(path);
        if (parent) {
          const folder = await fs.createDirectory({ vaultId: source.vaultId, path: parent }, true);
          if (!alive(source.vaultId, epoch)) return cancelled();
          if (!folder.ok && folder.error.code !== "ALREADY_EXISTS") return folder;
        }
        const written = await fs.writeText({ vaultId: source.vaultId, path }, "", { mode: "create" });
        if (!alive(source.vaultId, epoch)) return cancelled();
        if (!written.ok && written.error.code !== "ALREADY_EXISTS") return written;
        created = written.ok;
        if (created) logger.info(ctx.pluginId, "Note created from a wikilink");
        dirty.set(path, "structural");
        await refresh();
        if (!alive(source.vaultId, epoch)) return cancelled();
      }
      if (!path) return failure("NOT_FOUND", "Linked note not found.");
      const target = { vaultId: source.vaultId, path }; const read = await documents.read(target);
      if (!alive(source.vaultId, epoch)) return cancelled();
      if (!read.ok) return read;
      const range = created ? { from: 0, to: 0 } : anchorRange(read.value.text, link.destination);
      if (!range) return { ok: false, error: { code: "NOT_FOUND", message: "Linked heading or block not found." } };
      return { ok: true, value: { target, text: read.value.text, ...range } };
    },
  });
  ctx.provide(Backlinks, { query, async refresh() { requestFullScan(true); await refresh(); }, async link(target, source, occurrence, expectedText) {
    const fresh = query(target).unlinked.find(group => group.source.path === source.path && group.source.vaultId === source.vaultId);
    if (!fresh || fresh.text !== expectedText || !fresh.mentions.some(item => item.from === occurrence.from && item.to === occurrence.to))
      return { ok: false, error: { code: "CONFLICT", message: "The mention changed. Refresh the results." } };
    const display = expectedText.slice(occurrence.from, occurrence.to);
    const destination = target.path.replace(/\.md$/i, "");
    // Markdown syntax safely represents file names that cannot be put in a wikilink.
    const insert = /[\[\]|#\r\n]/.test(destination) || /[\[\]|\r\n]/.test(display)
      ? `[${display.replace(/[\\\[\]]/g, "\\$&")}](/${target.path.split("/").map(encodeURIComponent).join("/")})`
      : `[[${destination}${display === destination ? "" : "|" + display}]]`;
    const result = await documents.replace(source, occurrence, insert, expectedText);
    if (!ctx.signal.aborted) {
      if (result.ok) { buffers(); emit(); logger.info(ctx.pluginId, "Unlinked mention converted to a link"); }
      else logger.warn(ctx.pluginId, "Cannot link mention", { error: result.error });
    }
    return result;
  } });
  async function observe(): Promise<void> {
    const observing = ++observationRevision;
    await observer.dispose(); if (ctx.signal.aborted || observing !== observationRevision) return; observer = ctx.scope.child(); watch = undefined;
    const id = vaultId; const epoch = generation;
    if (!id || ctx.signal.aborted) return;
    const result = await observation.watch({ vaultId: id, path: "" }, observer.signal, true);
    if (!alive(id, epoch)) return;
    if (result.ok) watch = { vaultId: id, id: result.value };
    else logger.warn(ctx.pluginId, "Filesystem watch unavailable; backlink refresh uses periodic reconciliation", { error: result.error });
  }
  ctx.events.on(FileChanged, change => {
    if (change.vaultId !== vaultId) return;
    if (change.kind === "rescan" || !change.paths.length || change.paths.includes("") || (change.kind === "renamed" && change.paths.length !== 2)) {
      requestFullScan(true); schedule(); return;
    }
    for (const path of change.paths) {
      if (hidden(path) || dirty.get(path) === "structural") continue;
      dirty.set(path, change.kind === "modified" ? "modified" : "structural");
    }
    if (dirty.size) schedule();
  });
  ctx.events.on(DocumentContentChanged, change => { if (change.target.vaultId === vaultId) { buffers(); emit(); } });
  ctx.events.on(VaultChanged, () => {
    completeNotePaths = undefined;
    resolveLink = createLinkResolver([]); resolveListedLink = createLinkResolver([]);
    generation++; vaultId = vaults.current()?.id ?? null; entries.clear(); directories.clear(); queries.clear(); dirty.clear(); fullScan = "metadata";
    failures = 0; state = vaultId ? "loading" : "ready";
    emit(); emitPaths(); schedule(); void observe().catch(error => { if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot observe backlink sources", { error }); });
  });
  const poll = setInterval(() => { if (!watch) { requestFullScan(); schedule(); } }, 5000);
  ctx.scope.own({ dispose() { generation++; if (timer !== undefined) clearTimeout(timer); clearInterval(poll); entries.clear(); queries.clear(); } });
  void observe().catch(error => { if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot observe backlink sources", { error }); });
  void refresh(); logger.info(ctx.pluginId, "Backlink index ready");
} });
