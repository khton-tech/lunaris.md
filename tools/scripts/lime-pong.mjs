import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { command } from "./plugin-toolchain.mjs";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const example = "examples/pong-notification";
const directory = path.join(repository, "dist/lime-examples");
const output = path.join(directory, "pong-notification.lup");
const temporary = path.join(directory, `.pong-${randomUUID()}.lup`);
const compiler = "node_modules/typescript/bin/tsc";
const cli = "packages/cli/dist/bin.js";

try {
  await command([compiler, "-b", "packages/cli", "packages/test", "hosts/tauri"], repository);
  await command([compiler, "-p", example], repository);
  await mkdir(directory, { recursive: true });
  await command([cli, "pack", example, temporary], repository);
  const preview = JSON.parse(await command([cli, "inspect-package", temporary], repository));
  assert.equal(preview.pluginId, "example.pong-notification");
  await command(["--test", "--test-timeout=15000", `${example}/test/package.test.mjs`], repository,
    { ...process.env, LUNARIS_PONG_LUP: temporary });
  await rename(temporary, output);
  console.log("Pong package built, inspected and verified in the plugin runtime: dist/lime-examples/pong-notification.lup");
} catch (error) {
  console.error(`Pong packaging failed: ${error.message.trim().slice(-3000)}`);
  process.exitCode = 1;
} finally {
  await rm(temporary, { force: true });
}
