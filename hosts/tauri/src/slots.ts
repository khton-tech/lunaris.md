import slots from "@lunaris/slot-provider";
import { createWebSlotDriver } from "@lunaris/web-slot-driver";
import type { ApplicationDefinition } from "./session.js";

/** An isolated surface that can present SDK product UI during startup. */
export function composeSlotSurface(target: HTMLElement): ApplicationDefinition {
  const surface = target.ownerDocument.createElement("div");
  surface.className = "application-surface";
  const driver = createWebSlotDriver(surface);
  return {
    plugins: [driver, slots],
    entrypoints: [slots.manifest.id],
    grants: { [slots.manifest.id]: ["ui.surface"], [driver.manifest.id]: ["ui.surface", "ui.dom"] },
    view: { duringStartup: true, mount(signal) {
      signal.throwIfAborted();
      target.append(surface);
      return { dispose() { surface.remove(); } };
    } },
  };
}
