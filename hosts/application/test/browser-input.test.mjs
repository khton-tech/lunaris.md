import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { bindBrowserInput } from '@lunaris/application-host/browser-input';
import { mobileViewport, useBrowser } from '../../../tools/test/browser.mjs';

test('host fits the visible viewport during touch editing and preserves native context actions', async () => {
  const { window } = useBrowser(new JSDOM('<input>', { pretendToBeVisual: true }));
  const viewport = mobileViewport(window);
  const { document } = window;
  const field = document.querySelector('input');
  const release = bindBrowserInput(window);
  const frame = () => new Promise(resolve => window.requestAnimationFrame(resolve));
  const geometry = async (height, offsetTop = 0, scale = 1, event = 'resize') => {
    Object.assign(viewport, { height, offsetTop, scale });
    viewport.dispatchEvent(new window.Event(event));
    await frame();
  };
  const keyboardOpen = () => document.body.hasAttribute('data-keyboard-viewport');
  try {
    assert.equal(field.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true })), true);
    field.focus();
    await geometry(675);
    assert.equal(keyboardOpen(), false);
    await geometry(360, 0, 2);
    assert.equal(keyboardOpen(), false);
    await geometry(390, 120);
    assert.equal(keyboardOpen(), true);
    assert.equal(document.body.style.getPropertyValue('--keyboard-viewport-height'), '390px');
    assert.equal(document.body.style.getPropertyValue('--keyboard-viewport-top'), '120px');
    await geometry(390, 35, 1, 'scroll');
    assert.equal(document.body.style.getPropertyValue('--keyboard-viewport-top'), '35px');
    await geometry(720);
    assert.equal(document.activeElement, field);
    assert.equal(keyboardOpen(), false);
    assert.equal(document.body.style.getPropertyValue('--keyboard-viewport-height'), '');

    // A resizing WebView shrinks the layout viewport and the visual viewport.
    window.innerHeight = 390;
    await geometry(390);
    assert.equal(keyboardOpen(), true);
    field.blur();
    await frame();
    assert.equal(keyboardOpen(), true);
    release();
    assert.equal(keyboardOpen(), false);
    await geometry(355);
    assert.equal(keyboardOpen(), false);
  } finally {
    release();
    window.close();
  }
});

test('desktop host still suppresses the browser context menu and ignores window resizing', async () => {
  const { window } = useBrowser(new JSDOM('<textarea></textarea>', { pretendToBeVisual: true }));
  const field = window.document.querySelector('textarea');
  const release = bindBrowserInput(window);
  try {
    assert.equal(field.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true })), false);
    field.focus();
    window.innerHeight = 300;
    window.dispatchEvent(new window.Event('resize'));
    await new Promise(resolve => window.requestAnimationFrame(resolve));
    assert.equal(window.document.body.hasAttribute('data-keyboard-viewport'), false);
  } finally {
    release();
    window.close();
  }
});
