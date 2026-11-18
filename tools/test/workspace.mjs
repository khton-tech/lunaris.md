// React DOM detects input-event support when its module is first evaluated.
// Install the Node browser environment before importing the component runtime.
import { useBrowser } from './browser.mjs';
import { JSDOM } from 'jsdom';
import { setupWorkspace as mountWorkspace } from './workspace-surface.mjs';

export { flush, panel } from './workspace-surface.mjs';

export async function setupWorkspace(options = {}) {
  if (options.surface) return mountWorkspace(options);
  const dom = useBrowser(new JSDOM('<div id="app"></div>'));
  try {
    const workspace = await mountWorkspace(options, dom.window.document.getElementById('app'));
    return { ...workspace, dom, async stop() {
      try { await workspace.stop(); } finally { dom.window.close(); }
    } };
  } catch (error) {
    dom.window.close();
    throw error;
  }
}
