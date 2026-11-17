import { defineApi } from "@lunaris/sdk";
import type { PluginContext } from "@lunaris/sdk";

export type NativeProcessOwner = Pick<PluginContext, "pluginId" | "activationId" | "scope" | "resources">;

export interface NativeProcessOptions {
  /** A Windows executable in this package's assets directory. */
  readonly executable: string;
  readonly args?: readonly string[];
  readonly onLine?: (line: string) => void | Promise<void>;
}

export interface NativeProcess {
  write(line: string): Promise<void>;
  wait(): Promise<number | null>;
  dispose(): Promise<void>;
}

export interface NativeProcessesApi {
  /** Start a helper launched with the user's OS permissions and owned by this activation. */
  start(owner: NativeProcessOwner, options: NativeProcessOptions): Promise<NativeProcess>;
}

export const NativeProcesses = defineApi<NativeProcessesApi>({
  id: "lunaris.native-processes", version: "1.0.0",
  validate: value => !!value && typeof value === "object" && typeof Object.getOwnPropertyDescriptor(value, "start")?.value === "function",
});
