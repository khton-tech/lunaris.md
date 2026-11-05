import type { Disposable } from "@lunaris/sdk";
import type { HostSession, HostSnapshot } from "./session.js";
import { message as t } from "./catalog.js";
import type { MessageKey } from "./catalog.js";

/** Host-owned DOM. No plugin is given this system root or the session object. */
export function mountSystemView(root: HTMLElement, application: HTMLElement, session: HostSession): Disposable {
  const document = root.ownerDocument;
  root.lang = "en";
  let inspect = false;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const header = el("header", undefined, "masthead");
  const brand = el("div", undefined, "brand");
  brand.textContent = "Lunaris";
  const controls = el("div", undefined, "controls");
  const system = el("button"); system.type = "button";
  controls.append(system); header.append(brand, controls);
  const panel = el("main", undefined, "system-panel");
  const intro = el("section", undefined, "intro");
  const heading = el("h1");
  const detail = el("p", undefined, "detail");
  const retry = el("button"); retry.type = "button";
  const statusRow = el("div", undefined, "status-row");
  statusRow.append(heading, retry);
  intro.append(statusRow, detail);
  const metrics = el("dl", undefined, "metrics");
  const plugins = el("section", undefined, "section");
  const pluginsHeading = el("h2");
  const pluginHelp = el("details", undefined, "plugin-help");
  const pluginHelpHeading = el("summary");
  const scope = el("p", undefined, "muted");
  pluginHelp.append(pluginHelpHeading, scope);
  const pluginList = el("div", undefined, "table-scroll");
  plugins.append(pluginsHeading, pluginList, pluginHelp);
  const diagnostics = el("details", undefined, "section diagnostic-section");
  const diagnosticsSummary = el("summary");
  const diagnosticsHeading = el("h2");
  const diagnosticCount = el("span", undefined, "muted");
  diagnosticsSummary.append(diagnosticsHeading, diagnosticCount);
  const diagnosticList = el("ol", undefined, "diagnostics");
  diagnostics.append(diagnosticsSummary, diagnosticList);
  panel.append(intro, metrics, plugins, diagnostics);
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

  function render(snapshot: HostSnapshot): void {
    const renderKey = JSON.stringify([snapshot, inspect]);
    if (renderKey === previousRender) return;
    previousRender = renderKey;
    const showSystem = !snapshot.applicationVisible || inspect;
    panel.hidden = !showSystem;
    application.hidden = showSystem;
    system.hidden = !snapshot.applicationVisible;
    system.textContent = t(inspect ? "back" : "system");
    panel.setAttribute("aria-label", t("status"));
    root.dataset.phase = snapshot.phase;
    heading.textContent = t(snapshot.phase);
    heading.setAttribute("role", snapshot.phase === "fallback" ? "alert" : "status");
    detail.textContent = snapshot.recoveryBlocked ? t("restartRequired") : snapshot.phase === "fallback" ? t("details") : "";
    detail.hidden = snapshot.phase !== "fallback" && !snapshot.recoveryBlocked;
    retry.textContent = t(snapshot.busy ? "working" : "restart"); retry.disabled = snapshot.busy || snapshot.recoveryBlocked;
    retry.hidden = snapshot.phase === "running" || snapshot.phase === "starting" || snapshot.recoveryBlocked;
    pluginsHeading.textContent = t("plugins"); diagnosticsHeading.textContent = t("diagnostics");
    scope.textContent = t("scope"); pluginHelpHeading.textContent = t("pluginHelp");
    pluginHelp.hidden = snapshot.kernel.plugins.length + snapshot.disabled.length === 0;
    diagnosticCount.textContent = ` (${snapshot.incidents.length + snapshot.kernel.diagnostics.length})`;
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
      if (entries.length) diagnostics.open = true;
      for (const text of entries) diagnosticList.append(el("li", text, "mono"));
      if (!entries.length) diagnosticList.append(el("li", t("noDiagnostics"), "empty"));
    }
  }
  const subscription = session.subscribe(render);
  return { dispose() { subscription.dispose(); root.replaceChildren(); application.hidden = true; } };
}
