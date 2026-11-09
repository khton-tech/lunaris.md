import { russian } from "./locales/ru.js";
import { definePlugin } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { Workspace } from "@lunaris/workspace";
import { ActiveDocument, ActiveDocumentChanged, DocumentStatistics, DocumentStatisticsChanged } from "@lunaris/active-document";
import { FilesystemSources } from "@lunaris/filesystem";
import { AccountSession, AccountSessionChanged, ConnectionStatus, ConnectionChanged } from "@lunaris/remote";
import { Vault, VaultChanged } from "@lunaris/vault";
import { Localization, LocaleChanged } from "@lunaris/localization";
import manifest from "../manifest.json" with { type: "json" };

const catalogs = { en: {
  label: "Document status", noFile: "No file open", words: "Words: {count}", letters: "Letters: {count}",
  connected: "Server connected", offline: "Server offline", expired: "Session expired", unknown: "Server status unknown",
}, ru: russian };
export default definePlugin({ manifest, activate(ctx) {
  const logger = scopeLogger(ctx.use(Logger), ctx.signal); const workspace = ctx.use(Workspace);
  const documents = ctx.use(ActiveDocument); const sources = ctx.use(FilesystemSources);
  const connection = ctx.use(ConnectionStatus); const accounts = ctx.use(AccountSession); const vaults = ctx.use(Vault);
  const localization = ctx.use(Localization); const id = ctx.pluginId + ".content";
  const catalog = localization.register(ctx.pluginId, catalogs, ctx.signal);
  if (!catalog.ok) throw new Error("Cannot register status bar messages.", { cause: catalog.error });
  const text = (key: string, count?: number) => localization.text(ctx.pluginId, key, count === undefined ? {} : { count });
  let signature = ""; let registered = false; let lastConnection = "";
  function refresh(): void {
    if (ctx.signal.aborted) return;
    const vault = vaults.current(); const active = documents.current();
    const target = active?.vaultId === vault?.id ? active : null;
    const statistics = ctx.optional(DocumentStatistics)?.current();
    const ready = target && statistics?.state === "ready" && statistics.target.vaultId === target.vaultId && statistics.target.path === target.path;
    let serverLabel = ""; let serverTitle = ""; let serverState: "connected" | "offline" | "expired" | "unknown" | null = null;
    const remote = vault ? sources.remoteIdentity(vault.id) : null;
    if (remote?.ok) {
      const snapshot = connection.current(); const account = accounts.current();
      const matching = snapshot?.server === remote.value.server && (snapshot.state === "expired" ||
        (account?.server === remote.value.server && account.account.id === remote.value.accountId && account.epoch === snapshot.epoch));
      const state = matching ? snapshot.state : "unknown";
      serverState = state; serverLabel = text(state); serverTitle = remote.value.server;
      if (lastConnection !== state) {
        logger[state === "offline" || state === "expired" ? "warn" : "info"](ctx.pluginId, "Status bar connection changed", { data: { state } });
        lastConnection = state;
      }
    } else lastConnection = "";
    const path = target?.path ?? ""; const filename = path.split("/").at(-1) ?? "";
    const stem = filename.replace(/\.[^.]+$/, "");
    const props = { label: text("label"), filename: target ? stem || filename : text("noFile"), fileTitle: path,
      serverLabel, serverTitle, serverState, words: ready ? statistics.words : null, letters: ready ? statistics.letters : null, wordsLabel: ready ? text("words", statistics.words!) : "", lettersLabel: ready ? text("letters", statistics.letters!) : "" };
    const next = JSON.stringify(props); if (next === signature) return;
    const result = registered ? workspace.update(id, props) : workspace.register({ id, componentId: "lunaris.status-bar", region: "bottom", props }, ctx.signal);
    if (!result.ok) { logger.error(ctx.pluginId, "Cannot publish status bar", { error: result.error }); throw new Error("Cannot publish status bar.", { cause: result.error }); }
    registered = true; signature = next;
  }
  ctx.events.on(ActiveDocumentChanged, refresh);
  ctx.events.on(VaultChanged, refresh);
  ctx.events.on(LocaleChanged, refresh);
  ctx.events.on(ConnectionChanged, refresh);
  ctx.events.on(AccountSessionChanged, refresh);
  if (ctx.optional(DocumentStatistics)) ctx.events.on(DocumentStatisticsChanged, refresh);
  else logger.warn(ctx.pluginId, "Document statistics unavailable; showing file and connection only");
  refresh();
  logger.info(ctx.pluginId, "Status bar ready");
} });
