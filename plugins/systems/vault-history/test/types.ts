import history from "@lunaris/vault-history";
import { VaultHistory, VaultHistoryChanged } from "@lunaris/vault";
import type { PluginContext, PluginDefinition } from "@lunaris/sdk";
const plugin: PluginDefinition = history;
void plugin;
declare const ctx: PluginContext;
void ctx.use(VaultHistory).list();
void ctx.use(VaultHistory).open("saved-location");
ctx.events.on(VaultHistoryChanged, change => {
  // @ts-expect-error History snapshots cannot be mutated.
  change.entries.push({});
});
