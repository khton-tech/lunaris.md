import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { command, npmCliPath, prepareEmbeddedToolchain } from "./plugin-toolchain.mjs";

const execute = promisify(execFile);
const repository = fileURLToPath(new URL("../../", import.meta.url));
const example = path.join(repository, "examples/global-hotkey");
const temporary = await realpath(tmpdir());
const root = await mkdtemp(path.join(temporary, "lunaris-hotkey-"));
const windowsX64 = "x86_64-pc-windows-msvc";
try {
  if (process.platform !== "win32") throw new Error("Run the example build with the Windows MSVC toolchain.");
  const npm = await npmCliPath();
  await prepareEmbeddedToolchain({ output: root });
  const install = [npm, "install", "--ignore-scripts", "--no-audit", "--no-fund", "--offline"];
  await command(install, root);
  const cli = path.join(root, "node_modules/@lunaris/cli/dist/bin.js");
  const project = path.join(root, "project");
  await command([cli, "create-plugin", project, "--id", "example.global-hotkey"], root);
  await command([cli, "add-contract", "@lunaris/execution"], project);
  await command(install, project);
  await copyFile(path.join(example, "manifest.json"), path.join(project, "manifest.json"));
  for (const filename of ["plugin.ts", "contract.ts"]) {
    await copyFile(path.join(example, filename), path.join(project, "src", filename));
  }
  const binaryOutput = path.join(root, "native-target");
  await execute("cargo", [
    "build", "--locked", "--offline", "--release", "--target", windowsX64, "--target-dir", binaryOutput,
    "--manifest-path", path.join(example, "native/Cargo.toml"),
  ], { cwd: repository, windowsHide: true });
  const binary = path.join(project, "assets/bin/hotkey.exe");
  await mkdir(path.dirname(binary), { recursive: true });
  await copyFile(path.join(binaryOutput, windowsX64, "release/hotkey.exe"), binary);
  await command([npm, "run", "check"], project);
  const archive = path.join(project, "global-hotkey.lup");
  await command([cli, "pack", project, archive], project);
  const preview = JSON.parse(await command([cli, "inspect-package", archive], project));
  assert.equal(preview.pluginId, "example.global-hotkey");
  await command(["node_modules/typescript/bin/tsc", "-b", "hosts/application", "plugins/systems/driver/tauri-processes"], repository);
  await command(["--test", "--test-timeout=15000", path.join(example, "test/package.test.mjs")], repository,
    { ...process.env, LUNARIS_HOTKEY_LUP: archive, LUNARIS_HOTKEY_BINARY: binary });
  const output = path.join(repository, "dist/lime-examples");
  await mkdir(output, { recursive: true });
  await copyFile(archive, path.join(output, "global-hotkey.lup"));
  process.stdout.write("External Windows hotkey plugin built, installed in a runtime fixture and verified in probe mode: dist/lime-examples/global-hotkey.lup\n");
} catch (error) {
  process.stderr.write("Global hotkey build failed: " + (error.stderr || error.message).trim().slice(-3000) + "\n");
  process.exitCode = 1;
} finally {
  if (path.dirname(root) !== temporary || !path.basename(root).startsWith("lunaris-hotkey-")) throw Error("Unsafe temporary cleanup path.");
  await rm(root, { recursive: true, force: true });
}
