import { definePlugin } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { EditorExtensions } from "@lunaris/editor";
import { NoteLinks } from "@lunaris/backlinks";
import { ActiveDocument, DocumentContent } from "@lunaris/active-document";
import { ExternalLinks } from "@lunaris/external-links";
import { linkInteraction, wikiPreview } from "./extension.js";

export default definePlugin({ manifest: { manifestVersion: 1, id: "lunaris.document-links", version: "0.1.0", engine: "^0.1.0", sdk: "^0.1.0", entry: "./dist/src/index.js",
  provides: [], requires: [Logger, EditorExtensions, NoteLinks, ActiveDocument, DocumentContent, ExternalLinks].map(token => ({ kind: "api", id: token.id, range: "^1.0.0" })), permissions: ["ui.dom", "vault.access", "links.open"], optionalPermissions: [] }, activate(ctx) {
  const logger = scopeLogger(ctx.use(Logger), ctx.signal); const editor = ctx.use(EditorExtensions); const links = ctx.use(NoteLinks);
  const documents = ctx.use(ActiveDocument); const content = ctx.use(DocumentContent); const external = ctx.use(ExternalLinks);
  let sequence = 0;
  const result = editor.register({ id: ctx.pluginId, preview: wikiPreview, extension: linkInteraction(text => links.parse(text), (link, sourceText) => {
    const source = documents.current(); if (!source || ctx.signal.aborted) return;
    const ticket = ++sequence;
    const relevant = () => !ctx.signal.aborted && ticket === sequence && documents.current()?.vaultId === source.vaultId && documents.current()?.path === source.path;
    async function navigate(): Promise<void> {
      if (/^[a-z][a-z\d+.-]*:/i.test(link.destination) || link.destination.startsWith("//")) {
        const result = await external.open(link.destination.startsWith("//") ? "https:" + link.destination : link.destination);
        if (!result.ok) throw result.error;
      } else {
        const resolved = await links.resolve(source!, link, link.wiki ? { createFromSource: sourceText } : undefined);
        if (!relevant()) return;
        if (!resolved.ok) throw resolved.error;
        const current = await content.read(source!); if (!relevant()) return;
        if (!current.ok || current.value.text !== sourceText) return;
        const destination = resolved.value;
        const result = await content.reveal(destination.target, destination, destination.text);
        if (!result.ok) throw result.error;
      }
      if (!ctx.signal.aborted) logger.info(ctx.pluginId, "Document link opened");
    }
    void navigate().catch(error => { if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot open document link", { error }); });
  }, () => !ctx.signal.aborted) }, ctx.signal);
  if (!result.ok) throw new Error("Cannot register document link interactions.", { cause: result.error });
  logger.info(ctx.pluginId, "Document link interactions ready");
} });
