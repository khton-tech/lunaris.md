import { Channel, invoke } from "@tauri-apps/api/core";
import type { FileChange, FsResult } from "@lunaris/filesystem";

export interface NativeFilesystem {
  request<T>(sessionId: string, operation: string, args: Readonly<Record<string, unknown>>, onChange?: (change: FileChange) => void): Promise<FsResult<T>>;
}

/** Native resources outlive an individual kernel; activation IDs are kernel-local. */
export function createSessionId(): string { return globalThis.crypto.randomUUID(); }

export const nativeFilesystem: NativeFilesystem = {
  request(sessionId, operation, args, onChange) {
    const channel = new Channel<FileChange>();
    channel.onmessage = onChange ?? (() => {});
    return invoke("filesystem_request", { sessionId, request: { operation, ...args }, onChange: channel });
  },
};
