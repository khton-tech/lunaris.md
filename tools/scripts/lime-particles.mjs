import { mkdtemp, readFile, realpath, rm, writeFile, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { command, npmCliPath, prepareEmbeddedToolchain } from "./plugin-toolchain.mjs";

const temporary = await realpath(tmpdir());
const prefix = path.join(temporary, "lunaris-particles-");
const root = await mkdtemp(prefix);
try {
  const npm = await npmCliPath();
  await prepareEmbeddedToolchain({ output: root });
  const install = [npm, "install", "--ignore-scripts", "--no-audit", "--no-fund", "--offline"];
  await command(install, root);
  const cli = path.join(root, "node_modules/@lunaris/cli/dist/bin.js");
  const project = path.join(root, "project");
  await command([cli, "create-plugin", project, "--id", "example.deletion-particles"], root);
  await command([cli, "add-contract", "@lunaris/editor"], project);
  await command(install, project);
  const example = new URL("../../examples/deletion-particles/", import.meta.url);
  await copyFile(new URL("manifest.json", example), path.join(project, "manifest.json"));
  await writeFile(path.join(project, "src/plugin.ts"), await readFile(new URL("plugin.ts", example)));
  await command([npm, "run", "check"], project);
  const output = fileURLToPath(new URL("../../dist/lime-examples/", import.meta.url));
  await mkdir(output, { recursive: true });
  const archive = path.join(project, "deletion-particles.lup");
  await command([cli, "pack", project, archive], project);
  const preview = JSON.parse(await command([cli, "inspect-package", archive], project));
  assert.equal(preview.pluginId, "example.deletion-particles");
  await copyFile(archive, path.join(output, "deletion-particles.lup"));
  process.stdout.write("External deletion-particles plugin built and inspected: dist/lime-examples/deletion-particles.lup\n");
} catch (error) {
  process.stderr.write(`Deletion particles build failed: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  if (!path.resolve(root).startsWith(prefix)) throw Error("Unsafe temporary cleanup path.");
  await rm(root, { recursive: true, force: true });
}
