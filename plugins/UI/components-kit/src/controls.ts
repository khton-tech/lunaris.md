import { FolderOpen, Plus, ChevronRight, ArrowRight, Folder } from "lucide";
import type { IconNode } from "lucide";

const icons = { browse: FolderOpen, create: Plus, expand: ChevronRight, next: ArrowRight, folder: Folder };
/** Render only the requested Lucide node in the borrowed target's document. */
export function icon(document: Document, name: keyof typeof icons): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [key, value] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" })) svg.setAttribute(key, value);
  for (const [tag, attributes] of icons[name] as IconNode) {
    const child = document.createElementNS(svg.namespaceURI, tag);
    for (const [key, value] of Object.entries(attributes)) if (value !== undefined) child.setAttribute(key, String(value));
    svg.append(child);
  }
  return svg;
}
export function button(document: Document, label: string, name?: keyof typeof icons): HTMLButtonElement {
  const node = document.createElement("button"); node.type = "button";
  if (name) node.append(icon(document, name));
  const text = document.createElement("span"); text.textContent = label; node.append(text);
  return node;
}
export function textInput(document: Document): HTMLInputElement {
  const input = document.createElement("input"); input.type = "text"; input.autocomplete = "off"; input.spellcheck = false;
  return input;
}
