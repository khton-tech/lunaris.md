import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { MantineProvider } from "@mantine/core";
import type { ComponentInstance, ComponentProps } from "@lunaris/components";
import { Components } from "@lunaris/components";
import { definePlugin } from "@lunaris/sdk";
import { Logger } from "@lunaris/logging";
import { Themes, ThemeChanged } from "@lunaris/themes";
import { startupProps, selectorProps } from "./props.js";
import { StartupScreen, VaultSelector } from "./views.js";
import { resolveTheme } from "./theme.js";
import manifest from "../manifest.json" with { type: "json" };

let nextId = 0;
// All persistence belongs to the SDK theme/config services, never browser storage.
const colorSchemeManager = { get: () => "dark" as const, set() {}, subscribe() {}, unsubscribe() {}, clear() {} };

export default definePlugin({ manifest, activate(ctx) {
  const logger = ctx.use(Logger); const components = ctx.use(Components); const themes = ctx.use(Themes);
  logger.debug(ctx.pluginId, "Activating Mantine components");
  const instances = new Set<{ applyTheme(): void }>();
  ctx.events.on(ThemeChanged, () => {
    for (const instance of instances) instance.applyTheme();
  });
  for (const id of ["lunaris.startup-screen", "lunaris.vault-selector"] as const) {
    const validate = id === "lunaris.startup-screen" ? startupProps : selectorProps;
    const registration = components.register({ id, mount(target, initial, signal): ComponentInstance {
      let props = initial;
      try { validate(props); }
      catch (error) { logger.error(ctx.pluginId, "Invalid Mantine component props", { code: "MANTINE_PROPS_INVALID", data: { componentId: id }, error }); throw error; }
      const container = target.ownerDocument.createElement("div");
      container.id = `lunaris-mantine-${++nextId}`; container.className = "lm-root";
      Object.assign(container.style, { display: "flex", flex: "1 1 0%", minWidth: "0", minHeight: "0", containerType: "size" });
      let disposed = false; let failed = false; let renderError: unknown; let rendering = false;
      const root = createRoot(container, { onUncaughtError(error) {
        failed = true; renderError = error;
        if (!rendering && !disposed && !ctx.signal.aborted) logger.error(ctx.pluginId, "Mantine rendering failed", { code: "MANTINE_RENDER_FAILED", data: { componentId: id }, error });
      } });
      function render(): void {
        if (disposed) return;
        failed = false;
        const theme = resolveTheme(themes.current());
        // A provider per SDK-owned React root scopes color scheme and variables to its owned DOM.
        const view = id === "lunaris.startup-screen"
          ? createElement(StartupScreen, { props: startupProps(props), theme })
          : createElement(VaultSelector, { props: selectorProps(props), theme });
        rendering = true;
        try { flushSync(() => root.render(createElement(MantineProvider, {
          theme: theme.mantine, forceColorScheme: theme.scheme, colorSchemeManager,
          getRootElement: () => container, cssVariablesSelector: `#${container.id}`,
          cssVariablesResolver: () => theme.cssVariables,
          deduplicateCssVariables: false, withGlobalClasses: false,
        }, view))); } finally { rendering = false; }
        if (failed) throw renderError;
      }
      const instance = { applyTheme() {
        try { render(); }
        catch (error) { logger.error(ctx.pluginId, "Cannot apply Mantine theme", { code: "MANTINE_THEME_FAILED", error }); throw error; }
      } };
      function dispose(): void {
        if (disposed) return; disposed = true;
        signal.removeEventListener("abort", dispose); instances.delete(instance);
        try { flushSync(() => root.unmount()); } finally { container.remove(); }
      }
      try {
        target.append(container); render(); instances.add(instance);
        signal.addEventListener("abort", dispose, { once: true });
        if (themes.current() === null) logger.warn(ctx.pluginId, "No active theme; inheriting the product surface", { code: "THEME_UNSELECTED" });
        logger.debug(ctx.pluginId, "Mantine component mounted", { data: { componentId: id } });
      } catch (error) {
        dispose(); logger.error(ctx.pluginId, "Cannot mount Mantine component", { code: "MANTINE_MOUNT_FAILED", data: { componentId: id }, error }); throw error;
      }
      return { update(next: ComponentProps) {
        if (disposed) return;
        try { validate(next); props = next; render(); }
        catch (error) { logger.error(ctx.pluginId, "Cannot update Mantine component", { code: "MANTINE_UPDATE_FAILED", data: { componentId: id }, error }); throw error; }
      }, dispose };
    } }, ctx.signal);
    if (!registration.ok) {
      const error = new Error("Mantine component registration failed.", { cause: registration.error });
      logger.error(ctx.pluginId, "Cannot register Mantine component", { code: "MANTINE_REGISTRATION_FAILED", data: { componentId: id }, error }); throw error;
    }
  }
  logger.info(ctx.pluginId, "Mantine components ready", { code: "MANTINE_COMPONENTS_READY" });
} });
