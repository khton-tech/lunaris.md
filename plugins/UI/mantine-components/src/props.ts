import type { ComponentProps } from "@lunaris/components";

export interface StartupProps { readonly art: string; readonly logoLabel: string; readonly status: string; readonly detail?: string }
export interface WorkspaceHeaderProps {
  readonly name: string; readonly closeLabel: string; readonly busy: boolean; readonly error: string; readonly onClose: () => void;
}
export interface WorkspaceEmptyProps { readonly title: string; readonly detail: string }
export function workspaceHeaderProps(value: ComponentProps): WorkspaceHeaderProps {
  for (const key of ["name", "closeLabel", "error"]) if (typeof value[key] !== "string") throw new TypeError(`Workspace header requires ${key}.`);
  if (typeof value.busy !== "boolean" || typeof value.onClose !== "function") throw new TypeError("Invalid workspace close action.");
  return value as unknown as WorkspaceHeaderProps;
}
export function workspaceEmptyProps(value: ComponentProps): WorkspaceEmptyProps {
  if (typeof value.title !== "string" || typeof value.detail !== "string") throw new TypeError("Workspace placeholder requires localized title and detail.");
  return value as unknown as WorkspaceEmptyProps;
}
export interface SelectorProps {
  readonly onServer?: () => void;
  readonly art: string; readonly text: Readonly<Record<string, string>>;
  readonly mode: "create" | "select" | null; readonly folder: string; readonly name: string;
  readonly busy: boolean; readonly canContinue: boolean;
  readonly error: string; readonly historyError: string; readonly status: string;
  readonly entries: readonly { readonly reference: string; readonly name: string; readonly label: string }[];
  readonly activeReference?: string | null;
  readonly onMode: (mode: "create" | "select") => void; readonly onName: (value: string) => void;
  readonly onBrowse: () => void; readonly onNext: () => void;
  readonly onRecent: (reference: string) => void; readonly onRetry: () => void;
}
export function startupProps(value: ComponentProps): StartupProps {
  for (const key of ["art", "logoLabel", "status"]) if (typeof value[key] !== "string") throw new TypeError(`Startup requires ${key}.`);
  if (value.detail !== undefined && typeof value.detail !== "string") throw new TypeError("Invalid startup detail.");
  return value as unknown as StartupProps;
}
export function selectorProps(value: ComponentProps): SelectorProps {
  for (const key of ["art", "folder", "name", "error", "historyError", "status"]) if (typeof value[key] !== "string") throw new TypeError(`Selector requires ${key}.`);
  for (const key of ["busy", "canContinue"]) if (typeof value[key] !== "boolean") throw new TypeError(`Selector requires ${key}.`);
  for (const key of ["onMode", "onName", "onBrowse", "onNext", "onRecent", "onRetry"]) if (typeof value[key] !== "function") throw new TypeError(`Selector requires ${key}.`);
  if (value.mode !== null && value.mode !== "create" && value.mode !== "select") throw new TypeError("Invalid selector mode.");
  if (value.activeReference !== undefined && value.activeReference !== null && typeof value.activeReference !== "string") throw new TypeError("Invalid active reference.");
  const messages = ["logo", "recent", "empty", "create", "select", "folder", "folderPlaceholder", "browse", "name", "next", "retry"];
  if (!value.text || typeof value.text !== "object" || messages.some(key => typeof (value.text as Record<string, unknown>)[key] !== "string")) throw new TypeError("Selector requires localized messages.");
  if (!Array.isArray(value.entries) || value.entries.some(entry => !entry || ["reference", "name", "label"].some(key => typeof entry[key] !== "string"))) throw new TypeError("Invalid recent entries.");
  return value as unknown as SelectorProps;
}
