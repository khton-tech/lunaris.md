import { ApplicationDom } from "@lunaris/components";
import { Logger } from "@lunaris/logging";
import { definePlugin } from "@lunaris/sdk";
import manifest from "../manifest.json" with { type: "json" };

export default definePlugin({ manifest, activate(ctx) {
  const logger = ctx.use(Logger);
  try {
    const root = ctx.use(ApplicationDom).root();
    if (!root) throw new Error("The rendered application tree is unavailable.");
    const window = root.ownerDocument.defaultView;
    if (!window) throw new Error("The application tree has no active window.");
    const image = root.ownerDocument.createElement("img");
    image.dataset.pluginMascot = ctx.pluginId;
    image.alt = "";
    image.draggable = false;
    image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(ctx.resources.text("assets/drema.svg"));
    Object.assign(image.style, { display: "block", flex: "none", inlineSize: "1.65em", blockSize: "1.15em", objectFit: "contain" });

    // The standard status bar is a frontend implementation detail. A different
    // renderer can use different selectors or omit the bar entirely.
    const place = () => {
      const context = root.querySelector("footer.lm-status-bar .lm-status-context");
      if (!context) { image.remove(); return; }
      if (image === context.lastElementChild) return;
      context.append(image);
      logger.debug(ctx.pluginId, "Drema placed in existing status bar");
    };
    const observer = new window.MutationObserver(() => {
      if (ctx.signal.aborted) return;
      try { place(); } catch (error) { logger.error(ctx.pluginId, "Cannot place Drema", { error }); }
    });
    ctx.scope.own({ dispose() { observer.disconnect(); image.remove(); } });
    observer.observe(root, { childList: true, subtree: true });
    place();
    logger.info(ctx.pluginId, "Drema ready");
  } catch (error) {
    logger.error(ctx.pluginId, "Cannot start Drema", { error });
    throw error;
  }
} });
