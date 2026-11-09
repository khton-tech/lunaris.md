import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { useBrowser } from '../../../../tools/test/browser.mjs';
import { EditorState, EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, undo, redo } from '@codemirror/commands';
import { typingAnimation } from '../dist/src/typing-animation.js';

function setup(t, doc = '', reduce = false) {
  const dom = useBrowser(new JSDOM('<div id="editor"></div>', { pretendToBeVisual: true }));
  Object.defineProperty(globalThis, 'MutationObserver', { configurable: true, value: dom.window.MutationObserver });
  Object.defineProperty(globalThis, 'Window', { configurable: true, value: dom.window.Window });
  dom.window.Range.prototype.getClientRects = () => [];
  dom.window.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
  const listeners = new Set();
  const preference = { matches: reduce, addEventListener: (_, listener) => listeners.add(listener), removeEventListener: (_, listener) => listeners.delete(listener) };
  const matchMedia = dom.window.matchMedia;
  dom.window.matchMedia = query => query === '(prefers-reduced-motion: reduce)' ? preference : matchMedia(query);
  const view = new EditorView({ parent: dom.window.document.querySelector('#editor'), state: EditorState.create({
    doc, extensions: [history(), EditorState.allowMultipleSelections.of(true), typingAnimation],
  }) });
  t.after(() => { view.destroy(); assert.equal(listeners.size, 0); dom.window.close(); });
  return { view, preference, listeners };
}

test('short typed text fades without changing selection/history and feedback expires', async t => {
  const { view } = setup(t);
  view.dispatch({ changes: { from: 0, insert: 'я' }, selection: { anchor: 1 }, userEvent: 'input.type' });
  assert.equal(view.contentDOM.querySelector('.cm-typing-insertion').textContent, 'я');
  assert.equal(view.state.selection.main.head, 1);
  await new Promise(resolve => setTimeout(resolve, 230));
  assert.equal(view.contentDOM.querySelector('.cm-typing-insertion'), null);
  assert.equal(view.state.doc.toString(), 'я');
  assert.equal(undo(view), true); assert.equal(view.state.doc.toString(), '');
  assert.equal(view.contentDOM.querySelector('.cm-typing-deletion'), null);
  assert.equal(redo(view), true); assert.equal(view.state.doc.toString(), 'я');
  assert.equal(view.contentDOM.querySelector('.cm-typing-insertion'), null);
});

test('deleted text is a temporary inaccessible widget, never source text; rapid edits replace it', async t => {
  const { view } = setup(t, 'abc');
  view.dispatch({ changes: { from: 1, to: 2 }, selection: { anchor: 1 }, userEvent: 'delete.backward' });
  const ghost = view.contentDOM.querySelector('.cm-typing-deletion');
  assert.equal(ghost.textContent, 'b'); assert.equal(ghost.getAttribute('aria-hidden'), 'true');
  assert.equal(ghost.contentEditable, 'false');
  assert.equal(view.state.doc.toString(), 'ac'); assert.equal(view.state.sliceDoc(0, 2), 'ac');
  assert.equal(view.state.selection.main.head, 1);
  view.dispatch({ changes: { from: 1, to: 2 }, userEvent: 'delete.forward' });
  assert.equal(view.contentDOM.querySelectorAll('.cm-typing-deletion').length, 1);
  assert.equal(view.contentDOM.querySelector('.cm-typing-deletion').textContent, 'c');
  await new Promise(resolve => setTimeout(resolve, 230));
  assert.equal(view.contentDOM.querySelector('.cm-typing-deletion'), null);
  assert.equal(view.state.doc.toString(), 'a');
});

test('paste, bulk edits, line breaks, composition and external changes stay immediate', t => {
  for (const [text, userEvent] of [['paste', 'input.paste'], ['composition', 'input.type.compose'], ['a', undefined], ['a\nb', 'input.type'], ['a long paragraph', 'input.type']]) {
    const { view } = setup(t);
    view.dispatch({ changes: { from: 0, insert: text }, userEvent });
    assert.equal(view.contentDOM.querySelector('.cm-typing-insertion'), null);
    assert.equal(view.state.doc.toString(), text);
  }
});

test('reduced motion suppresses feedback and live preference changes clear it', t => {
  const { view, preference, listeners } = setup(t, '', true);
  view.dispatch({ changes: { from: 0, insert: 'a' }, userEvent: 'input.type' });
  assert.equal(view.contentDOM.querySelector('.cm-typing-insertion'), null);
  preference.matches = false;
  view.dispatch({ changes: { from: 1, insert: 'b' }, userEvent: 'input.type' });
  assert.ok(view.contentDOM.querySelector('.cm-typing-insertion'));
  preference.matches = true; for (const listener of listeners) listener();
  assert.equal(view.contentDOM.querySelector('.cm-typing-insertion'), null);
  assert.equal(view.state.doc.toString(), 'ab');
});

test('multiple carets animate their own insertions without moving selections', t => {
  const { view } = setup(t, 'ab');
  view.dispatch({ changes: [{ from: 0, insert: 'x' }, { from: 2, insert: 'y' }],
    selection: EditorSelection.create([EditorSelection.cursor(1), EditorSelection.cursor(4)]), userEvent: 'input.type' });
  assert.deepEqual([...view.contentDOM.querySelectorAll('.cm-typing-insertion')].map(node => node.textContent), ['x', 'y']);
  assert.deepEqual(view.state.selection.ranges.map(range => range.head), [1, 4]);
});
