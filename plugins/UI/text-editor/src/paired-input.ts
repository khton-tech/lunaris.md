import { EditorSelection, StateEffect, StateField } from "@codemirror/state";
import type { Extension, StateCommand, EditorState } from "@codemirror/state";
import { invertedEffects } from "@codemirror/commands";
import { EditorView, keymap } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";

interface Pair { open: number; from: number; to: number; opening: string; closing: string }

const rememberPair = StateEffect.define<Pair>({
  map: (pair, changes) => ({ ...pair, open: changes.mapPos(pair.open, 1), from: changes.mapPos(pair.from, 1), to: changes.mapPos(pair.to, -1) }),
});
const restorePairs = StateEffect.define<readonly Pair[]>();

/** Track generated delimiters so literal Markdown is never mistaken for a closer. */
const pairs = StateField.define<readonly Pair[]>({
  create: () => [],
  update(value, transaction) {
    const restored = transaction.effects.find(effect => effect.is(restorePairs));
    if (restored) return restored.value;
    const mapped = value.map(pair => ({ ...pair, open: transaction.changes.mapPos(pair.open, 1),
      from: transaction.changes.mapPos(pair.from, 1), to: transaction.changes.mapPos(pair.to, -1) }));
    const added = transaction.effects.filter(effect => effect.is(rememberPair)).map(effect => effect.value);
    return [...mapped.filter(pair => !added.some(next => next.open === pair.open)), ...added]
      .filter(pair => pair.open >= 0 && pair.open + pair.opening.length <= pair.from && pair.to <= transaction.newDoc.length
        && transaction.newDoc.sliceString(pair.open, pair.open + pair.opening.length) === pair.opening
        && transaction.newDoc.sliceString(pair.from, pair.to) === pair.closing);
  },
});

const delimiters: Readonly<Record<string, string>> = { "(": ")", "[": "]", "{": "}", "*": "*", "`": "`" };

function escaped(state: EditorState, position: number) {
  let start = position;
  while (start > 0 && state.sliceDoc(start - 1, start) === "\\") start--;
  return (position - start) % 2 === 1;
}

function inLiteralCode(state: EditorState, position: number) {
  for (let node = syntaxTree(state).resolveInner(position, -1); node; node = node.parent!) {
    if (["InlineCode", "FencedCode", "CodeBlock", "HTMLBlock"].includes(node.name)) return true;
  }
  return false;
}

const removeEmptyPair: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly) return false;
  const emptyPairs = state.selection.ranges.map(range => range.empty
    ? state.field(pairs).find(pair => pair.from === range.head && pair.open + pair.opening.length === pair.from) : undefined);
  if (emptyPairs.some(pair => !pair)) return false;
  dispatch(state.update(state.changeByRange(range => {
    const pair = emptyPairs[state.selection.ranges.indexOf(range)]!;
    return { changes: { from: pair.open, to: pair.to }, range: EditorSelection.cursor(pair.open) };
  }), { userEvent: "delete.backward", scrollIntoView: true }));
  return true;
};

/** Input only: paste, composition, loaded documents and programmatic edits stay literal. */
const input = EditorView.inputHandler.of((view, from, to, text) => {
  const { state } = view;
  if (state.readOnly || view.composing || text.length !== 1) return false;
  if (!"([{)]}*` ".includes(text)) return false;
  // Let replacement/composition input outside the current selections use CM's default path.
  if (from !== state.selection.main.from || to !== state.selection.main.to) return false;
  const changes = state.changeByRange(range => {
    const position = range.from;
    const pair = range.empty && !escaped(state, position) ? state.field(pairs).find(pair => position >= pair.from && position < pair.to
      && state.sliceDoc(position, position + 1) === text) : undefined;
    if (pair) {
      // A second star expands empty emphasis into strong emphasis before closing can skip.
      if (text === "*" && pair.opening === "*" && position === pair.from && pair.open + 1 === position) {
        return { changes: { from: position, insert: "**" }, range: EditorSelection.cursor(position + 1),
          effects: rememberPair.of({ open: pair.open, from: position + 1, to: position + 3, opening: "**", closing: "**" }) };
      }
      return { range: EditorSelection.cursor(position + 1) };
    }
    // Preserve the ordinary '* ' bullet shortcut instead of leaving a dangling auto-closer.
    const bullet = text === " " && range.empty ? state.field(pairs).find(pair => pair.opening === "*"
      && pair.from === position && pair.open + 1 === position && /^\s*$/.test(state.sliceDoc(state.doc.lineAt(position).from, pair.open))) : undefined;
    if (bullet) return { changes: { from: position, to: bullet.to, insert: text }, range: EditorSelection.cursor(position + 1) };
    const closing = delimiters[text];
    const symmetric = text === "*" || text === "`";
    const next = state.sliceDoc(range.to, range.to + 1);
    const previous = state.sliceDoc(position - (position > 0 ? 1 : 0), position);
    if (!closing || escaped(state, position) || (symmetric && inLiteralCode(state, position))
      || (range.empty && next && !/[\s)\]}>.,;:!?]/.test(next))
      || (range.empty && symmetric && /[\p{L}\p{N}_]/u.test(previous))) {
      return { changes: { from: range.from, to: range.to, insert: text }, range: EditorSelection.cursor(position + 1) };
    }
    const selected = state.sliceDoc(range.from, range.to);
    return { changes: { from: range.from, to: range.to, insert: text + selected + closing },
      range: selected ? EditorSelection.range(position + 1, position + 1 + selected.length) : EditorSelection.cursor(position + 1),
      effects: rememberPair.of({ open: position, from: position + 1 + selected.length, to: position + 2 + selected.length,
        opening: text, closing }) };
  });
  view.dispatch(state.update(changes, { userEvent: "input.type", scrollIntoView: true }));
  return true;
});

export const pairedInput: Extension = [pairs, input,
  invertedEffects.of(transaction => transaction.docChanged ? [restorePairs.of(transaction.startState.field(pairs))] : []),
  keymap.of([{ key: "Backspace", run: removeEmptyPair }])];
