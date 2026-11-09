import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dependencies, packagePath } from './boundaries.mjs';
import { hasServer } from './server-check.mjs';

export function selectScopes(files) {
  if (files.some(file => /^(package(-lock)?\.json|tsconfig[^/]*\.json|tools\/|\.github\/)/.test(file))) return Object.keys(dependencies);
  return Object.keys(dependencies).filter(scope => files.some(file => file.startsWith(`${packagePath(scope)}/`)));
}
function execute(args) {
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stdout + result.stderr);
  if (result.stdout.trim()) console.log(result.stdout.trim());
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    let scopes = Object.keys(dependencies);
    const base = process.env.CI_BASE_SHA;
    if (base) {
      if (!/^[0-9a-f]{40}$/i.test(base)) throw new Error('Invalid CI base SHA.');
      const diff = spawnSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' });
      if (diff.status !== 0) throw new Error('Cannot determine changed files.');
      scopes = selectScopes(diff.stdout.split(/\r?\n/).filter(Boolean));
    }
    execute(['--test', '--test-reporter=dot', 'tools/scripts/ci.test.mjs']);
    if (scopes.length) execute(['tools/scripts/check.mjs', ...scopes]);
    if (scopes.length && hasServer()) execute(['tools/scripts/server-check.mjs']);
    else if (scopes.length) {
      if (process.env.LUNARIS_SERVER_REQUIRED === '1') throw new Error('Server integration is required but the sibling server checkout is missing.');
      console.log('Server integration was not run: no sibling lunaris-server checkout. Use npm run server:check with both repositories.');
    }
    execute(['tools/scripts/audit.mjs', ...(scopes.length ? [] : ['--docs-only'])]);
    console.log(`CI passed: ${scopes.join(', ') || 'documentation only'} (affected consumers included by check).`);
  } catch (error) { console.error(`CI failed: ${error.message}`); process.exitCode = 1; }
}
