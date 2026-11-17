import { defineEvent } from "@lunaris/sdk";

export const GlobalHotkeyPressed = defineEvent<{ readonly shortcut: "Ctrl+Alt+Shift+H" }>({
  id: "example.global-hotkey-pressed",
  version: "1.0.0",
});
