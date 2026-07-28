import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const PROFILES = Object.freeze([
  'nominal',
  'latency-jitter',
  'loss',
  'reorder-duplicate',
  'combined-stress',
]);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_OUTPUT = path.join(
  REPO_ROOT,
  'evidence/2026-07-20/phase-4-g3-authoritative-movement',
);
const VITE_ORIGIN = 'http://127.0.0.1:5173';
const AUTHORITY_ORIGIN = 'http://127.0.0.1:8787';
const CHROME_PATH = process.env.KYX_CHROME_PATH
  ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const JOIN_TIMEOUT_MILLISECONDS = 30_000;
const MOVEMENT_HOLD_MILLISECONDS = 1_000;
const SETTLE_MILLISECONDS = 1_750;
const metricsAccessByRoomCode = new Map();

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

function safeOutputPath(value) {
  const resolved = path.resolve(value);
  const relative = path.relative(REPO_ROOT, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Evidence output must remain inside the repository.');
  }
  return resolved;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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

function startService(label, args) {
  const child = spawn(process.execPath, args, {
    cwd: REPO_ROOT,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const records = [];
  const capture = (stream, chunk) => {
    records.push({
      at: new Date().toISOString(),
      stream,
      text: chunk.toString('utf8'),
    });
  };
  child.stdout.on('data', (chunk) => capture('stdout', chunk));
  child.stderr.on('data', (chunk) => capture('stderr', chunk));
  return { label, child, records, command: [process.execPath, ...args] };
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

async function diagnostics(page) {
  return await page.evaluate(() => {
    const surface = window.__KYX_AUTHORITY_EVIDENCE__;
    if (surface === undefined) throw new Error('Authority evidence surface is missing.');
    return surface.getSnapshot();
  });
}

async function waitForJoined(page, generation = 0) {
  await page.waitForFunction((expectedGeneration) => {
    const snapshot = window.__KYX_AUTHORITY_EVIDENCE__?.getSnapshot();
    return snapshot?.connection.phase === 'joined'
      && snapshot.resume.generation === expectedGeneration
      && snapshot.lastError === null;
  }, generation, { timeout: JOIN_TIMEOUT_MILLISECONDS });
  return await diagnostics(page);
}

async function waitForRemote(page) {
  await page.waitForFunction(() => {
    const snapshot = window.__KYX_AUTHORITY_EVIDENCE__?.getSnapshot();
    return snapshot?.connection.phase === 'joined'
      && snapshot.remote.playerCount >= 1
      && snapshot.counters.remoteSamples >= 1;
  }, undefined, { timeout: JOIN_TIMEOUT_MILLISECONDS });
}

function lengthSquared(position) {
  return position.x ** 2 + position.y ** 2 + position.z ** 2;
}

function positionDeltaMillimeters(before, after) {
  if (before === null || after === null) return null;
  return Math.sqrt(lengthSquared({
    x: after.x - before.x,
    y: after.y - before.y,
    z: after.z - before.z,
  }));
}

function identityKey(identity) {
  return JSON.stringify(identity, Object.keys(identity).sort());
}

function impairmentObserved(profile, first, second) {
  const directions = [
    first.impairment.inbound.metrics,
    first.impairment.outbound.metrics,
    second.impairment.inbound.metrics,
    second.impairment.outbound.metrics,
  ];
  const total = (field) => directions.reduce((sum, metrics) => sum + metrics[field], 0);
  const maxima = (field) => Math.max(...directions.map((metrics) => metrics[field] ?? 0));
  const observed = {
    deliveredCopies: total('deliveredCopies'),
    droppedPackets: total('droppedPackets'),
    duplicatedPackets: total('duplicatedPackets'),
    reorderImpairedPackets: total('reorderImpairedPackets'),
    reorderedPackets: total('reorderedPackets'),
    maximumDeliveryLatencyMilliseconds: maxima('maximumDeliveryLatencyMilliseconds'),
    maximumObservedQueueDepth: maxima('maximumObservedQueueDepth'),
  };
  let expectedPhenomenaObserved = false;
  if (profile === 'nominal') {
    expectedPhenomenaObserved = observed.droppedPackets === 0
      && observed.duplicatedPackets === 0
      && observed.reorderImpairedPackets === 0;
  } else if (profile === 'latency-jitter') {
    expectedPhenomenaObserved = observed.maximumDeliveryLatencyMilliseconds >= 65;
  } else if (profile === 'loss') {
    expectedPhenomenaObserved = observed.droppedPackets > 0;
  } else if (profile === 'reorder-duplicate') {
    expectedPhenomenaObserved = observed.duplicatedPackets > 0
      && observed.reorderImpairedPackets > 0;
  } else if (profile === 'combined-stress') {
    expectedPhenomenaObserved = observed.droppedPackets > 0
      && observed.duplicatedPackets > 0
      && observed.reorderImpairedPackets > 0;
  }
  return { ...observed, expectedPhenomenaObserved };
}

function rememberMetricsAccess(room) {
  const access = room?.metricsAccess;
  if (
    typeof room?.roomCode !== 'string'
    || typeof access?.headerName !== 'string'
    || typeof access?.credential !== 'string'
    || typeof access?.expiresAt !== 'number'
  ) {
    throw new Error('Room creation did not issue a metrics read credential.');
  }
  metricsAccessByRoomCode.set(room.roomCode, access);
  return room;
}

async function nextBrowserRoomCreation(page) {
  const response = await page.waitForResponse((candidate) => {
    const url = new URL(candidate.url());
    return url.origin === AUTHORITY_ORIGIN
      && url.pathname === '/api/rooms/create'
      && candidate.request().method() === 'POST';
  }, { timeout: JOIN_TIMEOUT_MILLISECONDS });
  return rememberMetricsAccess(await response.json());
}

async function roomMetrics(roomCode) {
  const access = metricsAccessByRoomCode.get(roomCode);
  if (access === undefined) {
    throw new Error(`Metrics credential is unavailable for ${roomCode}.`);
  }
  const response = await fetch(`${AUTHORITY_ORIGIN}/api/rooms/${roomCode}/metrics`, {
    headers: {
      Origin: VITE_ORIGIN,
      [access.headerName]: access.credential,
    },
    cache: 'no-store',
  });
  const body = await response.json();
  if (!response.ok || body.ok !== true) {
    throw new Error(`Room metrics failed for ${roomCode}: HTTP ${response.status}`);
  }
  return body.metrics;
}

function attachBrowserLog(page, peer, records) {
  page.on('console', (message) => {
    records.push({
      at: new Date().toISOString(),
      peer,
      kind: 'console',
      level: message.type(),
      text: message.text(),
    });
  });
  page.on('pageerror', (error) => {
    records.push({
      at: new Date().toISOString(),
      peer,
      kind: 'pageerror',
      level: 'error',
      text: error.message,
    });
  });
  page.on('requestfailed', (request) => {
    records.push({
      at: new Date().toISOString(),
      peer,
      kind: 'requestfailed',
      level: 'error',
      method: request.method(),
      url: request.url(),
      text: request.failure()?.errorText ?? 'unknown request failure',
    });
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    records.push({
      at: new Date().toISOString(),
      peer,
      kind: 'http',
      level: response.status() >= 500 ? 'error' : 'warning',
      status: response.status(),
      url: response.url(),
    });
  });
}

async function createAdversarialRoom() {
  const response = await fetch(`${AUTHORITY_ORIGIN}/api/rooms/create`, {
    method: 'POST',
    headers: { Origin: VITE_ORIGIN },
  });
  const body = await response.json();
  if (response.status !== 201) throw new Error(`Adversarial room creation failed: ${response.status}`);
  return rememberMetricsAccess(body);
}

async function forgedTransformProbe(page, roomCode) {
  return await page.evaluate(async ({ authorityOrigin, code }) => {
    const socketUrl = new URL(`/api/rooms/${code}/socket`, authorityOrigin);
    socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    const waitFor = (messages, predicate, label, timeout = 10_000) => new Promise((resolve, reject) => {
      const started = performance.now();
      const poll = () => {
        const found = messages.find(predicate);
        if (found !== undefined) {
          resolve(found);
        } else if (performance.now() - started >= timeout) {
          reject(new Error(`Timed out waiting for ${label}: ${messages.map(({ type }) => type).join(',')}`));
        } else {
          setTimeout(poll, 10);
        }
      };
      poll();
    });
    const connect = async () => {
      const messages = [];
      const socket = new WebSocket(socketUrl);
      socket.addEventListener('message', (event) => {
        if (typeof event.data !== 'string') return;
        try { messages.push(JSON.parse(event.data)); } catch { /* captured by timeout */ }
      });
      await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true });
        socket.addEventListener(
          'error',
          () => reject(new Error('Adversarial socket failed.')),
          { once: true },
        );
      });
      return { socket, messages };
    };
    const attacker = await connect();
    const welcome = await waitFor(
      attacker.messages,
      (message) => message.type === 'welcome',
      'attacker welcome',
    );
    const socket = attacker.socket;
    socket.send(JSON.stringify({
      protocolVersion: 2,
      type: 'joinRoom',
      requestId: 'request.adversarial.join',
      roomCode: code,
      displayName: 'G3 Modified Client',
    }));
    const joined = await waitFor(
      attacker.messages,
      (message) => message.type === 'joinAccepted',
      'attacker joinAccepted',
    );
    const initial = await waitFor(
      attacker.messages,
      (message) => message.type === 'fullSnapshot'
        && message.localReconciliation?.player?.id === joined.playerId,
      'attacker initial full snapshot',
    );

    const witness = await connect();
    await waitFor(witness.messages, (message) => message.type === 'welcome', 'witness welcome');
    witness.socket.send(JSON.stringify({
      protocolVersion: 2,
      type: 'joinRoom',
      requestId: 'request.adversarial.witness',
      roomCode: code,
      displayName: 'G3 Witness Peer',
    }));
    const witnessJoined = await waitFor(
      witness.messages,
      (message) => message.type === 'joinAccepted',
      'witness joinAccepted',
    );
    await waitFor(
      witness.messages,
      (message) => message.type === 'fullSnapshot'
        && message.localReconciliation?.player?.id === witnessJoined.playerId,
      'witness initial full snapshot',
    );
    const activeBefore = await waitFor(
      attacker.messages,
      (message) => message.type === 'fullSnapshot'
        && message.serverTick > initial.serverTick
        && message.entities.some(({ id }) => id === witnessJoined.playerId),
      'two-player attacker snapshot',
    );
    const before = activeBefore.entities.find(({ id }) => id === joined.playerId);
    socket.send(JSON.stringify({
      protocolVersion: 2,
      type: 'SetPosition',
      xMillimeters: 999_999,
      yMillimeters: 999_999,
      zMillimeters: 999_999,
    }));
    const rejection = await waitFor(
      attacker.messages,
      (message) => message.type === 'error' && message.code === 'PROTOCOL_FORBIDDEN_COMMAND',
      'forged transform rejection',
    );
    const later = await waitFor(
      attacker.messages,
      (message) => message.type === 'fullSnapshot'
        && message.serverTick > activeBefore.serverTick
        && message.entities.some(({ id }) => id === joined.playerId),
      'post-forgery full snapshot',
    );
    const after = later.entities.find(({ id }) => id === joined.playerId);
    const result = {
      protocolVersion: welcome.protocolVersion,
      roomCode: code,
      matchId: joined.matchId,
      playerId: joined.playerId,
      rejectionCode: rejection.code,
      rejectionDetail: rejection.detail,
      socketRemainedOpen: socket.readyState === WebSocket.OPEN,
      before: [before.xMillimeters, before.yMillimeters, before.zMillimeters],
      after: [after.xMillimeters, after.yMillimeters, after.zMillimeters],
      forgedPositionAbsent: ![after.xMillimeters, after.yMillimeters, after.zMillimeters]
        .includes(999_999),
      witnessPlayerId: witnessJoined.playerId,
      laterSnapshotTickAdvanced: later.serverTick > activeBefore.serverTick,
      resumeTokenCaptured: false,
    };
    socket.close(1000, 'adversarial evidence complete');
    witness.socket.close(1000, 'adversarial witness complete');
    return result;
  }, { authorityOrigin: AUTHORITY_ORIGIN, code: roomCode });
}

async function captureProfile(browser, outputDirectory, profile) {
  const browserLog = [];
  const contextA = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const contextB = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  attachBrowserLog(pageA, 'A', browserLog);
  attachBrowserLog(pageB, 'B', browserLog);
  const encodedAuthority = encodeURIComponent(AUTHORITY_ORIGIN);
  const createUrl = `${VITE_ORIGIN}/__test__/authority?mode=create&displayName=Matrix%20A&authorityUrl=${encodedAuthority}&impairment=${profile}`;
  const capturedAt = new Date().toISOString();
  try {
    const roomCreation = nextBrowserRoomCreation(pageA);
    await pageA.goto(createUrl, { waitUntil: 'domcontentloaded', timeout: JOIN_TIMEOUT_MILLISECONDS });
    await roomCreation;
    const aJoined = await waitForJoined(pageA);
    const roomCode = aJoined.configuration.roomCode;
    const joinUrl = `${VITE_ORIGIN}/__test__/authority?mode=join&room=${encodeURIComponent(roomCode)}&displayName=Matrix%20B&authorityUrl=${encodedAuthority}&impairment=${profile}`;
    await pageB.goto(joinUrl, { waitUntil: 'domcontentloaded', timeout: JOIN_TIMEOUT_MILLISECONDS });
    const bJoined = await waitForJoined(pageB);
    await Promise.all([waitForRemote(pageA), waitForRemote(pageB)]);

    const idleStartedAt = Date.now();
    const idleMetricsBefore = await roomMetrics(roomCode);
    await delay(1_500);
    const idleMetricsAfter = await roomMetrics(roomCode);
    const idleElapsedMilliseconds = Date.now() - idleStartedAt;
    const measuredTickHz = (idleMetricsAfter.serverTick - idleMetricsBefore.serverTick)
      / (idleElapsedMilliseconds / 1_000);

    const beforeMoveA = await diagnostics(pageA);
    const beforeMoveB = await diagnostics(pageB);
    await pageA.keyboard.down('KeyW');
    await delay(MOVEMENT_HOLD_MILLISECONDS);
    await pageA.keyboard.up('KeyW');
    await delay(SETTLE_MILLISECONDS);
    const afterMoveA = await diagnostics(pageA);
    const afterMoveB = await diagnostics(pageB);

    await pageA.screenshot({
      path: path.join(outputDirectory, 'screenshots', `${profile}-a-before-resume.png`),
    });
    await pageB.screenshot({
      path: path.join(outputDirectory, 'screenshots', `${profile}-b-peer.png`),
    });

    const originalPlayerId = afterMoveA.authority.playerId;
    const originalMatchId = afterMoveA.authority.matchId;
    await pageA.getByTestId('authority-resume').click();
    const resumedA = await waitForJoined(pageA, 1);
    await pageA.keyboard.down('KeyD');
    await delay(MOVEMENT_HOLD_MILLISECONDS);
    await pageA.keyboard.up('KeyD');
    await delay(SETTLE_MILLISECONDS);
    const afterResumeMoveA = await diagnostics(pageA);
    const afterResumeMoveB = await diagnostics(pageB);
    const finalMetrics = await roomMetrics(roomCode);

    await pageA.screenshot({
      path: path.join(outputDirectory, 'screenshots', `${profile}-a-after-resume.png`),
    });

    const criticalBrowserLog = browserLog.filter((entry) => (
      entry.kind === 'pageerror'
      || entry.kind === 'requestfailed'
      || (entry.kind === 'console' && entry.level === 'error')
      || (entry.kind === 'http' && entry.status >= 500)
    ));
    const observed = impairmentObserved(profile, afterResumeMoveA, afterResumeMoveB);
    const assertions = {
      twoIsolatedContexts: contextA !== contextB,
      sameRoom: aJoined.configuration.roomCode === bJoined.configuration.roomCode,
      sameMatch: aJoined.authority.matchId === bJoined.authority.matchId,
      sameSimulationIdentity: identityKey(aJoined.authority.simulationIdentity)
        === identityKey(bJoined.authority.simulationIdentity),
      protocolV2: aJoined.authority.protocolVersion === 2
        && bJoined.authority.protocolVersion === 2,
      authorityTickNear20Hz: measuredTickHz >= 17 && measuredTickHz <= 23,
      localAuthorityPositionMoved: positionDeltaMillimeters(
        beforeMoveA.local.authoritativePosition,
        afterMoveA.local.authoritativePosition,
      ) > 0,
      peerReceivedRemoteSamples: afterMoveB.counters.remoteSamples
        > beforeMoveB.counters.remoteSamples,
      peerRenderedRemoteInterpolation: Object.entries(afterMoveB.counters.interpolationModes)
        .filter(([mode]) => mode !== 'empty')
        .reduce((sum, [, count]) => sum + count, 0) > 0,
      resumePreservedPlayer: resumedA.authority.playerId === originalPlayerId,
      resumePreservedMatch: resumedA.authority.matchId === originalMatchId,
      resumeTokenRotated: resumedA.resume.generation === 1
        && resumedA.counters.resumeTokenRotations === 1,
      postResumeAuthorityMovement: positionDeltaMillimeters(
        resumedA.local.authoritativePosition,
        afterResumeMoveA.local.authoritativePosition,
      ) > 0,
      impairmentPhenomenaObserved: observed.expectedPhenomenaObserved,
      impairmentQueuesBounded: observed.maximumObservedQueueDepth <= 4_096,
      clientsStayedJoined: afterResumeMoveA.connection.phase === 'joined'
        && afterResumeMoveB.connection.phase === 'joined',
      noClientLastError: afterResumeMoveA.lastError === null
        && afterResumeMoveB.lastError === null,
      noCriticalBrowserErrors: criticalBrowserLog.length === 0,
    };
    return {
      schemaVersion: 1,
      profile,
      capturedAt,
      completedAt: new Date().toISOString(),
      roomCode,
      matchId: afterResumeMoveA.authority.matchId,
      simulationIdentity: afterResumeMoveA.authority.simulationIdentity,
      measuredAuthorityTick: {
        before: idleMetricsBefore.serverTick,
        after: idleMetricsAfter.serverTick,
        elapsedMilliseconds: idleElapsedMilliseconds,
        measuredHz: measuredTickHz,
        note: 'Measured with two joined idle-input evidence clients; input-independent ticking is separately covered by the Worker-isolate socket test.',
      },
      movement: {
        initialAuthorityDeltaMillimeters: positionDeltaMillimeters(
          beforeMoveA.local.authoritativePosition,
          afterMoveA.local.authoritativePosition,
        ),
        postResumeAuthorityDeltaMillimeters: positionDeltaMillimeters(
          resumedA.local.authoritativePosition,
          afterResumeMoveA.local.authoritativePosition,
        ),
      },
      reconnect: {
        originalPlayerId,
        resumedPlayerId: resumedA.authority.playerId,
        originalMatchId,
        resumedMatchId: resumedA.authority.matchId,
        resumeGeneration: resumedA.resume.generation,
        resumeTokenLength: resumedA.resume.tokenLength,
        resumeTokenValueCaptured: false,
      },
      correction: {
        peerA: afterResumeMoveA.local.correctionBounds,
        peerB: afterResumeMoveB.local.correctionBounds,
        modesA: afterResumeMoveA.counters.reconciliationModes,
        modesB: afterResumeMoveB.counters.reconciliationModes,
        recoverableInputRejectionsA: afterResumeMoveA.input.authorityInputRejections,
        recoverableInputRejectionsB: afterResumeMoveB.input.authorityInputRejections,
      },
      remotePresentation: {
        peerA: {
          samples: afterResumeMoveA.counters.remoteSamples,
          insertions: afterResumeMoveA.counters.remoteInsertions,
          modes: afterResumeMoveA.counters.interpolationModes,
        },
        peerB: {
          samples: afterResumeMoveB.counters.remoteSamples,
          insertions: afterResumeMoveB.counters.remoteInsertions,
          modes: afterResumeMoveB.counters.interpolationModes,
        },
      },
      impairment: {
        observed,
        peerA: afterResumeMoveA.impairment,
        peerB: afterResumeMoveB.impairment,
      },
      workerMetrics: {
        idleBefore: idleMetricsBefore,
        idleAfter: idleMetricsAfter,
        final: finalMetrics,
      },
      browserLog,
      criticalBrowserLog,
      assertions,
      passed: Object.values(assertions).every(Boolean),
      snapshots: {
        aJoined,
        bJoined,
        beforeMoveA,
        beforeMoveB,
        afterMoveA,
        afterMoveB,
        resumedA,
        afterResumeMoveA,
        afterResumeMoveB,
      },
    };
  } finally {
    await Promise.allSettled([contextA.close(), contextB.close()]);
  }
}

async function packageVersion(relativePath) {
  return JSON.parse(await readFile(path.join(REPO_ROOT, relativePath), 'utf8')).version;
}

async function main() {
  const outputDirectory = safeOutputPath(argument('--output', DEFAULT_OUTPUT));
  if (await isPortOpen(5173) || await isPortOpen(8787)) {
    throw new Error('Ports 5173 and 8787 must both be free so the evidence run owns its exact runtimes.');
  }
  await mkdir(path.join(outputDirectory, 'screenshots'), { recursive: true });
  await mkdir(path.join(outputDirectory, 'logs'), { recursive: true });

  const authority = startService('wrangler', [
    'node_modules/wrangler/bin/wrangler.js',
    'dev',
    '--config',
    'wrangler.jsonc',
    '--port',
    '8787',
  ]);
  const vite = startService('vite', [
    'node_modules/vite/bin/vite.js',
    '--host',
    '127.0.0.1',
    '--port',
    '5173',
    '--strictPort',
  ]);
  let browser = null;
  let matrix = null;
  let terminalError = null;
  try {
    const healthResponse = await waitForHttp(`${AUTHORITY_ORIGIN}/health`, 'Authority');
    const health = await healthResponse.json();
    await waitForHttp(VITE_ORIGIN, 'Vite');
    browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
    const profileResults = [];
    for (const profile of PROFILES) {
      process.stdout.write(`Capturing ${profile}...\n`);
      profileResults.push(await captureProfile(browser, outputDirectory, profile));
    }
    const probeContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const probePage = await probeContext.newPage();
    await probePage.goto(VITE_ORIGIN, { waitUntil: 'domcontentloaded' });
    const adversarialRoom = await createAdversarialRoom();
    const adversarial = await forgedTransformProbe(probePage, adversarialRoom.roomCode);
    await probeContext.close();

    const packageLock = await readFile(path.join(REPO_ROOT, 'package-lock.json'));
    matrix = {
      schemaVersion: 1,
      evidenceId: 'phase-4-g3-authoritative-movement-2026-07-20',
      capturedAt: new Date().toISOString(),
      status: profileResults.every(({ passed }) => passed)
        ? 'FIVE_PROFILE_LOCAL_MATRIX_PASS'
        : 'FIVE_PROFILE_LOCAL_MATRIX_FAIL',
      gateDecision: 'NONE',
      gateClaim: 'G3_NOT_ACCEPTED',
      deploymentPerformed: false,
      runtime: {
        node: process.version,
        platform: `${process.platform}-${process.arch}`,
        chromeExecutable: CHROME_PATH,
        playwright: await packageVersion('node_modules/playwright/package.json'),
        vite: await packageVersion('node_modules/vite/package.json'),
        wrangler: await packageVersion('node_modules/wrangler/package.json'),
        health,
        packageLockSha256: createHash('sha256').update(packageLock).digest('hex'),
      },
      exactInvocation: [process.execPath, ...process.argv.slice(1)],
      serviceCommands: [authority.command, vite.command],
      profileOrder: PROFILES,
      profiles: profileResults,
      adversarial,
      aggregateAssertions: {
        allFiveProfilesCaptured: profileResults.length === PROFILES.length,
        allFiveProfilesPassed: profileResults.every(({ passed }) => passed),
        allRoomsAndMatchesSharedByPeers: profileResults.every(({ assertions }) => (
          assertions.sameRoom && assertions.sameMatch && assertions.sameSimulationIdentity
        )),
        allReconnectsPreservedIdentity: profileResults.every(({ assertions }) => (
          assertions.resumePreservedPlayer
          && assertions.resumePreservedMatch
          && assertions.resumeTokenRotated
        )),
        allProfilesMovedBeforeAndAfterResume: profileResults.every(({ assertions }) => (
          assertions.localAuthorityPositionMoved && assertions.postResumeAuthorityMovement
        )),
        allProfilesRenderedRemotePeers: profileResults.every(({ assertions }) => (
          assertions.peerReceivedRemoteSamples && assertions.peerRenderedRemoteInterpolation
        )),
        allExpectedImpairmentsObserved: profileResults.every(({ assertions }) => (
          assertions.impairmentPhenomenaObserved
        )),
        allClientsHealthy: profileResults.every(({ assertions }) => (
          assertions.clientsStayedJoined
          && assertions.noClientLastError
          && assertions.noCriticalBrowserErrors
        )),
        forgedTransformRejectedWithoutMutation: adversarial.rejectionCode
          === 'PROTOCOL_FORBIDDEN_COMMAND'
          && adversarial.forgedPositionAbsent
          && adversarial.socketRemainedOpen
          && adversarial.laterSnapshotTickAdvanced,
      },
      scopeBoundary: [
        'This is a deterministic five-profile local two-browser matrix, not a human G3 acceptance decision.',
        'The five named profiles are implementation stress cases; they do not by themselves cover the governing full Cartesian RTT/jitter/loss/duplication/render-FPS matrix.',
        'Worker-isolate coverage, not the idle-input browser span, proves input-independent ticking.',
        'No staging WSS, public authentication, hibernation/cost, checkpoint rehydration, load/backpressure, delta baseline, grace-expiry, version-rejection, or full-resync runtime matrix is claimed here.',
        'No deployment, publication, or account mutation was performed.',
      ],
    };
    await writeFile(
      path.join(outputDirectory, 'runtime-matrix.json'),
      `${JSON.stringify(matrix, null, 2)}\n`,
      'utf8',
    );
  } catch (error) {
    terminalError = error instanceof Error ? `${error.stack ?? error.message}` : String(error);
    throw error;
  } finally {
    if (browser !== null) await browser.close().catch(() => undefined);
    await Promise.allSettled([stopService(authority), stopService(vite)]);
    await writeFile(
      path.join(outputDirectory, 'logs', 'wrangler.jsonl'),
      `${authority.records.map((record) => JSON.stringify(record)).join('\n')}\n`,
      'utf8',
    );
    await writeFile(
      path.join(outputDirectory, 'logs', 'vite.jsonl'),
      `${vite.records.map((record) => JSON.stringify(record)).join('\n')}\n`,
      'utf8',
    );
    if (terminalError !== null) {
      await writeFile(path.join(outputDirectory, 'logs', 'capture-error.txt'), `${terminalError}\n`);
    }
  }
  const passed = matrix !== null
    && Object.values(matrix.aggregateAssertions).every(Boolean);
  process.stdout.write(`${JSON.stringify({
    outputDirectory,
    profiles: matrix?.profiles.map(({ profile, passed: profilePassed }) => ({
      profile,
      passed: profilePassed,
    })) ?? [],
    aggregatePassed: passed,
  }, null, 2)}\n`);
  if (!passed) process.exitCode = 1;
}

await main();
