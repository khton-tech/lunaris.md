import { defineApi } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";

export const workspaceRegions = Object.freeze(["main", "left-rail", "left-panel", "bottom", "mobile-menu", "mobile-launcher", "overlay"] as const);
export type WorkspaceBuiltInRegion = typeof workspaceRegions[number];
export type WorkspaceRegion = WorkspaceBuiltInRegion | `${string}.${string}`;
export type WorkspaceLayoutNode = {
  readonly kind: "region";
  readonly region: Exclude<WorkspaceRegion, "overlay">;
  readonly label?: string;
  readonly grow?: number;
} | {
  readonly kind: "row" | "column";
  readonly children: readonly WorkspaceLayoutNode[];
  readonly grow?: number;
};

export interface WorkspaceLayoutContext { readonly vaultId: string; readonly vaultName: string }
export interface WorkspaceLayoutApi {
  /** Describe region placement in the open Vault. Return null to use the standard layout. */
  describe(context: WorkspaceLayoutContext): WorkspaceLayoutNode | null;
  /** Invalidate the description. The provider releases its listener when owner aborts. */
  watch(listener: () => void, owner: CancellationSignal): void;
}
export const WorkspaceLayout = defineApi<WorkspaceLayoutApi>({
  id: "lunaris.workspace-layout", version: "1.0.0",
  validate: value => !!value && typeof value === "object" &&
    ["describe", "watch"].every(name => typeof Object.getOwnPropertyDescriptor(value, name)?.value === "function"),
});

export function isWorkspaceRegion(value: unknown): value is WorkspaceRegion {
  return typeof value === "string" && value.length <= 128 && (
    workspaceRegions.some(region => region === value) || /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(value)
  );
}

/** Validate and copy layout data at the controller and component boundaries. */
export function readWorkspaceLayout(value: unknown): WorkspaceLayoutNode | undefined {
  const regions = new Set<string>();
  let remaining = 32;
  function read(node: unknown, depth: number): WorkspaceLayoutNode | undefined {
    if (depth > 8 || --remaining < 0 || !node || typeof node !== "object" ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(node))) return;
    const fields = Object.getOwnPropertyDescriptors(node);
    const kind: unknown = fields.kind?.value;
    const allowed = kind === "region" ? ["kind", "region", "label", "grow"] : ["kind", "children", "grow"];
    if (Reflect.ownKeys(fields).some(key => typeof key !== "string" || !allowed.includes(key) || !("value" in fields[key]!))) return;
    const grow: unknown = fields.grow?.value === undefined ? 1 : fields.grow.value;
    if (typeof grow !== "number" || !Number.isInteger(grow) || grow < 1 || grow > 16) return;
    if (kind === "region") {
      const region: unknown = fields.region?.value;
      const label: unknown = fields.label?.value;
      if (!isWorkspaceRegion(region) || region === "overlay" || regions.has(region) || (label !== undefined && (typeof label !== "string" || label.length > 256))) return;
      regions.add(region);
      return Object.freeze({ kind, region, grow, ...(label === undefined ? {} : { label }) });
    }
    const children: unknown = fields.children?.value;
    if ((kind !== "row" && kind !== "column") || !Array.isArray(children) || children.length < 1 || children.length > 8) return;
    const normalized: WorkspaceLayoutNode[] = [];
    for (let index = 0; index < children.length; index++) {
      const field = Object.getOwnPropertyDescriptor(children, index);
      const child = read(field?.value, depth + 1);
      if (!child) return;
      normalized.push(child);
    }
    return Object.freeze({ kind, grow, children: Object.freeze(normalized) });
  }
  return read(value, 1);
}
