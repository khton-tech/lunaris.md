import slots from "@lunaris/slot-provider";
import { createWebSlotDriver } from "@lunaris/web-slot-driver";
import type { ApplicationDefinition } from "./session.js";

/** Stage product rendering off-screen until the host mounts the successful session. */
export function composeSlotSurface(target: HTMLElement): ApplicationDefinition {
  const surface = target.ownerDocument.createElement("div");
  surface.className = "application-surface";
  const driver = createWebSlotDriver(surface);
  return {
    plugins: [driver, slots],
    entrypoints: [slots.manifest.id],
    grants: { [slots.manifest.id]: ["ui.surface"], [driver.manifest.id]: ["ui.surface", "ui.dom"] },
    view: { mount(signal) {
      signal.throwIfAborted();
      target.append(surface);
      return { dispose() { surface.remove(); } };
    } },
  };
}
