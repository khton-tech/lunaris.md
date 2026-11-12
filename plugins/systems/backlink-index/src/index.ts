import { definePlugin } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { Backlinks, BacklinksChanged, NoteLinks } from "@lunaris/backlinks";
import { anchorRange } from "./anchor.js";
import type { MentionGroup, BacklinksSnapshot } from "@lunaris/backlinks";
import { DocumentContent, DocumentContentChanged } from "@lunaris/active-document";
import { Filesystem, FilesystemObservation, FileChanged } from "@lunaris/filesystem";
import { Vault, VaultChanged } from "@lunaris/vault";
import { parseNote, resolveLink, title, mention, unlinked } from "./markdown.js";
import type { ParsedNote } from "./markdown.js";
import type { FileTarget } from "@lunaris/filesystem";
import manifest from "../manifest.json" with { type: "json" };

interface Entry { note: ParsedNote; modifiedAt: number | null; size: number }
export default definePlugin({ manifest, activate(ctx) {
  const logger = scopeLogger(ctx.use(Logger), ctx.signal); const fs = ctx.use(Filesystem);
  const observation = ctx.use(FilesystemObservation); let observer = ctx.scope.child();
  const vaults = ctx.use(Vault); const documents = ctx.use(DocumentContent);
  let vaultId = vaults.current()?.id ?? null; let entries = new Map<string, Entry>();
  let state: BacklinksSnapshot["state"] = "loading"; let failures = 0; let generation = 0;
  const queries = new Map<string, BacklinksSnapshot>();
  let pending: Promise<void> | undefined; let again = false; let timer: ReturnType<typeof setTimeout> | undefined;
  let observationRevision = 0;
  let watch: { vaultId: string; id: string } | undefined; const dirty = new Set<string>();
  const alive = (id: string | null, epoch: number) => !ctx.signal.aborted && vaultId === id && generation === epoch;
  function emit(): void {
    if (ctx.signal.aborted) return;
    void ctx.events.emit(BacklinksChanged, { vaultId }).catch(error => { if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot publish backlink changes", { error }); });
  }
  function buffers(): void {
    if (ctx.signal.aborted) return;
    for (const buffer of documents.buffers()) if (buffer.target.vaultId === vaultId) {
      const old = entries.get(buffer.target.path);
      if (old && old.note.text !== buffer.text) { entries.set(buffer.target.path, { ...old, note: parseNote(buffer.text) }); queries.clear(); }
    }
  }
  async function scan(): Promise<void> {
    const id = vaultId; const epoch = generation; if (!id || ctx.signal.aborted) return;
    const next = new Map<string, Entry>(); let failed = 0; const invalidated = [...dirty]; dirty.clear();
    async function walk(path: string): Promise<void> {
      if (!alive(id, epoch)) return;
      const listed = await fs.list({ vaultId: id!, path });
      if (!alive(id, epoch)) return;
      if (!listed.ok) {
        failed++; logger.warn(ctx.pluginId, "Cannot list backlink sources", { error: listed.error });
        for (const [key, entry] of entries) if (!path || key.startsWith(path + "/")) next.set(key, entry);
        return;
      }
      for (const file of listed.value) {
        if (!alive(id, epoch)) return;
        if (file.path.split("/").some(part => part.startsWith("."))) continue;
        if (file.kind === "directory") await walk(file.path);
        else if (file.kind === "file" && /\.md$/i.test(file.path)) {
          const old = entries.get(file.path);
          if (old && file.modifiedAt !== null && file.modifiedAt === old.modifiedAt && file.size === old.size && !invalidated.some(p => !p || file.path === p || file.path.startsWith(p + "/"))) next.set(file.path, old);
          else {
            const read = await documents.read({ vaultId: id!, path: file.path });
            if (!alive(id, epoch)) return;
            if (read.ok) next.set(file.path, { note: parseNote(read.value.text), modifiedAt: file.modifiedAt, size: file.size });
            else { failed++; if (old) next.set(file.path, old); logger.warn(ctx.pluginId, "Cannot read backlink source", { error: read.error }); }
          }
        }
      }
    }
    try {
      await walk(""); if (!alive(id, epoch)) return;
      entries = next; queries.clear(); buffers(); failures = failed; state = failed ? "degraded" : "ready";
      logger.debug(ctx.pluginId, "Backlink index refreshed", { data: { files: entries.size, failures } }); emit();
    } catch (error) {
      if (!alive(id, epoch)) return;
      failures++; state = "degraded"; queries.clear(); logger.error(ctx.pluginId, "Backlink indexing failed", { error }); emit();
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
    buffers(); const cacheKey = JSON.stringify([target.path, excludedPaths]); const cached = queries.get(cacheKey); if (cached) return cached;
    const paths = [...entries.keys()]; const targetNote = entries.get(target.path);
    const linked: MentionGroup[] = []; const plain: MentionGroup[] = [];
    for (const [path, entry] of entries) {
      if (path === target.path) continue;
      const source = { vaultId: target.vaultId, path }; const note = entry.note;
      const matches = note.links.filter(link => resolveLink(link, path, paths) === target.path).map(link => mention(note.text, link.from, link.to));
      if (matches.length) linked.push({ source, text: note.text, modifiedAt: entry.modifiedAt, mentions: matches });
      const excluded = excludedPaths.some(p => p && (path === p || path.startsWith(p.replace(/\/$/, "") + "/")));
      if (!excluded && targetNote) {
        const matches = unlinked(note, [title(target.path), ...targetNote.note.aliases]);
        if (matches.length) plain.push({ source, text: note.text, modifiedAt: entry.modifiedAt, mentions: matches });
      }
    }
    const snapshot = { state, failures, linked, unlinked: plain };
    if (queries.size >= 32) queries.clear(); queries.set(cacheKey, snapshot); return snapshot;
  }
  ctx.provide(NoteLinks, {
    parse: text => parseNote(text).links,
    async resolve(source, link) {
      const epoch = generation;
      if (source.vaultId !== vaultId) return { ok: false, error: { code: "VAULT_CLOSED", message: "The source Vault is no longer active." } };
      let path = resolveLink(link, source.path, [...entries.keys()]);
      if (!path) { await refresh(); path = resolveLink(link, source.path, [...entries.keys()]); }
      if (!alive(source.vaultId, epoch)) return { ok: false, error: { code: "CANCELLED", message: "Link navigation cancelled." } };
      if (!path) return { ok: false, error: { code: "NOT_FOUND", message: "Linked note not found." } };
      const target = { vaultId: source.vaultId, path }; const read = await documents.read(target);
      if (!alive(source.vaultId, epoch)) return { ok: false, error: { code: "CANCELLED", message: "Link navigation cancelled." } };
      if (!read.ok) return read;
      const range = anchorRange(read.value.text, link.destination);
      if (!range) return { ok: false, error: { code: "NOT_FOUND", message: "Linked heading or block not found." } };
      return { ok: true, value: { target, text: read.value.text, ...range } };
    },
  });
  ctx.provide(Backlinks, { query, async refresh() { dirty.add(""); await refresh(); }, async link(target, source, occurrence, expectedText) {
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
  ctx.events.on(FileChanged, change => { if (change.vaultId === vaultId) { for (const path of change.paths) dirty.add(path); if (change.kind === "rescan") dirty.add(""); schedule(); } });
  ctx.events.on(DocumentContentChanged, change => { if (change.target.vaultId === vaultId) { buffers(); emit(); } });
  ctx.events.on(VaultChanged, () => {
    generation++; vaultId = vaults.current()?.id ?? null; entries.clear(); queries.clear(); dirty.clear(); failures = 0; state = vaultId ? "loading" : "ready";
    emit(); schedule(); void observe().catch(error => { if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot observe backlink sources", { error }); });
  });
  const poll = setInterval(() => { if (!watch) schedule(); }, 5000);
  ctx.scope.own({ dispose() { generation++; if (timer !== undefined) clearTimeout(timer); clearInterval(poll); entries.clear(); queries.clear(); } });
  void observe().catch(error => { if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot observe backlink sources", { error }); });
  void refresh(); logger.info(ctx.pluginId, "Backlink index ready");
} });
