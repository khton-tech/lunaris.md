import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestKernel } from '@lunaris/test';
import { definePlugin } from '@lunaris/sdk';
import { Logger } from '@lunaris/logging';
import { ExternalLinks, externalUrl } from '@lunaris/external-links';
import { createBrowserLinks } from '@lunaris/browser-links';
import { createTauriLinks } from '@lunaris/tauri-links';
import provider from '../dist/src/index.js';

async function setup(driver) {
  const kernel = createTestKernel(); let api;
  kernel.installMock(Logger, Object.fromEntries(['log','debug','info','warn','error'].map(name => [name, () => true])));
  kernel.register(driver); kernel.register(provider);
  kernel.register(definePlugin({manifest:{manifestVersion:1,id:'test.consumer',version:'0.1.0',engine:'^0.1.0',sdk:'^0.1.0',entry:'./index.js',provides:[],requires:[{kind:'api',id:ExternalLinks.id,range:'^1.0.0'}],permissions:['links.open'],optionalPermissions:[]},activate(ctx){api=ctx.use(ExternalLinks);}}));
  kernel.grant(driver.manifest.id,'links.native'); kernel.grant(provider.manifest.id,'links.open'); kernel.grant('test.consumer','links.open');
  await kernel.start('test.consumer');
  return {api,async stop(){await kernel.stopAll();kernel.assertNoResources();}};
}
test('external URL policy allows web/mail/phone and rejects executable/file schemes', () => {
  for (const url of ['https://example.com/path?q=a#part','http://example.com','mailto:a@example.com','tel:+123']) assert.ok(externalUrl(url));
  for (const url of ['javascript:alert(1)','data:text/html,test','file:///C:/secret','https://name:password@example.com','https://example.com\n','../note.md']) assert.equal(externalUrl(url),null);
});
test('browser dispatch retains the user gesture and never exposes an opener', async () => {
  const calls=[]; const s=await setup(createBrowserLinks({open(...args){calls.push(args);return null;}}));
  try {
    const pending=s.api.open('https://example.com');assert.equal(calls.length,1);
    assert.equal((await pending).ok,true);assert.deepEqual(calls[0],['https://example.com/','_blank','noopener,noreferrer']);
    assert.equal((await s.api.open('javascript:alert(1)')).error.code,'INVALID_URL');assert.equal(calls.length,1);
  }finally{await s.stop();}
});
test('desktop opens through the native port and reports native failures', async () => {
  const calls=[];const s=await setup(createTauriLinks(async url=>{calls.push(url);if(calls.length===2)throw Error('native opener failed');}));
  try {assert.equal((await s.api.open('https://example.com')).ok,true);assert.equal((await s.api.open('https://example.org')).error.code,'FAILED');assert.equal(calls.length,2);}
  finally{await s.stop();}
});
