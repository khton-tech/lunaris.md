import { Button, Input, InputWrapper, TextInput, createTheme } from "@mantine/core";
import type { CSSProperties } from "react";
import type { ThemeDefinition, ThemeValue } from "@lunaris/themes";

function field(value: ThemeValue | undefined, key: string): ThemeValue | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, ThemeValue>)[key] : undefined;
}
function text(value: ThemeValue | undefined, fallback: string): string { return typeof value === "string" ? value : fallback; }
function number(value: ThemeValue | undefined, fallback: number): number { return typeof value === "number" && value >= 0 ? value : fallback; }
function family(value: ThemeValue | undefined, fallback: string): string {
  return Array.isArray(value) && value.every(v => typeof v === "string") ? value.join(", ") : text(value, fallback);
}

/** Translate the selected SDK description once; Mantine never owns theme selection. */
export function resolveTheme(theme: ThemeDefinition | null) {
  const props = theme?.properties; const colors = props?.colors; const geometry = props?.geometry;
  const typography = props?.typography; const motion = props?.motion;
  const unit = text(field(geometry, "unit"), "px");
  const dimension = (value: ThemeValue | undefined, fallback: number) => `${number(value, fallback)}${unit}`;
  const color = (key: string, fallback = "currentColor") => text(field(colors, key), fallback);
  const font = family(field(typography, "fontFamily"), "system-ui, sans-serif");
  const fontSize = `${number(field(typography, "fontSize"), 14)}${text(field(typography, "fontSizeUnit"), "px")}`;
  const radius = dimension(field(field(geometry, "radius"), "medium"), 8);
  const variables: Record<string, string> = {};
  const palette = { background: "background", panel: "panel", content: "content", text: "text", secondary: "textSecondary", selection: "selection", separator: "separator", "control-border": "controlBorder", hover: "hover", focus: "focus", caret: "caret", error: "error", accent: "accent", "on-accent": "onAccent", "accent-hover": "accentHover" };
  for (const [variable, key] of Object.entries(palette)) variables[`--vault-${variable}`] = color(key, ["background", "panel", "content", "selection", "hover", "separator"].includes(variable) ? "transparent" : "currentColor");
  variables["--vault-space"] = dimension(field(field(geometry, "spacing"), "step"), 4);
  variables["--vault-radius"] = radius;
  variables["--vault-border"] = dimension(field(geometry, "borderWidth"), 1);
  variables["--vault-focus-width"] = dimension(field(geometry, "focusWidth"), 2);
  variables["--vault-focus-offset"] = dimension(field(geometry, "focusOffset"), 2);
  variables["--vault-mono"] = family(field(typography, "monoFontFamily"), "ui-monospace, monospace");
  variables["--vault-motion-fast"] = `${number(field(motion, "fast"), 120)}ms`;
  variables["--vault-motion-normal"] = `${number(field(motion, "normal"), 200)}ms`;
  variables["--vault-motion-easing"] = text(field(motion, "easing"), "cubic-bezier(0.2, 0, 0, 1)");
  const startup = field(props?.components, "startupScreen");
  const semantic = {
    "--mantine-color-body": color("background", "transparent"),
    "--mantine-color-text": color("text"), "--mantine-color-dimmed": color("textSecondary"),
    "--mantine-color-placeholder": color("textSecondary"), "--mantine-color-error": color("error"),
    "--mantine-color-anchor": color("accent"), "--mantine-color-default": color("content", "transparent"),
    "--mantine-color-default-hover": color("hover", "transparent"), "--mantine-color-default-color": color("text"),
    "--mantine-color-default-border": color("controlBorder"),
    "--mantine-color-disabled": color("selection", "transparent"),
    "--mantine-color-disabled-color": color("textSecondary"),
    "--mantine-color-disabled-border": color("separator", "transparent"),
    "--mantine-primary-color-filled": color("accent"), "--mantine-primary-color-filled-hover": color("accentHover"),
    "--mantine-primary-color-contrast": color("onAccent"), "--mantine-primary-color-light-color": color("accent"),
    "--mantine-primary-color-light": color("selection", "transparent"), "--mantine-primary-color-light-hover": color("hover", "transparent"),
  };
  return {
    scheme: props?.appearance === "light" ? "light" as const : "dark" as const,
    // Tokens and typography are safe to apply to embedded content. Painting a
    // surface is a separate decision made from the public presentation context.
    contentStyle: { ...variables, color: color("text"), fontFamily: font, fontSize, lineHeight: number(field(typography, "lineHeight"), 1.5) } as CSSProperties,
    pageBackground: color("background", "transparent"),
    cssVariables: { variables: semantic, light: semantic, dark: semantic },
    startup: {
      padding: dimension(field(startup, "padding"), number(field(field(geometry, "spacing"), "step"), 4) * 4),
      gap: dimension(field(startup, "gap"), number(field(field(geometry, "spacing"), "step"), 4) * 3),
      logoFontSize: `${number(field(startup, "logoFontSize"), 10)}${text(field(typography, "fontSizeUnit"), "px")}`,
      logoLineHeight: number(field(startup, "logoLineHeight"), 1.2),
      statusFontWeight: number(field(startup, "statusFontWeight"), 500),
    },
    mantine: createTheme({
      fontFamily: font, fontFamilyMonospace: variables["--vault-mono"]!, defaultRadius: radius,
      fontSizes: { sm: fontSize, md: fontSize }, lineHeights: { sm: String(number(field(typography, "lineHeight"), 1.5)), md: String(number(field(typography, "lineHeight"), 1.5)) },
      respectReducedMotion: true, activeClassName: "lm-pressed",
      variantColorResolver: ({ variant }) => variant === "filled"
        ? { background: color("accent"), hover: color("accentHover"), color: color("onAccent"), border: "transparent" }
        : { background: "transparent", hover: color("hover", "transparent"), color: color("text"), border: "transparent" },
      focusClassName: "lm-focus",
      spacing: { xs: dimension(field(field(geometry, "spacing"), "step"), 4), sm: dimension(number(field(field(geometry, "spacing"), "step"), 4) * 3, 12) },
      components: {
        Button: Button.extend({ defaultProps: { variant: "subtle", size: "md" }, classNames: { root: "lm-button" } }),
        Input: Input.extend({ defaultProps: { size: "md" }, classNames: { input: "lm-input" } }),
        InputWrapper: InputWrapper.extend({ defaultProps: { size: "md" }, classNames: { label: "lm-label" } }),
        TextInput: TextInput.extend({ defaultProps: { size: "md" } }),
      },
    }),
  };
}
