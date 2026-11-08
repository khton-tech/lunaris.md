import { AccountSession, Drafts } from "@lunaris/remote";
import type { PluginContext } from "@lunaris/sdk";
declare const ctx: PluginContext;
void ctx.use(AccountSession).connect("https://notes.example", ctx.signal);
// @ts-expect-error Connecting requires lifecycle ownership.
ctx.use(AccountSession).connect("https://notes.example");
// @ts-expect-error Draft identity must include the account and server.
ctx.use(Drafts).load({ vaultId: "v", path: "note.md" });
// @ts-expect-error Removing a draft requires its acknowledged revision.
ctx.use(Drafts).remove({ server: "https://notes.example", accountId: "a", vaultId: "v", path: "note.md" });
