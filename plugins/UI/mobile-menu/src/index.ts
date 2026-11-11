import { definePlugin, isSdkUnavailable } from "@lunaris/sdk";
import type { CancellationSignal, ResourceScope } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { Workspace } from "@lunaris/workspace";
import { MobileMenu } from "@lunaris/mobile-menu";
import type { MobileMenuApi, MobileMenuChoice, MobileMenuItem } from "@lunaris/mobile-menu";
import manifest from "../manifest.json" with { type: "json" };

function copyChoice(input: unknown, ids: Set<string>, allowTrailing: boolean): MobileMenuChoice | undefined {
 if (!input || typeof input !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return;
 const fields = Object.getOwnPropertyDescriptors(input);
 const keys = ["id", "label", "title", "icon", "disabled"];
 if (allowTrailing) keys.push("trailingAction");
 if (Reflect.ownKeys(fields).some(key => typeof key !== "string" || !keys.includes(key) || !("value" in fields[key]!))) return;
 const id: unknown = fields.id?.value;
 const label: unknown = fields.label?.value;
 const title: unknown = fields.title?.value;
 const icon: unknown = fields.icon?.value;
 const disabled: unknown = fields.disabled?.value;
 if (typeof id !== "string" || !id.trim() || ids.has(id) || typeof label !== "string" || !label.trim() ||
   (title !== undefined && typeof title !== "string") || (icon !== undefined && typeof icon !== "string") ||
   (disabled !== undefined && typeof disabled !== "boolean")) return;
 ids.add(id);
 const option = { id, label, ...(title === undefined ? {} : { title }), ...(icon === undefined ? {} : { icon }),
   ...(disabled === undefined ? {} : { disabled }) };
 if (fields.trailingAction?.value === undefined) return Object.freeze(option);
 const trailingAction = copyChoice(fields.trailingAction.value, ids, false);
 return trailingAction && Object.freeze({ ...option, trailingAction });
}
function copyChoices(input: unknown): readonly MobileMenuChoice[] | undefined {
 if (!Array.isArray(input) || !input.length) return;
 const choices: MobileMenuChoice[] = [];
 const ids = new Set<string>();
 for (const choice of input) {
  const copied = copyChoice(choice, ids, true);
  if (!copied) return;
  choices.push(copied);
 }
 return Object.freeze(choices);
}
export default definePlugin({ manifest, activate(ctx) {
 const logger = scopeLogger(ctx.use(Logger), ctx.signal); const workspace = ctx.use(Workspace);
 const entries = new Map<string, { item: MobileMenuItem; owner: CancellationSignal; remove: () => void }>();
 const regions = { panel: "mobile-menu", launcher: "mobile-launcher" } as const;
 const ids = { panel: ctx.pluginId + ".view", launcher: ctx.pluginId + ".launcher" };
 const targets = new Map<keyof typeof regions, ResourceScope>();
 const list = () => Object.freeze([...entries.values()].map(e => e.item).sort((a,b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id)));
 function publish(placement: keyof typeof regions): void {
  if (ctx.signal.aborted) return;
  const items = list().filter(item => (item.placement ?? "panel") === placement);
  const target = targets.get(placement);
  const id = ids[placement];
  if (!items.length) {
   targets.delete(placement);
   void target?.dispose().catch(error => logger.error(ctx.pluginId, "Cannot release mobile menu", { error }));
   return;
  }
  const props = { items, density: placement === "launcher" ? "compact" : "comfortable" };
  try {
   if (target) {
    const result = workspace.update(id, props);
    if (!result.ok) logger.error(ctx.pluginId, "Cannot update mobile menu", { error: result.error });
   } else {
    const scope = ctx.scope.child();
    const result = workspace.register({ id, componentId: "lunaris.mobile-menu", region: regions[placement], props }, scope.signal);
    if (result.ok) targets.set(placement, scope);
    else {
     void scope.dispose().catch(() => {});
     logger.error(ctx.pluginId, "Cannot register mobile menu", { error: result.error });
    }
   }
  } catch (error) { if (!isSdkUnavailable(error)) throw error; }
 }
 const copy = (input: MobileMenuItem): MobileMenuItem | undefined => {
  if (!input || typeof input !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return;
  const fields = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(fields).some(key => typeof key !== "string" || !["id","label","icon","order","disabled","onPress","placement","count","choices","selectedChoiceId","onReorder"].includes(key) || !("value" in fields[key]!))) return;
  if ((input.placement !== undefined && !["panel","launcher"].includes(input.placement)) || typeof input.id !== "string" || !/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(input.id) || typeof input.label !== "string" || !input.label.trim() || typeof input.icon !== "string" || typeof input.onPress !== "function" || (input.order !== undefined && !Number.isSafeInteger(input.order)) || (input.disabled !== undefined && typeof input.disabled !== "boolean")) return;
  if (input.count !== undefined && (!Number.isSafeInteger(input.count) || input.count < 0)) return;
  const choices = input.choices === undefined ? undefined : copyChoices(input.choices);
  if ((input.choices !== undefined && !choices) ||
    (input.selectedChoiceId != null && !choices?.some(choice => choice.id === input.selectedChoiceId)) ||
    (input.onReorder !== undefined && (!choices || typeof input.onReorder !== "function"))) return;
  const action = input.onPress;
  const reorder = input.onReorder;
  const isLive = () => {
   const current = entries.get(item.id);
   return !ctx.signal.aborted && current?.item === item && !current.owner.aborted && !item.disabled;
  };
  const item: MobileMenuItem = Object.freeze({ ...input, ...(choices ? { choices } : {}),
   ...(reorder ? { onReorder(id: string, targetId: string, edge: "before" | "after") {
    if (!isLive() || id === targetId || (edge !== "before" && edge !== "after") ||
      !choices?.some(choice => choice.id === id && !choice.disabled) || !choices.some(choice => choice.id === targetId)) return;
    try { reorder(id, targetId, edge); }
    catch (error) { if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot reorder mobile choices", { error, data: { id: item.id } }); }
   } } : {}), async onPress(choiceId?: string) {
   if (!isLive()) return;
   if (choices && (!choiceId || !choices.some(choice =>
     (choice.id === choiceId && !choice.disabled) || (choice.trailingAction?.id === choiceId && !choice.trailingAction.disabled)))) return;
   try {
    if (choices) await action(choiceId);
    else await action();
    if (!ctx.signal.aborted) logger.info(ctx.pluginId, "Mobile action completed", { data: { id: item.id } });
   } catch (error) {
    if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Mobile action failed", { error, data: { id: item.id } });
   }
  } });
  return item;
 };
 const api: MobileMenuApi = {
  list,
  register(input, owner) {
   const item = copy(input); if (!item || !owner || owner.aborted !== false || typeof owner.addEventListener !== "function" || typeof owner.removeEventListener !== "function") return { ok:false, error:"INVALID_ARGUMENT" };
   if (entries.has(item.id)) return { ok:false, error:"ALREADY_REGISTERED" };
   const remove = () => { const placement = entries.get(item.id)?.item.placement; owner.removeEventListener("abort", remove); entries.delete(item.id); publish(placement ?? "panel"); };
   entries.set(item.id, { item, owner, remove }); owner.addEventListener("abort", remove, { once:true }); publish(item.placement ?? "panel"); logger.info(ctx.pluginId, "Mobile action registered", { data: { id:item.id } }); return { ok:true };
  },
  update(input) {
   const item = copy(input); if (!item) return {ok:false,error:"INVALID_ARGUMENT"};
   const entry = entries.get(item.id); if (!entry) return {ok:false,error:"NOT_FOUND"};
   const previous = entry.item.placement ?? "panel";
   const placement = item.placement ?? "panel";
   entry.item = item;
   if (previous !== placement) publish(previous);
   publish(placement);
   return {ok:true};
  }
 };
 ctx.provide(MobileMenu, api);
 ctx.scope.own({ dispose() { for (const entry of entries.values()) entry.owner.removeEventListener("abort", entry.remove); entries.clear(); } });
 logger.info(ctx.pluginId, "Mobile menu ready");
} });
