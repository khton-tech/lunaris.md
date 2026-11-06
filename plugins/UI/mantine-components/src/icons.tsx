import { createElement } from "react";
import { FolderOpen, Plus, ChevronRight, Folder, ArrowRight, PackageOpen, Search, ListTree, Settings, Files, File, Ellipsis } from "lucide";
import type { IconNode } from "lucide";

const icons = { file: File, actions: Ellipsis, browse: FolderOpen, create: Plus, expand: ChevronRight, folder: Folder, next: ArrowRight, package: PackageOpen, search: Search, outline: ListTree, settings: Settings, files: Files };
/** Preserve the shared Lucide pack while Mantine owns the controls. */
export function Icon({ name }: { name: string }) {
  const node = Object.hasOwn(icons, name) ? icons[name as keyof typeof icons] : PackageOpen;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" width="1.15em" height="1.15em">
    {(node as IconNode).map(([tag, attributes], index) => createElement(tag, { ...attributes, key: index }))}
  </svg>;
}
