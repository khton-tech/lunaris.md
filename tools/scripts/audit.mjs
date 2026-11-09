import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { dependencies, packagePath, checkBoundaries } from './boundaries.mjs';

try {
  const files = [...(await readdir('DOCS', { recursive: true })).filter(name => name.endsWith('.md')).map(name => path.join('DOCS', name)), 'README.md', 'AGENTS.md'];
  for (const filename of files) {
    const source = await readFile(filename, 'utf8');
    for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      let target = match[1].replace(/^<|>$/g, '').split('#')[0];
      if (!target || /^(https?:|mailto:|plugin:|app:)/.test(target)) continue;
      target = decodeURIComponent(target);
      await stat(path.resolve(path.dirname(filename), target));
    }
  }
  if (!process.argv.includes('--docs-only')) {
    await checkBoundaries(Object.keys(dependencies));
    for (const scope of Object.keys(dependencies)) {
      const root = packagePath(scope);
      const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
      assert.equal(pkg.private, true, `${scope} must remain private until separate publishing authorization`);
      const expectedExports = scope === 'web' ? [] : scope === 'application-host'
        ? ['.', './session', './slots', './view', './scheduler', './shell.css']
        : scope === 'mantine-components' ? ['.', './styles.css'] : ['.'];
      assert.deepEqual(Object.keys(pkg.exports ?? {}), expectedExports, `${scope} public exports changed`);
      for (const [subpath, target] of Object.entries(pkg.exports ?? {})) {
        if (typeof target === 'string') await stat(path.join(root, target));
        else {
          await stat(path.join(root, target.types));
          await import(subpath === '.' ? pkg.name : pkg.name + subpath.slice(1));
        }
      }
      if (scope === 'web') {
        // The browser executable is bootstrapped by HTML, not imported by Node.
        await stat(path.join(root, 'index.html'));
        await stat(path.join(root, 'dist/bootstrap.js'));
      } else {
        for (const subpath of ['src/index.js', 'dist/index.js', 'package.json']) {
          await assert.rejects(import(`${pkg.name}/${subpath}`), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
        }
      }
      for (const name of Object.keys(pkg.dependencies ?? {})) {
        if (name.startsWith('@lunaris/')) assert.ok(dependencies[scope].some(dep => name === `@lunaris/${dep}`), `${scope} has undeclared architecture dependency ${name}`);
      }
    }
    const errors = await readFile('packages/sdk/src/errors.ts', 'utf8');
    const reference = await readFile('DOCS/reference/core-boundary.md', 'utf8');
    for (const [, code] of errors.matchAll(/"([A-Z][A-Z_]+)"/g)) assert.ok(reference.includes(`\`${code}\``), `Undocumented error code ${code}`);
  }
  console.log(`Audit passed: ${files.length} documentation files; ${process.argv.includes('--docs-only') ? 'local links' : 'public exports, dependency boundaries, diagnostics and local links'}.`);
} catch (error) { console.error(`Audit failed: ${error.message}`); process.exitCode = 1; }
