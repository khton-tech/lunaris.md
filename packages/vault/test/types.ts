import { Vault, VaultChanged, PrepareVault } from "@lunaris/vault";
import type { VaultResult } from "@lunaris/vault";
import type { PluginContext } from "@lunaris/sdk";
import type { VaultRoot } from "@lunaris/filesystem";
declare const ctx: PluginContext;
const manager = ctx.use(Vault);
const opened: Promise<VaultResult<VaultRoot | null>> = manager.open();
void opened;
ctx.events.on(VaultChanged, change => { void change.current?.id; });
ctx.hooks.register(PrepareVault, preparation => ({ ...preparation, error: null }));
// @ts-expect-error The manager selects roots without accepting native paths.
manager.open("C:/notes");
// @ts-expect-error Preparation handlers must return the preparation payload.
ctx.hooks.register(PrepareVault, () => true);
