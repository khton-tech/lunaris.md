import { defineApi, defineEvent } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";

export type PreparationPhase = "settings" | "document" | "content" | "presentation";
export interface PreparationContext {
  readonly epoch: number;
  readonly vaultId: string | null;
  readonly signal: CancellationSignal;
}
export interface PreparationSnapshot {
  readonly phase?: PreparationPhase;
  readonly epoch: number;
  readonly vaultId: string | null;
  readonly state: "idle" | "preparing" | "ready" | "failed";
}
export interface PreparationParticipant {
  readonly id: string;
  readonly phase: PreparationPhase;
  prepare(context: PreparationContext): Promise<void>;
}
/** Register during activation. Late registrations await their own preparation. */
export const Preparation = defineApi<{
  snapshot(): PreparationSnapshot;
  tracksVault(): boolean;
  register(participant: PreparationParticipant, owner: CancellationSignal): Promise<void>;
}>({ id: "lunaris.preparation", version: "1.0.0", validate: value => !!value && typeof value === "object" &&
  ["snapshot", "register", "tracksVault"].every(key => typeof Object.getOwnPropertyDescriptor(value, key)?.value === "function") });
export const PreparationChanged = defineEvent<PreparationSnapshot>({
  id: "lunaris.preparation-changed", version: "1.0.0", validate: value => {
    const state = value as PreparationSnapshot | null;
    return !!state && Number.isSafeInteger(state.epoch) && state.epoch >= 0 &&
      (state.vaultId === null || typeof state.vaultId === "string" && state.vaultId.length > 0) &&
      ["idle", "preparing", "ready", "failed"].includes(state.state) &&
      (state.phase === undefined || state.state === "preparing" && ["settings", "document", "content", "presentation"].includes(state.phase));
  },
});

export type StartupState = "loading" | "loaded" | "failed" | "stopped";
export type StartupStage = "composition" | "registration" | "activation" | "mounting" | "ready" | "failed" | "stopped";

/** Host milestones, not a percentage of dependency activation or elapsed time. */
export interface StartupSnapshot {
  readonly sequence: number;
  readonly state: StartupState;
  readonly stage: StartupStage;
  readonly pluginId?: string;
  /** Stable diagnostic code; raw errors and configuration values are excluded. */
  readonly errorCode?: string;
}

export interface StartupApi {
  snapshot(): StartupSnapshot;
}

export function isStartupSnapshot(value: unknown): value is StartupSnapshot {
  if (!value || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  if (!Reflect.ownKeys(value).every(key => typeof key === "string" &&
    ["sequence", "state", "stage", "pluginId", "errorCode"].includes(key) &&
    Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, "value"))) return false;
  const field = (key: string): unknown => Object.getOwnPropertyDescriptor(value, key)?.value;
  const state = field("state"); const stage = field("stage");
  return Number.isSafeInteger(field("sequence")) && (field("sequence") as number) >= 0 &&
    (state === "loading" ? ["composition", "registration", "activation", "mounting"].includes(stage as string) :
      state === "loaded" ? stage === "ready" : state === "failed" ? stage === "failed" : state === "stopped" && stage === "stopped") &&
    ["pluginId", "errorCode"].every(key => field(key) === undefined || typeof field(key) === "string" && (field(key) as string).length > 0);
}

export const Startup = defineApi<StartupApi>({
  id: "lunaris.startup", version: "1.0.0",
  validate: value => value !== null && typeof value === "object" &&
    typeof Object.getOwnPropertyDescriptor(value, "snapshot")?.value === "function",
});

export const StartupChanged = defineEvent<StartupSnapshot>({
  id: "lunaris.startup-changed", version: "1.0.0", validate: isStartupSnapshot,
});
