import kit from "@lunaris/mantine-components";
import type { PluginDefinition } from "@lunaris/sdk";
const definition: PluginDefinition = kit;
void definition;
import type { ComponentPresentation } from "@lunaris/components";
const embedded: ComponentPresentation = { mode: "embedded", sizing: "content" };
void embedded;
// @ts-expect-error Presentation mode is explicit and finite.
const invalid: ComponentPresentation = { mode: "panel" };
void invalid;
