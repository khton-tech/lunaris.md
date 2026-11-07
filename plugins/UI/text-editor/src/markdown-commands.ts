import type { StateCommand } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { insertNewlineContinueMarkup } from "@codemirror/lang-markdown";

/** Keep explicit tab levels that CommonMark's continuation command cannot see. */
export const continueTabIndentedList: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly) return false;
  const prefixes = state.selection.ranges.map(range => {
    if (!range.empty) return null;
    const cursor = syntaxTree(state).resolveInner(range.head, -1).cursor();
    let extended = false;
    do { if (cursor.name === "TabListIndent") extended = true; } while (cursor.parent());
    if (!extended) return null;
    const line = state.doc.lineAt(range.head);
    const before = state.sliceDoc(line.from, range.head);
    const item = /^([ \t]*)(?:[-+*]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]*)?(\S.*)$/.exec(before);
    return item?.[1] ?? null;
  });
  if (prefixes.every(prefix => prefix === null)) return false;
  return insertNewlineContinueMarkup({ state, dispatch(transaction) {
    const corrections = [];
    for (let index = 0; index < prefixes.length; index++) {
      const prefix = prefixes[index];
      if (prefix == null) continue;
      const line = transaction.newDoc.lineAt(transaction.newSelection.ranges[index]!.head);
      if (line.number <= state.doc.lineAt(state.selection.ranges[index]!.head).number) continue;
      const leading = /^[ \t]*/.exec(line.text)![0];
      if (leading !== prefix) corrections.push({ from: line.from, to: line.from + leading.length, insert: prefix });
    }
    if (!corrections.length) { dispatch(transaction); return; }
    const correction = transaction.state.changes(corrections);
    dispatch(state.update({ changes: transaction.changes.compose(correction),
      selection: transaction.newSelection.map(correction), effects: transaction.effects,
      scrollIntoView: true, userEvent: "input" }));
  } });
};
