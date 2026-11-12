import type { MentionGroup } from "@lunaris/backlinks";

/** Common Obsidian filter operators: phrases, negation, OR, file:, path: and /regex/. */
export function filterGroups(groups: readonly MentionGroup[], query: string, sort: string): MentionGroup[] {
  const tokens = query.match(/-?(?:(?:file|path|content):)?(?:"[^"]*"|\/(?:\\.|[^/])*\/[imsu]*|[^\s]+)/g) ?? [];
  const alternatives: string[][] = [[]];
  for (const token of tokens) { if (token === "OR") alternatives.push([]); else alternatives.at(-1)!.push(token); }
  const matches = (text: string, path: string) => alternatives.some(terms => terms.every(term => {
    const negate = term.startsWith("-"); if (negate) term = term.slice(1);
    const field = /^(file|path|content):/.exec(term); if (field) term = term.slice(field[0].length);
    const haystack = field?.[1] === "path" ? path : field?.[1] === "file" ? path.slice(path.lastIndexOf("/") + 1) : text;
    const regex = /^\/([\s\S]*)\/([imsu]*)$/.exec(term); let result = false;
    if (regex) { try { result = new RegExp(regex[1]!, regex[2] || "i").test(haystack); } catch { result = false; } }
    else result = haystack.toLocaleLowerCase().includes(term.replace(/^"|"$/g, "").toLocaleLowerCase());
    return negate ? !result : result;
  }));
  return groups.map(group => ({ ...group, mentions: group.mentions.filter(mention => matches(group.text.slice(mention.contextFrom, mention.contextTo), group.source.path)) }))
    .filter(group => group.mentions.length).sort((a, b) => {
      if (sort === "modified-desc" || sort === "modified-asc") {
        const delta = (a.modifiedAt ?? 0) - (b.modifiedAt ?? 0); if (delta) return sort === "modified-desc" ? -delta : delta;
      }
      const name = (path: string) => path.slice(path.lastIndexOf("/") + 1);
      const cmp = name(a.source.path).localeCompare(name(b.source.path), undefined, { numeric: true, sensitivity: "base" }) || a.source.path.localeCompare(b.source.path);
      return sort === "name-desc" ? -cmp : cmp;
    });
}
