import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { checkEnvironment } from './environment.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function developmentConfig(config, origin = 'http://127.0.0.1:3101', apiPort = 3100) {
  return Object.freeze({ ...config, host: '127.0.0.1', port: apiPort, publicOrigin: origin });
}

/** Serialize restarts so two processes never acquire the metadata lock together. */
export function restartQueue(restart, failed) {
  let pending = false; let running = false; let closed = false;
  const drain = async () => {
    if (running || closed) return;
    running = true;
    try { while (pending && !closed) { pending = false; await restart(); } }
    catch (error) { failed(error); }
    finally { running = false; }
  };
  return { request() { if (!closed) { pending = true; void drain(); } }, close() { closed = true; pending = false; } };
}

export async function serveApi(serverRoot, configFile, origin, apiPort) {
  const { loadConfig } = await import(pathToFileURL(path.join(serverRoot, 'src/config.mjs')).href);
  const { startApplication } = await import(pathToFileURL(path.join(serverRoot, 'src/application.mjs')).href);
  const app = await startApplication(developmentConfig(loadConfig(configFile), origin, apiPort));
  let closing;
  const disconnect = () => { if (process.connected) process.disconnect(); };
  const close = () => closing ??= app.close().then(disconnect);
  process.on('message', message => { if (message === 'stop') void close().catch(() => { process.exitCode = 1; disconnect(); }); });
  process.on('disconnect', () => { void close(); });
  process.on('SIGTERM', () => { void close(); }); process.on('SIGINT', () => { void close(); });
  process.send?.('ready');
}

export async function develop(serverRoot = path.resolve(repository, '../lunaris-server'), configFile = path.join(serverRoot, 'server.local.json'),
  { report = message => process.stdout.write(`[server-dev] ${message}\n`), apiPort = 3100, webPort = 3101 } = {}) {
  checkEnvironment();
  for (const filename of ['src/application.mjs', 'node_modules/@lunaris/sdk/package.json']) {
    if (!fs.existsSync(path.join(serverRoot, filename))) throw Error('Install the sibling server dependencies first: cd ../lunaris-server && npm ci.');
  }
  if (!fs.existsSync(configFile)) throw Error('Create server.local.json from server.example.json first. Existing data and policy are preserved.');
  const { createServer } = await import('vite');
  const vite = await createServer({ root: path.join(repository, 'hosts/web'), configFile: path.join(repository, 'hosts/web/vite.config.ts'),
    clearScreen: false, logLevel: 'warn', server: { host: '127.0.0.1', port: webPort, strictPort: true, proxy: { '/api': `http://127.0.0.1:${apiPort}` } } });
  const webOrigin = `http://127.0.0.1:${webPort}`;
  let api; let compiler; let closing = false; let timer; let compiled = false; let buildOutput = ''; const watchers = [];
  async function stopApi() {
    const old = api; api = undefined;
    if (!old || old.exitCode !== null || old.signalCode !== null) return;
    await new Promise(resolve => {
      const deadline = setTimeout(() => old.kill(), 6000);
      old.once('exit', () => { clearTimeout(deadline); resolve(); });
      if (old.connected) old.send('stop', () => {}); else old.kill();
    });
  }
  const queue = restartQueue(async () => {
    await stopApi(); if (closing) return;
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--api', serverRoot, configFile, webOrigin, String(apiPort)], {
      cwd: serverRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    api = child;
    // Product logs remain available, but compiler rebuild chatter is summarized.
    child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr);
    child.on('error', error => { report(`API process failed: ${error.message}`); });
    child.on('exit', (code, signal) => { if (api === child && !closing) report(`API stopped (${signal ?? code}); fix the error and save a source file to retry.`); });
    await new Promise((resolve, reject) => {
      const ready = message => { if (message === 'ready') { child.off('message', ready); resolve(); } };
      child.on('message', ready); child.once('error', reject);
      child.once('exit', code => { if (code !== 0) reject(Error(`API startup failed (${code}).`)); else resolve(); });
    });
    if (!closing && api === child) report(`API ready: http://127.0.0.1:${apiPort}; browser: ${webOrigin}.`);
  }, error => report(error.message));
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { if (compiled) queue.request(); }, 200); };
  async function close() {
    if (closing) return; closing = true; queue.close(); clearTimeout(timer);
    for (const watcher of watchers) watcher.close();
    if (compiler && compiler.exitCode === null && compiler.signalCode === null) {
      await new Promise(resolve => { compiler.once('exit', resolve); compiler.kill(); });
    }
    await stopApi(); await vite.close();
    process.off('SIGINT', shutdown); process.off('SIGTERM', shutdown);
    report('Stopped; source checkouts, configuration and Vault files were preserved.');
  }
  const shutdown = () => { void close(); };
  try {
    await vite.listen();
    for (const directory of ['src', 'plugins']) watchers.push(fs.watch(path.join(serverRoot, directory), { recursive: true }, schedule));
    watchers.push(fs.watch(path.dirname(configFile), (_, filename) => { if (filename === path.basename(configFile)) schedule(); }));
    compiler = spawn(process.execPath, ['node_modules/typescript/bin/tsc', '-b', 'hosts/web', '--watch', '--pretty', 'false', '--locale', 'en'], {
      cwd: repository, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    compiler.stdout.on('data', data => {
      buildOutput += data.toString(); const lines = buildOutput.split(/\r?\n/); buildOutput = lines.pop();
      for (const line of lines) {
        if (/Starting (compilation|incremental compilation)/.test(line)) { compiled = false; report('Compiling shared client/server dependencies...'); }
        else if (/Found 0 errors\. Watching for file changes\./.test(line)) { compiled = true; schedule(); }
        else if (/error TS\d+/.test(line)) report(line.trim());
      }
    });
    compiler.stderr.pipe(process.stderr);
    compiler.on('error', error => { report(error.message); process.exitCode = 1; void close(); });
    compiler.on('exit', code => { if (!closing) { report(`Compiler stopped (${code}).`); process.exitCode = 1; void close(); } });
    process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
    report('Watching main Lunaris and server sources. Browser HMR and API restarts are automatic.');
  } catch (error) { await close(); throw error; }
  return { close };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === '--api') await serveApi(process.argv[3], process.argv[4], process.argv[5], Number(process.argv[6]));
    else if (process.argv[2] === '--help') process.stdout.write('Usage: npm run dev:server [-- SERVER_DIRECTORY CONFIG_FILE]\nWatches shared TypeScript, serves browser on 3101 and restarts the API on 3100.\n');
    else await develop(process.argv[2] && path.resolve(process.argv[2]), process.argv[3] && path.resolve(process.argv[3]));
  } catch (error) { process.stderr.write(`Server development failed: ${error.message}\n`); process.exitCode = 1; }
}
