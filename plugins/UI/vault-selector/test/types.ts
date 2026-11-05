import { createVaultSelector } from "@lunaris/vault-selector";
import type { PluginDefinition } from "@lunaris/sdk";
const plugin: PluginDefinition = createVaultSelector({ art: "LUNARIS" });
void plugin;
