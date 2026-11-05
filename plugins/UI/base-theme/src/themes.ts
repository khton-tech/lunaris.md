import type { ThemeDefinition, ThemeProperties } from "@lunaris/themes";

const geometry: ThemeProperties = {
  unit: "px",
  spacing: { step: 4, scale: [4, 8, 12, 16, 24] },
  radius: { small: 4, medium: 6 },
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

/** Engine-owned data schema; the generic registry does not interpret these roles. */
export const baseThemes: readonly ThemeDefinition[] = [
  {
    id: "lunaris.base-theme-engine.light",
    name: "Lunaris Light",
    properties: {
      schema: "lunaris.base-theme",
      schemaVersion: 1,
      appearance: "light",
      colors: {
        background: "#F5F7FA",
        panel: "#EDF1F6",
        content: "#FFFFFF",
        text: "#182536",
        textSecondary: "#53657D",
        accent: "#244A73",
        onAccent: "#FFFFFF",
        selection: "#DCE8F3",
        separator: "#D5DEE8",
        controlBorder: "#73859B",
        hover: "#E5ECF4",
        accentHover: "#1C3B5C",
        focus: "#244A73",
      },
      geometry,
      typography,
      components,
    },
  },
  {
    id: "lunaris.base-theme-engine.dark",
    name: "Lunaris Dark",
    properties: {
      schema: "lunaris.base-theme",
      schemaVersion: 1,
      appearance: "dark",
      colors: {
        background: "#11151C",
        panel: "#181E28",
        content: "#202938",
        text: "#E6EBF2",
        textSecondary: "#A7B4C6",
        accent: "#C4E5FF",
        onAccent: "#152536",
        selection: "#223B52",
        separator: "#303C4D",
        controlBorder: "#8295AF",
        hover: "#29374A",
        accentHover: "#D7EDFF",
        focus: "#C4E5FF",
      },
      geometry,
      typography,
      components,
    },
  },
];
