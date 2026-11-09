import { EditorSelection } from "@codemirror/state";
import type { StateCommand } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

/** Callout is a custom composite; upstream's quote command only knows Blockquote. */
export const continueCallout: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly) return false;
  const contexts = state.selection.ranges.map(range => {
    if (!range.empty) return null;
    const line = state.doc.lineAt(range.head);
    const match = /^([ \t]*(?:(?:[-+*]|\d+[.)])[ \t]+)?(?:>[ \t]?)+)(.*)$/.exec(line.text);
    let callout = false, code = false;
    for (const position of [range.head, line.from + (match?.[1]?.lastIndexOf(">") ?? 0) + 1]) {
      for (let node = syntaxTree(state).resolveInner(Math.min(position, state.doc.length), -1); node; node = node.parent!) {
        if (node.name === "Callout") callout = true;
        if (["FencedCode", "CodeBlock"].includes(node.name)) code = true;
      }
    }
    return callout && match && range.head >= line.from + match[1]!.length ? { line, prefix: match[1]!, body: match[2]!, code } : null;
  });
  if (contexts.some(value => !value)) return false;
  let index = 0;
  const changes = state.changeByRange(range => {
    const context = contexts[index++]!;
    const { line, body, code } = context;
    const prefix = context.prefix.replace(/^([ \t]*)([-+*]|\d+[.)])([ \t]+)/, (_all, spaces: string, marker: string, after: string) => spaces + " ".repeat(marker.length) + after);
    const list = !code && /^([ \t]*)([-+*]|\d+[.)])([ \t]+)(\[[ xX]\][ \t]+)?/.exec(body);
    if (list && range.head >= line.from + context.prefix.length + list[0].length && !body.slice(list[0].length).trim()) {
      const from = line.from + context.prefix.length + list[1]!.length;
      return { changes: { from, to: line.to }, range: EditorSelection.cursor(from) };
    }
    if (!body.trim() && !code) {
      const from = line.from + context.prefix.lastIndexOf(">");
      return { changes: { from, to: line.to }, range: EditorSelection.cursor(from) };
    }
    let marker = code ? /^[ \t]*/.exec(body)![0] : "";
    if (list && range.head >= line.from + context.prefix.length + list[0].length) {
      const number = /^(\d+)([.)])$/.exec(list[2]!);
      marker = list[1]! + (number ? String(Number(number[1]) + 1) + number[2] : list[2]) + list[3] + (list[4] ? "[ ] " : "");
    }
    const insert = state.lineBreak + prefix + marker;
    return { changes: { from: range.head, insert }, range: EditorSelection.cursor(range.head + insert.replace(/\r\n/g, "\n").length) };
  });
  dispatch(state.update(changes, { scrollIntoView: true, userEvent: "input" })); return true;
};
