import { Channel, invoke } from "@tauri-apps/api/core";

export type ProcessEvent = { readonly line: string } | { readonly exit: number | null };
export type ProcessRequest =
  | { readonly kind: "start"; readonly owner: string; readonly bytes: readonly number[]; readonly args: readonly string[] }
  | { readonly kind: "stop"; readonly owner: string; readonly id: number }
  | { readonly kind: "write"; readonly owner: string; readonly id: number; readonly line: string };
export type ProcessBridge = (request: ProcessRequest, receive?: (event: ProcessEvent) => void) => Promise<number | null>;

export const requestProcess: ProcessBridge = (request, receive) => {
  const channel = new Channel(receive);
  return invoke("native_process_request", { request, channel });
};
