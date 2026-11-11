import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import execution from '@lunaris/quickjs-execution';
import { setupWorkspace, flush } from '../../../../tools/test/workspace.mjs';

test('a bundled third-party non-Markdown viewport mounts and interacts through public SDK without DOM access', async () => {
  const s = await setupWorkspace({ activeScreen: true, pluginRuntime: true, plugins: [execution] });
  try {
    await s.open(); const environment = { vaultId: s.service.current().id, generation: 1 }; await s.tools.runtime.open(environment);
    const manifest = { manifestVersion: 1, id: 'author.novel-tool', version: '1.0.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './plugin.js', metadata: { name: 'Novel tool', author: 'Author', description: 'A non-Markdown board', platforms: 'universal', languages: ['en'] }, provides: [], requires: [{ kind: 'api', id: 'lunaris.views', range: '^1.0.0' }, { kind: 'api', id: 'lunaris.active-screen', range: '^1.0.0' }, { kind: 'api', id: 'lunaris.logger', range: '^1.0.0' }], permissions: ['ui.dom'], optionalPermissions: [] };
    const code = `import {definePlugin} from '@lunaris/sdk'; import {Views} from '@lunaris/components'; import {ActiveScreen} from '@lunaris/active-screen'; import {Logger} from '@lunaris/logging';
      export default definePlugin({manifest:${JSON.stringify(manifest)},activate(ctx){
        const views=ctx.use(Views), screens=ctx.use(ActiveScreen);let count=0,mode='one',pointer='';
        const refresh=()=>screens.update('author.novel-tool.screen',{count,mode,pointer});
        views.register({id:'author.novel-tool.board',render(props){return {kind:'column',children:[
          {kind:'text',text:'Novel tool count: '+count+'; No host DOM: '+typeof document+'; '+pointer},
          {kind:'button',label:'Increment',onPress(){count++;refresh();}},
          {kind:'button',label:'Fail action',onPress(){throw Error('Guest action failed');}},
          {kind:'select',label:'Mode',value:mode,options:[{value:'one',label:'First'},{value:'two',label:'Second'}],onChange(value){mode=value;refresh();}},
          {kind:'drawing',label:'Novel graph',width:300,height:150,shapes:[{kind:'circle',x:30+count,y:40,radius:15,color:'accent'}],onPointer(event){pointer='Data only: '+(typeof event.target==='undefined');refresh();},onKey(event){if(event.key==='ArrowRight'){count++;refresh();}}}
        ]};}},ctx.signal);
        screens.register({id:'author.novel-tool.screen',componentId:'author.novel-tool.board'},ctx.signal);screens.select('author.novel-tool.screen');
        ctx.use(Logger).info(ctx.pluginId,'Novel viewport ready');
      }});`;
    const output = await build({ stdin: { contents: code, resolveDir: process.cwd(), sourcefile: 'novel-tool.js' }, bundle: true, platform: 'neutral', format: 'esm', write: false, logLevel: 'silent' });
    const registered = await s.tools.runtime.register(environment, manifest, { entry: 'plugin.js', modules: { 'plugin.js': output.outputFiles[0].text } }, true);
    assert.equal(registered.ok, true, JSON.stringify(s.session.snapshot().kernel.diagnostics)); await flush();
    const view = () => s.surface.querySelector('.lm-declarative-view');
    assert.ok(view().closest('.lm-active-screen')); assert.equal(view().closest('.lm-root').style.backgroundColor, 'transparent');
    assert.match(view().textContent, /Novel tool count: 0; No host DOM: undefined/);
    [...view().querySelectorAll('button')].find(button => button.textContent === 'Increment').click(); await flush(); assert.match(view().textContent, /count: 1/);
    [...view().querySelectorAll('button')].find(button => button.textContent === 'Fail action').click(); await flush();
    assert.equal(s.session.snapshot().phase, 'running');
    assert.ok(s.logs.some(([level, , , details]) => level === 'error' && details?.error?.cause?.message === 'Guest action failed'));
    view().querySelector('[role=combobox]').click(); await flush(); assert.equal(view().querySelectorAll('[role=option]').length, 2);
    [...view().querySelectorAll('[role=option]')].find(option => option.textContent.includes('Second')).click(); await flush(); assert.match(view().querySelector('[role=combobox]').textContent, /Second/);
    const drawing = view().querySelector('svg[aria-label="Novel graph"]');
    drawing.dispatchEvent(new s.dom.window.MouseEvent('pointerdown', { bubbles: true, clientX: 4, clientY: 5 })); await flush(); assert.match(view().textContent, /Data only: true/);
    const key = new s.dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }); drawing.dispatchEvent(key); assert.equal(key.defaultPrevented, false);
    drawing.dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); await flush(); assert.match(view().textContent, /count: 2/);
    for (const preset of ['windows-xp', 'windows-xp-dark', 'monochrome']) { s.tools.themes.select(`lunaris.base-theme-engine.${preset}`); await flush(); assert.equal(view().closest('.lm-root').style.backgroundColor, 'transparent'); }
    assert.equal((await s.tools.runtime.disable(environment, manifest.id)).ok, true); await flush(); assert.equal(view(), null);
  } finally { await s.stop(); }
});
