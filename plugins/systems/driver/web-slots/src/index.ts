import { definePlugin } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { SlotDriver, ROOT_SLOT, normalizeSlot, isLiveOwner, slotFailure } from "@lunaris/slots";
import type { SlotInfo, SlotErrorCode } from "@lunaris/slots";
import { SlotDom } from "@lunaris/slot-dom";
import manifest from "../manifest.json" with { type: "json" };

/** Only trusted host composition supplies the application's isolated DOM surface. */
export function createWebSlotDriver(target: HTMLElement) {
  return definePlugin({ manifest, activate(ctx) {
    const logger = scopeLogger(ctx.use(Logger), ctx.signal);
    const entries = new Map<string, { element: HTMLElement; info: SlotInfo; detach: () => void }>();
    const document = target.ownerDocument;
    function reject(code: SlotErrorCode, message: string) {
      logger.warn(ctx.pluginId, message, { code });
      return slotFailure(code, message);
    }
    function element(info: SlotInfo): HTMLElement {
      const node = document.createElement("div");
      node.dataset.lunarisSlot = info.id;
      Object.assign(node.style, {
        display: "flex", flexDirection: info.direction, minWidth: "0", minHeight: "0", boxSizing: "border-box",
        flex: `${info.grow} 1 ${info.grow > 0 ? "0px" : "auto"}`, overflow: "auto",
      });
      return node;
    }
    function remove(id: string): void {
      const pending = [id];
      for (let index = 0; index < pending.length; index++) {
        for (const entry of entries.values()) if (entry.info.parent === pending[index]) pending.push(entry.info.id);
      }
      for (const key of pending.reverse()) {
        const entry = entries.get(key);
        if (entry) { entry.detach(); entry.element.remove(); entries.delete(key); }
      }
    }
    const root = element(ROOT_SLOT);
    entries.set("root", { element: root, info: ROOT_SLOT, detach() {} });
    ctx.scope.own({ dispose() { remove("root"); } });
    target.append(root);
    ctx.provide(SlotDom, { get: id => entries.get(id)?.element });
    ctx.provide(SlotDriver, { create(info, owner, registry) {
      const normalized = normalizeSlot(info);
      if (!normalized || !isLiveOwner(owner) || !isLiveOwner(registry)) return reject("INVALID_ARGUMENT", "A valid slot and live owner signals are required.");
      if (entries.has(normalized.id)) return reject("ALREADY_EXISTS", "The target already exists.");
      const parent = entries.get(normalized.parent!);
      if (!parent) return reject("PARENT_MISSING", "The parent target does not exist.");
      let node: HTMLElement | undefined;
      try {
        node = element(normalized);
        // Keep DOM and visual order aligned, including keyboard traversal.
        const next = [...entries.values()].filter(entry => entry.info.parent === normalized.parent && entry.info.order > normalized.order)
          .sort((a, b) => a.info.order - b.info.order)[0];
        parent.element.insertBefore(node, next?.element ?? null);
        const release = () => remove(normalized.id);
        entries.set(normalized.id, { element: node, info: normalized, detach: () => {
          owner.removeEventListener("abort", release); registry.removeEventListener("abort", release);
        } });
        owner.addEventListener("abort", release, { once: true });
        registry.addEventListener("abort", release, { once: true });
        logger.debug(ctx.pluginId, "Slot target created", { data: { id: normalized.id } });
        return { ok: true, value: null };
      } catch (error) {
        node?.remove(); entries.get(normalized.id)?.detach(); entries.delete(normalized.id);
        logger.error(ctx.pluginId, "Cannot create slot target", { code: "DRIVER_FAILED", error, data: { id: normalized.id } });
        return slotFailure("DRIVER_FAILED", "The rendering target could not be created.");
      }
    } });
    logger.info(ctx.pluginId, "Web slot driver ready", { code: "SLOT_DRIVER_READY" });
  } });
}
