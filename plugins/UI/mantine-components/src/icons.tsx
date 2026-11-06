import { createElement } from "react";
import { FolderOpen, Plus, ChevronRight, Folder, ArrowRight } from "lucide";
import type { IconNode } from "lucide";

const icons = { browse: FolderOpen, create: Plus, expand: ChevronRight, folder: Folder, next: ArrowRight };
/** Preserve the shared Lucide pack while Mantine owns the controls. */
export function Icon({ name }: { name: keyof typeof icons }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" width="1.15em" height="1.15em">
    {(icons[name] as IconNode).map(([tag, attributes], index) => createElement(tag, { ...attributes, key: index }))}
  </svg>;
}
