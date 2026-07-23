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
  'evidence/2026-07-22/phase-4-g3-real-slow-socket',
);
const DEFAULT_RUN = path.join(EVIDENCE_ROOT, 'runs/local-v1');
const AUTHORITY_ORIGIN = 'http://127.0.0.1:8787';
const ALLOWED_ORIGIN = 'http://127.0.0.1:5173';
const SNAPSHOT_ACK_FALLBACK_MILLISECONDS = 1_000;
const MAX_SNAPSHOT_ACK_DEBT_MILLISECONDS = 3_000;
const RECOVERY_PAUSE_MILLISECONDS = 600;
const SOURCE_FILES = Object.freeze([
  'worker/transport-limits.json',
  'worker/security.ts',
  'worker/room.ts',
  'src/net/protocol.ts',
  'src/net/schemas.ts',
  'tests/unit/worker/security.test.ts',
  'tests/worker/protocolV2Socket.test.ts',
  'tools/evidence/capture-phase4-g3-real-slow-socket.mjs',
  'tools/evidence/verify-phase4-g3-real-slow-socket.mjs',
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

async function waitUntil(predicate, label, timeoutMilliseconds = 10_000) {
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

function startService(label, argumentsList) {
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
  return { label, child, records, command: [process.execPath, ...argumentsList] };
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

async function waitForMetrics(room, predicate, label, timeoutMilliseconds = 10_000) {
  return await waitUntil(async () => {
    const metrics = await roomMetrics(room);
    return predicate(metrics) ? metrics : false;
  }, label, timeoutMilliseconds);
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
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
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

async function startPausingProxy(resources, label) {
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
      at: new Date().toISOString(),
      endpoint: 'downstream',
      message: error.message,
    }));
    upstream.on('error', (error) => session.errors.push({
      at: new Date().toISOString(),
      endpoint: 'upstream',
      message: error.message,
    }));
    downstream.pipe(upstream);
    upstream.pipe(downstream);
  });
  server.on('error', (error) => serverErrors.push({
    at: new Date().toISOString(),
    message: error.message,
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
  if (address === null || typeof address === 'string') throw new Error(`${label} has no TCP port.`);
  const proxy = {
    label,
    port: address.port,
    sessions,
    serverErrors,
    server,
    stopped: false,
    pause(session) {
      if (session.upstream === null) throw new Error(`${label} session has no upstream.`);
      session.pauseStartedAt = new Date().toISOString();
      session.clientToServerBytesAtPause = session.clientToServerBytes;
      session.serverToClientBytesAtPause = session.serverToClientBytes;
      session.upstream.pause();
      session.upstreamWasPaused = session.upstream.isPaused();
    },
    resume(session) {
      if (session.upstream === null) throw new Error(`${label} session has no upstream.`);
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
  resources.proxies.push(proxy);
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
  const send = (message) => {
    if (socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    probe.sent.push({ at: new Date().toISOString(), message });
    return true;
  };
  const sendAck = () => {
    if (probe.baselineId === null || probe.baselineTick === null) return false;
    return send({
      protocolVersion: 2,
      type: 'ack',
      snapshotBaselineVersion: 1,
      reliableEventStreamVersion: 1,
      snapshotBaselineId: probe.baselineId,
      serverTick: probe.baselineTick,
      lastEventId: probe.lastEventId,
    });
  };
  probe.send = send;
  probe.sendAck = sendAck;
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
      if (probe.autoAck) sendAck();
      return;
    }
    if (message.type === 'reliableEventBatch') {
      for (const event of message.events) {
        const sequence = reliableEventSequence(event.id);
        if (sequence > probe.lastEventSequence) {
          probe.lastEventSequence = sequence;
          probe.lastEventId = event.id;
        }
      }
      if (probe.autoAck) sendAck();
    }
  });
  socket.on('error', (error) => probe.errors.push({
    at: new Date().toISOString(),
    kind: 'socket',
    message: error.message,
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
    const index = probe.messages.findIndex(({ message }) => predicate(message));
    return index < 0 ? false : { ...probe.messages[index], index };
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
  const counts = {};
  for (const { message } of probe.messages) counts[message.type] = (counts[message.type] ?? 0) + 1;
  return {
    label: probe.label,
    url: probe.url,
    readyState: probe.socket.readyState,
    messageCounts: counts,
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
    proxyLabel: proxy.label,
    proxyPort: proxy.port,
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

async function runEvictionScenario(resources) {
  const room = await createRoom();
  const proxy = await startPausingProxy(resources, 'eviction-pausing-proxy');
  const stalled = await makeProbe(resources, {
    label: 'stalled-proxied-client',
    url: socketUrl(room, proxy.port),
    autoAck: false,
  });
  const stalledJoin = await joinProbe(stalled, room, 'request.real-slow.stalled', 'Real Slow Stalled');
  const session = await waitUntil(() => proxy.sessions[0] ?? false, 'eviction proxy session');
  proxy.pause(session);
  const metricsBefore = await roomMetrics(room);
  let pingNonce = 0;
  const pingTimer = setInterval(() => {
    stalled.send({
      protocolVersion: 2,
      type: 'ping',
      nonce: pingNonce,
      clientTick: stalled.baselineTick ?? 0,
    });
    pingNonce += 1;
  }, 250);
  const healthy = await makeProbe(resources, {
    label: 'healthy-direct-peer',
    url: socketUrl(room),
    autoAck: true,
  });
  const healthyJoin = await joinProbe(healthy, room, 'request.real-slow.healthy', 'Healthy Direct');
  const metricsEvicted = await waitForMetrics(
    room,
    ({ connectedPlayers, transport }) => (
      connectedPlayers === 1 && transport.snapshotAckDebtEvictions === 1
    ),
    'real snapshot ACK-debt eviction',
    12_000,
  );
  clearInterval(pingTimer);
  const inboundBytesBeforeResume = session.clientToServerBytes;
  proxy.resume(session);
  const stalledClose = await Promise.race([
    stalled.closed,
    delay(5_000).then(() => { throw new Error('Stalled client close did not drain after proxy resume.'); }),
  ]);
  await delay(100);
  session.serverToClientBytesAfterResume = session.serverToClientBytes;
  const healthyLater = await waitForMessage(
    healthy,
    (message) => (
      (message.type === 'fullSnapshot' || message.type === 'deltaSnapshot')
        && message.serverTick > metricsEvicted.serverTick
    ),
    'post-eviction advancing snapshot',
  );
  const metricsFinal = await roomMetrics(room);
  const proxySummary = proxySessionSummary(proxy, session);
  const pingsSent = stalled.sent.filter(({ message }) => message.type === 'ping').length;
  const assertions = {
    realTcpProxyOwnedEphemeralPort: proxy.port > 0 && proxy.port !== 8787,
    upstreamReadWasActuallyPaused: proxySummary.upstreamWasPaused === true,
    noServerToClientDataEventsWhilePaused:
      proxySummary.serverToClientBytesBeforeResume === proxySummary.serverToClientBytesAtPause,
    clientToServerTrafficContinuedWhilePaused:
      inboundBytesBeforeResume > (proxySummary.clientToServerBytesAtPause ?? 0) && pingsSent >= 8,
    closeFrameDrainedAfterResume:
      (proxySummary.serverToClientBytesAfterResume ?? 0)
        > (proxySummary.serverToClientBytesBeforeResume ?? 0),
    applicationDebtEvictedExactlyOne: metricsEvicted.transport.snapshotAckDebtEvictions === 1,
    slowConsumerMetricEvictedExactlyOne: metricsEvicted.transport.slowConsumerEvictions === 1,
    debtPersistedForPinnedBoundary:
      metricsEvicted.transport.maximumSnapshotAckDebtMilliseconds
        >= MAX_SNAPSHOT_ACK_DEBT_MILLISECONDS,
    snapshotsWereCoalesced: metricsEvicted.transport.snapshotAckDebtSnapshotsCoalesced > 0,
    reliableBatchesWereCoalesced:
      metricsEvicted.transport.snapshotAckDebtReliableBatchesCoalesced > 0,
    fallbackOccurredBeforeEviction: metricsEvicted.transport.snapshotAckTimeoutFallbacks >= 1,
    stalledClientClosedWithPinnedPolicy:
      stalledClose.code === 1013 && stalledClose.reason === 'Snapshot acknowledgement timeout',
    healthyPeerStayedConnected: healthy.socket.readyState === WebSocket.OPEN
      && metricsEvicted.connectedPlayers === 1,
    healthyPeerAdvancedAfterEviction: healthyLater.message.serverTick > metricsEvicted.serverTick,
    inboundPingsReachedWorker:
      metricsEvicted.transport.inboundMessagesReceived
        - metricsBefore.transport.inboundMessagesReceived >= pingsSent,
    noProbeDecodeOrSocketErrors: stalled.errors.length === 0 && healthy.errors.length === 0,
  };
  const result = {
    scenario: 'real-paused-read-eviction',
    room,
    constants: {
      maxSnapshotAckDebtMilliseconds: MAX_SNAPSHOT_ACK_DEBT_MILLISECONDS,
      snapshotAckFallbackMilliseconds: SNAPSHOT_ACK_FALLBACK_MILLISECONDS,
    },
    stalledJoin,
    healthyJoin,
    pingsSent,
    metricsBefore,
    metricsEvicted,
    metricsFinal,
    healthyPostEvictionSnapshot: healthyLater.message,
    stalledClient: probeSummary(stalled),
    healthyClient: probeSummary(healthy),
    proxy: proxySummary,
    assertions,
    passed: Object.values(assertions).every(Boolean),
  };
  await closeProbe(healthy);
  await proxy.stop();
  return result;
}

async function runRecoveryScenario(resources) {
  const room = await createRoom();
  const proxy = await startPausingProxy(resources, 'recovery-pausing-proxy');
  const recovering = await makeProbe(resources, {
    label: 'recovering-proxied-client',
    url: socketUrl(room, proxy.port),
    autoAck: false,
  });
  const recoveringJoin = await joinProbe(
    recovering,
    room,
    'request.real-slow.recovering',
    'Recovering Proxied',
  );
  const session = await waitUntil(() => proxy.sessions[0] ?? false, 'recovery proxy session');
  proxy.pause(session);
  const metricsBefore = await roomMetrics(room);
  let pingNonce = 10_000;
  const pingTimer = setInterval(() => {
    recovering.send({
      protocolVersion: 2,
      type: 'ping',
      nonce: pingNonce,
      clientTick: recovering.baselineTick ?? 0,
    });
    pingNonce += 1;
  }, 200);
  await delay(RECOVERY_PAUSE_MILLISECONDS);
  recovering.autoAck = true;
  proxy.resume(session);
  recovering.sendAck();
  clearInterval(pingTimer);
  const metricsRecovered = await waitForMetrics(
    room,
    ({ connectedPlayers, transport }) => (
      connectedPlayers === 1
        && transport.snapshotAckDebtRecoveries
          > metricsBefore.transport.snapshotAckDebtRecoveries
    ),
    'short-pause ACK-debt recovery',
  );
  const healthy = await makeProbe(resources, {
    label: 'recovery-room-healthy-direct-peer',
    url: socketUrl(room),
    autoAck: true,
  });
  const healthyJoin = await joinProbe(
    healthy,
    room,
    'request.real-slow.recovery-healthy',
    'Recovery Healthy',
  );
  const metricsTwoPeers = await waitForMetrics(
    room,
    ({ connectedPlayers }) => connectedPlayers === 2,
    'two connected peers after recovery',
  );
  const later = await waitForMessage(
    recovering,
    (message) => (
      (message.type === 'fullSnapshot' || message.type === 'deltaSnapshot')
        && message.serverTick > recoveringJoin.full.serverTick
    ),
    'recovering client later snapshot',
  );
  await delay(200);
  const metricsFinal = await roomMetrics(room);
  session.serverToClientBytesAfterResume = session.serverToClientBytes;
  const proxySummary = proxySessionSummary(proxy, session);
  const pingsSent = recovering.sent.filter(({ message }) => message.type === 'ping').length;
  const assertions = {
    realTcpProxyOwnedEphemeralPort: proxy.port > 0 && proxy.port !== 8787,
    upstreamReadWasActuallyPaused: proxySummary.upstreamWasPaused === true,
    pauseStayedBelowFallback:
      proxySummary.pauseDurationMilliseconds >= RECOVERY_PAUSE_MILLISECONDS - 25
        && proxySummary.pauseDurationMilliseconds < SNAPSHOT_ACK_FALLBACK_MILLISECONDS,
    noServerToClientDataEventsWhilePaused:
      proxySummary.serverToClientBytesBeforeResume === proxySummary.serverToClientBytesAtPause,
    clientToServerTrafficContinuedWhilePaused:
      (proxySummary.clientToServerBytesBeforeResume ?? 0)
        > (proxySummary.clientToServerBytesAtPause ?? 0) && pingsSent >= 2,
    debtRecoveryIncremented:
      metricsRecovered.transport.snapshotAckDebtRecoveries
        > metricsBefore.transport.snapshotAckDebtRecoveries,
    noFallbackDuringShortPause:
      metricsRecovered.transport.snapshotAckTimeoutFallbacks
        === metricsBefore.transport.snapshotAckTimeoutFallbacks,
    noEviction: metricsFinal.transport.snapshotAckDebtEvictions === 0
      && metricsFinal.transport.slowConsumerEvictions === 0,
    bothPeersStayedConnected: metricsTwoPeers.connectedPlayers === 2
      && metricsFinal.connectedPlayers === 2,
    recoveringClientAdvanced: later.message.serverTick > recoveringJoin.full.serverTick
      && recovering.socket.readyState === WebSocket.OPEN,
    healthyPeerStayedConnected: healthy.socket.readyState === WebSocket.OPEN,
    maximumDebtBelowEvictionBoundary:
      metricsFinal.transport.maximumSnapshotAckDebtMilliseconds
        < MAX_SNAPSHOT_ACK_DEBT_MILLISECONDS,
    noProbeDecodeOrSocketErrors: recovering.errors.length === 0 && healthy.errors.length === 0,
  };
  const result = {
    scenario: 'real-paused-read-recovery',
    room,
    constants: {
      recoveryPauseMilliseconds: RECOVERY_PAUSE_MILLISECONDS,
      maxSnapshotAckDebtMilliseconds: MAX_SNAPSHOT_ACK_DEBT_MILLISECONDS,
      snapshotAckFallbackMilliseconds: SNAPSHOT_ACK_FALLBACK_MILLISECONDS,
    },
    recoveringJoin,
    healthyJoin,
    pingsSent,
    metricsBefore,
    metricsRecovered,
    metricsTwoPeers,
    metricsFinal,
    recoveringLaterSnapshot: later.message,
    recoveringClient: probeSummary(recovering),
    healthyClient: probeSummary(healthy),
    proxy: proxySummary,
    assertions,
    passed: Object.values(assertions).every(Boolean),
  };
  await Promise.all([closeProbe(recovering), closeProbe(healthy)]);
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
    throw new Error('Real slow-socket evidence output is not empty; preserve it and select a fresh run.');
  }
  if (await isPortOpen(8787)) {
    throw new Error('Port 8787 must be free so the capture owns the Wrangler runtime.');
  }
  const logsRoot = path.join(runRoot, 'logs');
  await mkdir(logsRoot, { recursive: true });
  const evidencePath = path.join(runRoot, 'real-slow-socket.json');
  const resources = { probes: [], proxies: [] };
  const authority = startService('wrangler', [
    'node_modules/wrangler/bin/wrangler.js',
    'dev',
    '--config',
    'wrangler.jsonc',
    '--port',
    '8787',
  ]);
  let eviction = null;
  let recovery = null;
  let health = null;
  let terminalError = null;
  try {
    health = await (await waitForHttp(`${AUTHORITY_ORIGIN}/health`, 'Authority')).json();
    eviction = await runEvictionScenario(resources);
    recovery = await runRecoveryScenario(resources);
    await Promise.all([
      writeFile(
        path.join(logsRoot, 'eviction-scenario.json'),
        `${JSON.stringify(eviction, null, 2)}\n`,
        'utf8',
      ),
      writeFile(
        path.join(logsRoot, 'recovery-scenario.json'),
        `${JSON.stringify(recovery, null, 2)}\n`,
        'utf8',
      ),
    ]);
  } catch (error) {
    terminalError = error instanceof Error ? `${error.stack ?? error.message}` : String(error);
  } finally {
    for (const probe of resources.probes) await closeProbe(probe).catch(() => undefined);
    for (const proxy of resources.proxies) await proxy.stop().catch(() => undefined);
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
  if (eviction === null || recovery === null || health === null) {
    throw new Error('Real slow-socket scenarios were not captured.');
  }
  const cleanup = { authorityPort8787Free: !(await isPortOpen(8787)) };
  const aggregateAssertions = {
    evictionScenarioPassed: eviction.passed === true,
    recoveryScenarioPassed: recovery.passed === true,
    ownedAuthorityPortReleased: cleanup.authorityPort8787Free === true,
  };
  const result = {
    schemaVersion: 1,
    evidenceId: 'phase-4-g3-real-slow-socket-local-v1-2026-07-22',
    capturedAt: new Date().toISOString(),
    status: Object.values(aggregateAssertions).every(Boolean)
      ? 'LOCAL_G3_REAL_SLOW_SOCKET_EVIDENCE_PASS'
      : 'LOCAL_G3_REAL_SLOW_SOCKET_EVIDENCE_FAIL',
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
    sourceInventory: await sourceInventory(),
    eviction,
    recovery,
    cleanup,
    aggregateAssertions,
    scopeBoundary: [
      'This record uses actual ws clients and an owned Node TCP byte relay whose server-to-client upstream read is paused while client-to-server application pings continue.',
      'It proves the application-level snapshot-ACK-debt eviction and sub-threshold recovery policies against a real local Wrangler Durable Object runtime.',
      'It does not claim operating-system socket-buffer saturation or a documented server-side WebSocket bufferedAmount surface.',
      'Multiple stalled clients, public authentication, production-origin WSS, external staging, load/soak, resource/cost, physical-device refresh, product flow, and human acceptance remain open.',
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
