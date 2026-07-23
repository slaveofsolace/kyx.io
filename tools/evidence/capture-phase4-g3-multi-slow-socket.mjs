import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { WebSocket } from 'ws';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCE_ROOT = path.join(
  REPO_ROOT,
  'evidence/2026-07-22/phase-4-g3-multi-slow-socket',
);
const DEFAULT_RUN = path.join(EVIDENCE_ROOT, 'runs/local-v1');
const AUTHORITY_ORIGIN = 'http://127.0.0.1:8787';
const ALLOWED_ORIGIN = 'http://127.0.0.1:5173';
const STALLED_CLIENT_COUNT = 4;
const MAX_SNAPSHOT_ACK_DEBT_MILLISECONDS = 3_000;
const MINIMUM_PINGS_PER_STALLED_CLIENT = 8;
const SOURCE_FILES = Object.freeze([
  'worker/transport-limits.json',
  'worker/security.ts',
  'worker/room.ts',
  'src/net/protocol.ts',
  'src/net/schemas.ts',
  'tools/evidence/capture-phase4-g3-multi-slow-socket.mjs',
  'tools/evidence/verify-phase4-g3-multi-slow-socket.mjs',
  'wrangler.jsonc',
  'package-lock.json',
]);

function argument(name, fallback) {
  const indexes = process.argv.flatMap((value, index) => value === name ? [index] : []);
  if (indexes.length > 1) throw new Error(`${name} may be provided at most once.`);
  if (indexes.length === 0) return fallback;
  const value = process.argv[indexes[0] + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} requires a path.`);
  return value;
}

function containedRunPath(value) {
  const runsRoot = path.join(EVIDENCE_ROOT, 'runs');
  const resolved = path.resolve(REPO_ROOT, value);
  const relative = path.relative(runsRoot, resolved);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`--output must be a child of ${path.relative(REPO_ROOT, runsRoot)}.`);
  }
  return resolved;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function sameJson(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

async function waitUntil(predicate, label, timeoutMilliseconds = 15_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMilliseconds) {
    const value = await predicate();
    if (value) return value;
    await delay(20);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function isPortOpen(port) {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const finish = (open) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(500);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

function startService(argumentsList) {
  const child = spawn(process.execPath, argumentsList, {
    cwd: REPO_ROOT,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const records = [];
  const capture = (stream, chunk) => records.push({
    at: new Date().toISOString(),
    stream,
    text: chunk.toString('utf8'),
  });
  child.stdout.on('data', (chunk) => capture('stdout', chunk));
  child.stderr.on('data', (chunk) => capture('stderr', chunk));
  return { child, records, command: [process.execPath, ...argumentsList] };
}

async function stopService(service) {
  if (service.child.exitCode !== null || service.child.signalCode !== null) return;
  service.child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => service.child.once('exit', resolve)),
    delay(4_000),
  ]);
  if (service.child.exitCode === null && service.child.signalCode === null) {
    service.child.kill('SIGKILL');
  }
}

async function waitForHttp(url, label, timeoutMilliseconds = 30_000) {
  const startedAt = Date.now();
  let lastError = 'not attempted';
  while (Date.now() - startedAt < timeoutMilliseconds) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) return response;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(100);
  }
  throw new Error(`${label} did not become ready: ${lastError}`);
}

async function createRoom() {
  const response = await fetch(`${AUTHORITY_ORIGIN}/api/rooms/create`, {
    method: 'POST',
    headers: { Origin: ALLOWED_ORIGIN },
    cache: 'no-store',
  });
  const body = await response.json();
  if (response.status !== 201 || body.ok !== true) {
    throw new Error(`Room creation failed: HTTP ${response.status}`);
  }
  return body;
}

async function roomMetrics(room) {
  const response = await fetch(`${AUTHORITY_ORIGIN}${room.metricsPath}`, {
    headers: { Origin: ALLOWED_ORIGIN },
    cache: 'no-store',
  });
  const body = await response.json();
  if (!response.ok || body.ok !== true) {
    throw new Error(`Room metrics failed for ${room.roomCode}: HTTP ${response.status}`);
  }
  return body.metrics;
}

async function waitForMetrics(room, predicate, label) {
  return await waitUntil(async () => {
    const metrics = await roomMetrics(room);
    return predicate(metrics) ? metrics : false;
  }, label);
}

async function fileRecord(absolute) {
  const bytes = await readFile(absolute);
  const details = await stat(absolute);
  return {
    path: path.relative(REPO_ROOT, absolute).replaceAll('\\', '/'),
    bytes: details.size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

async function recursiveFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await recursiveFiles(absolute));
    else if (entry.isFile()) result.push(absolute);
  }
  return result;
}

async function sourceInventory() {
  return await Promise.all(SOURCE_FILES.map((relative) => fileRecord(path.join(REPO_ROOT, relative))));
}

async function artifactInventory(runRoot, evidencePath) {
  return await Promise.all((await recursiveFiles(runRoot))
    .filter((absolute) => absolute !== evidencePath)
    .sort()
    .map(fileRecord));
}

async function startPausingProxy(resources) {
  const sessions = [];
  const serverErrors = [];
  const server = net.createServer((downstream) => {
    const session = {
      index: sessions.length,
      connectedAt: new Date().toISOString(),
      downstream,
      upstream: null,
      clientToServerBytes: 0,
      serverToClientBytes: 0,
      clientToServerChunks: 0,
      serverToClientChunks: 0,
      pauseStartedAt: null,
      pauseCompletedAt: null,
      pauseDurationMilliseconds: null,
      clientToServerBytesAtPause: null,
      clientToServerBytesBeforeResume: null,
      serverToClientBytesAtPause: null,
      serverToClientBytesBeforeResume: null,
      serverToClientBytesAfterResume: null,
      upstreamWasPaused: false,
      errors: [],
    };
    sessions.push(session);
    downstream.setNoDelay(true);
    const upstream = net.createConnection({ host: '127.0.0.1', port: 8787 });
    upstream.setNoDelay(true);
    session.upstream = upstream;
    downstream.on('data', (chunk) => {
      session.clientToServerBytes += chunk.length;
      session.clientToServerChunks += 1;
    });
    upstream.on('data', (chunk) => {
      session.serverToClientBytes += chunk.length;
      session.serverToClientChunks += 1;
    });
    downstream.on('error', (error) => session.errors.push({
      at: new Date().toISOString(), endpoint: 'downstream', message: error.message,
    }));
    upstream.on('error', (error) => session.errors.push({
      at: new Date().toISOString(), endpoint: 'upstream', message: error.message,
    }));
    downstream.pipe(upstream);
    upstream.pipe(downstream);
  });
  server.on('error', (error) => serverErrors.push({
    at: new Date().toISOString(), message: error.message,
  }));
  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(0, '127.0.0.1');
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Proxy has no TCP port.');
  const proxy = {
    port: address.port,
    sessions,
    serverErrors,
    server,
    stopped: false,
    pause(session) {
      if (session.upstream === null) throw new Error('Proxy session has no upstream.');
      session.pauseStartedAt = new Date().toISOString();
      session.clientToServerBytesAtPause = session.clientToServerBytes;
      session.serverToClientBytesAtPause = session.serverToClientBytes;
      session.upstream.pause();
      session.upstreamWasPaused = session.upstream.isPaused();
    },
    resume(session) {
      if (session.upstream === null) throw new Error('Proxy session has no upstream.');
      session.clientToServerBytesBeforeResume = session.clientToServerBytes;
      session.serverToClientBytesBeforeResume = session.serverToClientBytes;
      session.upstream.resume();
      session.pauseCompletedAt = new Date().toISOString();
      session.pauseDurationMilliseconds = Date.parse(session.pauseCompletedAt)
        - Date.parse(session.pauseStartedAt);
    },
    async stop() {
      if (proxy.stopped) return;
      proxy.stopped = true;
      for (const session of sessions) {
        session.upstream?.destroy();
        session.downstream.destroy();
      }
      if (!server.listening) return;
      await new Promise((resolve) => server.close(resolve));
    },
  };
  resources.proxy = proxy;
  return proxy;
}

function socketUrl(room, port = 8787) {
  return `ws://127.0.0.1:${port}${room.socketPath}`;
}

function reliableEventSequence(id) {
  if (id === null) return 0;
  return Number(/^event\.([1-9][0-9]*)$/u.exec(id)?.[1] ?? 0);
}

async function makeProbe(resources, { label, url, autoAck }) {
  const socket = new WebSocket(url, { headers: { Origin: ALLOWED_ORIGIN } });
  const probe = {
    label,
    url,
    socket,
    autoAck,
    messages: [],
    sent: [],
    errors: [],
    baselineId: null,
    baselineTick: null,
    lastEventId: null,
    lastEventSequence: 0,
    close: null,
    closed: null,
  };
  probe.closed = new Promise((resolve) => {
    socket.once('close', (code, reason) => {
      probe.close = { code, reason: reason.toString('utf8') };
      resolve(probe.close);
    });
  });
  probe.send = (message) => {
    if (socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    probe.sent.push({ at: new Date().toISOString(), message });
    return true;
  };
  probe.sendAck = () => {
    if (probe.baselineId === null || probe.baselineTick === null) return false;
    return probe.send({
      protocolVersion: 2,
      type: 'ack',
      snapshotBaselineVersion: 1,
      reliableEventStreamVersion: 1,
      snapshotBaselineId: probe.baselineId,
      serverTick: probe.baselineTick,
      lastEventId: probe.lastEventId,
    });
  };
  socket.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data.toString('utf8'));
    } catch (error) {
      probe.errors.push({
        at: new Date().toISOString(),
        kind: 'decode',
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    probe.messages.push({ at: new Date().toISOString(), message });
    if (message.type === 'fullSnapshot' || message.type === 'deltaSnapshot') {
      probe.baselineId = message.snapshotBaselineId;
      probe.baselineTick = message.serverTick;
      if (message.type === 'fullSnapshot') {
        probe.lastEventId = message.reliableEventBaselineId;
        probe.lastEventSequence = reliableEventSequence(message.reliableEventBaselineId);
      }
      if (probe.autoAck) probe.sendAck();
    } else if (message.type === 'reliableEventBatch') {
      for (const reliableEvent of message.events) {
        const sequence = reliableEventSequence(reliableEvent.id);
        if (sequence > probe.lastEventSequence) {
          probe.lastEventSequence = sequence;
          probe.lastEventId = reliableEvent.id;
        }
      }
      if (probe.autoAck) probe.sendAck();
    }
  });
  socket.on('error', (error) => probe.errors.push({
    at: new Date().toISOString(), kind: 'socket', message: error.message,
  }));
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${label} socket open timed out.`)), 10_000);
    socket.once('open', () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
  resources.probes.push(probe);
  return probe;
}

async function waitForMessage(probe, predicate, label, timeoutMilliseconds = 10_000) {
  return await waitUntil(() => {
    const found = probe.messages.find(({ message }) => predicate(message));
    return found ?? false;
  }, `${probe.label} ${label}`, timeoutMilliseconds);
}

async function joinProbe(probe, room, requestId, displayName) {
  await waitForMessage(probe, ({ type }) => type === 'welcome', 'welcome');
  probe.send({
    protocolVersion: 2,
    type: 'joinRoom',
    requestId,
    roomCode: room.roomCode,
    displayName,
  });
  const accepted = await waitForMessage(
    probe,
    (message) => message.type === 'joinAccepted' && message.requestId === requestId,
    'joinAccepted',
  );
  const full = await waitForMessage(
    probe,
    (message) => message.type === 'fullSnapshot'
      && message.localReconciliation?.player?.id === accepted.message.playerId,
    'initial fullSnapshot',
  );
  return { accepted: accepted.message, full: full.message };
}

async function closeProbe(probe) {
  if (probe.socket.readyState === WebSocket.OPEN) probe.socket.close(1000, 'evidence cleanup');
  if (probe.socket.readyState === WebSocket.CLOSED) return probe.close;
  await Promise.race([probe.closed, delay(1_000)]);
  if (probe.socket.readyState !== WebSocket.CLOSED) probe.socket.terminate();
  return probe.close;
}

function probeSummary(probe) {
  const messageCounts = {};
  for (const { message } of probe.messages) {
    messageCounts[message.type] = (messageCounts[message.type] ?? 0) + 1;
  }
  return {
    label: probe.label,
    url: probe.url,
    readyState: probe.socket.readyState,
    messageCounts,
    messagesReceived: probe.messages.length,
    messagesSent: probe.sent.length,
    decodeOrSocketErrors: probe.errors,
    latestBaselineId: probe.baselineId,
    latestBaselineTick: probe.baselineTick,
    latestEventId: probe.lastEventId,
    close: probe.close,
  };
}

function proxySessionSummary(proxy, session) {
  return {
    proxyPort: proxy.port,
    sessionIndex: session.index,
    protocol: 'real-node-tcp-byte-relay',
    connectedAt: session.connectedAt,
    clientToServerBytes: session.clientToServerBytes,
    serverToClientBytes: session.serverToClientBytes,
    clientToServerChunks: session.clientToServerChunks,
    serverToClientChunks: session.serverToClientChunks,
    pauseStartedAt: session.pauseStartedAt,
    pauseCompletedAt: session.pauseCompletedAt,
    pauseDurationMilliseconds: session.pauseDurationMilliseconds,
    clientToServerBytesAtPause: session.clientToServerBytesAtPause,
    clientToServerBytesBeforeResume: session.clientToServerBytesBeforeResume,
    serverToClientBytesAtPause: session.serverToClientBytesAtPause,
    serverToClientBytesBeforeResume: session.serverToClientBytesBeforeResume,
    serverToClientBytesAfterResume: session.serverToClientBytesAfterResume,
    upstreamWasPaused: session.upstreamWasPaused,
    sessionErrors: session.errors,
    serverErrors: proxy.serverErrors,
  };
}

async function runScenario(resources) {
  const room = await createRoom();
  const metricsInitial = await roomMetrics(room);
  const proxy = await startPausingProxy(resources);
  const stalledRecords = [];
  for (let index = 0; index < STALLED_CLIENT_COUNT; index += 1) {
    const probe = await makeProbe(resources, {
      label: `stalled-proxied-client-${index + 1}`,
      url: socketUrl(room, proxy.port),
      autoAck: false,
    });
    const joined = await joinProbe(
      probe,
      room,
      `request.multi-slow.stalled-${index + 1}`,
      `Multi Slow ${index + 1}`,
    );
    const session = await waitUntil(
      () => proxy.sessions[index] ?? false,
      `proxy session ${index + 1}`,
    );
    proxy.pause(session);
    const pingTimer = setInterval(() => {
      probe.send({
        protocolVersion: 2,
        type: 'ping',
        nonce: probe.sent.filter(({ message }) => message.type === 'ping').length,
        clientTick: probe.baselineTick ?? 0,
      });
    }, 250);
    resources.pingTimers.push(pingTimer);
    stalledRecords.push({ probe, joined, session, pingTimer });
  }

  const healthy = await makeProbe(resources, {
    label: 'healthy-direct-peer',
    url: socketUrl(room),
    autoAck: true,
  });
  const healthyJoin = await joinProbe(
    healthy,
    room,
    'request.multi-slow.healthy',
    'Multi Slow Healthy',
  );
  const metricsPaused = await roomMetrics(room);
  const metricsEvicted = await waitForMetrics(
    room,
    ({ connectedPlayers, transport }) => (
      connectedPlayers === 1
      && transport.snapshotAckDebtEvictions === STALLED_CLIENT_COUNT
      && transport.slowConsumerEvictions === STALLED_CLIENT_COUNT
    ),
    'all stalled clients to be evicted while healthy peer remains',
  );

  for (const record of stalledRecords) {
    clearInterval(record.pingTimer);
    record.inboundBytesBeforeResume = record.session.clientToServerBytes;
    proxy.resume(record.session);
  }
  const closes = await Promise.all(stalledRecords.map(async ({ probe }) => await Promise.race([
    probe.closed,
    delay(5_000).then(() => {
      throw new Error(`${probe.label} close did not drain after proxy resume.`);
    }),
  ])));
  await delay(100);
  for (const { session } of stalledRecords) {
    session.serverToClientBytesAfterResume = session.serverToClientBytes;
  }
  const healthyLater = await waitForMessage(
    healthy,
    (message) => (
      (message.type === 'fullSnapshot' || message.type === 'deltaSnapshot')
      && message.serverTick > metricsEvicted.serverTick
    ),
    'post-eviction advancing snapshot',
  );
  const metricsFinal = await roomMetrics(room);
  const stalled = stalledRecords.map((record, index) => ({
    ordinal: index + 1,
    join: record.joined,
    pingsSent: record.probe.sent.filter(({ message }) => message.type === 'ping').length,
    inboundBytesBeforeResume: record.inboundBytesBeforeResume,
    close: closes[index],
    client: probeSummary(record.probe),
    proxy: proxySessionSummary(proxy, record.session),
  }));
  const playerIds = [
    ...stalled.map(({ join }) => join.accepted.playerId),
    healthyJoin.accepted.playerId,
  ];
  const totalPings = stalled.reduce((sum, record) => sum + record.pingsSent, 0);
  const assertions = {
    exactStalledClientCount: stalled.length === STALLED_CLIENT_COUNT,
    realTcpProxyOwnedEphemeralPort: proxy.port > 0 && proxy.port !== 8787,
    exactDistinctPlayerIdentities: new Set(playerIds).size === STALLED_CLIENT_COUNT + 1,
    everyUpstreamReadActuallyPaused: stalled.every(({ proxy: session }) => (
      session.upstreamWasPaused === true
    )),
    noServerToClientDataEventsWhilePaused: stalled.every(({ proxy: session }) => (
      session.serverToClientBytesBeforeResume === session.serverToClientBytesAtPause
    )),
    everyClientToServerLegStayedLive: stalled.every((record) => (
      record.inboundBytesBeforeResume > (record.proxy.clientToServerBytesAtPause ?? 0)
      && record.pingsSent >= MINIMUM_PINGS_PER_STALLED_CLIENT
    )),
    everyCloseFrameDrainedAfterResume: stalled.every(({ proxy: session }) => (
      (session.serverToClientBytesAfterResume ?? 0)
        > (session.serverToClientBytesBeforeResume ?? 0)
    )),
    everyStalledClientClosedWithPinnedPolicy: stalled.every(({ close }) => (
      close.code === 1013 && close.reason === 'Snapshot acknowledgement timeout'
    )),
    exactApplicationDebtEvictionCount:
      metricsEvicted.transport.snapshotAckDebtEvictions
        - metricsInitial.transport.snapshotAckDebtEvictions === STALLED_CLIENT_COUNT,
    exactSlowConsumerEvictionCount:
      metricsEvicted.transport.slowConsumerEvictions
        - metricsInitial.transport.slowConsumerEvictions === STALLED_CLIENT_COUNT,
    debtPersistedForPinnedBoundary:
      metricsEvicted.transport.maximumSnapshotAckDebtMilliseconds
        >= MAX_SNAPSHOT_ACK_DEBT_MILLISECONDS,
    snapshotsWereCoalescedForStalledSet:
      metricsEvicted.transport.snapshotAckDebtSnapshotsCoalesced >= STALLED_CLIENT_COUNT,
    reliableBatchesWereCoalescedForStalledSet:
      metricsEvicted.transport.snapshotAckDebtReliableBatchesCoalesced >= STALLED_CLIENT_COUNT,
    timeoutFallbackOccurredForEveryStalledClient:
      metricsEvicted.transport.snapshotAckTimeoutFallbacks >= STALLED_CLIENT_COUNT,
    healthyPeerStayedConnected: healthy.socket.readyState === WebSocket.OPEN
      && metricsEvicted.connectedPlayers === 1,
    healthyPeerAdvancedAfterEvictions:
      healthyLater.message.serverTick > metricsEvicted.serverTick,
    inboundPingsReachedWorker:
      metricsEvicted.transport.inboundMessagesReceived
        - metricsInitial.transport.inboundMessagesReceived >= totalPings,
    noProbeDecodeOrSocketErrors:
      stalled.every(({ client }) => client.decodeOrSocketErrors.length === 0)
      && healthy.errors.length === 0,
  };
  const result = {
    scenario: 'multiple-real-paused-read-evictions',
    room,
    constants: {
      stalledClientCount: STALLED_CLIENT_COUNT,
      maxSnapshotAckDebtMilliseconds: MAX_SNAPSHOT_ACK_DEBT_MILLISECONDS,
      minimumPingsPerStalledClient: MINIMUM_PINGS_PER_STALLED_CLIENT,
    },
    metricsInitial,
    metricsPaused,
    metricsEvicted,
    metricsFinal,
    stalled,
    healthyJoin,
    healthyPostEvictionSnapshot: healthyLater.message,
    healthyClient: probeSummary(healthy),
    totalPings,
    assertions,
    passed: Object.values(assertions).every(Boolean),
  };
  await closeProbe(healthy);
  await proxy.stop();
  return result;
}

async function main() {
  const runRoot = containedRunPath(argument('--output', DEFAULT_RUN));
  const existing = await readdir(runRoot).catch((error) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  });
  if (existing.length > 0) {
    throw new Error('Multi-slow evidence output is not empty; preserve it and select a fresh run.');
  }
  if (await isPortOpen(8787)) {
    throw new Error('Port 8787 must be free so the capture owns the Wrangler runtime.');
  }
  const logsRoot = path.join(runRoot, 'logs');
  await mkdir(logsRoot, { recursive: true });
  const evidencePath = path.join(runRoot, 'multi-slow-socket.json');
  const sourceInventoryAtStart = await sourceInventory();
  const resources = { probes: [], proxy: null, pingTimers: [] };
  const authority = startService([
    'node_modules/wrangler/bin/wrangler.js',
    'dev',
    '--config',
    'wrangler.jsonc',
    '--port',
    '8787',
  ]);
  let scenario = null;
  let health = null;
  let terminalError = null;
  try {
    health = await (await waitForHttp(`${AUTHORITY_ORIGIN}/health`, 'Authority')).json();
    scenario = await runScenario(resources);
    await writeFile(
      path.join(logsRoot, 'multi-slow-scenario.json'),
      `${JSON.stringify(scenario, null, 2)}\n`,
      'utf8',
    );
  } catch (error) {
    terminalError = error instanceof Error ? `${error.stack ?? error.message}` : String(error);
  } finally {
    for (const timer of resources.pingTimers) clearInterval(timer);
    for (const probe of resources.probes) await closeProbe(probe).catch(() => undefined);
    await resources.proxy?.stop().catch(() => undefined);
    await stopService(authority);
    await writeFile(
      path.join(logsRoot, 'wrangler.jsonl'),
      `${authority.records.map((record) => JSON.stringify(record)).join('\n')}\n`,
      'utf8',
    );
    if (terminalError !== null) {
      await writeFile(path.join(logsRoot, 'capture-error.txt'), `${terminalError}\n`, 'utf8');
    }
  }
  if (terminalError !== null) throw new Error(terminalError);
  if (scenario === null || health === null) throw new Error('Multi-slow scenario was not captured.');
  const sourceInventoryAtEnd = await sourceInventory();
  const cleanup = { authorityPort8787Free: !(await isPortOpen(8787)) };
  const aggregateAssertions = {
    multipleStalledClientScenarioPassed: scenario.passed === true,
    ownedAuthorityPortReleased: cleanup.authorityPort8787Free === true,
    sourceUnchangedDuringCapture: sameJson(sourceInventoryAtStart, sourceInventoryAtEnd),
  };
  const result = {
    schemaVersion: 1,
    evidenceId: 'phase-4-g3-multi-slow-socket-local-v1-2026-07-22',
    capturedAt: new Date().toISOString(),
    status: Object.values(aggregateAssertions).every(Boolean)
      ? 'LOCAL_G3_MULTI_SLOW_SOCKET_EVIDENCE_PASS'
      : 'LOCAL_G3_MULTI_SLOW_SOCKET_EVIDENCE_FAIL',
    gateDecision: 'NONE',
    gateClaim: 'G3_NOT_ACCEPTED',
    deploymentPerformed: false,
    exactInvocation: [process.execPath, ...process.argv.slice(1)],
    serviceCommand: authority.command,
    runtime: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      webSocketImplementation: 'ws package with real TCP sockets',
      health,
    },
    sourceInventoryAtStart,
    sourceInventory: sourceInventoryAtEnd,
    scenario,
    cleanup,
    aggregateAssertions,
    scopeBoundary: [
      'This record uses five actual ws clients: four independently paused server-to-client TCP reads and one directly connected acknowledging healthy peer against one owned local Wrangler Durable Object runtime.',
      'Each paused connection keeps its client-to-server leg live with application pings; byte counters prove no server-to-client data event was delivered until resume.',
      'It proves bounded application-level snapshot-ACK-debt eviction for a concurrent stalled set while a healthy peer continues to advance.',
      'It does not claim operating-system socket-buffer saturation or a documented server-side WebSocket bufferedAmount surface.',
      'Public authentication, production-origin WSS, external staging, load/soak duration, CPU/memory/storage/bandwidth/cost, physical-device refresh, product flow, and human acceptance remain open.',
      'No deployment, publication, commit, reset, clean, or stash was performed.',
      'G3 remains unaccepted.',
    ],
  };
  result.artifactInventory = await artifactInventory(runRoot, evidencePath);
  await writeFile(evidencePath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${result.status}\n${evidencePath}\n`);
  if (result.status.endsWith('_FAIL')) process.exitCode = 1;
}

await main();
