import { definePlugin } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { Slots, SlotDriver, ROOT_SLOT, normalizeSlot, isLiveOwner, slotFailure } from "@lunaris/slots";
import type { SlotInfo } from "@lunaris/slots";
import manifest from "../manifest.json" with { type: "json" };

export default definePlugin({ manifest, activate(ctx) {
  const logger = scopeLogger(ctx.use(Logger), ctx.signal);
  const driver = ctx.use(SlotDriver);
  const slots = new Map<string, { info: SlotInfo; detach: () => void }>([[ROOT_SLOT.id, { info: ROOT_SLOT, detach() {} }]]);
  function remove(id: string): void {
    const pending = [id];
    for (let index = 0; index < pending.length; index++) {
      for (const entry of slots.values()) if (entry.info.parent === pending[index]) pending.push(entry.info.id);
    }
    for (const key of pending.reverse()) { slots.get(key)?.detach(); slots.delete(key); }
    // Ownership cleanup changes local state only; SDK access may already be closed.
  }
  ctx.scope.own({ dispose() { for (const entry of slots.values()) entry.detach(); slots.clear(); } });
  ctx.provide(Slots, {
    get: id => slots.get(id)?.info,
    list: (parent = "root") => Object.freeze([...slots.values()].filter(entry => entry.info.parent === parent).map(entry => entry.info).sort((a, b) => a.order - b.order)),
    create(request, owner) {
      const info = normalizeSlot(request);
      if (!info || !isLiveOwner(owner)) {
        logger.warn(ctx.pluginId, "Slot request rejected", { code: "INVALID_ARGUMENT" });
        return slotFailure("INVALID_ARGUMENT", "A valid slot request and live owner signal are required.");
      }
      if (slots.has(info.id)) {
        logger.warn(ctx.pluginId, "Slot ID is already occupied", { code: "ALREADY_EXISTS", data: { id: info.id } });
        return slotFailure("ALREADY_EXISTS", "The slot ID is already occupied.");
      }
      if (!slots.has(info.parent!)) {
        logger.warn(ctx.pluginId, "Parent slot is unavailable", { code: "PARENT_MISSING", data: { id: info.id, parent: info.parent } });
        return slotFailure("PARENT_MISSING", "The parent slot does not exist.");
      }
      const created = driver.create(info, owner, ctx.signal);
      if (!created.ok) {
        logger.error(ctx.pluginId, "Slot target creation failed", { code: created.error.code, error: created.error, data: { id: info.id } });
        return created;
      }
      const signal: CancellationSignal = owner;
      const release = () => remove(info.id);
      slots.set(info.id, { info, detach: () => signal.removeEventListener("abort", release) });
      signal.addEventListener("abort", release, { once: true });
      logger.debug(ctx.pluginId, "Slot allocated", { data: { id: info.id, parent: info.parent } });
      return { ok: true, value: info };
    },
  });
  logger.info(ctx.pluginId, "Slot provider ready", { code: "SLOTS_READY" });
} });
