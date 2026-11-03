import type { Disposable } from "@lunaris/sdk";
import type { HostSession, HostSnapshot } from "./session.js";
import { translator } from "./catalog.js";
import type { MessageKey } from "./catalog.js";

/** Host-owned DOM. No plugin is given this system root or the session object. */
export function mountSystemView(root: HTMLElement, application: HTMLElement, session: HostSession, locale = "en"): Disposable {
  const document = root.ownerDocument;
  let t = translator(locale);
  let inspect = false;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const header = el("header", undefined, "masthead");
  const brand = el("div", undefined, "brand");
  brand.append(el("span", "L", "mark"), el("span", "LUNARIS", "wordmark"));
  const controls = el("div", undefined, "controls");
  const language = el("select");
  for (const [code, label] of [["en", "English"], ["ru", "Русский"]]) {
    const option = el("option", label!); option.value = code!; language.append(option);
  }
  language.value = locale.startsWith("ru") ? "ru" : "en";
  const system = el("button"); system.type = "button";
  controls.append(language, system); header.append(brand, controls);
  const panel = el("main", undefined, "system-panel");
  const intro = el("section", undefined, "intro");
  const eyebrow = el("p", undefined, "eyebrow");
  const heading = el("h1");
  const description = el("p", undefined, "description");
  const detail = el("p", undefined, "detail");
  const retry = el("button", undefined, "primary"); retry.type = "button";
  intro.append(eyebrow, heading, description, detail, retry);
  const metrics = el("dl", undefined, "metrics");
  const plugins = el("section", undefined, "section");
  const pluginsHeading = el("h2");
  const scope = el("p", undefined, "muted");
  const pluginList = el("div", undefined, "table-scroll");
  plugins.append(pluginsHeading, scope, pluginList);
  const diagnostics = el("section", undefined, "section");
  const diagnosticsHeading = el("h2");
  const diagnosticList = el("ol", undefined, "diagnostics");
  diagnostics.append(diagnosticsHeading, diagnosticList);
  const footer = el("footer", undefined, "muted");
  panel.append(intro, metrics, plugins, diagnostics, footer);
  root.replaceChildren(header, panel);
  root.dataset.hostShell = "true";
  let previousList = "";
  let previousDiagnostics = "";
  let previousRender = "";

  function action(work: () => Promise<void>): void {
    void work().catch(() => session.reportFault("view", "RECOVERY_ACTION_FAILED"));
  }
  retry.onclick = () => action(session.start);
  system.onclick = () => { inspect = !inspect; render(session.snapshot()); };
  language.onchange = () => {
    t = translator(language.value); previousList = ""; previousDiagnostics = "";
    document.documentElement.lang = language.value; render(session.snapshot());
  };

  function render(snapshot: HostSnapshot): void {
    const renderKey = JSON.stringify([snapshot, inspect, language.value]);
    if (renderKey === previousRender) return;
    previousRender = renderKey;
    const showSystem = !snapshot.applicationVisible || inspect;
    panel.hidden = !showSystem;
    application.hidden = showSystem;
    system.hidden = !snapshot.applicationVisible;
    system.textContent = t(inspect ? "back" : "system");
    language.setAttribute("aria-label", t("language"));
    panel.setAttribute("aria-label", t("status"));
    root.dataset.phase = snapshot.phase;
    const phaseKeys = { idle: "phaseIdle", starting: "phaseStarting", running: "phaseRunning", fallback: "phaseFallback", stopped: "phaseStopped" } as const;
    eyebrow.textContent = `${t("host")} / ${t(phaseKeys[snapshot.phase])}`;
    heading.textContent = t(snapshot.phase);
    heading.setAttribute("role", snapshot.phase === "fallback" ? "alert" : "status");
    description.textContent = t("description");
    detail.textContent = t(snapshot.recoveryBlocked ? "restartRequired" : snapshot.phase === "fallback" ? "details" : "empty");
    detail.hidden = snapshot.phase !== "fallback" && snapshot.kernel.plugins.length > 0;
    retry.textContent = t(snapshot.busy ? "working" : "restart"); retry.disabled = snapshot.busy || snapshot.recoveryBlocked;
    pluginsHeading.textContent = t("plugins"); diagnosticsHeading.textContent = t("diagnostics");
    scope.textContent = t("scope"); footer.textContent = t("safety");
    metrics.replaceChildren();
    const stats: [MessageKey, string][] = [
      ["kernel", snapshot.kernelVersion], ["sdk", snapshot.sdkVersion],
      ["active", `${snapshot.kernel.plugins.filter(plugin => plugin.state === "active").length} / ${snapshot.kernel.plugins.length}`],
      ["disabled", String(snapshot.disabled.length)],
    ];
    for (const [key, value] of stats) {
      const item = el("div"); item.append(el("dt", t(key)), el("dd", value)); metrics.append(item);
    }
    const listKey = JSON.stringify([snapshot.kernel.plugins, snapshot.disabled, snapshot.busy, snapshot.recoveryBlocked]);
    if (listKey !== previousList) {
      previousList = listKey;
      const table = el("table");
      const caption = el("caption", t("plugins"), "sr-only"); table.append(caption);
      const head = el("thead"); const titles = el("tr");
      for (const key of ["plugin", "version", "state", "resources", "actions"] as const) {
        const cell = el("th", t(key)); cell.scope = "col"; titles.append(cell);
      }
      head.append(titles); table.append(head);
      const body = el("tbody");
      for (const plugin of snapshot.kernel.plugins) {
        const row = el("tr"); row.dataset.pluginId = plugin.manifest.id;
        const stateKey = plugin.state === "active" ? "activeState" : plugin.state === "starting" ? "startingState" : plugin.state === "stopped" ? "stoppedState" : plugin.state;
        row.append(el("td", plugin.manifest.id, "mono"), el("td", plugin.manifest.version, "mono"),
          el("td", t(stateKey)), el("td", String(plugin.ownedResources), "mono"));
        const cell = el("td"); const disable = el("button", t("disable"));
        disable.disabled = snapshot.busy || snapshot.recoveryBlocked;
        disable.onclick = () => action(() => session.disable(plugin.manifest.id));
        cell.append(disable); row.append(cell); body.append(row);
      }
      for (const id of snapshot.disabled) {
        const row = el("tr"); row.dataset.pluginId = id;
        row.append(el("td", id, "mono"), el("td", "—"), el("td", t("disabled")), el("td", "—"));
        const cell = el("td"); const enable = el("button", t("enable")); enable.disabled = snapshot.busy || snapshot.recoveryBlocked;
        enable.onclick = () => action(() => session.enable(id)); cell.append(enable); row.append(cell); body.append(row);
      }
      table.append(body);
      pluginList.replaceChildren(snapshot.kernel.plugins.length + snapshot.disabled.length ? table : el("p", t("noPlugins"), "empty"));
    }
    const diagnosticKey = JSON.stringify([snapshot.incidents, snapshot.kernel.diagnostics]);
    if (diagnosticKey !== previousDiagnostics) {
      previousDiagnostics = diagnosticKey; diagnosticList.replaceChildren();
      const entries = [
        ...snapshot.incidents.map(item => `${t(item.origin)} / ${item.code}${item.pluginId ? ` / ${item.pluginId}` : ""}`),
        ...snapshot.kernel.diagnostics.map(item => `#${item.sequence} / ${item.code}${item.pluginId ? ` / ${item.pluginId}` : ""}${item.contractId ? ` / ${item.contractId}` : ""}`),
      ];
      for (const text of entries) diagnosticList.append(el("li", text, "mono"));
      if (!entries.length) diagnosticList.append(el("li", t("noDiagnostics"), "empty"));
    }
  }
  const subscription = session.subscribe(render);
  return { dispose() { subscription.dispose(); root.replaceChildren(); application.hidden = true; } };
}
