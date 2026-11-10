import type { Line, MarkdownConfig } from "@lezer/markdown";

/** Underline-like lines must not turn preceding text into a heading. */
export const noSetextHeadings: MarkdownConfig = { remove: ["SetextHeading"] };

function tabList(line: Line) {
  if (line.indent < line.baseIndent + 4 || !line.text.slice(line.basePos, line.pos).includes("\t")) return false;
  const text = line.text.slice(line.pos);
  return /^(?:[-+*]|\d{1,9}[.)])(?:[ \t]|$)/.test(text) && !/^([-*])(?:[ \t]*\1){2,}[ \t]*$/.test(text);
}

/** Hard-tab list indentation is editable even when intermediate levels are empty.
 * Consume only list indentation before CommonMark's indented-code rule; ordinary
 * indented text and fenced code retain their existing interpretation.
 */
export const tabIndentedLists: MarkdownConfig = {
  defineNodes: [{
    name: "TabListIndent", block: true,
    composite(_context, line, width) {
      if (line.pos === line.text.length) return true;
      if (line.indent < line.baseIndent + width) return false;
      line.moveBaseColumn(line.baseIndent + width);
      return true;
    },
  }],
  parseBlock: [{
    name: "TabListIndent", before: "IndentedCode",
    parse(context, line) {
      if (!tabList(line)) return false;
      context.startComposite("TabListIndent", line.basePos, 4);
      line.moveBaseColumn(line.baseIndent + 4);
      return null;
    },
    leaf() {
      return {
        nextLine(context, line, leaf) {
          if (!tabList(line)) return false;
          // Deeply indented markers must start a new list instead of becoming a
          // lazy continuation of the preceding item's paragraph.
          context.addLeafElement(leaf, context.elt("Paragraph", leaf.start, leaf.start + leaf.content.length,
            context.parser.parseInline(leaf.content, leaf.start)));
          return true;
        },
        finish() { return false; },
      };
    },
  }],
};
