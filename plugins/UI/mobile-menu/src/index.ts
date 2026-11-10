import { definePlugin, isSdkUnavailable } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { Localization, LocaleChanged } from "@lunaris/localization";
import { Workspace } from "@lunaris/workspace";
import { MobileMenu } from "@lunaris/mobile-menu";
import type { MobileMenuApi, MobileMenuItem } from "@lunaris/mobile-menu";
import manifest from "../manifest.json" with { type: "json" };
export default definePlugin({ manifest, activate(ctx) {
 const logger = scopeLogger(ctx.use(Logger), ctx.signal); const workspace = ctx.use(Workspace);
 const entries = new Map<string, { item: MobileMenuItem; owner: CancellationSignal; remove: () => void }>();
 const id = ctx.pluginId + ".view";
 const launcherId = ctx.pluginId + ".launcher";
 const localization = ctx.use(Localization);
 const catalog = localization.register(ctx.pluginId, { en: { demo: "Test button {number}" }, ru: { demo: "Тестовая кнопка {number}" } }, ctx.signal);
 if (!catalog.ok) throw new Error("Cannot register mobile menu messages", { cause: catalog.error });
 const itemsFor = (placement: "panel" | "launcher") => list().filter(item => (item.placement ?? "panel") === placement);
 const list = () => Object.freeze([...entries.values()].map(e => e.item).sort((a,b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id)));
 const publish = () => { if (ctx.signal.aborted) return; try { for (const [target, placement] of [[id,"panel"], [launcherId,"launcher"]] as const) { const result = workspace.update(target, { items: itemsFor(placement), density: placement === "launcher" ? "compact" : "comfortable" }); if (!result.ok) logger.error(ctx.pluginId, "Cannot update mobile menu", { error: result.error }); } } catch (error) { if (!isSdkUnavailable(error)) throw error; } };
 const copy = (input: MobileMenuItem): MobileMenuItem | undefined => {
  if (!input || typeof input !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return;
  const fields = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(fields).some(key => typeof key !== "string" || !["id","label","icon","order","disabled","onPress","placement"].includes(key) || !("value" in fields[key]!))) return;
  if ((input.placement !== undefined && !["panel","launcher"].includes(input.placement)) || typeof input.id !== "string" || !/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(input.id) || typeof input.label !== "string" || !input.label.trim() || typeof input.icon !== "string" || typeof input.onPress !== "function" || (input.order !== undefined && !Number.isSafeInteger(input.order)) || (input.disabled !== undefined && typeof input.disabled !== "boolean")) return;
  const action = input.onPress;
  const item: MobileMenuItem = Object.freeze({ ...input, onPress: async () => { const current = entries.get(item.id); if (ctx.signal.aborted || !current || current.item !== item || current.owner.aborted || item.disabled) return; try { await action(); if (!ctx.signal.aborted) logger.info(ctx.pluginId, "Mobile action completed", { data: { id: item.id } }); } catch(error) { if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Mobile action failed", { error, data: { id: item.id } }); } } });
  return item;
 };
 const initial = workspace.register({ id, componentId: "lunaris.mobile-menu", region: "mobile-menu", props: { items: [] } }, ctx.signal);
 if (!initial.ok) throw new Error("Cannot register mobile menu", { cause: initial.error });
 const launcher = workspace.register({ id: launcherId, componentId: "lunaris.mobile-menu", region: "mobile-launcher", props: { items: [], density: "compact" } }, ctx.signal);
 if (!launcher.ok) throw new Error("Cannot register mobile launcher", { cause: launcher.error });
 const api: MobileMenuApi = {
  list,
  register(input, owner) {
   const item = copy(input); if (!item || !owner || owner.aborted !== false || typeof owner.addEventListener !== "function" || typeof owner.removeEventListener !== "function") return { ok:false, error:"INVALID_ARGUMENT" };
   if (entries.has(item.id)) return { ok:false, error:"ALREADY_REGISTERED" };
   const remove = () => { owner.removeEventListener("abort", remove); entries.delete(item.id); publish(); };
   entries.set(item.id, { item, owner, remove }); owner.addEventListener("abort", remove, { once:true }); publish(); logger.info(ctx.pluginId, "Mobile action registered", { data: { id:item.id } }); return { ok:true };
  },
  update(input) { const item = copy(input); if (!item) return {ok:false,error:"INVALID_ARGUMENT"}; const entry = entries.get(item.id); if (!entry) return {ok:false,error:"NOT_FOUND"}; entry.item = item; publish(); return {ok:true}; }
 };
 ctx.provide(MobileMenu, api);
 const demos = ["search", "files", "outline", "settings", "account"];
 const demoItem = (icon: string, index: number) => ({ id: ctx.pluginId + ".demo-" + (index + 1), label: localization.text(ctx.pluginId, "demo", { number: index + 1 }), icon, order: index, onPress() {} });
 demos.forEach((icon,index) => { const result = api.register(demoItem(icon,index), ctx.signal); if (!result.ok) throw new Error("Cannot register preview action"); });
 ctx.events.on(LocaleChanged, () => { demos.forEach((icon,index) => api.update(demoItem(icon,index))); });
 ctx.scope.own({ dispose() { for (const entry of entries.values()) entry.owner.removeEventListener("abort", entry.remove); entries.clear(); } });
 logger.info(ctx.pluginId, "Mobile menu ready");
} });
