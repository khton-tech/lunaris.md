import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import { createLinkResolver } from '../../plugins/systems/backlink-index/dist/src/markdown.js';

const paths = Array.from({ length: 2000 }, (_, index) => `folder${index % 50}/Note${index}.md`);
const links = paths.map((path, index) => ({
  destination: index % 2 ? path : path.slice(path.lastIndexOf('/') + 1), wiki: true,
}));

try {
  const samples = [];
  for (let round = 0; round < 6; round++) {
    const start = performance.now();
    const resolve = createLinkResolver(paths);
    const indexed = performance.now();
    for (let index = 0; index < links.length; index++) {
      assert.equal(resolve(links[index], 'folder0/source.md'), paths[index]);
    }
    samples.push({ buildMs: +(indexed - start).toFixed(3), totalMs: +(performance.now() - start).toFixed(3) });
  }
  const report = { node: process.version, paths: paths.length, lookups: links.length, samples };
  if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n');
  console.log(`Note links benchmark: ${paths.length} paths, ${links.length} verified lookups; total ms ${samples.map(sample => sample.totalMs).join(', ')}.`);
} catch (error) {
  console.error(`Note links benchmark failed: ${error.message}`);
  process.exitCode = 1;
}
