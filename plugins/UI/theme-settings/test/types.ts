import { createThemeSettings } from "@lunaris/theme-settings";
createThemeSettings({ defaultThemeId: "example.theme" });
// @ts-expect-error Theme policy is explicit at the composition boundary.
createThemeSettings();
