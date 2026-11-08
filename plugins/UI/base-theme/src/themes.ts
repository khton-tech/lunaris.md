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

/** Engine-owned presets consumed through the shared semantic theme contract. */
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
  {
    id: "lunaris.base-theme-engine.windows-xp",
    name: "Windows XP Luna",
    properties: {
      schema: "lunaris.base-theme",
      schemaVersion: 1,
      appearance: "light",
      colors: {
        background: "#FFFFFF",
        main: "#245EDB",
        sub: "#ACA899",
        text: "#1A1A1A",
        caret: "#000000",
        subAlt: "#ECE9D8",
        error: "#A4262C",
        extraError: "#8B1D24",
        colorfulError: "#805500",
        colorfulExtraError: "#694600",
        panel: "#ECE9D8",
        content: "#FFFFFF",
        textSecondary: "#444444",
        accent: "#245EDB",
        onAccent: "#FFFFFF",
        selection: "#D4E3FC",
        separator: "#ACA899",
        controlBorder: "#716F64",
        hover: "#E5EFFF",
        accentHover: "#194CC5",
        focus: "#003C74",
      },
      geometry: { ...geometry, radius: { small: 3, medium: 4 } },
      typography: { ...typography, fontFamily: ["Tahoma", "Segoe UI", "sans-serif"], fontSize: 13 },
      components: {
        ...components,
        controls: {
          buttonBackground: "linear-gradient(#FFFFFF, #F0F0EA 48%, #E2DFD6)",
          buttonHoverBackground: "linear-gradient(#FFFFFF, #F9F4DE 48%, #F3D58B)",
          buttonPressedBackground: "linear-gradient(#C9C7BD, #E3E1D8)",
          buttonBorder: "#003C74",
          buttonShadow: "inset 1px 1px 0 #FFFFFF, inset -1px -1px 0 #D6D0C5",
          primaryBackground: "linear-gradient(#3986F5, #245EDB 48%, #1645B5)",
          primaryHoverBackground: "linear-gradient(#3077E4, #194CC5 48%, #123992)",
          primaryPressedBackground: "linear-gradient(#123992, #194CC5)",
          inputShadow: "inset 1px 1px 2px #D6D2C2",
        },
      },
      motion: { ...motion, fast: 80, normal: 140 },
    },
  },
];
