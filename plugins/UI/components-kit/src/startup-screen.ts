import type { CancellationSignal } from "@lunaris/sdk";
import type { ComponentInstance, ComponentProps } from "@lunaris/components";
import type { ThemeDefinition, ThemeValue } from "@lunaris/themes";

interface ScreenProps { readonly art: string; readonly logoLabel: string; readonly status: string; readonly detail: string }

function readProps(props: ComponentProps): ScreenProps {
  for (const key of ["art", "logoLabel", "status"]) {
    if (typeof props[key] !== "string") throw new TypeError(`Startup screen requires a string ${key}.`);
  }
  if (props.detail !== undefined && typeof props.detail !== "string") throw new TypeError("Startup screen detail must be a string.");
  return { art: props.art as string, logoLabel: props.logoLabel as string, status: props.status as string, detail: (props.detail as string | undefined) ?? "" };
}

function field(value: ThemeValue | undefined, key: string): ThemeValue | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ?
    (value as Readonly<Record<string, ThemeValue>>)[key] : undefined;
}
function text(value: ThemeValue | undefined, fallback: string): string { return typeof value === "string" ? value : fallback; }
function family(value: ThemeValue | undefined, fallback: string): string {
  return Array.isArray(value) && value.length > 0 && value.every(item => typeof item === "string") ? value.join(", ") : text(value, fallback);
}
function size(value: ThemeValue | undefined, unit: string, fallback: string): string {
  return typeof value === "number" && value >= 0 ? `${value}${unit}` : fallback;
}

/** Owned DOM only; target layout and SDK subscriptions belong to their providers. */
export function mountStartupScreen(target: HTMLElement, props: ComponentProps, signal: CancellationSignal,
  currentTheme: () => ThemeDefinition | null, released: () => void): ComponentInstance & { applyTheme(): void } {
  const initial = readProps(props);
  const document = target.ownerDocument;
  const screen = document.createElement("section");
  const logo = document.createElement("pre");
  const status = document.createElement("p");
  const detail = document.createElement("p");
  Object.assign(screen.style, { boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "safe center", minHeight: "0", minWidth: "0", maxWidth: "100%", overflow: "auto", flex: "1 1 0%" });
  Object.assign(logo.style, { margin: "0", maxWidth: "100%", flexShrink: "0", overflow: "auto", whiteSpace: "pre" });
  for (const node of [status, detail]) Object.assign(node.style, { margin: "0", maxWidth: "100%", overflowWrap: "anywhere", textAlign: "center" });
  logo.setAttribute("role", "img");
  status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite"); status.setAttribute("aria-atomic", "true");
  screen.append(logo, status, detail);
  let disposed = false;
  function update(next: ScreenProps): void {
    logo.textContent = next.art; logo.setAttribute("aria-label", next.logoLabel);
    status.textContent = next.status; detail.textContent = next.detail; detail.hidden = next.detail.length === 0;
  }
  function applyTheme(): void {
    if (disposed) return;
    const theme = currentTheme()?.properties;
    const colors = theme?.colors; const geometry = theme?.geometry; const typography = theme?.typography;
    const tokens = field(theme?.components, "startupScreen");
    const unit = text(field(geometry, "unit"), "px");
    const spacing = field(field(geometry, "spacing"), "step");
    screen.style.backgroundColor = text(field(colors, "background"), "transparent");
    screen.style.color = text(field(colors, "text"), "inherit");
    detail.style.color = text(field(colors, "textSecondary"), "inherit");
    screen.style.padding = size(field(tokens, "padding"), unit, size(typeof spacing === "number" ? spacing * 4 : undefined, unit, "0"));
    screen.style.gap = size(field(tokens, "gap"), unit, size(typeof spacing === "number" ? spacing * 3 : undefined, unit, "0"));
    screen.style.fontFamily = family(field(typography, "fontFamily"), "inherit");
    screen.style.fontSize = size(field(typography, "fontSize"), text(field(typography, "fontSizeUnit"), "px"), "inherit");
    const lineHeight = field(typography, "lineHeight");
    screen.style.lineHeight = typeof lineHeight === "number" && lineHeight > 0 ? String(lineHeight) : "normal";
    logo.style.fontFamily = family(field(typography, "monoFontFamily"), "monospace");
    logo.style.fontSize = size(field(tokens, "logoFontSize"), text(field(typography, "fontSizeUnit"), "px"), "inherit");
    const logoLineHeight = field(tokens, "logoLineHeight");
    logo.style.lineHeight = typeof logoLineHeight === "number" && logoLineHeight > 0 ? String(logoLineHeight) : "inherit";
    const weight = field(tokens, "statusFontWeight");
    status.style.fontWeight = typeof weight === "number" && weight >= 1 && weight <= 1000 ? String(weight) : "inherit";
  }
  function dispose(): void {
    if (disposed) return;
    disposed = true; signal.removeEventListener("abort", dispose); screen.remove(); released();
  }
  try {
    update(initial); applyTheme(); signal.addEventListener("abort", dispose, { once: true }); target.append(screen);
  } catch (error) { dispose(); throw error; }
  return { update(next) { if (!disposed) update(readProps(next)); }, applyTheme, dispose };
}
