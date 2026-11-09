import type { MarkdownConfig } from "@lezer/markdown";

export const calloutTypes = ["note", "abstract", "info", "todo", "tip", "success", "question", "warning", "failure", "danger", "bug", "example", "quote"] as const;
export type CalloutType = typeof calloutTypes[number];
const aliases: Readonly<Record<string, CalloutType>> = { summary: "abstract", tldr: "abstract", hint: "tip", important: "tip", check: "success", done: "success", help: "question", faq: "question", caution: "warning", attention: "warning", fail: "failure", missing: "failure", error: "danger", cite: "quote" };
export function readHeader(text: string) {
  const match = /^\[!([a-zA-Z0-9_-]+)\]([+-]?)(?:[ \t]+(.*))?$/.exec(text);
  if (!match) return null;
  const rawType = match[1]!.toLowerCase();
  const type = aliases[rawType] ?? (calloutTypes.includes(rawType as CalloutType) ? rawType as CalloutType : "note");
  return { type, rawType, title: match[3]?.trim() ?? "", fold: match[2] as "" | "+" | "-" };
}

/** A quote-compatible composite keeps native Markdown lists, tasks and fences. */
export const calloutMarkdown: MarkdownConfig = {
  defineNodes: [{ name: "Callout", block: true, composite(context, line) {
    if (line.next !== 62) return false;
    line.addMarker(context.elt("CalloutMark", context.lineStart + line.pos, context.lineStart + line.pos + 1));
    line.moveBase(line.pos + (/^[ \t]/.test(line.text.slice(line.pos + 1)) ? 2 : 1));
    return true;
  } }, "CalloutMark", { name: "CalloutHeader", block: true }],
  parseBlock: [{ name: "Callout", before: "Blockquote", parse(context, line) {
    if (line.next !== 62 || !readHeader(line.text.slice(line.pos + 1).trimStart())) return false;
    context.startComposite("Callout", line.pos);
    context.addElement(context.elt("CalloutMark", context.lineStart + line.pos, context.lineStart + line.pos + 1));
    line.moveBase(line.pos + (/^[ \t]/.test(line.text.slice(line.pos + 1)) ? 2 : 1));
    return null;
  } }, { name: "CalloutHeader", before: "LinkReference", parse(context, line) {
    if (context.parentType().name !== "Callout" || !readHeader(line.text.slice(line.pos))) return false;
    context.addElement(context.elt("CalloutHeader", context.lineStart + line.pos, context.lineStart + line.text.length));
    context.nextLine(); return true;
  } }],
};
