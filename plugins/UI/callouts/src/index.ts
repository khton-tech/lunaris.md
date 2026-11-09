import { Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { continueCallout } from "./commands.js";
import { definePlugin } from "@lunaris/sdk";
import { EditorExtensions } from "@lunaris/editor";
import { Components, ComponentsChanged } from "@lunaris/components";
import { Localization, LocaleChanged } from "@lunaris/localization";
import { Logger, scopeLogger } from "@lunaris/logging";
import { Themes, ThemeChanged } from "@lunaris/themes";
import { calloutMarkdown } from "./markdown.js";
import { calloutPreview, calloutTheme, presentation } from "./preview.js";
import manifest from "../manifest.json" with { type: "json" };

const catalogs = {
  en: { note: "Note", abstract: "Summary", info: "Information", todo: "To do", tip: "Tip", success: "Success", question: "Question", warning: "Warning", failure: "Failure", danger: "Danger", bug: "Bug", example: "Example", quote: "Quote", toggle: "Expand or collapse callout", edit: "Edit callout title" },
  ru: { note: "Заметка", abstract: "Кратко", info: "Информация", todo: "Задача", tip: "Совет", success: "Успех", question: "Вопрос", warning: "Предупреждение", failure: "Ошибка", danger: "Опасность", bug: "Баг", example: "Пример", quote: "Цитата", toggle: "Развернуть или свернуть коллаут", edit: "Изменить заголовок коллаута" },
};
export default definePlugin({ manifest, activate(ctx) {
  const logger = scopeLogger(ctx.use(Logger), ctx.signal), editor = ctx.use(EditorExtensions);
  const components = ctx.use(Components), localization = ctx.use(Localization), themes = ctx.use(Themes);
  const catalog = localization.register(ctx.pluginId, catalogs, ctx.signal);
  if (!catalog.ok) throw new Error("Cannot register callout messages.", { cause: catalog.error });
  let registration: { dispose(): unknown } | undefined;
  let unavailable = false;
  let rendererFailed = false;
  const active = () => !ctx.signal.aborted;
  const text = (key: keyof typeof catalogs.en) => localization.text(ctx.pluginId, key);
  function refresh() {
    if (!active()) return;
    const available = !rendererFailed && components.has("lunaris.callout-header");
    if (!available && !unavailable) logger.warn(ctx.pluginId, "Callout header unavailable; preserving editable source");
    unavailable = !available;
    registration?.dispose();
    const result = editor.register({ id: ctx.pluginId, markdown: calloutMarkdown, extension: [Prec.highest(keymap.of([{ key: "Enter", run: continueCallout }])), calloutPreview, calloutTheme(themes.current()?.properties.colors as Record<string, unknown> | undefined), presentation.of({
      available, title: type => text(type), toggleLabel: text("toggle"), editLabel: text("edit"), active,
      toggled(collapsed) { if (active()) logger.debug(ctx.pluginId, "Callout disclosure changed", { data: { collapsed } }); },
      mount(target, props) {
        if (!active() || !components.has("lunaris.callout-header")) return null;
        const mounted = components.mount("lunaris.callout-header", target, props, ctx.signal);
        if (!mounted.ok) {
          logger.error(ctx.pluginId, "Cannot mount callout header", { error: mounted.error });
          rendererFailed = true; void Promise.resolve().then(refresh); return null;
        }
        return mounted.value;
      },
    })] }, ctx.signal);
    if (!result.ok) throw new Error("Cannot register callout extension.", { cause: result.error });
    registration = result.value;
  }
  ctx.events.on(ComponentsChanged, event => { if (event.componentId === "lunaris.callout-header") { rendererFailed = false; refresh(); } });
  ctx.events.on(LocaleChanged, refresh); ctx.events.on(ThemeChanged, refresh);
  refresh(); logger.info(ctx.pluginId, "Callouts ready");
} });
