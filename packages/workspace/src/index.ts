import { defineApi, defineEvent } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";

/** Component roles receive these props in addition to their registered props. */
export interface WorkspaceContext { readonly vaultId: string; readonly vaultName: string }
export type WorkspaceProps = Readonly<Record<string, unknown>>;
export interface WorkspaceContent {
  readonly id: string;
  readonly componentId: string;
  readonly props?: WorkspaceProps;
  readonly order?: number;
  readonly region?: "main" | "left-rail" | "left-panel" | "bottom" | "mobile-menu" | "mobile-launcher";
  /** Optional dismissal of a left-panel overlay (for example Escape). */
  readonly onDismiss?: (() => void) | undefined;
}
export type WorkspaceResult = { readonly ok: true; readonly value: null } | {
  readonly ok: false;
  readonly error: { readonly code: "INVALID_ARGUMENT" | "ALREADY_REGISTERED" | "REGION_OCCUPIED" | "NOT_FOUND"; readonly message: string };
};
export interface WorkspaceApi {
  /** Register once; Workspace remounts the role with fresh context on Vault switches. */
  register(content: WorkspaceContent, owner: CancellationSignal): WorkspaceResult;
  /** Replace all custom props. The reserved `workspace` prop is supplied by Workspace. */
  update(id: string, props: WorkspaceProps): WorkspaceResult;
  list(): readonly WorkspaceContent[];
}
export const Workspace = defineApi<WorkspaceApi>({
  id: "lunaris.workspace", version: "1.4.0",
  validate: value => !!value && typeof value === "object" &&
    ["register", "update", "list"].every(name => typeof Object.getOwnPropertyDescriptor(value, name)?.value === "function"),
});
export interface WorkspaceChange { readonly kind: "registered" | "updated" | "removed"; readonly id: string }
export const WorkspaceChanged = defineEvent<WorkspaceChange>({
  id: "lunaris.workspace-changed", version: "1.0.0",
  validate(value) {
    if (!value || typeof value !== "object") return false;
    return ["registered", "updated", "removed"].includes(Object.getOwnPropertyDescriptor(value, "kind")?.value as string) &&
      typeof Object.getOwnPropertyDescriptor(value, "id")?.value === "string";
  },
});

/** Mobile overlay presentation, independent of Sidebar tab selection. */
export interface WorkspaceSidebarApi { open(): void; close(): void; isOpen(): boolean }
export const WorkspaceSidebar = defineApi<WorkspaceSidebarApi>({ id: "lunaris.workspace-sidebar", version: "1.0.0",
 validate: value => !!value && typeof value === "object" && ["open", "close", "isOpen"].every(key => typeof Object.getOwnPropertyDescriptor(value, key)?.value === "function") });
