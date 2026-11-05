import type { CancellationSignal } from "@lunaris/sdk";
import type { ComponentInstance, ComponentProps } from "@lunaris/components";
import type { ThemeDefinition, ThemeValue } from "@lunaris/themes";
import { button, icon, textInput } from "./controls.js";
import { selectorStyle } from "./vault-selector-style.js";

type Mode = "create" | "select";
interface Recent { readonly reference: string; readonly name: string; readonly label: string }
interface SelectorProps {
  readonly art: string; readonly text: Readonly<Record<string, string>>; readonly mode: Mode | null;
  readonly folder: string; readonly name: string; readonly busy: boolean; readonly canContinue: boolean;
  readonly error: string; readonly historyError: string; readonly status: string; readonly entries: readonly Recent[];
  readonly activeReference?: string | null;
  readonly onMode: (mode: Mode) => void; readonly onName: (name: string) => void; readonly onBrowse: () => void;
  readonly onNext: () => void; readonly onRecent: (reference: string) => void; readonly onRetry: () => void;
}
const messages = ["logo", "recent", "empty", "create", "select", "folder", "folderPlaceholder", "browse", "name", "next", "retry"];
let instanceId = 0;
function readProps(value: ComponentProps): SelectorProps {
  for (const key of ["art", "folder", "name", "error", "historyError", "status"]) if (typeof value[key] !== "string") throw new TypeError(`Vault selector requires ${key}.`);
  for (const key of ["busy", "canContinue"]) if (typeof value[key] !== "boolean") throw new TypeError(`Vault selector requires ${key}.`);
  for (const key of ["onMode", "onName", "onBrowse", "onNext", "onRecent", "onRetry"]) if (typeof value[key] !== "function") throw new TypeError(`Vault selector requires ${key}.`);
  if (value.mode !== null && value.mode !== "create" && value.mode !== "select") throw new TypeError("Invalid selector mode.");
  if (value.activeReference !== undefined && value.activeReference !== null && typeof value.activeReference !== "string") throw new TypeError("Invalid active Vault reference.");
  if (!value.text || typeof value.text !== "object" || messages.some(key => typeof (value.text as Record<string, unknown>)[key] !== "string")) throw new TypeError("Vault selector requires localized messages.");
  if (!Array.isArray(value.entries) || value.entries.some(entry => !entry || ["reference", "name", "label"].some(key => typeof entry[key] !== "string"))) throw new TypeError("Invalid recent entries.");
  return value as unknown as SelectorProps;
}
function field(value: ThemeValue | undefined, key: string): ThemeValue | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Readonly<Record<string, ThemeValue>>)[key] : undefined;
}
const text = (value: ThemeValue | undefined, fallback: string): string => typeof value === "string" ? value : fallback;

export function mountVaultSelector(target: HTMLElement, input: ComponentProps, signal: CancellationSignal,
  currentTheme: () => ThemeDefinition | null, released: () => void): ComponentInstance & { applyTheme(): void } {
  let props = readProps(input); let disposed = false;
  const document = target.ownerDocument;
  const id = `ln-vault-${++instanceId}`;
  const frame = document.createElement("div");
  Object.assign(frame.style, { display: "flex", flex: "1 1 0%", minWidth: "0", minHeight: "0", containerType: "inline-size" });
  const screen = document.createElement("section"); screen.className = "ln-vault";
  const style = document.createElement("style"); style.textContent = selectorStyle;
  const recents = document.createElement("aside"); recents.className = "ln-vault-recents";
  const heading = document.createElement("h2");
  const list = document.createElement("ul");
  const empty = document.createElement("p");
  const historyError = document.createElement("p"); historyError.className = "ln-vault-message"; historyError.setAttribute("role", "status");
  const retry = button(document, ""); retry.addEventListener("click", () => props.onRetry());
  recents.append(heading, list, empty, historyError, retry);
  const main = document.createElement("div"); main.className = "ln-vault-main";
  const content = document.createElement("div"); content.className = "ln-vault-content";
  const logo = document.createElement("pre"); logo.setAttribute("role", "img");
  const status = document.createElement("p"); status.className = "ln-vault-status"; status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  const actions = document.createElement("div"); actions.className = "ln-vault-actions";
  const cards = new Map<Mode, { card: HTMLElement; toggle: HTMLButtonElement; form: HTMLFormElement; disclosure: HTMLElement; folderLabel: HTMLElement; path: HTMLElement; browse: HTMLButtonElement; nameLabel: Text; name: HTMLInputElement; next: HTMLButtonElement; error: HTMLParagraphElement }>();
  for (const mode of ["create", "select"] as const) {
    const card = document.createElement("div"); card.className = "ln-vault-action";
    const toggle = button(document, "", mode === "create" ? "create" : "browse"); toggle.className = "ln-vault-toggle"; toggle.append(icon(document, "expand"));
    const form = document.createElement("form");
    form.id = `${id}-${mode}`; toggle.setAttribute("aria-controls", form.id);
    const disclosure = document.createElement("div"); disclosure.className = "ln-vault-disclosure";
    const body = document.createElement("div"); body.className = "ln-vault-disclosure-body";
    const folderLabel = document.createElement("div"); folderLabel.className = "ln-vault-field";
    const folderText = document.createElement("span"); folderText.id = `${id}-${mode}-folder`;
    const folderRow = document.createElement("div"); folderRow.className = "ln-vault-folder";
    folderRow.setAttribute("role", "group"); folderRow.setAttribute("aria-labelledby", folderText.id);
    const path = document.createElement("span"); path.className = "ln-vault-path"; path.id = `${id}-${mode}-path`;
    const browse = button(document, "", "browse"); browse.addEventListener("click", () => props.onBrowse());
    browse.setAttribute("aria-describedby", path.id);
    folderRow.append(path, browse); folderLabel.append(folderText, folderRow);
    const nameLabel = document.createElement("label"); const nameText = document.createTextNode(""); const name = textInput(document); name.maxLength = 200; name.required = mode === "create";
    name.addEventListener("input", () => props.onName(name.value)); nameLabel.append(nameText, name); nameLabel.hidden = mode !== "create";
    const error = document.createElement("p"); error.setAttribute("role", "alert");
    const next = button(document, "", "next"); next.className = "ln-vault-next"; next.type = "submit";
    form.append(folderLabel, nameLabel, error, next);
    toggle.addEventListener("click", event => {
      props.onMode(mode);
      if (props.mode === mode && event.detail === 0) browse.focus({ preventScroll: true });
    });
    form.addEventListener("submit", event => { event.preventDefault(); if (props.mode === mode && !props.busy && props.canContinue) props.onNext(); });
    body.append(form); disclosure.append(body); card.append(toggle, disclosure); actions.append(card);
    cards.set(mode, { card, toggle, form, disclosure, folderLabel: folderText, path, browse, nameLabel: nameText, name, next, error });
  }
  const generalError = document.createElement("p"); generalError.className = "ln-vault-message"; generalError.setAttribute("role", "alert");
  content.append(logo, status, actions, generalError); main.append(content); screen.append(style, recents, main); frame.append(screen);
  let recentKey = "";
  function update(next: SelectorProps): void {
    const wasBusy = props.busy;
    props = next; const t = props.text;
    logo.textContent = props.art; logo.setAttribute("aria-label", t.logo!);
    heading.textContent = t.recent!; recents.setAttribute("aria-label", t.recent!);
    empty.textContent = t.empty!; empty.hidden = props.entries.length > 0 || !!props.historyError;
    historyError.textContent = props.historyError; historyError.hidden = !props.historyError;
    retry.querySelector("span")!.textContent = t.retry!; retry.hidden = !props.historyError; retry.disabled = props.busy;
    status.textContent = props.status;
    generalError.textContent = props.mode === null ? props.error : ""; generalError.hidden = !generalError.textContent;
    screen.setAttribute("aria-busy", String(props.busy));
    const key = JSON.stringify(props.entries);
    if (key !== recentKey) {
      recentKey = key; list.replaceChildren();
      for (const entry of props.entries) {
        const li = document.createElement("li"); const open = button(document, "", "folder");
        const labels = open.querySelector("span")!; labels.className = "ln-vault-recent-text";
        const title = document.createElement("span"); title.textContent = entry.name;
        const label = document.createElement("small"); label.textContent = entry.label; label.hidden = entry.label === entry.name;
        open.dataset.reference = entry.reference;
        labels.append(title, label); open.addEventListener("click", () => props.onRecent(entry.reference)); li.append(open); list.append(li);
      }
    }
    for (const open of list.querySelectorAll("button")) {
      open.disabled = props.busy;
      if (open.dataset.reference === props.activeReference) open.setAttribute("aria-current", "true");
      else open.removeAttribute("aria-current");
    }
    for (const [mode, card] of cards) {
      card.toggle.querySelector("span")!.textContent = t[mode]!;
      const expanded = props.mode === mode;
      if (!expanded && card.form.contains(document.activeElement)) card.toggle.focus({ preventScroll: true });
      card.toggle.setAttribute("aria-expanded", String(expanded)); card.toggle.disabled = props.busy;
      card.card.dataset.open = String(expanded);
      card.disclosure.setAttribute("aria-hidden", String(!expanded)); card.form.toggleAttribute("inert", !expanded);
      card.folderLabel.textContent = t.folder!;
      card.path.textContent = expanded && props.folder ? props.folder : t.folderPlaceholder!;
      card.path.title = expanded ? props.folder : ""; card.path.dataset.empty = String(!expanded || !props.folder);
      card.browse.setAttribute("aria-label", t.browse!); card.browse.title = t.browse!; card.browse.disabled = props.busy || !expanded;
      card.nameLabel.textContent = t.name!; card.name.disabled = props.busy || !expanded;
      if (props.mode === mode && card.name.value !== props.name) card.name.value = props.name;
      card.next.querySelector("span")!.textContent = t.next!; card.next.disabled = props.busy || !props.canContinue || !expanded;
      card.error.textContent = props.mode === mode ? props.error : ""; card.error.hidden = !card.error.textContent;
    }
    if (wasBusy && !props.busy && !props.error) {
      if (props.mode) {
        const card = cards.get(props.mode)!;
        (props.folder ? props.mode === "create" ? card.name : card.next : card.browse).focus();
      } else if (props.status) { status.tabIndex = -1; status.focus({ preventScroll: true }); }
    }
  }
  function applyTheme(): void {
    if (disposed) return;
    const properties = currentTheme()?.properties; const colors = properties?.colors; const geometry = properties?.geometry; const typography = properties?.typography;
    const unit = text(field(geometry, "unit"), "px");
    const dimension = (value: ThemeValue | undefined, fallback: string) => typeof value === "number" && value >= 0 ? `${value}${unit}` : fallback;
    const palette: Record<string, string> = { background: "background", panel: "panel", content: "content", selection: "selection", text: "text", secondary: "textSecondary", separator: "separator", "control-border": "controlBorder", hover: "hover", focus: "focus", accent: "accent", "on-accent": "onAccent", "accent-hover": "accentHover" };
    for (const [variable, key] of Object.entries(palette)) screen.style.setProperty(`--vault-${variable}`, text(field(colors, key), ["text", "secondary", "focus", "on-accent"].includes(variable) ? "currentColor" : "transparent"));
    for (const [name, value, fallback] of [
      ["space", field(field(geometry, "spacing"), "step"), ".25rem"], ["radius", field(field(geometry, "radius"), "medium"), "0"],
      ["border", field(geometry, "borderWidth"), "1px"], ["focus-width", field(geometry, "focusWidth"), "2px"], ["focus-offset", field(geometry, "focusOffset"), "2px"],
    ] as const) screen.style.setProperty(`--vault-${name}`, dimension(value, fallback));
    for (const [name, key, fallback] of [["font", "fontFamily", "inherit"], ["mono", "monoFontFamily", "monospace"]] as const) {
      const value = field(typography, key); screen.style.setProperty(`--vault-${name}`, Array.isArray(value) && value.every(v => typeof v === "string") ? value.join(", ") : text(value, fallback));
    }
    const fontSize = field(typography, "fontSize"); screen.style.setProperty("--vault-font-size", typeof fontSize === "number" ? `${fontSize}${text(field(typography, "fontSizeUnit"), "px")}` : "inherit");
    const lineHeight = field(typography, "lineHeight"); screen.style.setProperty("--vault-line-height", typeof lineHeight === "number" ? String(lineHeight) : "normal");
    const motion = properties?.motion;
    for (const [key, fallback] of [["fast", 120], ["normal", 200]] as const) {
      const value = field(motion, key); screen.style.setProperty(`--vault-motion-${key}`, `${typeof value === "number" && value >= 0 ? value : fallback}ms`);
    }
    screen.style.setProperty("--vault-motion-easing", text(field(motion, "easing"), "cubic-bezier(0.2, 0, 0, 1)"));
  }
  function dispose(): void { if (disposed) return; disposed = true; signal.removeEventListener("abort", dispose); frame.remove(); released(); }
  try { update(props); applyTheme(); signal.addEventListener("abort", dispose, { once: true }); target.append(frame); }
  catch (error) { dispose(); throw error; }
  return { update(next) { if (!disposed) update(readProps(next)); }, applyTheme, dispose };
}
