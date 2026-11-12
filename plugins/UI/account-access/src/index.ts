import { russian } from "./locales/ru.js";
import { definePlugin, isSdkUnavailable } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { AccountAccess, AccountAccessChanged, AccountSession, AccountSessionChanged, AccountVaults } from "@lunaris/remote";
import type { AccountAccessPlacement, RemoteVault, ServerInfo } from "@lunaris/remote";
import { FilesystemSources } from "@lunaris/filesystem";
import { Vault, VaultChanged, VaultLocations } from "@lunaris/vault";
import { Components, ComponentsChanged } from "@lunaris/components";
import type { MountedComponent } from "@lunaris/components";
import { Slots } from "@lunaris/slots";
import { SlotDom } from "@lunaris/slot-dom";
import { Localization, LocaleChanged } from "@lunaris/localization";
import { Startup, StartupChanged } from "@lunaris/startup";

const catalog = { en: {
  pendingconnect: "Connecting…", pendinglogin: "Signing in…", pendingregister: "Creating account…",
  loading: "Loading vaults…",
  connect: "Connect to server", login: "Sign in", register: "Create account", vaults: "Your vaults", trash: "Trash", local: "Local vaults",
  address: "Server address", username: "Login", password: "Password", showPassword: "Show or hide password", invitation: "Invitation token", name: "Vault name",
  create: "Create vault", restore: "Restore", delete: "Move to trash", logout: "Sign out", refresh: "Refresh", empty: "No vaults here", changeServer: "Change server",
  passwordReset: "Contact your server administrator to reset your password.", expires: "Available until {date}",
  cancel: "Cancel", accountMenu: "Account", vaultActions: "Vault actions",
  loginDetail: "Sign in to access your vaults.", registerDetail: "One account for all your vaults on this server.",
  connectDetail: "Enter the address of your Lunaris server.", vaultsDetail: "Choose a vault to continue.",
  trashDetail: "Restore a vault before its retention period ends.", emptyTrash: "Trash is empty",
  emptyDetail: "Create your first vault to start writing.", emptyTrashDetail: "Vaults you move to trash will appear here.",
  error: "The operation failed. Try again.", offline: "The server is unavailable. Check the address and your connection.",
  credentials: "Invalid login or password.", invitationError: "The invitation is missing, invalid or already used.", taken: "This login is already registered.",
  limit: "The account has reached its active vault limit.", conflict: "Unsaved changes need attention before continuing.", invalid: "Check the entered values.",
}, ru: russian };
type Mode = "connect" | "login" | "register" | "vaults" | "trash";
export function createAccountAccess(options: { readonly art?: string; readonly defaultOpen?: boolean; readonly defaultAddress?: string; readonly allowLocal?: boolean } = {}) {
  const provides = [AccountAccess, AccountAccessChanged];
  const requires = [Logger, AccountSession, AccountSessionChanged, AccountVaults, FilesystemSources, Vault, VaultChanged, VaultLocations, Components, ComponentsChanged, Slots, SlotDom, Localization, LocaleChanged, Startup, StartupChanged];
  return definePlugin({ manifest: { manifestVersion: 1, id: "lunaris.account-access", version: "0.1.0", engine: "^0.1.0", sdk: "^0.1.0", entry: "./dist/index.js",
    provides: provides.map(t => ({ kind: t.kind, id: t.id, version: t.version })), requires: requires.map(t => ({ kind: t.kind, id: t.id, range: `^${t.version}` })),
    permissions: ["account.access", "filesystem.access", "vault.access", "ui.dom"], optionalPermissions: [] }, activate(ctx) {
    const logger = scopeLogger(ctx.use(Logger), ctx.signal); const session = ctx.use(AccountSession); const vaults = ctx.use(AccountVaults); const sources = ctx.use(FilesystemSources);
    const active = ctx.use(Vault); const locations = ctx.use(VaultLocations); const components = ctx.use(Components); const slots = ctx.use(Slots); const targets = ctx.use(SlotDom);
    const localization = ctx.use(Localization); const startup = ctx.use(Startup);
    const registered = localization.register(ctx.pluginId, catalog, ctx.signal); if (!registered.ok) throw Error("Cannot register account messages.");
    let visible = options.defaultOpen ?? false; let mode: Mode = "connect"; let info: ServerInfo | null = null; let busy = false; let error = ""; let entries: readonly RemoteVault[] = []; let unavailable = false;
    let catalogState: "loading" | "ready" | "error" = "ready";
    let listRevision = 0;
    const fields = { address: options.defaultAddress ?? "", login: "", password: "", invitation: "", name: "" };
    let screen = ctx.scope.child(); let mounted: MountedComponent | undefined; let allocated = false; let autoConnected = false;
    let placement: AccountAccessPlacement | undefined;
    let unbindPlacement: (() => void) | undefined;
    let viewGeneration = 0; let operationGeneration = 0;
    const stopped = () => ctx.signal.aborted || operationGeneration !== viewGeneration;
    function releaseView() {
      mounted = undefined; allocated = false;
      void screen.dispose().catch(() => {});
    }
    function detach() { unbindPlacement?.(); unbindPlacement = undefined; placement = undefined; }
    const slotId = "lunaris.account-access.screen";
    const text = (key: string) => localization.text(ctx.pluginId, key);
    function errorKey(code: string) { return ({ OFFLINE: "offline", SERVER_UNAVAILABLE: "offline", INVALID_CREDENTIALS: "credentials", INVITATION_INVALID: "invitationError", INVITATION_REQUIRED: "invitationError", LOGIN_TAKEN: "taken", LIMIT_REACHED: "limit", CONFLICT: "conflict", INVALID_ARGUMENT: "invalid" } as Record<string, string>)[code] ?? "error"; }
    async function list() {
      const revision = ++listRevision;
      const requestedMode = mode;
      const epoch = session.current()?.epoch;
      catalogState = "loading"; entries = []; render();
      const result = await vaults.list(requestedMode === "trash" ? "trashed" : "active");
      if (stopped() || revision !== listRevision || mode !== requestedMode || session.current()?.epoch !== epoch) return;
      catalogState = result.ok ? "ready" : "error";
      if (result.ok) entries = result.value;
      else { error = errorKey(result.error.code); logger.warn(ctx.pluginId, "Cannot load account catalog", { error: result.error }); }
    }
    async function openEntry(entry: RemoteVault, created = false) {
      const location = sources.location("remote", entry.location);
      if (!location.ok) { error = "error"; return; }
      const opened = await locations.open(location.value, created ? { name: entry.name } : undefined);
      if (!stopped() && !opened.ok) error = errorKey(opened.error.code);
    }
    function render() {
      if (unavailable || ctx.signal.aborted) return;
      try { renderView(); } catch (error) { if (isSdkUnavailable(error)) unavailable = true; else throw error; }
    }
    function renderView() {
      if (ctx.signal.aborted) return;
      if (!visible || active.current() || startup.snapshot().state !== "loaded") {
        releaseView(); return;
      }
      if (screen.signal.aborted) screen = ctx.scope.child();
      if (!placement && !allocated) {
        const created = slots.create({ id: slotId, grow: 1 }, screen.signal); if (!created.ok) throw Error("Cannot allocate account screen."); allocated = true;
      }
      const props = { ...fields, art: options.art ?? "", presentation: placement ? { mode: "embedded", sizing: "content" } : { mode: "standalone", sizing: "fill" }, mode, catalogState, serverName: info?.name ?? "", serverDescription: info?.description ?? "", account: session.current()?.account.login ?? "", busy,
        error: error ? text(error) : "", allowChangeServer: !!placement || (options.allowLocal ?? false), allowLocal: !placement && (options.allowLocal ?? false), invitationRequired: info?.registration === "invitation",
        text: Object.fromEntries(Object.keys(catalog.en).filter(key => key !== "expires").map(key => [key, text(key)])),
        entries: entries.map(entry => ({ id: entry.id, name: entry.name, detail: entry.expiresAt ? localization.text(ctx.pluginId, "expires", { date: new Date(entry.expiresAt).toLocaleDateString(localization.locale()) }) : "" })),
        onField(field: keyof typeof fields, value: string) { if (!busy && Object.hasOwn(fields, field)) { fields[field] = value; error = ""; render(); } },
        onSubmit: submit, onToggleAuth() { if (!busy) { mode = mode === "login" ? "register" : "login"; fields.password = ""; error = ""; render(); } },
        onLocal() { if (!busy) setVisible(false); }, onLogout: () => run(async () => { const result = await session.logout(); if (!result.ok) error = errorKey(result.error.code); else { entries = []; mode = "login"; } }),
        onOpen: (id: string) => run(async () => { const entry = entries.find(v => v.id === id); if (entry) await openEntry(entry); }),
        onTrash: (id: string) => run(async () => { const result = await vaults.trash(id); if (stopped()) return; if (!result.ok) error = errorKey(result.error.code); else await list(); }),
        onRestore: (id: string) => run(async () => { const result = await vaults.restore(id); if (stopped()) return; if (!result.ok) error = errorKey(result.error.code); else await list(); }),
        onToggleTrash: () => run(async () => { mode = mode === "trash" ? "vaults" : "trash"; await list(); }),
        onRefresh: () => run(list), onChangeServer() { if (!busy) { fields.password = ""; fields.invitation = ""; error = ""; mode = "connect"; render(); } },
      };
      if (mounted) { const result = mounted.update(props); if (result.ok) return; mounted = undefined; }
      const target = placement?.target ?? targets.get(slotId); if (!target || !components.has("lunaris.account-access")) return;
      const result = components.mount("lunaris.account-access", target, props, screen.signal); if (!result.ok) throw Error("Cannot mount account role."); mounted = result.value;
    }
    function run(work: () => Promise<void>) {
      if (busy || unavailable || ctx.signal.aborted) return; operationGeneration = viewGeneration; busy = true; placement?.onBusyChange?.(true); error = ""; render();
      void work().catch(failure => { if (isSdkUnavailable(failure)) { unavailable = true; return; } if (!stopped()) { if (catalogState === "loading") catalogState = "error"; error = "error"; logger.error(ctx.pluginId, "Account operation failed", { error: failure }); } }).finally(() => { busy = false; if (!ctx.signal.aborted) { placement?.onBusyChange?.(false); render(); } });
    }
    async function connect() {
      const result = await session.connect(fields.address, ctx.signal); if (stopped()) return;
      if (!result.ok) { error = errorKey(result.error.code); return; }
      info = result.value; mode = session.current() ? "vaults" : "login"; if (mode === "vaults") await list();
    }
    function submit() { run(async () => {
      if (mode === "connect") return connect();
      if (mode === "vaults") { const result = await vaults.create(fields.name.trim()); if (stopped()) return; if (!result.ok) error = errorKey(result.error.code); else { fields.name = ""; catalogState = "ready"; entries = [...entries, result.value]; await openEntry(result.value, true); } return; }
      if (mode !== "login" && mode !== "register") return;
      const password = fields.password; fields.password = "";
      if (mode === "register") { const created = await session.register(fields.login, password, fields.invitation); if (stopped()) return; if (!created.ok) { error = errorKey(created.error.code); return; } }
      if (stopped()) return;
      const result = await session.login(fields.login, password); fields.invitation = "";
      if (stopped()) return;
      if (!result.ok) error = errorKey(result.error.code); else { mode = "vaults"; await list(); }
    }); }
    function setVisible(value: boolean) { visible = value; render(); void ctx.events.emit(AccountAccessChanged, { visible }).catch(failure => { if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot publish account screen state", { error: failure }); }); }
    ctx.provide(AccountAccess, {
      visible: () => visible,
      open(nextPlacement) {
        if (busy || ctx.signal.aborted || nextPlacement?.owner.aborted) return;
        if (nextPlacement && (!nextPlacement.target || typeof nextPlacement.target.appendChild !== "function")) throw TypeError("A borrowed account target is required.");
        releaseView(); detach(); viewGeneration++;
        placement = nextPlacement;
        if (placement) {
          const owner = placement.owner;
          const abort = () => { viewGeneration++; visible = false; fields.password = ""; releaseView(); detach(); };
          owner.addEventListener("abort", abort, { once: true });
          unbindPlacement = () => owner.removeEventListener("abort", abort);
        }
        mode = session.current() ? "vaults" : info ? "login" : "connect";
        setVisible(true); if (mode === "vaults") run(list);
      },
      close() { if (busy) return; viewGeneration++; fields.password = ""; setVisible(false); detach(); },
    });
    ctx.scope.own({ dispose() { detach(); } });
    ctx.events.on(VaultChanged, change => { render(); if (!change.current && visible && session.current()) run(list); });
    ctx.events.on(AccountSessionChanged, change => { listRevision++; entries = []; catalogState = "ready"; fields.password = ""; fields.invitation = ""; fields.name = ""; if (!change.current && mode !== "connect") mode = info ? "login" : "connect"; render(); });
    ctx.events.on(ComponentsChanged, change => { if (change.componentId === "lunaris.account-access") { if (change.kind === "removed") mounted = undefined; render(); } });
    ctx.events.on(LocaleChanged, render);
    function loaded() { render(); if (visible && options.defaultAddress && !autoConnected && startup.snapshot().state === "loaded") { autoConnected = true; run(connect); } }
    ctx.events.on(StartupChanged, loaded); loaded(); logger.info(ctx.pluginId, "Account access ready");
  } });
}
