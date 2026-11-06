import type { ThemeDefinition, ThemeProperties } from "@lunaris/themes";

const geometry: ThemeProperties = {
  unit: "px",
  spacing: { step: 4, scale: [4, 8, 12, 16, 24] },
  radius: { small: 4, medium: 8 },
  borderWidth: 1,
  focusWidth: 2,
  focusOffset: 2,
};
const typography: ThemeProperties = {
  fontFamily: ["Segoe UI", "system-ui", "sans-serif"],
  monoFontFamily: ["ui-monospace", "Consolas", "monospace"],
  fontSize: 14,
  fontSizeUnit: "px",
  lineHeight: 1.5,
  weight: { regular: 400, medium: 500, semibold: 600 },
};

const components: ThemeProperties = {
  startupScreen: { padding: 32, gap: 24, logoFontSize: 10, logoLineHeight: 1.2, statusFontWeight: 500 },
};
const motion: ThemeProperties = { fast: 120, normal: 200, easing: "cubic-bezier(0.2, 0, 0, 1)" };

/** Preset colors from the Owner's reference, mapped to shared component roles. */
export const baseThemes: readonly ThemeDefinition[] = [
  {
    id: "lunaris.base-theme-engine.monochrome",
    name: "Monochrome",
    properties: {
      schema: "lunaris.base-theme",
      schemaVersion: 1,
      appearance: "dark",
      colors: {
        background: "#0F0F0F",
        main: "#E7E7E7",
        sub: "#4C4C4C",
        text: "#E7E7E7",
        caret: "#F5F5F5",
        subAlt: "#1A1A1A",
        error: "#AC8C8C",
        extraError: "#C49EA0",
        colorfulError: "#ACA98A",
        colorfulExtraError: "#C4C19E",
        panel: "#1A1A1A",
        content: "#1A1A1A",
        textSecondary: "#E7E7E7",
        accent: "#E7E7E7",
        onAccent: "#0F0F0F",
        selection: "#4C4C4C",
        separator: "#4C4C4C",
        controlBorder: "#E7E7E7",
        hover: "#4C4C4C",
        accentHover: "#F5F5F5",
        focus: "#F5F5F5",
      },
      geometry,
      typography,
      components,
      motion,
    },
  },
];
