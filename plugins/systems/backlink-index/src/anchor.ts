/** Headings and block IDs are resolved against the same text snapshot used for navigation. */
export function anchorRange(text: string, destination: string): { from: number; to: number } | null {
  const hash = destination.indexOf("#"); if (hash < 0) return { from: 0, to: 0 };
  let anchor: string; try { anchor = decodeURIComponent(destination.slice(hash + 1)); } catch { return null; }
  if (!anchor) return { from: 0, to: 0 };
  let offset = 0; let fence = "";
  const slug = (value: string) => value.trim().toLocaleLowerCase().replace(/[*_`~]/g, "").replace(/\s+/g, "-");
  const lines = text.split(/\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!.replace(/\r$/, ""); const boundary = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (boundary) { if (!fence) fence = boundary[1]!; else if (boundary[1]![0] === fence[0] && boundary[1]!.length >= fence.length) fence = ""; }
    else if (!fence) {
      if (anchor.startsWith("^") && line.trimEnd().endsWith(" " + anchor)) return { from: offset, to: offset + line.length };
      if (anchor.startsWith("^") && line.trim() === anchor) return { from: offset, to: offset + line.length };
      const heading = /^ {0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/.exec(line)?.[1]
        ?? (index + 1 < lines.length && /^ {0,3}(?:=+|-+)\s*$/.test(lines[index + 1]!) ? line : undefined);
      if (!anchor.startsWith("^") && heading && slug(heading) === slug(anchor.split("#").at(-1)!)) return { from: offset, to: offset + line.length };
    }
    offset += lines[index]!.length + 1;
  }
  return null;
}
