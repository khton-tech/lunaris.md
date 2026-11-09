import type { ComponentPresentation, ComponentProps } from "@lunaris/components";

/** Defaults describe the role itself, never the identity or DOM of its consumer. */
export const presentationDefaults: Readonly<Record<string, Required<ComponentPresentation>>> = {
  "lunaris.callout-header": { mode: "embedded", sizing: "content" },
  "lunaris.status-bar": { mode: "embedded", sizing: "content" },
  "lunaris.client-update": { mode: "standalone", sizing: "content" },
  "lunaris.account-access": { mode: "standalone", sizing: "fill" },
  "lunaris.window-titlebar": { mode: "standalone", sizing: "content" },
  "lunaris.task-checkbox": { mode: "embedded", sizing: "content" },
  "lunaris.startup-screen": { mode: "standalone", sizing: "fill" },
  "lunaris.vault-selector": { mode: "standalone", sizing: "fill" },
  "lunaris.workspace-layout": { mode: "standalone", sizing: "fill" },
  "lunaris.workspace-header": { mode: "embedded", sizing: "content" },
  "lunaris.settings-choices": { mode: "embedded", sizing: "content" },
  "lunaris.settings-items": { mode: "embedded", sizing: "content" },
};
const embedded: Required<ComponentPresentation> = Object.freeze({ mode: "embedded", sizing: "fill" });

export function readPresentation(id: string, props: ComponentProps): Required<ComponentPresentation> {
  const defaults = presentationDefaults[id] ?? embedded;
  if (props.presentation === undefined) return defaults;
  const value = props.presentation;
  if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError("Invalid component presentation.");
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).some(key => typeof key !== "string" || !["mode", "sizing"].includes(key) || !("value" in fields[key]!))) throw new TypeError("Invalid component presentation fields.");
  const mode: unknown = fields.mode?.value === undefined ? defaults.mode : fields.mode.value;
  const sizing: unknown = fields.sizing?.value === undefined ? defaults.sizing : fields.sizing.value;
  if ((mode !== "embedded" && mode !== "standalone") || (sizing !== "fill" && sizing !== "content")) throw new TypeError("Invalid component presentation mode or sizing.");
  return { mode, sizing };
}
