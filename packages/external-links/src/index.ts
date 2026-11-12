import { defineApi } from "@lunaris/sdk";

export type ExternalLinkResult = { readonly ok: true; readonly value: null } | { readonly ok: false; readonly error: { readonly code: "INVALID_URL" | "FAILED" | "CANCELLED"; readonly message: string } };
export interface ExternalLinksApi { open(url: string): Promise<ExternalLinkResult> }
const validate = (value: unknown) => !!value && typeof value === "object" && typeof Object.getOwnPropertyDescriptor(value, "open")?.value === "function";
/** Only explicit web/mail/telephone destinations may leave the application. */
export function externalUrl(value: string): string | null {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try { const url = new URL(value); return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
export const ExternalLinks = defineApi<ExternalLinksApi>({ id: "lunaris.external-links", version: "1.0.0", consumePermission: "links.open", validate });
export const ExternalLinksDriver = defineApi<ExternalLinksApi>({ id: "lunaris.external-links-driver", version: "1.0.0", providePermission: "links.native", consumePermission: "links.open", validate });
