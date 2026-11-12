import { parser as baseParser, Autolink } from "@lezer/markdown";
import { parseDocument, visit } from "yaml";
import type { Mention, NoteLink } from "@lunaris/backlinks";

interface Span { from: number; to: number }
export interface ParsedNote {
  readonly text: string;
  readonly aliases: readonly string[];
  readonly links: readonly NoteLink[];
  readonly excluded: readonly Span[];
}
const overlaps = (ranges: readonly Span[], from: number, to: number) => ranges.some(r => r.from < to && r.to > from);
const escaped = (text: string, pos: number) => { let n = 0; while (pos > 0 && text[--pos] === "\\") n++; return n % 2 === 1; };
const label = (value: string) => value.replace(/\\([\[\]\\])/g, "$1").trim().replace(/\s+/g, " ").toLowerCase();
const parser = baseParser.configure(Autolink);

function wikiLink(raw: string, body: string, from: number): NoteLink | null {
  const separator = body.indexOf("|");
  const target = separator < 0 ? body : body.slice(0, separator);
  const destination = target.trim();
  if (!destination) return null;
  const alias = separator < 0 ? "" : body.slice(separator + 1);
  const bodyFrom = from + (raw.startsWith("!") ? 3 : 2);
  let labelFrom = bodyFrom + target.length - target.trimStart().length;
  let display = destination;
  if (alias.trim()) {
    labelFrom = bodyFrom + separator + 1 + alias.length - alias.trimStart().length;
    display = alias.trim();
  } else if (!/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(destination)) {
    const path = destination.split("#", 1)[0]!;
    const basenameFrom = path.lastIndexOf("/") + 1;
    const basename = path.slice(basenameFrom);
    if (basename) {
      labelFrom += basenameFrom;
      display = basename.replace(/\.md$/i, "") || basename;
    }
  }
  return { from, to: from + raw.length, destination, wiki: true, label: { from: labelFrom, to: labelFrom + display.length } };
}

/** Parse Markdown structure before finding prose; code and existing links are never unlinked mentions. */
export function parseNote(text: string): ParsedNote {
  const excluded: Span[] = []; const links: NoteLink[] = []; let aliases: string[] = [];
  const front = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)(?:\r?\n|$)/.exec(text);
  if (front) {
    excluded.push({ from: 0, to: front[0].length });
    try {
      const doc = parseDocument(front[1]!, { uniqueKeys: true });
      if (!doc.errors.length) {
        const data = doc.toJS({ maxAliasCount: 20 }) as { aliases?: unknown; alias?: unknown } | null;
        const values = data?.aliases ?? data?.alias;
        aliases = (Array.isArray(values) ? values : typeof values === "string" ? [values] : []).filter((v): v is string => typeof v === "string" && !!v.trim()).map(v => v.trim());
        const offset = text.indexOf("\n") + 1;
        visit(doc, { Scalar(key, node) {
          if (key === "key" || typeof node.value !== "string" || !node.range) return;
          const raw = front[1]!.slice(node.range[0], node.range[1]);
          for (const match of raw.matchAll(/!?\[\[([^\]\r\n]+)\]\]/g)) {
            const from = offset + node.range[0] + match.index;
            const link = wikiLink(match[0], match[1]!, from);
            if (link) links.push(link);
          }
        } });
      }
    } catch { /* Invalid metadata does not prevent indexing the Markdown body. */ }
  }
  for (const m of text.matchAll(/%%[\s\S]*?(?:%%|$)/g)) excluded.push({ from: m.index, to: m.index + m[0].length });
  for (const m of text.matchAll(/<!--[\s\S]*?(?:-->|$)/g)) excluded.push({ from: m.index, to: m.index + m[0].length });
  const tree = parser.parse(text); const linkNodes: Span[] = []; const inlineLinks: Span[] = []; const definitions = new Map<string, string>();
  tree.iterate({ enter(node) {
    if (overlaps(excluded, node.from, node.to) && excluded.some(r => r.from <= node.from && r.to >= node.to)) return false;
    if (["FencedCode", "CodeBlock", "InlineCode", "Comment", "HTMLBlock"].includes(node.name)) {
      excluded.push({ from: node.from, to: node.to }); return false;
    }
    if (node.name === "LinkReference") {
      const raw = text.slice(node.from, node.to); const match = /^\s*\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))/.exec(raw);
      if (match && !definitions.has(label(match[1]!))) definitions.set(label(match[1]!), match[2] ?? match[3]!);
      excluded.push({ from: node.from, to: node.to }); return false;
    }
    if (node.name === "URL") {
      const raw = text.slice(node.from, node.to);
      links.push({ from: node.from, to: node.to, destination: raw.startsWith("www.") ? "https://" + raw : !raw.includes(":") && raw.includes("@") ? "mailto:" + raw : raw, wiki: false });
      excluded.push({ from: node.from, to: node.to }); return false;
    }
    if (node.name === "Link" || node.name === "Image" || node.name === "Autolink") {
      if (node.node.getChild("URL")) inlineLinks.push({ from: node.from, to: node.to });
      linkNodes.push({ from: node.from, to: node.to }); return false;
    }
    return;
  } });
  for (const m of text.matchAll(/!?\[\[([^\]\r\n]+)\]\]/g)) {
    const from = m.index; const to = from + m[0].length;
    if (escaped(text, from) || overlaps(excluded, from, to) || overlaps(inlineLinks, from, to)) continue;
    const link = wikiLink(m[0], m[1]!, from);
    if (link) links.push(link);
    excluded.push({ from, to });
  }
  for (const span of linkNodes) {
    if (overlaps(excluded, span.from, span.to)) continue;
    const raw = text.slice(span.from, span.to); const node = tree.resolveInner(span.from + 1, 1);
    let container = node; while (container.parent && container.from !== span.from) container = container.parent;
    const url = container.getChild("URL");
    let destination = url ? text.slice(url.from, url.to).replace(/^<|>$/g, "") : undefined;
    if (!destination) {
      const ref = /^!?\[([\s\S]*?)\](?:\[([^\]]*)\])?$/.exec(raw);
      if (ref) destination = definitions.get(label(ref[2] || ref[1]!));
    }
    if (destination) links.push({ ...span, destination, wiki: false });
    excluded.push(span);
  }
  return { text, aliases: [...new Set(aliases)], links, excluded };
}

export const title = (path: string) => path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/i, "");
function normalize(path: string): string | null {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") { if (!parts.length) return null; parts.pop(); } else parts.push(part);
  }
  return parts.join("/");
}
function notePath(link: NoteLink): string | null {
  let destination = link.destination;
  if (/^[a-z][a-z\d+.-]*:/i.test(destination) || destination.startsWith("//")) return null;
  destination = destination.split("#")[0]!;
  try { destination = decodeURIComponent(destination); } catch { return null; }
  destination = destination.replace(/\\([()\[\] #])/g, "$1");
  if (!destination) return "";
  if (destination.endsWith("/") || /(?:^|\/)\.{1,2}$/.test(destination)) return null;
  return /\.md$/i.test(destination) ? destination : destination + ".md";
}
const parentPath = (source: string) => source.slice(0, Math.max(0, source.lastIndexOf("/")));

export function creationPath(link: NoteLink, source: string): string | null {
  const destination = notePath(link);
  if (!link.wiki || !destination) return null;
  if (destination.startsWith("/") || (destination.includes("/") && !/^\.\.?\//.test(destination))) return normalize(destination);
  return normalize(parentPath(source) + "/" + destination);
}

/** Share exact, case-insensitive and suffix lookup tables for one path catalog. */
export function createLinkResolver(paths: readonly string[]): (link: NoteLink, source: string) => string | null {
  const exactPaths = new Set(paths);
  const foldedPaths = new Map<string, string>();
  const suffixPaths = new Map<string, string[]>();
  for (const path of paths) {
    const folded = path.toLowerCase();
    if (!foldedPaths.has(folded)) foldedPaths.set(folded, path);
    let offset = 0;
    do {
      const suffix = folded.slice(offset);
      const matches = suffixPaths.get(suffix) ?? [];
      matches.push(path); suffixPaths.set(suffix, matches);
      const separator = folded.indexOf("/", offset);
      offset = separator < 0 ? -1 : separator + 1;
    } while (offset >= 0);
  }
  const exact = (candidate: string | null) => candidate === null ? undefined :
    exactPaths.has(candidate) ? candidate : foldedPaths.get(candidate.toLowerCase());
  return (link, source) => {
    const destination = notePath(link);
    if (destination === null) return null;
    if (!destination) return source;
    const parent = parentPath(source);
    const relative = normalize(parent + "/" + destination);
    const root = normalize(destination);
    const direct = destination.startsWith("/") ? exact(root) : link.wiki
      ? destination.includes("/") ? exact(root) ?? exact(relative) : exact(relative)
      : exact(relative) ?? exact(root);
    if (direct) return direct;
    if (destination.startsWith(".") || destination.startsWith("/")) return null;
    const candidates = suffixPaths.get(destination.toLowerCase()) ?? [];
    const sourceParts = parent.split("/");
    let best: string | null = null; let nearest = -1;
    for (const path of candidates) {
      const parts = path.split("/"); let proximity = 0;
      while (proximity < sourceParts.length && sourceParts[proximity] === parts[proximity]) proximity++;
      if (proximity > nearest || proximity === nearest && best !== null && path.localeCompare(best) < 0) {
        best = path; nearest = proximity;
      }
    }
    return best;
  };
}
export function mention(text: string, from: number, to: number): Mention {
  const before = text.slice(0, from); const after = text.slice(to);
  const boundaries = [...before.matchAll(/\r?\n[ \t]*\r?\n/g)]; const last = boundaries.at(-1);
  const end = /\r?\n[ \t]*\r?\n/.exec(after);
  return { from, to, line: before.split("\n").length, contextFrom: last ? last.index + last[0].length : 0, contextTo: end ? to + end.index : text.length };
}
export function unlinked(note: ParsedNote, names: readonly string[]): Mention[] {
  const found: Mention[] = []; const text = note.text;
  const word = (s: string) => /[\p{L}\p{N}_]/u.test(s);
  for (const name of [...new Set(names)].filter(Boolean).sort((a, b) => b.length - a.length)) {
    const regex = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
    for (const match of text.matchAll(regex)) {
      const from = match.index; const to = from + match[0].length;
      if (overlaps(note.excluded, from, to) || overlaps(found, from, to) || escaped(text, from)) continue;
      if (word(name[0]!) && from > 0 && word(text[from - 1]!)) continue;
      if (word(name.at(-1)!) && to < text.length && word(text[to]!)) continue;
      found.push(mention(text, from, to));
    }
  }
  return found.sort((a, b) => a.from - b.from);
}
