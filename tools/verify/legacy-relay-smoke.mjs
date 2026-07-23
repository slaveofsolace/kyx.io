#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer as createProbeServer } from 'node:net';
import { get as httpGet } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SERVER_DIR = resolve(ROOT, 'server');
const SERVER_ENTRY = resolve(SERVER_DIR, 'index.js');
const HIGH_PORT_START = 52_000;
const HIGH_PORT_SPAN = 10_000;
const STARTUP_TIMEOUT_MS = 8_000;
const REQUEST_TIMEOUT_MS = 3_000;
const SHUTDOWN_TIMEOUT_MS = 3_000;

const checks = [];
let failure = null;
let child = null;
let socket = null;

function check(condition, label, detail = '') {
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ''}`);
  checks.push(label);
}

function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => rejectPromise(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolvePromise(value);
      },
      (error) => {
        clearTimeout(timer);
        rejectPromise(error);
      },
    );
  });
}

async function canBindLoopback(port) {
  const probe = createProbeServer();
  probe.unref();

  try {
    await withTimeout(new Promise((resolvePromise, rejectPromise) => {
      probe.once('error', rejectPromise);
      probe.listen({ host: '127.0.0.1', port, exclusive: true }, resolvePromise);
    }), 1_000, `loopback port probe ${port}`);
    return true;
  } catch {
    return false;
  } finally {
    if (probe.listening) {
      await new Promise((resolvePromise) => probe.close(resolvePromise));
    }
  }
}

async function chooseDedicatedHighPort() {
  const seed = (process.pid * 131) % HIGH_PORT_SPAN;
  for (let attempt = 0; attempt < 128; attempt += 1) {
    const port = HIGH_PORT_START + ((seed + attempt * 97) % HIGH_PORT_SPAN);
    if (await canBindLoopback(port)) return port;
  }
  throw new Error('Unable to reserve a free loopback port in the dedicated high-port range.');
}

function waitForOutput(childProcess, getOutput, predicate) {
  return withTimeout(new Promise((resolvePromise, rejectPromise) => {
    const inspect = () => {
      const output = getOutput();
      if (!predicate(output)) return;
      cleanup();
      resolvePromise(output);
    };
    const exited = (code, signal) => {
      cleanup();
      rejectPromise(new Error(`relay exited before readiness (code=${code}, signal=${signal})`));
    };
    const failed = (error) => {
      cleanup();
      rejectPromise(error);
    };
    const cleanup = () => {
      childProcess.stdout.off('data', inspect);
      childProcess.stderr.off('data', inspect);
      childProcess.off('exit', exited);
      childProcess.off('error', failed);
    };

    childProcess.stdout.on('data', inspect);
    childProcess.stderr.on('data', inspect);
    childProcess.once('exit', exited);
    childProcess.once('error', failed);
    inspect();
  }), STARTUP_TIMEOUT_MS, 'legacy relay startup');
}

function requestContainmentBanner(port) {
  return withTimeout(new Promise((resolvePromise, rejectPromise) => {
    const request = httpGet({
      protocol: 'http:',
      hostname: '127.0.0.1',
      port,
      path: '/containment-smoke',
      headers: { connection: 'close' },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.once('end', () => resolvePromise({
        statusCode: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    request.once('error', rejectPromise);
  }), REQUEST_TIMEOUT_MS, 'loopback HTTP containment request');
}

function openWebSocket(WebSocket, url) {
  const client = new WebSocket(url);
  return withTimeout(new Promise((resolvePromise, rejectPromise) => {
    const opened = () => {
      cleanup();
      resolvePromise(client);
    };
    const failed = (error) => {
      cleanup();
      rejectPromise(error);
    };
    const cleanup = () => {
      client.off('open', opened);
      client.off('error', failed);
    };

    client.once('open', opened);
    client.once('error', failed);
  }), REQUEST_TIMEOUT_MS, 'direct loopback WebSocket connection');
}

function createMessageQueue(client) {
  const buffered = [];
  const waiting = [];

  function settle(item) {
    const waiterIndex = waiting.findIndex((waiter) => waiter.predicate(item));
    if (waiterIndex === -1) {
      buffered.push(item);
      return;
    }
    const [waiter] = waiting.splice(waiterIndex, 1);
    clearTimeout(waiter.timer);
    waiter.resolve(item);
  }

  client.on('message', (data) => {
    try {
      settle(JSON.parse(data.toString()));
    } catch (error) {
      for (const waiter of waiting.splice(0)) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error(`relay emitted invalid JSON: ${error.message}`));
      }
    }
  });

  client.on('error', (error) => {
    for (const waiter of waiting.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  });

  return {
    next(predicate, label) {
      const bufferedIndex = buffered.findIndex(predicate);
      if (bufferedIndex !== -1) return Promise.resolve(buffered.splice(bufferedIndex, 1)[0]);

      return new Promise((resolvePromise, rejectPromise) => {
        const waiter = {
          predicate,
          resolve: resolvePromise,
          reject: rejectPromise,
          timer: null,
        };
        waiter.timer = setTimeout(() => {
          const index = waiting.indexOf(waiter);
          if (index !== -1) waiting.splice(index, 1);
          rejectPromise(new Error(`${label} timed out after ${REQUEST_TIMEOUT_MS}ms`));
        }, REQUEST_TIMEOUT_MS);
        waiting.push(waiter);
      });
    },
  };
}

async function closeWebSocket(client) {
  if (!client || client.readyState === client.CLOSED) return;
  if (client.readyState !== client.OPEN) {
    client.terminate();
    return;
  }

  const closed = new Promise((resolvePromise) => client.once('close', resolvePromise));
  client.close(1000, 'smoke complete');
  try {
    await withTimeout(closed, 1_000, 'WebSocket close');
  } catch {
    client.terminate();
  }
}

function waitForChildExit(childProcess, timeoutMs) {
  if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
    return Promise.resolve({ code: childProcess.exitCode, signal: childProcess.signalCode });
  }
  return withTimeout(new Promise((resolvePromise) => {
    childProcess.once('exit', (code, signal) => resolvePromise({ code, signal }));
  }), timeoutMs, 'exact relay child shutdown');
}

async function terminateExactChild(childProcess) {
  if (!childProcess || childProcess.exitCode !== null || childProcess.signalCode !== null) return;

  childProcess.kill('SIGTERM');
  try {
    await waitForChildExit(childProcess, SHUTDOWN_TIMEOUT_MS);
  } catch {
    childProcess.kill('SIGKILL');
    await waitForChildExit(childProcess, SHUTDOWN_TIMEOUT_MS);
  }
}

try {
  const serverSource = await readFile(SERVER_ENTRY, 'utf8');
  check(/const\s+HOST\s*=\s*['"]127\.0\.0\.1['"]/u.test(serverSource), 'server hard-codes IPv4 loopback');
  check(/httpServer\.listen\s*\(\s*port\s*,\s*HOST\b/u.test(serverSource), 'server listen call uses the loopback constant');
  check(
    !/process\.env\s*(?:\.\s*[A-Z0-9_]*HOST\b|\[\s*['"][^'"]*HOST[^'"]*['"]\s*\])/iu.test(serverSource),
    'server exposes no environment-based host override',
  );
  check(!/process\.argv\b|--host\b/iu.test(serverSource), 'server exposes no argv host option');

  const packageJson = JSON.parse(await readFile(resolve(SERVER_DIR, 'package.json'), 'utf8'));
  const lockJson = JSON.parse(await readFile(resolve(SERVER_DIR, 'package-lock.json'), 'utf8'));
  const installedWs = JSON.parse(await readFile(resolve(SERVER_DIR, 'node_modules', 'ws', 'package.json'), 'utf8'));
  const lockedWsVersion = lockJson.packages?.['node_modules/ws']?.version;
  check(typeof packageJson.dependencies?.ws === 'string', 'ws is a direct server dependency');
  check(Boolean(lockedWsVersion), 'server lockfile pins the ws package');
  check(installedWs.version === lockedWsVersion, 'installed ws matches the server lockfile', `${installedWs.version} != ${lockedWsVersion}`);

  const require = createRequire(import.meta.url);
  const wsModule = require(resolve(SERVER_DIR, 'node_modules', 'ws'));
  const WebSocket = wsModule.WebSocket ?? wsModule;
  check(typeof WebSocket === 'function', 'smoke client loads WebSocket from server/node_modules/ws');

  const port = await chooseDedicatedHighPort();
  check(port >= HIGH_PORT_START && port < HIGH_PORT_START + HIGH_PORT_SPAN, 'test selected a dedicated high loopback port');

  let stdout = '';
  let stderr = '';
  child = spawn(process.execPath, [SERVER_ENTRY, '--host', '0.0.0.0'], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      LEGACY_RELAY_PORT: String(port),
      LEGACY_RELAY_HOST: '0.0.0.0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  const expectedEndpoint = `ws://127.0.0.1:${port}`;
  await waitForOutput(
    child,
    () => `${stdout}\n${stderr}`,
    (output) => output.includes(expectedEndpoint) && output.includes('non-authoritative; loopback only; do not expose or deploy'),
  );
  check(stdout.includes(`comparison fixture listening at ${expectedEndpoint}`), 'stdout announces the exact loopback endpoint');
  check(stdout.includes('non-authoritative; loopback only; do not expose or deploy'), 'stdout labels the relay non-authoritative and loopback-only');
  check(!stdout.includes('0.0.0.0'), 'public host argument/environment override is ignored');
  check(stderr.trim() === '', 'relay starts without stderr output', stderr.trim());

  const response = await requestContainmentBanner(port);
  check(response.statusCode === 200, 'HTTP containment endpoint returns 200', String(response.statusCode));
  check(response.headers['content-type'] === 'text/plain; charset=utf-8', 'HTTP containment endpoint is plain text');
  check(response.headers['cache-control'] === 'no-store', 'HTTP containment endpoint disables caching');
  check(response.headers['x-content-type-options'] === 'nosniff', 'HTTP containment endpoint sends nosniff');
  check(response.body === 'KYX legacy relay - loopback comparison fixture only\n', 'HTTP containment banner is exact', JSON.stringify(response.body));

  socket = await openWebSocket(WebSocket, expectedEndpoint);
  const connectedUrl = new URL(socket.url);
  check(
    connectedUrl.protocol === 'ws:'
      && connectedUrl.hostname === '127.0.0.1'
      && connectedUrl.port === String(port),
    'WebSocket client connects directly to the loopback relay',
    socket.url,
  );
  const messages = createMessageQueue(socket);

  const welcome = await messages.next((message) => message?.type === 'welcome', 'welcome message');
  check(welcome.id === 1, 'fresh relay assigns reproducible first client id 1', String(welcome.id));
  check(Number.isInteger(welcome.matchStart), 'welcome includes an integer matchStart');
  check(welcome.matchDurationMs === 8 * 60 * 1000, 'welcome declares the eight-minute legacy match duration');
  check(
    JSON.stringify(welcome.players) === JSON.stringify([{ id: 1, name: 'Recruit', kills: 0, score: 0 }]),
    'welcome roster is reproducible for one fresh client',
    JSON.stringify(welcome.players),
  );

  socket.send(JSON.stringify({ type: 'hello', name: '  Relay\u0000 Smoke  ' }));
  const joined = await messages.next((message) => message?.type === 'joined', 'hello joined message');
  const state = await messages.next((message) => message?.type === 'state', 'hello state message');
  check(JSON.stringify(joined) === JSON.stringify({ type: 'joined', name: 'Relay Smoke' }), 'hello emits a reproducibly sanitized joined message', JSON.stringify(joined));
  check(state.matchStart === welcome.matchStart, 'hello state preserves the welcome matchStart');
  check(state.matchDurationMs === welcome.matchDurationMs, 'hello state preserves the match duration');
  check(
    JSON.stringify(state.players) === JSON.stringify([{ id: 1, name: 'Relay Smoke', kills: 0, score: 0 }]),
    'hello state contains the reproducible sanitized roster',
    JSON.stringify(state.players),
  );
} catch (error) {
  failure = error;
} finally {
  try {
    await closeWebSocket(socket);
  } catch (error) {
    failure ??= error;
  }

  try {
    await terminateExactChild(child);
    if (child) {
      check(child.exitCode !== null || child.signalCode !== null, 'exact spawned relay child is terminated in finally');
    }
  } catch (error) {
    failure ??= error;
  }
}

console.log('KYX legacy relay loopback smoke test');
console.log(`Root: ${ROOT}`);
console.log('Network boundary: HTTP and WebSocket requests target 127.0.0.1 only; no external network is used.');
for (const label of checks) console.log(`PASS ${label}`);

if (failure) {
  console.error(`FAIL ${failure.stack ?? failure.message}`);
  console.log(`Summary: ${checks.length} passed, 1 failed.`);
  process.exitCode = 1;
} else {
  console.log(`Summary: ${checks.length} passed, 0 failed.`);
}
