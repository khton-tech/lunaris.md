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

const communityTheme = (slug: string, name: string, appearance: "dark" | "light", colors: ThemeProperties): ThemeDefinition => ({
  id: `lunaris.base-theme-engine.${slug}`,
  name,
  properties: { schema: "lunaris.base-theme", schemaVersion: 1, appearance, colors, geometry, typography, components, motion },
});

interface DarkPalette {
  background: string; panel: string; text: string; textSecondary: string;
  accent: string; accentHover: string; onAccent: string; hover: string; selection: string;
  controlBorder: string; focus: string;
}

const darkPalette = (colors: DarkPalette): ThemeProperties => ({
  ...colors, main: colors.accent, sub: colors.controlBorder, caret: colors.text, subAlt: colors.panel,
  error: "#FFB4AB", extraError: "#FFDAD4", colorfulError: "#F2C078", colorfulExtraError: "#FFE0A8",
  content: colors.background, linkMissing: "#A0A0A0", separator: colors.hover,
});

/** Engine-owned presets consumed through the shared semantic theme contract. */
export const baseThemes: readonly ThemeDefinition[] = [
  {
    id: "lunaris.base-theme-engine.lunaris",
    name: "Lunaris",
    properties: {
      schema: "lunaris.base-theme",
      schemaVersion: 1,
      appearance: "dark",
      colors: {
        ...darkPalette({
          background: "#242B2C", panel: "#252D2E", text: "#EEEDE5", textSecondary: "#ACB9B3",
          accent: "#C1D8A5", accentHover: "#CDDFB6", onAccent: "#202628",
          hover: "#303A3B", selection: "#39483D", controlBorder: "#899E85", focus: "#C1D8A5",
        }),
        content: "#202628",
        sub: "#394344",
        separator: "#394344",
      },
      geometry: { ...geometry, radius: { small: 4, medium: 10 } },
      typography: { ...typography, monoFontFamily: ["Consolas", "ui-monospace", "monospace"], fontSize: 15, lineHeight: 1.3 },
      components,
      motion,
    },
  },
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
        content: "#141414",
        textSecondary: "#B8B8B8",
        accent: "#E7E7E7",
        onAccent: "#0F0F0F",
        selection: "#373737",
        separator: "#333333",
        controlBorder: "#898989",
        hover: "#292929",
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
        subAlt: "#C0C0C0",
        error: "#951F26",
        extraError: "#8B1D24",
        colorfulError: "#805500",
        colorfulExtraError: "#694600",
        panel: "#C0C0C0",
        content: "#FFFFFF",
        textSecondary: "#333333",
        accent: "#245EDB",
        accentForeground: "#1749A3",
        onAccent: "#FFFFFF",
        selection: "#D4E3FC",
        separator: "#ACA899",
        controlBorder: "#555555",
        hover: "#E5EFFF",
        accentHover: "#194CC5",
        focus: "#003C74",
      },
      geometry: { ...geometry, radius: { small: 0, medium: 2 } },
      typography: { ...typography, fontFamily: ["Tahoma", "Segoe UI", "sans-serif"], fontSize: 13 },
      components: {
        ...components,
        windowChrome: {
          enabled: true,
          captionBackground: "linear-gradient(#2274D3 0%, #0869EF 12%, #0055E5 55%, #0048CC 88%, #1B6CF2)",
          captionText: "#FFFFFF",
          frameColor: "#0055E5",
          surfaceShadow: "inset 1px 1px 0 #FFFFFF, inset -1px -1px 0 #808080",
          insetShadow: "inset 1px 1px 0 #808080, inset -1px -1px 0 #FFFFFF",
          menuBorder: "#808080",
        },
        controls: {
          buttonBackground: "linear-gradient(#F5F5F5, #D4D0C8)",
          buttonHoverBackground: "linear-gradient(#FFFFFF, #F9F4DE 48%, #F3D58B)",
          buttonPressedBackground: "linear-gradient(#C9C7BD, #E3E1D8)",
          buttonBorder: "#003C74",
          buttonShadow: "inset 1px 1px 0 #FFFFFF, inset -1px -1px 0 #D6D0C5",
          primaryBackground: "linear-gradient(#2D70D9, #245EDB 48%, #1645B5)",
          primaryHoverBackground: "linear-gradient(#286ACD, #194CC5 48%, #123992)",
          primaryPressedBackground: "linear-gradient(#123992, #194CC5)",
          inputShadow: "inset 1px 1px 2px #D6D2C2",
        },
      },
      motion: { ...motion, fast: 80, normal: 140 },
    },
  },
  {
    id: "lunaris.base-theme-engine.windows-xp-dark",
    name: "Windows XP Luna Dark",
    properties: {
      schema: "lunaris.base-theme",
      schemaVersion: 1,
      appearance: "dark",
      colors: {
        background: "#181C24", main: "#245EDB", sub: "#515B6D",
        text: "#F0F2F7", caret: "#FFFFFF", subAlt: "#282E3A",
        error: "#FFB4B8", extraError: "#FFC9CC",
        colorfulError: "#EBCB8B", colorfulExtraError: "#F5DEA8",
        panel: "#282E3A", content: "#1C212B", textSecondary: "#D0D7E2",
        accent: "#245EDB", accentForeground: "#91BCFF", onAccent: "#FFFFFF", link: "#91BCFF", selection: "#304566",
        separator: "#515B6D", controlBorder: "#94A4BE", hover: "#323D50",
        accentHover: "#194CC5", focus: "#B5D3FF",
      },
      geometry: { ...geometry, radius: { small: 0, medium: 2 } },
      typography: { ...typography, fontFamily: ["Tahoma", "Segoe UI", "sans-serif"], fontSize: 13 },
      components: {
        ...components,
        windowChrome: {
          enabled: true,
          captionBackground: "linear-gradient(#345B91 0%, #234B80 12%, #173C70 55%, #102D59 88%, #234D83)",
          captionText: "#FFFFFF", frameColor: "#173C70",
          surfaceShadow: "inset 1px 1px 0 #68778E, inset -1px -1px 0 #10141C",
          insetShadow: "inset 1px 1px 0 #10141C, inset -1px -1px 0 #68778E",
          menuBorder: "#94A4BE",
        },
        controls: {
          buttonBackground: "linear-gradient(#414D60, #2B3443)",
          buttonHoverBackground: "linear-gradient(#52647F, #3A4A64 48%, #4B5B76)",
          buttonPressedBackground: "linear-gradient(#222B3B, #354258)",
          buttonBorder: "#94A4BE",
          buttonShadow: "inset 1px 1px 0 #68778E, inset -1px -1px 0 #151B26",
          primaryBackground: "linear-gradient(#2C70D4, #245EDB 48%, #1645B5)",
          primaryHoverBackground: "linear-gradient(#2866C7, #194CC5 48%, #123992)",
          primaryPressedBackground: "linear-gradient(#123992, #194CC5)",
          inputShadow: "inset 1px 1px 2px #10141C",
        },
      },
      motion: { ...motion, fast: 80, normal: 140 },
    },
  },
  communityTheme("catppuccin-mocha", "Catppuccin Mocha", "dark", {
    ...darkPalette({
      background: "#1E1E2E", panel: "#181825", text: "#CDD6F4", textSecondary: "#B2BAD4",
      accent: "#CBA6F7", accentHover: "#D5B7F9", onAccent: "#1E1E2E",
      hover: "#313244", selection: "#45475A", controlBorder: "#A6ADC8", focus: "#B4BEFE",
    }),
    linkMissing: "#909090",
  }),
  communityTheme("dracula", "Dracula", "dark", darkPalette({
    background: "#282A36", panel: "#21222C", text: "#F8F8F2", textSecondary: "#B8BDCD",
    accent: "#BD93F9", accentHover: "#CAA8FA", onAccent: "#282A36",
    hover: "#343746", selection: "#44475A", controlBorder: "#8995B7", focus: "#8BE9FD",
  })),
  communityTheme("nord", "Nord", "dark", darkPalette({
    background: "#2E3440", panel: "#3B4252", text: "#ECEFF4", textSecondary: "#CBD3DF",
    accent: "#88C0D0", accentHover: "#9FCCD9", onAccent: "#2E3440",
    hover: "#434C5E", selection: "#4C566A", controlBorder: "#9FB3C8", focus: "#8FBCBB",
  })),
  communityTheme("tokyo-night", "Tokyo Night", "dark", darkPalette({
    background: "#1A1B26", panel: "#16161E", text: "#C0CAF5", textSecondary: "#A7B1D4",
    accent: "#7AA2F7", accentHover: "#93B4F9", onAccent: "#1A1B26",
    hover: "#292E42", selection: "#343A52", controlBorder: "#7F89B4", focus: "#BB9AF7",
  })),
  communityTheme("rose-pine", "Rosé Pine", "dark", darkPalette({
    background: "#191724", panel: "#1F1D2E", text: "#E0DEF4", textSecondary: "#BDB9D5",
    accent: "#EBBCBA", accentHover: "#EFC9C7", onAccent: "#191724",
    hover: "#26233A", selection: "#403D52", controlBorder: "#9E9AAF", focus: "#C4A7E7",
  })),
  communityTheme("gruvbox-dark", "Gruvbox Dark", "dark", darkPalette({
    background: "#282828", panel: "#1D2021", text: "#EBDBB2", textSecondary: "#CDBFA0",
    accent: "#FABD2F", accentHover: "#FBCA57", onAccent: "#282828",
    hover: "#3C3836", selection: "#504945", controlBorder: "#BDAE93", focus: "#FE8019",
  })),
  communityTheme("everforest-dark", "Everforest Dark", "dark", {
    ...darkPalette({
      background: "#2D353B", panel: "#343F44", text: "#D3C6AA", textSecondary: "#C6C1B1",
      accent: "#A7C080", accentHover: "#B8CC98", onAccent: "#2D353B",
      hover: "#3D484D", selection: "#425055", controlBorder: "#A0A9AD", focus: "#83C092",
    }),
    separator: "#485357",
    sub: "#A7C080",
  }),
  communityTheme("sakura-night", "Sakura Night", "dark", darkPalette({
    background: "#211A22", panel: "#2B202B", text: "#F4E8F0", textSecondary: "#CCB7C7",
    accent: "#E89AB8", accentHover: "#ECADC5", onAccent: "#211A22",
    hover: "#392B38", selection: "#50384B", controlBorder: "#C18AA9", focus: "#F2B6D0",
  })),
  communityTheme("maiami-night", "Maiami Night", "dark", {
    background: "#18181A", main: "#E4609B", sub: "#47BAC0",
    text: "#FFFFFF", caret: "#E4609B", subAlt: "#0F0F10",
    error: "#FFF591", extraError: "#B6AF68",
    colorfulError: "#FFF591", colorfulExtraError: "#B6AF68",
    panel: "#0F0F10", content: "#18181A", textSecondary: "#47BAC0",
    accent: "#E4609B", onAccent: "#18181A", selection: "#40303B",
    separator: "#343038", controlBorder: "#47BAC0", hover: "#292327",
    accentHover: "#E97EAE", focus: "#E4609B",
  }),
];
