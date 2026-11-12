import { spawnSync } from 'node:child_process';
try {
  const run = args => { const r=spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:4*1024*1024,windowsHide:true}); if(r.error||r.status!==0)throw Error(r.error?.message??r.stdout+r.stderr);return r.stdout; };
  run(['node_modules/typescript/bin/tsc','-b','hosts/tauri','hosts/web','packages/test']);
  const output=run(['--test','--test-reporter=tap','plugins/systems/driver/server-transport/test/transport.test.mjs','tools/scripts/session-restore.test.mjs']);
  const passed=Number(output.match(/^# pass (\d+)/m)?.[1]);if(!passed||Number(output.match(/^# skipped (\d+)/m)?.[1]))throw Error('Required session tests were absent or skipped.');
  process.stdout.write('Session checks passed: '+passed+' tests; secure persistence, restart, origin isolation, expiry, logout and last remote Vault restoration.\n');
}catch(error){process.stderr.write('Session checks failed: '+error.message+'\n');process.exitCode=1;}
