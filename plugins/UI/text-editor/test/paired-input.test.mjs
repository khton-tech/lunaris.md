import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { useBrowser } from '../../../../tools/test/browser.mjs';
import { EditorState, EditorSelection } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, history, undo, redo } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { pairedInput } from '../dist/src/paired-input.js';

function setup(t, doc = '', extra = []) {
  const dom = useBrowser(new JSDOM('<div id="editor"></div>', { pretendToBeVisual: true }));
  Object.defineProperty(globalThis, 'MutationObserver', { configurable: true, value: dom.window.MutationObserver });
  Object.defineProperty(globalThis, 'Window', { configurable: true, value: dom.window.Window });
  dom.window.Range.prototype.getClientRects = () => [];
  dom.window.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
  const view = new EditorView({ parent: dom.window.document.querySelector('#editor'), state: EditorState.create({
    doc, extensions: [markdown(), history(), pairedInput, keymap.of(defaultKeymap), EditorState.allowMultipleSelections.of(true), extra],
  }) });
  t.after(() => { view.destroy(); dom.window.close(); });
  return {
    view,
    type(text) {
      const { from, to } = view.state.selection.main;
      const handled = view.state.facet(EditorView.inputHandler).some(handler => handler(view, from, to, text, () => view.state.update(view.state.replaceSelection(text))));
      if (!handled && !view.state.readOnly) view.dispatch(view.state.update(view.state.replaceSelection(text), { userEvent: 'input.type' }));
      return handled;
    },
    press(key) { view.contentDOM.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, keyCode: 8, bubbles: true, cancelable: true })); },
    select(anchor, head = anchor) { view.dispatch({ selection: { anchor, head } }); },
    check(text, head) { assert.equal(view.state.doc.toString(), text); assert.equal(view.state.selection.main.head, head); },
  };
}

test('opening delimiters insert pairs and typing each closer exits without changing text', t => {
  for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}'], ['*', '*'], ['`', '`']]) {
    const s = setup(t); s.type(open); s.check(open + close, 1);
    s.type('text'); s.type(close); s.check(open + 'text' + close, 6);
  }
  const s = setup(t); s.type('`'); s.type('`'); s.check('``', 2);
});

test('two stars grow empty emphasis to bold and closing stars advance individually', t => {
  const s = setup(t); s.type('*'); s.type('*'); s.check('****', 2);
  s.type('bold'); s.type('*'); s.check('**bold**', 7);
  s.type('*'); s.check('**bold**', 8);
});

test('nested pairs survive inner input and empty pairs delete together', t => {
  const s = setup(t); s.type('('); s.type('['); s.type('{'); s.check('([{}])', 3);
  s.press('Backspace'); s.check('([])', 2);
  s.type('x'); s.type(']'); s.type(')'); s.check('([x])', 5);
  const bold = setup(t); bold.type('*'); bold.type('*'); bold.press('Backspace'); bold.check('', 0);
});

test('selection wrapping and multiple cursors preserve independently tracked closers', t => {
  const s = setup(t, 'one two'); s.select(0, 3); s.type('[');
  assert.equal(s.view.state.sliceDoc(), '[one] two');
  assert.equal(s.view.state.sliceDoc(s.view.state.selection.main.from, s.view.state.selection.main.to), 'one');
  const multiple = setup(t, '\n');
  multiple.view.dispatch({ selection: EditorSelection.create([EditorSelection.cursor(0), EditorSelection.cursor(1)]) });
  multiple.type('*'); multiple.type('*');
  assert.equal(multiple.view.state.sliceDoc(), '****\n****');
  multiple.type('x'); multiple.type('*'); multiple.type('*');
  assert.equal(multiple.view.state.sliceDoc(), '**x**\n**x**');
  assert.deepEqual(multiple.view.state.selection.ranges.map(range => range.head), [5, 11]);
});

test('escaped syntax, words, literal code, paste and read-only input remain literal', t => {
  for (const [doc, input, expected] of [['\\', '*', '\\*'], ['word', '*', 'word*'], ['`code', '*', '`code*'], ['```\ncode', '*', '```\ncode*']]) {
    const s = setup(t, doc); s.select(doc.length); s.type(input); s.check(expected, expected.length);
  }
  const paste = setup(t); assert.equal(paste.type('**pasted**'), false); paste.check('**pasted**', 10);
  const locked = setup(t, '', EditorState.readOnly.of(true)); assert.equal(locked.type('('), false); locked.check('', 0);
  const literal = setup(t, '**saved**'); literal.select(7); literal.type('*'); literal.check('**saved***', 8);
  const escapedCloser = setup(t); escapedCloser.type('*'); escapedCloser.type('\\'); escapedCloser.type('*');
  escapedCloser.check('*\\**', 3);
});

test('star bullets stay ordinary Markdown and auto-pairs follow edits before them', t => {
  const s = setup(t); s.type('*'); s.type(' '); s.type('item'); s.check('* item', 6);
  const shifted = setup(t); shifted.type('('); shifted.type('x');
  shifted.view.dispatch({ changes: { from: 0, insert: 'prefix ' } });
  shifted.type(')'); shifted.check('prefix (x)', 10);
});

test('undo and redo restore generated closers as well as source text', t => {
  const s = setup(t); s.type('('); assert.equal(undo(s.view), true); s.check('', 0);
  assert.equal(redo(s.view), true); s.select(1); s.check('()', 1);
  s.type(')'); s.check('()', 2);
  const bold = setup(t); bold.type('*'); bold.type('*'); bold.type('bold');
  assert.equal(undo(bold.view), true); assert.equal(redo(bold.view), true);
  bold.select(6);
  bold.type('*'); bold.type('*'); bold.check('**bold**', 8);
});
