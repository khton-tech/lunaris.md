import { spawnSync } from 'node:child_process';
import { checkEnvironment } from './environment.mjs';
import { checkBoundaries, dependencies } from './boundaries.mjs';
function run(args, label) {
  const result=spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:8*1024*1024});
  if(result.error||result.status!==0)throw Error(`${label}: ${result.error?.message ?? result.stdout+result.stderr}`);
  return result.stdout;
}
try {
  checkEnvironment();run(['node_modules/typescript/bin/tsc','-b','hosts/application','hosts/tauri','packages/test'],'Build');
  await checkBoundaries(Object.keys(dependencies));
  for(const path of ['packages/external-links','packages/backlinks','plugins/systems/external-links','plugins/systems/driver/browser-links','plugins/systems/driver/tauri-links','plugins/UI/document-links'])
    run(['node_modules/typescript/bin/tsc','-p',path+'/test/tsconfig.json'],'Type fixtures');
  const output=run(['--test','--test-reporter=tap',
    'plugins/systems/external-links/test/links.test.mjs','plugins/systems/backlink-index/test/anchor.test.mjs',
    'plugins/systems/backlink-index/test/markdown.test.mjs','plugins/systems/backlink-index/test/index.test.mjs',
    'plugins/UI/text-editor/test/integration.test.mjs','plugins/UI/text-editor/test/document-content.test.mjs',
    'hosts/application/test/product-startup.test.mjs','hosts/application/test/preparation.test.mjs',
  ],'Link navigation tests');
  const passed=Number(output.match(/^# pass (\d+)$/m)?.[1]??0);
  if(Number(output.match(/^# skipped (\d+)$/m)?.[1]??0))throw Error('Required tests were skipped.');
  console.log(`Link navigation checks passed: ${passed} tests; build, SDK fixtures and dependency boundaries. Native opener acceptance remains manual.`);
}catch(error){console.error(`Link navigation checks failed: ${error.message}`);process.exitCode=1;}
