import { defineApi } from "@lunaris/sdk";
export type ClipboardResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: { readonly code: "UNSUPPORTED" | "DENIED" | "FAILED" | "CANCELLED"; readonly message: string } };
export interface ClipboardApi {
  capabilities(): { readonly read: boolean; readonly write: boolean };
  readText(): Promise<ClipboardResult<string>>;
  writeText(text: string): Promise<ClipboardResult<null>>;
}
const validate = (value: unknown) => !!value && typeof value === "object" && ["capabilities", "readText", "writeText"].every(key => typeof Object.getOwnPropertyDescriptor(value, key)?.value === "function");
export const Clipboard = defineApi<ClipboardApi>({ id: "lunaris.clipboard", version: "1.0.0", consumePermission: "clipboard.access", validate });
export const ClipboardDriver = defineApi<ClipboardApi>({ id: "lunaris.clipboard-driver", version: "1.0.0", providePermission: "clipboard.native", consumePermission: "clipboard.access", validate });
