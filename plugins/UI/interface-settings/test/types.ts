import { createInterfaceSettings } from "@lunaris/interface-settings";
createInterfaceSettings({ defaultThemeId: "example.theme" });
// @ts-expect-error host policy is required
createInterfaceSettings();
