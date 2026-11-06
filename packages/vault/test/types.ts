import { Vault, VaultCreation, VaultLocations, VaultChanged, PrepareVault } from "@lunaris/vault";
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
void ctx.use(VaultLocations).select(ctx.signal);
void ctx.use(VaultLocations).open({ reference: "saved", label: "Notes" }, { name: "My Notes" });
// @ts-expect-error A native path is not a location reference object.
ctx.use(VaultLocations).open("C:/notes");
// @ts-expect-error Preparation handlers must return the preparation payload.
ctx.hooks.register(PrepareVault, () => true);

void ctx.use(VaultCreation).create({ reference: "parent", label: "Parent" }, "Notes");
// @ts-expect-error Creation requires an explicit directory name.
ctx.use(VaultCreation).create({ reference: "parent", label: "Parent" });
