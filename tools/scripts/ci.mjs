import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dependencies, packagePath } from './boundaries.mjs';

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
    execute(['tools/scripts/audit.mjs', ...(scopes.length ? [] : ['--docs-only'])]);
    console.log(`CI passed: ${scopes.join(', ') || 'documentation only'} (affected consumers included by check).`);
  } catch (error) { console.error(`CI failed: ${error.message}`); process.exitCode = 1; }
}
