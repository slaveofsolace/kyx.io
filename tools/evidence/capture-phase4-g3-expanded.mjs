import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import {
  deriveTransportFloodPlan,
  normalizeTransportLimitContract,
  verifyTransportFloodEvidence,
} from './g3-expanded-transport-contract.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_OUTPUT = path.join(
  REPO_ROOT,
  'evidence/2026-07-21/phase-4-g3-expanded/runs/local-v14',
);
const VITE_ORIGIN = 'http://127.0.0.1:5173';
const AUTHORITY_ORIGIN = 'http://127.0.0.1:8787';
const CHROME_PATH = process.env.KYX_CHROME_PATH
  ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const JOIN_TIMEOUT_MILLISECONDS = 30_000;
const PROFILE_CASES = Object.freeze([
  { profile: 'matrix-rtt-0', dimension: 'rtt', value: 0 },
  { profile: 'matrix-rtt-50', dimension: 'rtt', value: 50 },
  { profile: 'matrix-rtt-100', dimension: 'rtt', value: 100 },
  { profile: 'matrix-rtt-200', dimension: 'rtt', value: 200 },
  { profile: 'matrix-rtt-350', dimension: 'rtt', value: 350 },
  { profile: 'matrix-jitter-15', dimension: 'jitter', value: 15 },
  { profile: 'matrix-jitter-50', dimension: 'jitter', value: 50 },
  { profile: 'matrix-loss-1', dimension: 'loss', value: 1 },
  { profile: 'matrix-loss-3', dimension: 'loss', value: 3 },
  { profile: 'matrix-loss-8', dimension: 'loss', value: 8 },
  { profile: 'matrix-duplicate-1', dimension: 'duplication', value: 1 },
  { profile: 'matrix-duplicate-5', dimension: 'duplication', value: 5 },
  { profile: 'matrix-targeted-reorder', dimension: 'reordering', value: 'targeted-burst' },
  { profile: 'matrix-outage-recovery', dimension: 'recovery', value: 'bounded-outage' },
]);
const VIDEO_PROFILES = new Set([
  'matrix-rtt-350',
  'matrix-targeted-reorder',
  'matrix-outage-recovery',
]);
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
  const capture = (stream, chunk) => records.push({
    at: new Date().toISOString(),
    stream,
    text: chunk.toString('utf8'),
  });
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

async function transportLimitContract() {
  const absolute = path.join(REPO_ROOT, 'worker/transport-limits.json');
  const bytes = await readFile(absolute);
  return normalizeTransportLimitContract(
    JSON.parse(bytes.toString('utf8')),
    createHash('sha256').update(bytes).digest('hex'),
  );
}

function transportFloodCounters(metrics) {
  return {
    inboundMessagesReceived: metrics.transport.inboundMessagesReceived,
    inboundMessagesRateAccepted: metrics.transport.inboundMessagesRateAccepted,
    inboundMessagesRateRejected: metrics.transport.inboundMessagesRateRejected,
  };
}

async function createRoom() {
  const response = await fetch(`${AUTHORITY_ORIGIN}/api/rooms/create`, {
    method: 'POST',
    headers: { Origin: VITE_ORIGIN },
    cache: 'no-store',
  });
  const body = await response.json();
  if (response.status !== 201 || body.ok !== true) {
    throw new Error(`Room creation failed: HTTP ${response.status}`);
  }
  return rememberMetricsAccess(body);
}

async function diagnostics(page) {
  return await page.evaluate(() => {
    const surface = window.__KYX_AUTHORITY_EVIDENCE__;
    if (surface === undefined) throw new Error('Authority evidence surface is missing.');
    return surface.getSnapshot();
  });
}

async function waitForJoined(page) {
  await page.waitForFunction(() => {
    const snapshot = window.__KYX_AUTHORITY_EVIDENCE__?.getSnapshot();
    return snapshot?.connection.phase === 'joined'
      && snapshot.connection.socketState === 'open'
      && snapshot.lastError === null;
  }, undefined, { timeout: JOIN_TIMEOUT_MILLISECONDS });
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

async function captureInterpolatedObserver(page, movedEntityId, screenshotPath) {
  const presentationHandle = await page.waitForFunction((expectedEntityId) => {
    const surface = window.__KYX_AUTHORITY_EVIDENCE__;
    const presentation = surface?.samplePresentation();
    return presentation?.remotes.some(({ entityId, mode }) => (
      entityId === expectedEntityId && mode === 'interpolated'
    )) === true ? presentation : false;
  }, movedEntityId, { timeout: JOIN_TIMEOUT_MILLISECONDS });
  let presentation;
  try {
    presentation = await presentationHandle.jsonValue();
  } finally {
    await presentationHandle.dispose();
  }
  const captured = await page.evaluate(({ presentation: exactPresentation, expectedEntityId }) => {
    const remote = exactPresentation.remotes.find(({ entityId, mode }) => (
      entityId === expectedEntityId && mode === 'interpolated'
    ));
    if (remote === undefined) {
      throw new Error('Captured presentation lost the interpolated moved peer.');
    }
    const structuredSample = {
      capturedAt: new Date().toISOString(),
      entityId: remote.entityId,
      mode: remote.mode,
      estimatedServerTick: exactPresentation.estimatedServerTick,
    };
    const elementId = 'kyx-dev-only-observer-proof';
    const label = 'DEV-ONLY OBSERVER PROOF';
    document.getElementById(elementId)?.remove();
    const overlay = document.createElement('aside');
    overlay.id = elementId;
    overlay.setAttribute('data-observer-proof', JSON.stringify(structuredSample));
    overlay.textContent = [
      label,
      `Captured: ${structuredSample.capturedAt}`,
      `Entity: ${structuredSample.entityId}`,
      `Mode: ${structuredSample.mode}`,
      `Estimated server tick: ${structuredSample.estimatedServerTick.toFixed(3)}`,
    ].join('\n');
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '16px 16px auto auto',
      zIndex: '2147483647',
      maxWidth: '560px',
      padding: '14px 16px',
      border: '3px solid #25f2d0',
      borderRadius: '8px',
      background: 'rgba(3, 10, 18, 0.96)',
      color: '#f4fffd',
      font: '700 15px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace',
      letterSpacing: '0.02em',
      whiteSpace: 'pre-wrap',
      boxShadow: '0 0 0 2px rgba(0, 0, 0, 0.8), 0 12px 40px rgba(0, 0, 0, 0.5)',
      pointerEvents: 'none',
    });
    document.body.append(overlay);
    const renderedPayload = JSON.parse(overlay.getAttribute('data-observer-proof'));
    return {
      structuredSample,
      overlay: {
        elementId,
        label,
        payload: { ...structuredSample },
        renderedPayload,
      },
    };
  }, { presentation, expectedEntityId: movedEntityId });
  const snapshot = await diagnostics(page);
  await page.screenshot({ path: screenshotPath });
  return {
    capturedAt: captured.structuredSample.capturedAt,
    presentation,
    structuredSample: captured.structuredSample,
    overlay: captured.overlay,
    snapshot,
  };
}

function attachBrowserLog(page, peer, records, requestFailurePhase = () => 'steady') {
  page.on('console', (message) => records.push({
    at: new Date().toISOString(),
    peer,
    kind: 'console',
    level: message.type(),
    text: message.text(),
  }));
  page.on('pageerror', (error) => records.push({
    at: new Date().toISOString(),
    peer,
    kind: 'pageerror',
    level: 'error',
    text: error.message,
  }));
  page.on('requestfailed', (request) => records.push({
    at: new Date().toISOString(),
    peer,
    kind: 'requestfailed',
    navigationPhase: requestFailurePhase(),
    level: 'error',
    method: request.method(),
    url: request.url(),
    text: request.failure()?.errorText ?? 'unknown request failure',
  }));
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

function criticalBrowserRecords(records) {
  return records.filter((entry) => entry.kind === 'pageerror'
    || entry.kind === 'requestfailed'
    || (entry.kind === 'console' && entry.level === 'error')
    || (entry.kind === 'http' && entry.status >= 500));
}

function positionDelta(before, after) {
  if (before === null || after === null) return null;
  return Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
}

function identityKey(identity) {
  return JSON.stringify(identity, Object.keys(identity).sort());
}

function sameJson(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function summarizeConfig(config) {
  if (config.kind === 'seeded') return { ...config };
  const encoded = JSON.stringify(config.schedule);
  return {
    kind: 'scripted',
    startingClockMilliseconds: config.startingClockMilliseconds,
    maximumQueueDepth: config.maximumQueueDepth,
    scheduleLength: config.schedule.length,
    scheduleSha256: createHash('sha256').update(encoded).digest('hex'),
    dropDirectiveCount: config.schedule.filter(({ drop }) => drop).length,
    duplicateDirectiveCount: config.schedule
      .filter(({ duplicateDelayMilliseconds }) => duplicateDelayMilliseconds !== null).length,
    reorderDirectiveCount: config.schedule
      .filter(({ reorderDelayMilliseconds }) => reorderDelayMilliseconds > 0).length,
    firstDropOrdinals: config.schedule.flatMap(({ drop }, index) => drop ? [index] : []).slice(0, 24),
    firstReorderOrdinals: config.schedule
      .flatMap(({ reorderDelayMilliseconds }, index) => reorderDelayMilliseconds > 0 ? [index] : [])
      .slice(0, 24),
  };
}

function summarizeImpairment(diagnostics) {
  return {
    profile: diagnostics.profile,
    enabled: diagnostics.enabled,
    policy: diagnostics.policy,
    connectionsCreated: diagnostics.connectionsCreated,
    activeConnectionOrdinal: diagnostics.activeConnectionOrdinal,
    reliableControlFramesBypassedInbound: diagnostics.reliableControlFramesBypassedInbound,
    reliableControlFramesBypassedOutbound: diagnostics.reliableControlFramesBypassedOutbound,
    bootstrapGameplayFramesBypassedInbound: diagnostics.bootstrapGameplayFramesBypassedInbound,
    bootstrapGameplayFramesBypassedOutbound: diagnostics.bootstrapGameplayFramesBypassedOutbound,
    inbound: {
      config: summarizeConfig(diagnostics.inbound.config),
      metrics: diagnostics.inbound.metrics,
    },
    outbound: {
      config: summarizeConfig(diagnostics.outbound.config),
      metrics: diagnostics.outbound.metrics,
    },
    sessions: diagnostics.sessions.map((session) => ({
      connectionOrdinal: session.connectionOrdinal,
      socketState: session.socketState,
      gameplayImpairmentActive: session.gameplayImpairmentActive,
      reliableControlFramesBypassedInbound: session.reliableControlFramesBypassedInbound,
      reliableControlFramesBypassedOutbound: session.reliableControlFramesBypassedOutbound,
      bootstrapGameplayFramesBypassedInbound: session.bootstrapGameplayFramesBypassedInbound,
      bootstrapGameplayFramesBypassedOutbound: session.bootstrapGameplayFramesBypassedOutbound,
      inboundMetrics: session.inbound.metrics,
      outboundMetrics: session.outbound.metrics,
      strandedCopiesAtClose: session.strandedCopiesAtClose,
      impairmentFaults: session.impairmentFaults,
    })),
  };
}

function aggregateImpairment(first, second) {
  const directions = [
    first.inbound.metrics,
    first.outbound.metrics,
    second.inbound.metrics,
    second.outbound.metrics,
  ];
  const sum = (field) => directions.reduce((total, metrics) => total + metrics[field], 0);
  const maximum = (field) => Math.max(...directions.map((metrics) => metrics[field] ?? 0));
  const minimumValues = (field) => directions
    .map((metrics) => metrics[field])
    .filter((value) => value !== null);
  return {
    sentPackets: sum('sentPackets'),
    deliveredCopies: sum('deliveredCopies'),
    droppedPackets: sum('droppedPackets'),
    duplicatedPackets: sum('duplicatedPackets'),
    reorderImpairedPackets: sum('reorderImpairedPackets'),
    reorderedPackets: sum('reorderedPackets'),
    overflowRejectedPackets: sum('overflowRejectedPackets'),
    maximumObservedQueueDepth: maximum('maximumObservedQueueDepth'),
    minimumDeliveryLatencyMilliseconds: Math.min(
      ...minimumValues('minimumDeliveryLatencyMilliseconds'),
    ),
    maximumDeliveryLatencyMilliseconds: maximum('maximumDeliveryLatencyMilliseconds'),
  };
}

function configurations(first, second) {
  return [
    first.inbound.config,
    first.outbound.config,
    second.inbound.config,
    second.outbound.config,
  ];
}

function caseConfigurationMatches(testCase, first, second) {
  const configs = configurations(first, second);
  if (testCase.dimension === 'rtt') {
    return configs.every((config) => config.kind === 'seeded'
      && config.baseLatencyMilliseconds === testCase.value / 2
      && config.jitterMilliseconds === 0
      && config.lossRatePermille === 0
      && config.duplicateRatePermille === 0
      && config.reorderRatePermille === 0);
  }
  if (testCase.dimension === 'jitter') {
    return configs.every((config) => config.kind === 'seeded'
      && config.baseLatencyMilliseconds === 60
      && config.jitterMilliseconds === testCase.value
      && config.lossRatePermille === 0
      && config.duplicateRatePermille === 0
      && config.reorderRatePermille === 0);
  }
  if (testCase.dimension === 'loss') {
    return configs.every((config) => config.kind === 'seeded'
      && config.lossRatePermille === testCase.value * 10
      && config.duplicateRatePermille === 0
      && config.reorderRatePermille === 0);
  }
  if (testCase.dimension === 'duplication') {
    return configs.every((config) => config.kind === 'seeded'
      && config.lossRatePermille === 0
      && config.duplicateRatePermille === testCase.value * 10
      && config.reorderRatePermille === 0);
  }
  if (testCase.dimension === 'reordering') {
    return configs.every((config) => config.kind === 'scripted'
      && config.scheduleLength === 512
      && config.reorderDirectiveCount > 0
      && config.dropDirectiveCount === 0);
  }
  if (testCase.dimension === 'recovery') {
    const [aInbound, aOutbound, bInbound, bOutbound] = configs;
    return [aInbound, bInbound].every((config) => config.kind === 'scripted'
      && config.scheduleLength === 512
      && config.dropDirectiveCount === 18)
      && [aOutbound, bOutbound].every((config) => config.kind === 'seeded'
        && config.lossRatePermille === 0);
  }
  return false;
}

function casePhenomenaObserved(testCase, observed, firstFinal, secondFinal) {
  if (testCase.dimension === 'rtt') {
    return observed.minimumDeliveryLatencyMilliseconds === testCase.value / 2
      && observed.maximumDeliveryLatencyMilliseconds === testCase.value / 2;
  }
  if (testCase.dimension === 'jitter') {
    return observed.minimumDeliveryLatencyMilliseconds < 60
      && observed.maximumDeliveryLatencyMilliseconds > 60
      && observed.minimumDeliveryLatencyMilliseconds >= 60 - testCase.value
      && observed.maximumDeliveryLatencyMilliseconds <= 60 + testCase.value;
  }
  if (testCase.dimension === 'loss') return observed.droppedPackets > 0;
  if (testCase.dimension === 'duplication') return observed.duplicatedPackets > 0;
  if (testCase.dimension === 'reordering') {
    return observed.reorderImpairedPackets > 0 && observed.reorderedPackets > 0;
  }
  if (testCase.dimension === 'recovery') {
    return observed.droppedPackets >= 18
      && [firstFinal, secondFinal].some((snapshot) => (
        snapshot.counters.interpolationModes.extrapolated > 0
        && snapshot.counters.interpolationModes.stale > 0
        && snapshot.counters.interpolationModes.interpolated > 0
      ));
  }
  return false;
}

function compactSnapshot(snapshot) {
  return {
    connection: snapshot.connection,
    authority: snapshot.authority,
    input: snapshot.input,
    local: snapshot.local,
    remote: snapshot.remote,
    resume: snapshot.resume,
    counters: snapshot.counters,
    lastNotice: snapshot.lastNotice,
    lastError: snapshot.lastError,
  };
}

async function captureDimensionProfile(browser, outputDirectory, testCase) {
  const browserLog = [];
  const videoEnabled = VIDEO_PROFILES.has(testCase.profile);
  const videoOptions = videoEnabled ? {
    recordVideo: {
      dir: path.join(outputDirectory, 'video', '.playwright'),
      size: { width: 1280, height: 900 },
    },
  } : {};
  const contextA = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    ...videoOptions,
  });
  const contextB = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    ...videoOptions,
  });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const videoA = pageA.video();
  const videoB = pageB.video();
  attachBrowserLog(pageA, `${testCase.profile}:A`, browserLog);
  attachBrowserLog(pageB, `${testCase.profile}:B`, browserLog);
  const authority = encodeURIComponent(AUTHORITY_ORIGIN);
  const createUrl = `${VITE_ORIGIN}/__test__/authority?mode=create&displayName=Expanded%20A&authorityUrl=${authority}&impairment=${testCase.profile}`;
  let result;
  try {
    const roomCreation = nextBrowserRoomCreation(pageA);
    await pageA.goto(createUrl, { waitUntil: 'domcontentloaded', timeout: JOIN_TIMEOUT_MILLISECONDS });
    await roomCreation;
    const joinedA = await waitForJoined(pageA);
    const roomCode = joinedA.configuration.roomCode;
    const joinUrl = `${VITE_ORIGIN}/__test__/authority?mode=join&room=${encodeURIComponent(roomCode)}&displayName=Expanded%20B&authorityUrl=${authority}&impairment=${testCase.profile}`;
    await pageB.goto(joinUrl, { waitUntil: 'domcontentloaded', timeout: JOIN_TIMEOUT_MILLISECONDS });
    const joinedB = await waitForJoined(pageB);
    await Promise.all([waitForRemote(pageA), waitForRemote(pageB)]);

    const tickStartedAt = Date.now();
    const tickBefore = await roomMetrics(roomCode);
    await delay(1_000);
    const tickAfter = await roomMetrics(roomCode);
    const tickElapsedMilliseconds = Date.now() - tickStartedAt;
    const measuredAuthorityHz = (tickAfter.serverTick - tickBefore.serverTick)
      / (tickElapsedMilliseconds / 1_000);

    const beforeA = await diagnostics(pageA);
    const beforeB = await diagnostics(pageB);
    await pageA.keyboard.down('KeyW');
    await delay(120);
    const predictionLead = await diagnostics(pageA);
    const observerBMotionPromise = captureInterpolatedObserver(
      pageB,
      joinedA.authority.playerId,
      path.join(outputDirectory, 'screenshots', `${testCase.profile}-b-motion.png`),
    );
    await delay(680);
    await pageA.keyboard.up('KeyW');
    const observerBMotion = await observerBMotionPromise;
    await delay(2_500);
    const finalA = await diagnostics(pageA);
    const finalB = await diagnostics(pageB);
    const workerFinal = await roomMetrics(roomCode);

    const impairmentA = summarizeImpairment(finalA.impairment);
    const impairmentB = summarizeImpairment(finalB.impairment);
    const observed = aggregateImpairment(impairmentA, impairmentB);
    const critical = criticalBrowserRecords(browserLog);
    const highRttPredictionRequired = testCase.dimension === 'rtt' && testCase.value >= 200;
    const predictionLeadDelta = positionDelta(
      beforeA.local.predictedPosition,
      predictionLead.local.predictedPosition,
    );
    const authorityLeadDelta = positionDelta(
      beforeA.local.authoritativePosition,
      predictionLead.local.authoritativePosition,
    );
    const assertions = {
      twoIsolatedBrowserContexts: contextA !== contextB,
      sameRoom: joinedA.configuration.roomCode === joinedB.configuration.roomCode,
      sameMatch: joinedA.authority.matchId === joinedB.authority.matchId,
      sameSimulationIdentity: identityKey(joinedA.authority.simulationIdentity)
        === identityKey(joinedB.authority.simulationIdentity),
      protocolV2: joinedA.authority.protocolVersion === 2 && joinedB.authority.protocolVersion === 2,
      authorityTickNear20Hz: measuredAuthorityHz >= 17 && measuredAuthorityHz <= 23,
      authorityMovementObserved: positionDelta(
        beforeA.local.authoritativePosition,
        finalA.local.authoritativePosition,
      ) > 0,
      predictionLeadAtHighRtt: !highRttPredictionRequired
        || (predictionLeadDelta > 0 && authorityLeadDelta === 0),
      remoteSamplesAdvanced: finalB.counters.remoteSamples > beforeB.counters.remoteSamples,
      remoteInterpolationRendered: finalB.counters.interpolationModes.interpolated > 0,
      observerBInterpolatedMovedPeerDuringMotion:
        observerBMotion.snapshot.counters.interpolationModes.interpolated
          > beforeB.counters.interpolationModes.interpolated
        && observerBMotion.presentation.remotes.some(({ entityId, mode }) => (
          entityId === joinedA.authority.playerId && mode === 'interpolated'
        )),
      observerBMotionOverlayMatchesStructuredSample:
        observerBMotion.structuredSample.capturedAt === observerBMotion.capturedAt
        && observerBMotion.structuredSample.entityId === joinedA.authority.playerId
        && observerBMotion.structuredSample.mode === 'interpolated'
        && observerBMotion.structuredSample.estimatedServerTick
          === observerBMotion.presentation.estimatedServerTick
        && sameJson(observerBMotion.overlay.payload, observerBMotion.structuredSample)
        && sameJson(observerBMotion.overlay.renderedPayload, observerBMotion.structuredSample),
      reconciliationMeasured: finalA.local.correctionBounds.sampleCount > 0
        && finalB.local.correctionBounds.sampleCount > 0,
      reconciliationBelowTwoMeterSnapBoundary:
        finalA.local.correctionBounds.histogram.atLeast2000 === 0
        && finalB.local.correctionBounds.histogram.atLeast2000 === 0,
      exactNamedConfiguration: caseConfigurationMatches(testCase, impairmentA, impairmentB),
      expectedPhenomenaObserved: casePhenomenaObserved(
        testCase,
        observed,
        finalA,
        finalB,
      ),
      impairmentQueuesBounded: observed.maximumObservedQueueDepth <= 4_096
        && observed.overflowRejectedPackets === 0,
      controlFramesBypassedTruthfully: [impairmentA, impairmentB].every((impairment) => (
        impairment.policy.frameScope === 'gameplay_input_snapshot_ack_after_initial_full_snapshot'
        && impairment.policy.reliableControlPolicy
          === 'bypass_synthetic_loss_duplication_reorder_and_latency'
        && impairment.bootstrapGameplayFramesBypassedInbound >= 1
        && impairment.reliableControlFramesBypassedInbound >= 3
      )),
      bothClientsStayedJoined: finalA.connection.phase === 'joined'
        && finalB.connection.phase === 'joined'
        && finalA.connection.socketState === 'open'
        && finalB.connection.socketState === 'open',
      noClientErrors: finalA.lastError === null && finalB.lastError === null,
      noCriticalBrowserErrors: critical.length === 0,
      workerQueueBounded: workerFinal.maximumObservedQueueDepth <= 128,
    };

    await Promise.all([
      pageA.screenshot({
        path: path.join(outputDirectory, 'screenshots', `${testCase.profile}-a.png`),
      }),
      pageB.screenshot({
        path: path.join(outputDirectory, 'screenshots', `${testCase.profile}-b.png`),
      }),
    ]);
    result = {
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      profile: testCase.profile,
      dimension: testCase.dimension,
      requiredValue: testCase.value,
      roomCode,
      matchId: finalA.authority.matchId,
      simulationIdentity: finalA.authority.simulationIdentity,
      authorityTick: {
        before: tickBefore.serverTick,
        after: tickAfter.serverTick,
        elapsedMilliseconds: tickElapsedMilliseconds,
        measuredHz: measuredAuthorityHz,
      },
      movement: {
        authorityDeltaMillimeters: positionDelta(
          beforeA.local.authoritativePosition,
          finalA.local.authoritativePosition,
        ),
        predictionLeadDeltaMillimeters: predictionLeadDelta,
        authorityLeadDeltaMillimeters: authorityLeadDelta,
      },
      correction: {
        peerA: finalA.local.correctionBounds,
        peerB: finalB.local.correctionBounds,
        modesA: finalA.counters.reconciliationModes,
        modesB: finalB.counters.reconciliationModes,
      },
      remotePresentation: {
        peerA: {
          samples: finalA.counters.remoteSamples,
          insertions: finalA.counters.remoteInsertions,
          modes: finalA.counters.interpolationModes,
        },
        peerB: {
          samples: finalB.counters.remoteSamples,
          insertions: finalB.counters.remoteInsertions,
          modes: finalB.counters.interpolationModes,
        },
        observerBMotion: {
          capturedAt: observerBMotion.capturedAt,
          presentation: observerBMotion.presentation,
          structuredSample: observerBMotion.structuredSample,
          samples: observerBMotion.snapshot.counters.remoteSamples,
          insertions: observerBMotion.snapshot.counters.remoteInsertions,
          modes: observerBMotion.snapshot.counters.interpolationModes,
        },
      },
      visualEvidence: {
        observerBMotionScreenshot: `screenshots/${testCase.profile}-b-motion.png`,
        observerBMotionOverlay: observerBMotion.overlay,
        videos: videoEnabled
          ? [`video/${testCase.profile}-a.webm`, `video/${testCase.profile}-b.webm`]
          : [],
      },
      impairment: { observed, peerA: impairmentA, peerB: impairmentB },
      workerMetrics: { tickBefore, tickAfter, final: workerFinal },
      browserLog,
      criticalBrowserLog: critical,
      assertions,
      passed: Object.values(assertions).every(Boolean),
      snapshots: {
        joinedA: compactSnapshot(joinedA),
        joinedB: compactSnapshot(joinedB),
        beforeA: compactSnapshot(beforeA),
        beforeB: compactSnapshot(beforeB),
        predictionLead: compactSnapshot(predictionLead),
        observerBMotion: compactSnapshot(observerBMotion.snapshot),
        finalA: compactSnapshot(finalA),
        finalB: compactSnapshot(finalB),
      },
    };
    await writeFile(
      path.join(outputDirectory, 'profiles', `${testCase.profile}.json`),
      `${JSON.stringify(result, null, 2)}\n`,
      'utf8',
    );
  } finally {
    await Promise.allSettled([contextB.close(), contextA.close()]);
    if (videoEnabled) {
      await Promise.all([
        videoA?.saveAs(path.join(outputDirectory, 'video', `${testCase.profile}-a.webm`)),
        videoB?.saveAs(path.join(outputDirectory, 'video', `${testCase.profile}-b.webm`)),
      ]);
    }
  }
  return result;
}

async function captureRenderRates(browser) {
  const browserLog = [];
  const contextA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const contextB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  attachBrowserLog(pageA, 'render:A', browserLog);
  attachBrowserLog(pageB, 'render:B', browserLog);
  const authority = encodeURIComponent(AUTHORITY_ORIGIN);
  try {
    const roomCreation = nextBrowserRoomCreation(pageA);
    await pageA.goto(
      `${VITE_ORIGIN}/__test__/authority?mode=create&displayName=Render%20A&authorityUrl=${authority}&impairment=matrix-rtt-0`,
      { waitUntil: 'domcontentloaded', timeout: JOIN_TIMEOUT_MILLISECONDS },
    );
    await roomCreation;
    const joinedA = await waitForJoined(pageA);
    const roomCode = joinedA.configuration.roomCode;
    await pageB.goto(
      `${VITE_ORIGIN}/__test__/authority?mode=join&room=${encodeURIComponent(roomCode)}&displayName=Render%20B&authorityUrl=${authority}&impairment=matrix-rtt-0`,
      { waitUntil: 'domcontentloaded', timeout: JOIN_TIMEOUT_MILLISECONDS },
    );
    await waitForJoined(pageB);
    await Promise.all([waitForRemote(pageA), waitForRemote(pageB)]);
    const rows = [];
    for (const targetHz of [30, 60, 120]) {
      const before = await diagnostics(pageA);
      const metricsBefore = await roomMetrics(roomCode);
      const sample = await pageA.evaluate(async ({ hz, durationMilliseconds }) => {
        const surface = window.__KYX_AUTHORITY_EVIDENCE__;
        if (surface === undefined) throw new Error('Authority evidence surface is missing.');
        const startedAt = performance.now();
        let calls = 0;
        const interval = setInterval(() => {
          surface.samplePresentation();
          calls += 1;
        }, 1_000 / hz);
        await new Promise((resolve) => setTimeout(resolve, durationMilliseconds));
        clearInterval(interval);
        const elapsedMilliseconds = performance.now() - startedAt;
        return { calls, elapsedMilliseconds, measuredHz: calls / (elapsedMilliseconds / 1_000) };
      }, { hz: targetHz, durationMilliseconds: 2_000 });
      const after = await diagnostics(pageA);
      const metricsAfter = await roomMetrics(roomCode);
      const authorityHz = (metricsAfter.serverTick - metricsBefore.serverTick)
        / (sample.elapsedMilliseconds / 1_000);
      const commandHz = (after.counters.commandsGenerated - before.counters.commandsGenerated)
        / (sample.elapsedMilliseconds / 1_000);
      const minimumRenderHz = targetHz === 120 ? 105 : targetHz * 0.82;
      const maximumRenderHz = targetHz === 120 ? 150 : targetHz * 1.18;
      const assertions = {
        explicitPresentationSamplerReachedTargetBand:
          sample.measuredHz >= minimumRenderHz && sample.measuredHz <= maximumRenderHz,
        authorityStayedFixedNear20Hz: authorityHz >= 17 && authorityHz <= 23,
        inputSimulationStayedFixedNear20Hz: commandHz >= 17 && commandHz <= 23,
        renderSamplingDidNotScaleSimulation: sample.calls
          > after.counters.commandsGenerated - before.counters.commandsGenerated,
        clientStayedHealthy: after.connection.phase === 'joined' && after.lastError === null,
      };
      rows.push({
        targetHz,
        explicitPresentationSample: sample,
        authorityHz,
        commandHz,
        commandDelta: after.counters.commandsGenerated - before.counters.commandsGenerated,
        authorityTickDelta: metricsAfter.serverTick - metricsBefore.serverTick,
        assertions,
        passed: Object.values(assertions).every(Boolean),
      });
    }
    const critical = criticalBrowserRecords(browserLog);
    return {
      schemaVersion: 1,
      roomCode,
      rows,
      browserLog,
      criticalBrowserLog: critical,
      passed: rows.every(({ passed }) => passed) && critical.length === 0,
      boundary: 'These are explicit browser presentation-sampler rates; they do not claim physical 120 Hz display capture.',
    };
  } finally {
    await Promise.allSettled([contextA.close(), contextB.close()]);
  }
}

async function captureLifecycle(browser) {
  const browserLog = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  attachBrowserLog(page, 'lifecycle', browserLog);
  try {
    const room = await createRoom();
    await page.goto(VITE_ORIGIN, { waitUntil: 'domcontentloaded' });
    const result = await page.evaluate(async ({ authorityOrigin, room }) => {
      const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      const socketUrl = (roomCode) => {
        const url = new URL(`/api/rooms/${roomCode}/socket`, authorityOrigin);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        return url.toString();
      };
      const eventSequence = (eventId) => {
        if (eventId === null || eventId === undefined) return 0;
        const match = /^event\.([1-9][0-9]*)$/u.exec(eventId);
        return match === null ? 0 : Number(match[1]);
      };
      const connect = async (roomCode) => {
        const socket = new WebSocket(socketUrl(roomCode));
        const probe = {
          socket,
          messages: [],
          entities: new Map(),
          snapshotBaselineId: null,
          snapshotTick: null,
          lastEventId: null,
          lastEventSequence: 0,
          acknowledgementsSent: 0,
          deltaBaselineMisses: 0,
        };
        const acknowledge = () => {
          if (
            socket.readyState !== WebSocket.OPEN
            || probe.snapshotBaselineId === null
            || probe.snapshotTick === null
          ) return;
          socket.send(JSON.stringify({
            protocolVersion: 2,
            type: 'ack',
            snapshotBaselineVersion: 1,
            reliableEventStreamVersion: 1,
            snapshotBaselineId: probe.snapshotBaselineId,
            serverTick: probe.snapshotTick,
            lastEventId: probe.lastEventId,
          }));
          probe.acknowledgementsSent += 1;
        };
        socket.addEventListener('message', (event) => {
          if (typeof event.data !== 'string') return;
          try {
            const parsed = JSON.parse(event.data);
            let message = parsed;
            let shouldAcknowledge = false;
            if (parsed.type === 'fullSnapshot') {
              probe.entities.clear();
              for (const entity of parsed.entities) probe.entities.set(entity.id, entity);
              probe.snapshotBaselineId = parsed.snapshotBaselineId;
              probe.snapshotTick = parsed.serverTick;
              probe.lastEventId = parsed.reliableEventBaselineId ?? null;
              probe.lastEventSequence = eventSequence(probe.lastEventId);
              shouldAcknowledge = true;
            } else if (parsed.type === 'deltaSnapshot') {
              if (
                parsed.baseSnapshotBaselineId === probe.snapshotBaselineId
                && parsed.baseTick === probe.snapshotTick
              ) {
                for (const entityId of parsed.removedEntityIds) probe.entities.delete(entityId);
                for (const entity of parsed.entities) probe.entities.set(entity.id, entity);
                probe.snapshotBaselineId = parsed.snapshotBaselineId;
                probe.snapshotTick = parsed.serverTick;
                message = { ...parsed, entities: [...probe.entities.values()] };
                shouldAcknowledge = true;
              } else {
                probe.deltaBaselineMisses += 1;
              }
            } else if (parsed.type === 'reliableEventBatch') {
              for (const reliableEvent of parsed.events) {
                const sequence = eventSequence(reliableEvent.id);
                if (sequence > probe.lastEventSequence) {
                  probe.lastEventSequence = sequence;
                  probe.lastEventId = reliableEvent.id;
                }
                if (reliableEvent.kind === 'playerLeft') {
                  probe.entities.delete(reliableEvent.subjectId);
                }
              }
              shouldAcknowledge = true;
            }
            probe.messages.push(message);
            if (shouldAcknowledge) acknowledge();
          } catch { /* asserted by timeout */ }
        });
        await new Promise((resolve, reject) => {
          socket.addEventListener('open', resolve, { once: true });
          socket.addEventListener('error', () => reject(new Error('socket failed')), { once: true });
        });
        return probe;
      };
      const waitFor = async (probe, predicate, label, timeoutMilliseconds = 20_000) => {
        const startedAt = performance.now();
        while (performance.now() - startedAt < timeoutMilliseconds) {
          const found = probe.messages.find(predicate);
          if (found !== undefined) return found;
          await wait(10);
        }
        throw new Error(`Timed out waiting for ${label}: ${probe.messages.map(({ type }) => type).join(',')}`);
      };
      const join = async (probe, requestId, displayName) => {
        await waitFor(probe, (message) => message.type === 'welcome', `${displayName} welcome`);
        probe.socket.send(JSON.stringify({
          protocolVersion: 2,
          type: 'joinRoom',
          requestId,
          roomCode: room.roomCode,
          displayName,
        }));
        const accepted = await waitFor(
          probe,
          (message) => message.type === 'joinAccepted' && message.requestId === requestId,
          `${displayName} joinAccepted`,
        );
        const snapshot = await waitFor(
          probe,
          (message) => message.type === 'fullSnapshot'
            && message.localReconciliation?.player?.id === accepted.playerId,
          `${displayName} initial full snapshot`,
        );
        return { accepted, snapshot };
      };

      const a = await connect(room.roomCode);
      const aJoined = await join(a, 'request.lifecycle.a', 'Lifecycle A');
      const activation = await connect(room.roomCode);
      const activationJoined = await join(
        activation,
        'request.lifecycle.activation',
        'Lifecycle Passive Activation',
      );
      const inputIndependent = await waitFor(
        a,
        (message) => (message.type === 'fullSnapshot' || message.type === 'deltaSnapshot')
          && message.serverTick >= aJoined.snapshot.serverTick + 4,
        'input-independent tick advance',
      );
      const aBefore = inputIndependent.entities.find(({ id }) => id === aJoined.accepted.playerId);
      a.socket.send(JSON.stringify({
        protocolVersion: 2,
        type: 'inputBatch',
        commands: [{
          type: 'input',
          sequence: 0,
          clientTick: inputIndependent.serverTick,
          moveX: 0,
          moveY: 127,
          lookYawDeltaMilliDegrees: 0,
          lookPitchDeltaMilliDegrees: 0,
          heldButtons: 0,
          pressedButtons: 0,
          releasedButtons: 0,
        }],
      }));
      const aAck = await waitFor(
        a,
        (message) => message.type === 'inputAck' && message.lastProcessedInputSequence === 0,
        'A input acknowledgement',
      );
      const aMoved = await waitFor(
        a,
        (message) => (message.type === 'fullSnapshot' || message.type === 'deltaSnapshot')
          && message.serverTick >= aAck.serverTick
          && message.entities.some((entity) => entity.id === aJoined.accepted.playerId
            && entity.zMillimeters !== aBefore.zMillimeters),
        'A authoritative movement',
      );

      const b = await connect(room.roomCode);
      const bJoined = await join(b, 'request.lifecycle.b', 'Lifecycle Late B');
      const lateA = bJoined.snapshot.entities.find(({ id }) => id === aJoined.accepted.playerId);

      const duplicate = await connect(room.roomCode);
      await waitFor(duplicate, (message) => message.type === 'welcome', 'duplicate welcome');
      duplicate.socket.send(JSON.stringify({
        protocolVersion: 2,
        type: 'resumeRoom',
        requestId: 'request.lifecycle.duplicate',
        roomCode: room.roomCode,
        resumeToken: aJoined.accepted.resumeToken,
      }));
      const duplicateRejected = await waitFor(
        duplicate,
        (message) => message.type === 'joinRejected'
          && message.requestId === 'request.lifecycle.duplicate',
        'duplicate session rejection',
      );

      a.socket.send(JSON.stringify({
        protocolVersion: 2,
        type: 'requestFullSnapshot',
        requestId: 'request.lifecycle.resync',
        reason: 'history_gap',
      }));
      const resync = await waitFor(
        a,
        (message) => message.type === 'fullSnapshot'
          && message.resyncRequestId === 'request.lifecycle.resync',
        'correlated explicit full resync',
      );
      a.socket.send(JSON.stringify({
        protocolVersion: 2,
        type: 'requestFullSnapshot',
        requestId: 'request.lifecycle.resync-fast',
        reason: 'manual_evidence',
      }));
      const resyncRateLimited = await waitFor(
        a,
        (message) => message.type === 'error'
          && message.requestId === 'request.lifecycle.resync-fast',
        'full snapshot request rate limit',
      );

      const version = await connect(room.roomCode);
      await waitFor(version, (message) => message.type === 'welcome', 'version probe welcome');
      version.socket.send(JSON.stringify({
        protocolVersion: 1,
        type: 'joinRoom',
        requestId: 'request.lifecycle.version1',
        roomCode: room.roomCode,
        displayName: 'Version One',
      }));
      const versionRejected = await waitFor(
        version,
        (message) => message.type === 'error'
          && message.code === 'PROTOCOL_VERSION_UNSUPPORTED',
        'version rejection',
      );

      const tickBeforeLeave = resync.serverTick;
      const bClosed = new Promise((resolve) => {
        b.socket.addEventListener('close', resolve, { once: true });
      });
      b.socket.close(1000, 'lifecycle leave evidence');
      await bClosed;
      await wait(250);
      const graceFloorTick = Math.max(
        tickBeforeLeave,
        ...a.messages.flatMap((message) => (
          message.type === 'fullSnapshot' || message.type === 'deltaSnapshot'
        )
          ? [message.serverTick]
          : []),
      );
      const graceSnapshot = await waitFor(
        a,
        (message) => (message.type === 'fullSnapshot' || message.type === 'deltaSnapshot')
          && message.serverTick > graceFloorTick
          && message.entities.some(({ id }) => id === bJoined.accepted.playerId),
        'disconnected peer retained during grace',
        2_000,
      );
      const leaveSnapshot = await waitFor(
        a,
        (message) => (message.type === 'fullSnapshot' || message.type === 'deltaSnapshot')
          && message.serverTick > tickBeforeLeave
          && !message.entities.some(({ id }) => id === bJoined.accepted.playerId),
        'peer removal full snapshot',
        16_000,
      );

      const aClosed = new Promise((resolve) => {
        a.socket.addEventListener('close', resolve, { once: true });
      });
      a.socket.close(1000, 'lifecycle authenticated reconnect');
      await aClosed;
      const resumed = await connect(room.roomCode);
      await waitFor(resumed, (message) => message.type === 'welcome', 'resume welcome');
      resumed.socket.send(JSON.stringify({
        protocolVersion: 2,
        type: 'resumeRoom',
        requestId: 'request.lifecycle.resume',
        roomCode: room.roomCode,
        resumeToken: aJoined.accepted.resumeToken,
      }));
      const resumedJoin = await waitFor(
        resumed,
        (message) => message.type === 'joinAccepted'
          && message.requestId === 'request.lifecycle.resume',
        'authenticated resume accepted',
      );
      const resumedSnapshot = await waitFor(
        resumed,
        (message) => message.type === 'fullSnapshot'
          && message.localReconciliation?.player?.id === aJoined.accepted.playerId,
        'resume full snapshot',
      );

      const replay = await connect(room.roomCode);
      await waitFor(replay, (message) => message.type === 'welcome', 'replay welcome');
      replay.socket.send(JSON.stringify({
        protocolVersion: 2,
        type: 'resumeRoom',
        requestId: 'request.lifecycle.replay',
        roomCode: room.roomCode,
        resumeToken: aJoined.accepted.resumeToken,
      }));
      const replayRejected = await waitFor(
        replay,
        (message) => message.type === 'joinRejected'
          && message.requestId === 'request.lifecycle.replay',
        'resume replay rejected',
      );
      const assertions = {
        initialJoinFullSnapshot: aJoined.snapshot.entities
          .some(({ id }) => id === aJoined.accepted.playerId),
        serverTickAdvancedWithoutInput: inputIndependent.serverTick > aJoined.snapshot.serverTick
          && inputIndependent.localReconciliation.player.lastProcessedSequence === -1
          && activationJoined.snapshot.localReconciliation.player.lastProcessedSequence === -1,
        passiveActivationPeerDistinctAndVisibleWithoutInput:
          activationJoined.accepted.playerId !== aJoined.accepted.playerId
          && activationJoined.accepted.playerId !== bJoined.accepted.playerId
          && activationJoined.accepted.matchId === aJoined.accepted.matchId
          && inputIndependent.entities.some(({ id }) => id === activationJoined.accepted.playerId),
        lateJoinFullSnapshotContainsExistingMovedPlayer: lateA !== undefined
          && lateA.zMillimeters !== aBefore.zMillimeters
          && bJoined.snapshot.serverTick >= aMoved.serverTick,
        duplicateActiveSessionRejected: duplicateRejected.code === 'DUPLICATE_SESSION',
        explicitFullResyncCorrelated: resync.resyncRequestId === 'request.lifecycle.resync'
          && resync.localReconciliation.player.id === aJoined.accepted.playerId,
        fullResyncRateBounded: resyncRateLimited.code === 'FULL_SNAPSHOT_RATE_LIMITED',
        protocolVersionRejected: versionRejected.code === 'PROTOCOL_VERSION_UNSUPPORTED'
          && version.socket.readyState === WebSocket.OPEN,
        disconnectGracePreservedThenRemovedPlayer: graceSnapshot.entities
          .some(({ id }) => id === bJoined.accepted.playerId)
          && !leaveSnapshot.entities.some(({ id }) => id === bJoined.accepted.playerId),
        authenticatedReconnectPreservedIdentity: resumedJoin.playerId === aJoined.accepted.playerId
          && resumedJoin.matchId === aJoined.accepted.matchId
          && resumedJoin.connectionMode === 'resumed',
        resumeRotatedOpaqueToken: resumedJoin.resumeToken !== aJoined.accepted.resumeToken
          && resumedJoin.resumeToken.length === 43,
        reconnectBeganWithFullSnapshot: resumedSnapshot.localReconciliation.player.id
          === aJoined.accepted.playerId,
        replayedResumeTokenRejected: replayRejected.code === 'RESUME_REJECTED',
      };
      for (const probe of [duplicate, version, replay]) {
        if (probe.socket.readyState === WebSocket.OPEN) probe.socket.close(1000, 'lifecycle complete');
      }
      return {
        roomCode: room.roomCode,
        matchId: resumedJoin.matchId,
        playerId: resumedJoin.playerId,
        passiveActivationPeer: {
          purpose: 'satisfy minimum-player match start without sending input',
          playerId: activationJoined.accepted.playerId,
          matchId: activationJoined.accepted.matchId,
          initialLastProcessedSequence:
            activationJoined.snapshot.localReconciliation.player.lastProcessedSequence,
        },
        lateJoinPlayerId: bJoined.accepted.playerId,
        ticks: {
          initial: aJoined.snapshot.serverTick,
          inputIndependent: inputIndependent.serverTick,
          moved: aMoved.serverTick,
          lateJoin: bJoined.snapshot.serverTick,
          explicitResync: resync.serverTick,
          disconnectGrace: graceSnapshot.serverTick,
          leave: leaveSnapshot.serverTick,
          resumed: resumedSnapshot.serverTick,
        },
        rejectionCodes: {
          duplicate: duplicateRejected.code,
          resyncRate: resyncRateLimited.code,
          version: versionRejected.code,
          replay: replayRejected.code,
        },
        tokenValuesCaptured: false,
        protocolClientDiagnostics: {
          aAcknowledgementsSent: a.acknowledgementsSent,
          activationAcknowledgementsSent: activation.acknowledgementsSent,
          bAcknowledgementsSent: b.acknowledgementsSent,
          resumedAcknowledgementsSent: resumed.acknowledgementsSent,
          deltaBaselineMisses: a.deltaBaselineMisses
            + activation.deltaBaselineMisses
            + b.deltaBaselineMisses
            + resumed.deltaBaselineMisses,
        },
        assertions,
        passed: Object.values(assertions).every(Boolean),
      };
    }, { authorityOrigin: AUTHORITY_ORIGIN, room });
    const workerMetrics = await roomMetrics(result.roomCode);
    const assertions = {
      ...result.assertions,
      finalRoomHealthy: workerMetrics.players === 2 && workerMetrics.connectedPlayers === 2,
    };
    const critical = criticalBrowserRecords(browserLog);
    return {
      schemaVersion: 1,
      ...result,
      workerMetrics,
      assertions,
      browserLog,
      criticalBrowserLog: critical,
      passed: Object.values(assertions).every(Boolean) && critical.length === 0,
    };
  } finally {
    await context.close();
  }
}

async function captureRefreshResume(browser) {
  const browserLog = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  let navigationPhase = 'pre-reload';
  attachBrowserLog(page, 'refresh', browserLog, () => navigationPhase);
  try {
    const room = await createRoom();
    await page.goto(VITE_ORIGIN, { waitUntil: 'domcontentloaded' });
    const prepared = await page.evaluate(async ({ authorityOrigin, room }) => {
      const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      const url = new URL(`/api/rooms/${room.roomCode}/socket`, authorityOrigin);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const messages = [];
      const socket = new WebSocket(url);
      const transport = {
        snapshotBaselineId: null,
        serverTick: null,
        lastEventId: null,
        acknowledgementsSent: 0,
      };
      const acknowledge = () => {
        if (
          socket.readyState !== WebSocket.OPEN
          || transport.snapshotBaselineId === null
          || transport.serverTick === null
        ) return;
        socket.send(JSON.stringify({
          protocolVersion: 2,
          type: 'ack',
          snapshotBaselineVersion: 1,
          reliableEventStreamVersion: 1,
          snapshotBaselineId: transport.snapshotBaselineId,
          serverTick: transport.serverTick,
          lastEventId: transport.lastEventId,
        }));
        transport.acknowledgementsSent += 1;
      };
      socket.addEventListener('message', (event) => {
        if (typeof event.data !== 'string') return;
        const message = JSON.parse(event.data);
        if (message.type === 'fullSnapshot' || message.type === 'deltaSnapshot') {
          transport.snapshotBaselineId = message.snapshotBaselineId;
          transport.serverTick = message.serverTick;
        }
        if (message.type === 'fullSnapshot') {
          transport.lastEventId = message.reliableEventBaselineId ?? null;
        } else if (message.type === 'reliableEventBatch' && message.events.length > 0) {
          transport.lastEventId = message.events.at(-1).id;
        }
        messages.push(message);
        if (
          message.type === 'fullSnapshot'
          || message.type === 'deltaSnapshot'
          || message.type === 'reliableEventBatch'
        ) acknowledge();
      });
      await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true });
        socket.addEventListener('error', reject, { once: true });
      });
      const waitFor = async (predicate, label) => {
        for (let index = 0; index < 1_000; index += 1) {
          const found = messages.find(predicate);
          if (found !== undefined) return found;
          await wait(10);
        }
        throw new Error(`refresh prepare ${label}`);
      };
      await waitFor((message) => message.type === 'welcome', 'welcome');
      socket.send(JSON.stringify({
        protocolVersion: 2,
        type: 'joinRoom',
        requestId: 'request.refresh.join',
        roomCode: room.roomCode,
        displayName: 'Refresh Resume',
      }));
      const joined = await waitFor(
        (message) => message.type === 'joinAccepted'
          && message.requestId === 'request.refresh.join',
        'joinAccepted',
      );
      await waitFor(
        (message) => message.type === 'fullSnapshot'
          && message.localReconciliation?.player?.id === joined.playerId,
        'fullSnapshot',
      );
      sessionStorage.setItem('kyx.g3.refresh.room', room.roomCode);
      sessionStorage.setItem('kyx.g3.refresh.player', joined.playerId);
      sessionStorage.setItem('kyx.g3.refresh.match', joined.matchId);
      sessionStorage.setItem('kyx.g3.refresh.token', joined.resumeToken);
      return {
        roomCode: room.roomCode,
        playerId: joined.playerId,
        matchId: joined.matchId,
        socketStateBeforeReload: socket.readyState,
        activeSocketBeforeReload: socket.readyState === WebSocket.OPEN,
        acknowledgementsSentBeforeReload: transport.acknowledgementsSent,
      };
    }, { authorityOrigin: AUTHORITY_ORIGIN, room });
    const reloadStartedAt = new Date().toISOString();
    navigationPhase = 'reload-teardown';
    await page.reload({ waitUntil: 'domcontentloaded' });
    navigationPhase = 'post-reload';
    const reloadCompletedAt = new Date().toISOString();
    await delay(250);
    const resumed = await page.evaluate(async ({ authorityOrigin }) => {
      const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      const roomCode = sessionStorage.getItem('kyx.g3.refresh.room');
      const expectedPlayer = sessionStorage.getItem('kyx.g3.refresh.player');
      const expectedMatch = sessionStorage.getItem('kyx.g3.refresh.match');
      const token = sessionStorage.getItem('kyx.g3.refresh.token');
      if (roomCode === null || expectedPlayer === null || expectedMatch === null || token === null) {
        throw new Error('refresh session state missing');
      }
      const url = new URL(`/api/rooms/${roomCode}/socket`, authorityOrigin);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const messages = [];
      const socket = new WebSocket(url);
      const transport = {
        snapshotBaselineId: null,
        serverTick: null,
        lastEventId: null,
        acknowledgementsSent: 0,
      };
      const acknowledge = () => {
        if (
          socket.readyState !== WebSocket.OPEN
          || transport.snapshotBaselineId === null
          || transport.serverTick === null
        ) return;
        socket.send(JSON.stringify({
          protocolVersion: 2,
          type: 'ack',
          snapshotBaselineVersion: 1,
          reliableEventStreamVersion: 1,
          snapshotBaselineId: transport.snapshotBaselineId,
          serverTick: transport.serverTick,
          lastEventId: transport.lastEventId,
        }));
        transport.acknowledgementsSent += 1;
      };
      socket.addEventListener('message', (event) => {
        if (typeof event.data !== 'string') return;
        const message = JSON.parse(event.data);
        if (message.type === 'fullSnapshot' || message.type === 'deltaSnapshot') {
          transport.snapshotBaselineId = message.snapshotBaselineId;
          transport.serverTick = message.serverTick;
        }
        if (message.type === 'fullSnapshot') {
          transport.lastEventId = message.reliableEventBaselineId ?? null;
        } else if (message.type === 'reliableEventBatch' && message.events.length > 0) {
          transport.lastEventId = message.events.at(-1).id;
        }
        messages.push(message);
        if (
          message.type === 'fullSnapshot'
          || message.type === 'deltaSnapshot'
          || message.type === 'reliableEventBatch'
        ) acknowledge();
      });
      await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true });
        socket.addEventListener('error', reject, { once: true });
      });
      const waitFor = async (predicate, label) => {
        for (let index = 0; index < 1_000; index += 1) {
          const found = messages.find(predicate);
          if (found !== undefined) return found;
          await wait(10);
        }
        throw new Error(`refresh resume ${label}`);
      };
      await waitFor((message) => message.type === 'welcome', 'welcome');
      socket.send(JSON.stringify({
        protocolVersion: 2,
        type: 'resumeRoom',
        requestId: 'request.refresh.resume',
        roomCode,
        resumeToken: token,
      }));
      const accepted = await waitFor(
        (message) => message.type === 'joinAccepted'
          && message.requestId === 'request.refresh.resume',
        'joinAccepted',
      );
      const snapshot = await waitFor(
        (message) => message.type === 'fullSnapshot'
          && message.localReconciliation?.player?.id === expectedPlayer,
        'fullSnapshot',
      );
      const result = {
        roomCode,
        playerId: accepted.playerId,
        matchId: accepted.matchId,
        tokenValuesCaptured: false,
        assertions: {
          realDocumentReloadOccurred: performance.getEntriesByType('navigation')[0]?.type === 'reload',
          playerIdentityPreserved: accepted.playerId === expectedPlayer,
          matchIdentityPreserved: accepted.matchId === expectedMatch,
          connectionModeResumed: accepted.connectionMode === 'resumed',
          tokenRotated: accepted.resumeToken !== token && accepted.resumeToken.length === 43,
          resumedWithFullSnapshot: snapshot.localReconciliation.player.id === expectedPlayer,
        },
        protocolClientDiagnostics: {
          acknowledgementsSent: transport.acknowledgementsSent,
        },
      };
      for (const key of [
        'kyx.g3.refresh.room',
        'kyx.g3.refresh.player',
        'kyx.g3.refresh.match',
        'kyx.g3.refresh.token',
      ]) sessionStorage.removeItem(key);
      socket.close(1000, 'refresh evidence complete');
      return { ...result, passed: Object.values(result.assertions).every(Boolean) };
    }, { authorityOrigin: AUTHORITY_ORIGIN });
    const allCritical = criticalBrowserRecords(browserLog);
    const expectedReloadTeardownRequestFailures = allCritical.filter((entry) => (
      entry.kind === 'requestfailed'
        && entry.navigationPhase === 'reload-teardown'
        && entry.text === 'net::ERR_ABORTED'
        && new URL(entry.url).origin === VITE_ORIGIN
    ));
    const expectedReloadTeardownSet = new Set(expectedReloadTeardownRequestFailures);
    const critical = allCritical.filter((entry) => !expectedReloadTeardownSet.has(entry));
    const assertions = {
      activeSocketWasOpenAtDocumentReload: prepared.activeSocketBeforeReload === true
        && prepared.socketStateBeforeReload === 1,
      ...resumed.assertions,
      zeroUnexpectedCriticalBrowserFailuresAcrossReload: critical.length === 0,
    };
    return {
      schemaVersion: 1,
      prepared,
      resumed,
      reloadWindow: { startedAt: reloadStartedAt, completedAt: reloadCompletedAt },
      assertions,
      browserLog,
      expectedReloadTeardownRequestFailures,
      criticalBrowserLog: critical,
      passed: Object.values(assertions).every(Boolean) && critical.length === 0,
    };
  } finally {
    await context.close();
  }
}

async function captureAbuse(browser, transportContract) {
  const transportFloodPlan = deriveTransportFloodPlan(transportContract);
  const browserLog = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  attachBrowserLog(page, 'abuse', browserLog);
  try {
    const room = await createRoom();
    await page.goto(VITE_ORIGIN, { waitUntil: 'domcontentloaded' });
    const result = await page.evaluate(async ({ authorityOrigin, room }) => {
      const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      const socketUrl = new URL(`/api/rooms/${room.roomCode}/socket`, authorityOrigin);
      socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      const eventSequence = (eventId) => {
        if (eventId === null || eventId === undefined) return 0;
        const match = /^event\.([1-9][0-9]*)$/u.exec(eventId);
        return match === null ? 0 : Number(match[1]);
      };
      const connect = async () => {
        const socket = new WebSocket(socketUrl);
        const probe = {
          socket,
          messages: [],
          entities: new Map(),
          snapshotBaselineId: null,
          snapshotTick: null,
          lastEventId: null,
          lastEventSequence: 0,
          acknowledgementsSent: 0,
          deltaBaselineMisses: 0,
        };
        const acknowledge = () => {
          if (
            socket.readyState !== WebSocket.OPEN
            || probe.snapshotBaselineId === null
            || probe.snapshotTick === null
          ) return;
          socket.send(JSON.stringify({
            protocolVersion: 2,
            type: 'ack',
            snapshotBaselineVersion: 1,
            reliableEventStreamVersion: 1,
            snapshotBaselineId: probe.snapshotBaselineId,
            serverTick: probe.snapshotTick,
            lastEventId: probe.lastEventId,
          }));
          probe.acknowledgementsSent += 1;
        };
        socket.addEventListener('message', (event) => {
          if (typeof event.data !== 'string') return;
          const parsed = JSON.parse(event.data);
          let message = parsed;
          let shouldAcknowledge = false;
          if (parsed.type === 'fullSnapshot') {
            probe.entities.clear();
            for (const entity of parsed.entities) probe.entities.set(entity.id, entity);
            probe.snapshotBaselineId = parsed.snapshotBaselineId;
            probe.snapshotTick = parsed.serverTick;
            probe.lastEventId = parsed.reliableEventBaselineId ?? null;
            probe.lastEventSequence = eventSequence(probe.lastEventId);
            shouldAcknowledge = true;
          } else if (parsed.type === 'deltaSnapshot') {
            if (
              parsed.baseSnapshotBaselineId === probe.snapshotBaselineId
              && parsed.baseTick === probe.snapshotTick
            ) {
              for (const entityId of parsed.removedEntityIds) probe.entities.delete(entityId);
              for (const entity of parsed.entities) probe.entities.set(entity.id, entity);
              probe.snapshotBaselineId = parsed.snapshotBaselineId;
              probe.snapshotTick = parsed.serverTick;
              message = { ...parsed, entities: [...probe.entities.values()] };
              shouldAcknowledge = true;
            } else {
              probe.deltaBaselineMisses += 1;
            }
          } else if (parsed.type === 'reliableEventBatch') {
            for (const reliableEvent of parsed.events) {
              const sequence = eventSequence(reliableEvent.id);
              if (sequence > probe.lastEventSequence) {
                probe.lastEventSequence = sequence;
                probe.lastEventId = reliableEvent.id;
              }
              if (reliableEvent.kind === 'playerLeft') {
                probe.entities.delete(reliableEvent.subjectId);
              }
            }
            shouldAcknowledge = true;
          }
          probe.messages.push(message);
          if (shouldAcknowledge) acknowledge();
        });
        await new Promise((resolve, reject) => {
          socket.addEventListener('open', resolve, { once: true });
          socket.addEventListener('error', reject, { once: true });
        });
        return probe;
      };
      const waitFor = async (probe, predicate, label, timeoutMilliseconds = 10_000) => {
        const startedAt = performance.now();
        while (performance.now() - startedAt < timeoutMilliseconds) {
          const found = probe.messages.find(predicate);
          if (found !== undefined) return found;
          await wait(10);
        }
        throw new Error(`abuse ${label}: ${probe.messages.map(({ type }) => type).join(',')}`);
      };
      const attacker = await connect();
      await waitFor(attacker, (message) => message.type === 'welcome', 'welcome');
      attacker.socket.send(JSON.stringify({
        protocolVersion: 2,
        type: 'joinRoom',
        requestId: 'request.abuse.join',
        roomCode: room.roomCode,
        displayName: 'Abuse Probe',
      }));
      const joined = await waitFor(
        attacker,
        (message) => message.type === 'joinAccepted',
        'joinAccepted',
      );
      const initial = await waitFor(
        attacker,
        (message) => message.type === 'fullSnapshot'
          && message.localReconciliation?.player?.id === joined.playerId,
        'initial snapshot',
      );
      const witness = await connect();
      await waitFor(witness, (message) => message.type === 'welcome', 'witness welcome');
      witness.socket.send(JSON.stringify({
        protocolVersion: 2,
        type: 'joinRoom',
        requestId: 'request.abuse.witness',
        roomCode: room.roomCode,
        displayName: 'Abuse Witness',
      }));
      const witnessJoined = await waitFor(
        witness,
        (message) => message.type === 'joinAccepted',
        'witness joinAccepted',
      );
      await waitFor(
        witness,
        (message) => message.type === 'fullSnapshot'
          && message.localReconciliation?.player?.id === witnessJoined.playerId,
        'witness snapshot',
      );
      const active = await waitFor(
        attacker,
        (message) => (message.type === 'fullSnapshot' || message.type === 'deltaSnapshot')
          && message.serverTick > initial.serverTick,
        'active snapshot',
      );
      const before = active.entities.find(({ id }) => id === joined.playerId);

      attacker.socket.send(JSON.stringify({
        protocolVersion: 2,
        type: 'SetPosition',
        xMillimeters: 999_999,
        yMillimeters: 999_999,
        zMillimeters: 999_999,
      }));
      const forgedTransform = await waitFor(
        attacker,
        (message) => message.type === 'error'
          && message.code === 'PROTOCOL_FORBIDDEN_COMMAND',
        'forged transform',
      );
      attacker.socket.send(JSON.stringify({
        protocolVersion: 2,
        type: 'inputBatch',
        playerId: 'player.forged',
        commands: [{
          type: 'input', sequence: 0, clientTick: active.serverTick,
          moveX: 0, moveY: 0, lookYawDeltaMilliDegrees: 0,
          lookPitchDeltaMilliDegrees: 0, heldButtons: 0, pressedButtons: 0, releasedButtons: 0,
        }],
      }));
      const forgedPlayer = await waitFor(
        attacker,
        (message) => message.type === 'error'
          && message.code === 'PROTOCOL_UNKNOWN_FIELD'
          && message.detail === '$.playerId',
        'forged player id',
      );
      const command = (sequence) => ({
        type: 'input', sequence, clientTick: active.serverTick,
        moveX: 0, moveY: 0, lookYawDeltaMilliDegrees: 0,
        lookPitchDeltaMilliDegrees: 0, heldButtons: 0, pressedButtons: 0, releasedButtons: 0,
      });
      attacker.socket.send(JSON.stringify({
        protocolVersion: 2,
        type: 'inputBatch',
        commands: [command(0)],
      }));
      await waitFor(
        attacker,
        (message) => message.type === 'inputAck' && message.lastProcessedInputSequence === 0,
        'valid input ack',
      );
      attacker.socket.send(JSON.stringify({
        protocolVersion: 2,
        type: 'inputBatch',
        commands: [command(0)],
      }));
      const replay = await waitFor(
        attacker,
        (message) => message.type === 'error'
          && message.code === 'INPUT_REJECTED'
          && message.detail?.includes('duplicate_sequence'),
        'duplicate input replay',
      );
      attacker.socket.send(JSON.stringify({
        protocolVersion: 2,
        type: 'inputBatch',
        commands: [command(2_000)],
      }));
      const sequenceLead = await waitFor(
        attacker,
        (message) => message.type === 'error'
          && message.code === 'INPUT_REJECTED'
          && message.detail?.includes('sequence_too_far_ahead'),
        'sequence lead',
      );

      const floodStart = 1;
      for (let batchIndex = 0; batchIndex < 5; batchIndex += 1) {
        attacker.socket.send(JSON.stringify({
          protocolVersion: 2,
          type: 'inputBatch',
          commands: Array.from({ length: 32 }, (_, index) => command(
            floodStart + batchIndex * 32 + index,
          )),
        }));
      }
      await wait(250);
      const queueFullRejectionsObserved = attacker.messages.filter((message) => (
        message.type === 'error'
          && message.code === 'INPUT_REJECTED'
          && message.detail?.includes('queue_full')
      )).length;
      attacker.socket.send('x'.repeat(16_385));
      const oversized = await waitFor(
        attacker,
        (message) => message.type === 'error'
          && message.code === 'PROTOCOL_MESSAGE_TOO_LARGE',
        'oversized message',
      );
      attacker.socket.send('{not-json');
      const invalidJson = await waitFor(
        attacker,
        (message) => message.type === 'error'
          && message.code === 'PROTOCOL_INVALID_JSON',
        'invalid json',
      );
      const later = await waitFor(
        witness,
        (message) => (message.type === 'fullSnapshot' || message.type === 'deltaSnapshot')
          && message.serverTick > active.serverTick + 2,
        'post-abuse witness snapshot',
      );
      const after = later.entities.find(({ id }) => id === joined.playerId);

      const assertions = {
        forgedTransformRejected: forgedTransform.code === 'PROTOCOL_FORBIDDEN_COMMAND',
        forgedPlayerIdRejected: forgedPlayer.code === 'PROTOCOL_UNKNOWN_FIELD',
        replayRejected: replay.detail.includes('duplicate_sequence'),
        sequenceLeadRejected: sequenceLead.detail.includes('sequence_too_far_ahead'),
        oversizedMessageRejected: oversized.code === 'PROTOCOL_MESSAGE_TOO_LARGE',
        invalidJsonRejected: invalidJson.code === 'PROTOCOL_INVALID_JSON',
        forgedTransformDidNotMutateState: before.xMillimeters === after.xMillimeters
          && before.yMillimeters === after.yMillimeters
          && before.zMillimeters === after.zMillimeters,
        socketRemainedOpen: attacker.socket.readyState === WebSocket.OPEN,
      };
      attacker.socket.close(1000, 'abuse evidence complete');
      witness.socket.close(1000, 'abuse witness complete');
      return {
        roomCode: room.roomCode,
        matchId: joined.matchId,
        playerId: joined.playerId,
        rejectionCodes: {
          forgedTransform: forgedTransform.code,
          forgedPlayer: forgedPlayer.code,
          replay: replay.code,
          sequenceLead: sequenceLead.code,
          oversized: oversized.code,
          invalidJson: invalidJson.code,
        },
        authorityQueuePressure: {
          batchesSent: 5,
          commandsSent: 160,
          queueFullRejectionsObserved,
        },
        protocolClientDiagnostics: {
          attackerAcknowledgementsSent: attacker.acknowledgementsSent,
          witnessAcknowledgementsSent: witness.acknowledgementsSent,
          deltaBaselineMisses: attacker.deltaBaselineMisses + witness.deltaBaselineMisses,
        },
        tokenValuesCaptured: false,
        assertions,
        passed: Object.values(assertions).every(Boolean),
      };
    }, { authorityOrigin: AUTHORITY_ORIGIN, room });
    const workerMetricsBeforeTransportFlood = await roomMetrics(result.roomCode);
    const rawTransportFlood = await page.evaluate(async ({
      authorityOrigin,
      roomCode,
      messagesToSend,
    }) => {
      const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      const socketUrl = new URL(`/api/rooms/${roomCode}/socket`, authorityOrigin);
      socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      const messages = [];
      const socket = new WebSocket(socketUrl);
      socket.addEventListener('message', (event) => {
        if (typeof event.data === 'string') messages.push(JSON.parse(event.data));
      });
      await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true });
        socket.addEventListener('error', reject, { once: true });
      });
      const waitFor = async (predicate, label, timeoutMilliseconds = 10_000) => {
        const startedAt = performance.now();
        while (performance.now() - startedAt < timeoutMilliseconds) {
          const found = messages.find(predicate);
          if (found !== undefined) return found;
          await wait(10);
        }
        throw new Error(`transport flood ${label}: ${messages.map(({ type }) => type).join(',')}`);
      };
      await waitFor((message) => message.type === 'welcome', 'welcome');
      const closedPromise = new Promise((resolve) => {
        socket.addEventListener('close', (event) => resolve({
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        }), { once: true });
      });
      const payloads = Array.from({ length: messagesToSend }, (_, index) => JSON.stringify({
        protocolVersion: 2,
        type: 'ack',
        snapshotBaselineVersion: 1,
        reliableEventStreamVersion: 1,
        snapshotBaselineId: 'baseline.rate-flood',
        serverTick: 0,
        lastEventId: `event.${index + 1}`,
      }));
      let messagesSent = 0;
      for (const payload of payloads) {
        socket.send(payload);
        messagesSent += 1;
      }
      const rateLimited = await waitFor(
        (message) => message.type === 'error' && message.code === 'RATE_LIMITED',
        'rate limit',
      );
      const close = await Promise.race([
        closedPromise,
        wait(5_000).then(() => { throw new Error('transport flood socket did not close'); }),
      ]);
      return { messagesSent, rejectionCode: rateLimited.code, close };
    }, {
      authorityOrigin: AUTHORITY_ORIGIN,
      roomCode: result.roomCode,
      messagesToSend: transportFloodPlan.messagesSent,
    });
    const workerMetrics = await roomMetrics(result.roomCode);
    const transportFlood = {
      schemaVersion: 1,
      contract: transportContract,
      ...rawTransportFlood,
      workerCounters: {
        before: transportFloodCounters(workerMetricsBeforeTransportFlood),
        after: transportFloodCounters(workerMetrics),
      },
    };
    const transportFloodVerification = verifyTransportFloodEvidence(
      transportFlood,
      transportContract,
    );
    const authorityQueuePressure = {
      ...result.authorityQueuePressure,
      workerReportedQueueFullRejections: workerMetrics.inputRejections.queue_full,
      workerMaximumObservedQueueDepth: workerMetrics.maximumObservedQueueDepth,
    };
    const assertions = {
      ...result.assertions,
      queueFloodRateLimitedAndDisconnected: transportFlood.rejectionCode === 'RATE_LIMITED'
        && transportFlood.close.code === 1008,
      transportFloodCountersExact: transportFloodVerification.passed,
      queueFloodRejectedAndBounded: transportFlood.rejectionCode === 'RATE_LIMITED'
        && transportFlood.close.code === 1008
        && workerMetrics.inputRejections.queue_full > 0
        && workerMetrics.maximumObservedQueueDepth <= 128,
    };
    const critical = criticalBrowserRecords(browserLog);
    return {
      schemaVersion: 2,
      ...result,
      rejectionCodes: {
        ...result.rejectionCodes,
        queueFlood: transportFlood.rejectionCode,
      },
      transportFlood,
      transportFloodVerification,
      workerMetrics,
      authorityQueuePressure,
      assertions,
      browserLog,
      criticalBrowserLog: critical,
      passed: Object.values(assertions).every(Boolean) && critical.length === 0,
      boundary: 'Browser backpressure/slow-consumer saturation is not simulated by this probe.',
    };
  } finally {
    await context.close();
  }
}

async function packageVersion(relativePath) {
  return JSON.parse(await readFile(path.join(REPO_ROOT, relativePath), 'utf8')).version;
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

async function artifactInventory(outputDirectory, excluded = new Set()) {
  const files = (await recursiveFiles(outputDirectory)).sort();
  return await Promise.all(files.filter((absolute) => !excluded.has(absolute)).map(async (absolute) => {
    const bytes = await readFile(absolute);
    const details = await stat(absolute);
    return {
      path: path.relative(REPO_ROOT, absolute).replaceAll('\\', '/'),
      bytes: details.size,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  }));
}

async function main() {
  const outputDirectory = safeOutputPath(argument('--output', DEFAULT_OUTPUT));
  if (await isPortOpen(5173) || await isPortOpen(8787)) {
    throw new Error('Ports 5173 and 8787 must both be free so the evidence run owns its runtimes.');
  }
  const existingOutputEntries = await readdir(outputDirectory).catch((error) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  });
  if (existingOutputEntries.length > 0) {
    throw new Error('Expanded evidence output is not empty; preserve it and select a fresh --output.');
  }
  for (const directory of ['profiles', 'screenshots', 'video', 'logs']) {
    await mkdir(path.join(outputDirectory, directory), { recursive: true });
  }
  const matrixPath = path.join(outputDirectory, 'expanded-runtime-matrix.json');

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
    const transportContract = await transportLimitContract();
    await waitForHttp(VITE_ORIGIN, 'Vite');
    browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });

    const profiles = [];
    for (const testCase of PROFILE_CASES) {
      process.stdout.write(`Expanded G3 profile ${testCase.profile}...\n`);
      profiles.push(await captureDimensionProfile(browser, outputDirectory, testCase));
    }
    process.stdout.write('Expanded G3 render-rate sweep...\n');
    const renderRates = await captureRenderRates(browser);
    process.stdout.write('Expanded G3 lifecycle sweep...\n');
    const lifecycle = await captureLifecycle(browser);
    process.stdout.write('Expanded G3 real-refresh resume...\n');
    const refreshResume = await captureRefreshResume(browser);
    process.stdout.write('Expanded G3 abuse sweep...\n');
    const abuse = await captureAbuse(browser, transportContract);

    const packageLock = await readFile(path.join(REPO_ROOT, 'package-lock.json'));
    const coverage = {
      rttMilliseconds: [0, 50, 100, 200, 350].map((value) => ({
        value,
        evidenceProfile: `matrix-rtt-${value}`,
      })),
      jitterPlusMinusMilliseconds: [
        { value: 0, evidenceProfile: 'matrix-rtt-100' },
        { value: 15, evidenceProfile: 'matrix-jitter-15' },
        { value: 50, evidenceProfile: 'matrix-jitter-50' },
      ],
      lossPercent: [
        { value: 0, evidenceProfile: 'matrix-rtt-50' },
        { value: 1, evidenceProfile: 'matrix-loss-1' },
        { value: 3, evidenceProfile: 'matrix-loss-3' },
        { value: 8, evidenceProfile: 'matrix-loss-8' },
      ],
      duplicationPercent: [
        { value: 0, evidenceProfile: 'matrix-rtt-50' },
        { value: 1, evidenceProfile: 'matrix-duplicate-1' },
        { value: 5, evidenceProfile: 'matrix-duplicate-5' },
      ],
      reordering: [{ value: 'targeted-burst', evidenceProfile: 'matrix-targeted-reorder' }],
      renderRateHz: renderRates.rows.map(({ targetHz }) => targetHz),
      lifecycle: Object.keys(lifecycle.assertions),
      abuse: Object.keys(abuse.assertions),
      recovery: [{ value: 'bounded-outage', evidenceProfile: 'matrix-outage-recovery' }],
    };
    matrix = {
      schemaVersion: 1,
      evidenceId: 'phase-4-g3-expanded-local-v14-2026-07-22',
      capturedAt: new Date().toISOString(),
      status: profiles.every(({ passed }) => passed)
        && renderRates.passed
        && lifecycle.passed
        && refreshResume.passed
        && abuse.passed
        ? 'EXPANDED_LOCAL_G3_EVIDENCE_PASS'
        : 'EXPANDED_LOCAL_G3_EVIDENCE_FAIL',
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
        transportContract,
      },
      exactInvocation: [process.execPath, ...process.argv.slice(1)],
      serviceCommands: [authority.command, vite.command],
      profileOrder: PROFILE_CASES.map(({ profile }) => profile),
      profiles,
      renderRates,
      lifecycle,
      refreshResume,
      abuse,
      coverage,
      aggregateAssertions: {
        everyDimensionProfilePassed: profiles.every(({ passed }) => passed),
        everyRequiredRttPointCaptured: coverage.rttMilliseconds.length === 5,
        everyRequiredJitterPointMapped: coverage.jitterPlusMinusMilliseconds.length === 3,
        everyRequiredLossPointMapped: coverage.lossPercent.length === 4,
        everyRequiredDuplicationPointMapped: coverage.duplicationPercent.length === 3,
        targetedReorderCaptured: profiles.some(({ profile, passed }) => (
          profile === 'matrix-targeted-reorder' && passed
        )),
        boundedOutageRecoveryCaptured: profiles.some(({ profile, passed }) => (
          profile === 'matrix-outage-recovery' && passed
        )),
        everyRenderRatePassed: renderRates.passed,
        lifecyclePassed: lifecycle.passed,
        realRefreshResumePassed: refreshResume.passed,
        abuseProbePassed: abuse.passed,
        observerBMotionEvidenceCaptured: profiles.every(({ assertions }) => (
          assertions.observerBInterpolatedMovedPeerDuringMotion === true
        )),
        noTokenValueCaptured: lifecycle.tokenValuesCaptured === false
          && refreshResume.resumed.tokenValuesCaptured === false
          && abuse.tokenValuesCaptured === false,
      },
      scopeBoundary: [
        'This is local HTTP/WS development evidence with real Chromium contexts and a local Wrangler Durable Object runtime.',
        'Required impairment values are covered as factored one-dimension sweeps plus targeted reorder and bounded-outage cases; this is not the 540-case Cartesian product of every dimension combination.',
        'The 120 Hz row is an explicit browser presentation-sampler cadence, not physical 120 Hz monitor/video proof.',
        'Periodic movement snapshots remain gameplay-impaired; join/resume/version/resync control frames and the first bootstrap full snapshot bypass synthetic impairment by declared policy.',
        'These rows exercised versioned acknowledged delta snapshots in the current Worker. Missing/history fallback and reliable-event resend/deduplication are not acceptance claims of this expanded impairment harness; those belong to the separate successor transport evidence.',
        'Slow-consumer/backpressure saturation, public authentication, staging WSS, hibernation/checkpoint recovery, load/soak, and cost remain outside this local run.',
        'No deployment, publication, commit, reset, clean, or stash was performed.',
        'G3 remains unaccepted until all governing rows and required human acceptance are complete.',
      ],
    };
    await writeFile(matrixPath, `${JSON.stringify(matrix, null, 2)}\n`, 'utf8');
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
      await writeFile(
        path.join(outputDirectory, 'logs', 'capture-error.txt'),
        `${terminalError}\n`,
        'utf8',
      );
    }
  }
  const cleanup = {
    vitePort5173Free: !(await isPortOpen(5173)),
    authorityPort8787Free: !(await isPortOpen(8787)),
  };
  matrix.cleanup = cleanup;
  matrix.aggregateAssertions.ownedPortsReleased = Object.values(cleanup).every(Boolean);
  if (!matrix.aggregateAssertions.ownedPortsReleased) {
    matrix.status = 'EXPANDED_LOCAL_G3_EVIDENCE_FAIL';
  }
  const inventory = await artifactInventory(outputDirectory, new Set([matrixPath]));
  matrix.artifactInventory = inventory;
  await writeFile(matrixPath, `${JSON.stringify(matrix, null, 2)}\n`, 'utf8');
  const passed = matrix.status === 'EXPANDED_LOCAL_G3_EVIDENCE_PASS'
    && Object.values(matrix.aggregateAssertions).every(Boolean);
  process.stdout.write(`${JSON.stringify({
    outputDirectory,
    status: matrix.status,
    profiles: matrix.profiles.map(({ profile, passed: profilePassed }) => ({
      profile,
      passed: profilePassed,
    })),
    renderRates: matrix.renderRates.rows.map(({ targetHz, passed: ratePassed }) => ({
      targetHz,
      passed: ratePassed,
    })),
    lifecyclePassed: matrix.lifecycle.passed,
    refreshResumePassed: matrix.refreshResume.passed,
    abusePassed: matrix.abuse.passed,
    aggregatePassed: passed,
  }, null, 2)}\n`);
  if (!passed) process.exitCode = 1;
}

await main();
