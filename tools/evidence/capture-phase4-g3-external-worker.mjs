import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import WebSocket from 'ws';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCE_ROOT = path.join(
  REPO_ROOT,
  'evidence/2026-07-22/phase-4-g3-external-worker',
);
const RUNS_ROOT = path.join(EVIDENCE_ROOT, 'runs');
const RUNTIME_FILENAME = 'external-worker-runtime.json';
const LOCALHOST_ORIGIN = 'http://127.0.0.1:5173';
const FORBIDDEN_ORIGIN = 'https://g3-forbidden-origin.invalid';
const REQUEST_TIMEOUT_MILLISECONDS = 30_000;
const WAIT_POLL_MILLISECONDS = 10;
const PROTOCOL_VERSION = 2;

const SOURCE_FILES = Object.freeze([
  'package-lock.json',
  'src/net/protocol.ts',
  'src/net/schemas.ts',
  'worker/reliableEvents.ts',
  'worker/resumeSessions.ts',
  'worker/resumeToken.ts',
  'worker/metricsAccess.ts',
  'worker/room.ts',
  'worker/security.ts',
  'worker/snapshotBaselines.ts',
  'worker/worker.ts',
  'tools/evidence/capture-phase4-g3-external-worker.mjs',
  'tools/evidence/verify-phase4-g3-external-worker.mjs',
]);

const ASSERTION_KEYS = Object.freeze([
  'httpsHealthReached',
  'expectedBuildIdMatched',
  'roomBindingHealthy',
  'forbiddenOriginRejected',
  'httpsRoomCreated',
  'wssTransportUsed',
  'twoConcurrentProtocolV2Clients',
  'bothClientsJoined',
  'serverTickAdvanced',
  'bothClientsMaterializedDeltas',
  'bothClientsAutoAcknowledged',
  'inputAcceptedByAuthority',
  'authoritativeMovementObservedByBothClients',
  'forgedTransformRejected',
  'forgedTransformDidNotMutateAuthority',
  'initialSocketClosedCleanly',
  'resumeAuthenticatedByOpaqueCredential',
  'resumeIdentityPreserved',
  'resumeCredentialRotatedWithoutSerialization',
  'resumeStartedWithFullSnapshot',
  'metricsHealthy',
  'sourceFrozen',
  'sensitiveValuesNotSerialized',
  'scopeBoundariesRecorded',
]);

const TIMING_KEYS = Object.freeze([
  'healthMs',
  'forbiddenOriginMs',
  'createRoomMs',
  'clientAOpenMs',
  'clientAJoinAcceptedMs',
  'clientAInitialFullMs',
  'clientBOpenMs',
  'clientBJoinAcceptedMs',
  'clientBInitialFullMs',
  'tickAdvanceMs',
  'inputAckMs',
  'clientAAuthorityMovementMs',
  'clientBObservedMovementMs',
  'forgedTransformRejectionMs',
  'postForgerySnapshotMs',
  'resumeOpenMs',
  'resumeAcceptedMs',
  'resumeFullSnapshotMs',
  'metricsMs',
  'totalMs',
]);

function usage() {
  return [
    'Usage:',
    '  node tools/evidence/capture-phase4-g3-external-worker.mjs',
    '    --worker-origin https://<external-worker-host>',
    '    --expected-build-id <exact BUILD_ID>',
    '    --output evidence/2026-07-22/phase-4-g3-external-worker/runs/<fresh-run-id>',
    '',
    `The fixed allowed Origin is ${LOCALHOST_ORIGIN}. This is an external ephemeral-preview`,
    'transport smoke only; it does not deploy, exercise production-origin authentication/product',
    'flow, establish durable staging, or accept G3.',
  ].join('\n');
}

function requiredArgument(name) {
  const indexes = process.argv.flatMap((value, index) => value === name ? [index] : []);
  if (indexes.length !== 1) throw new Error(`${name} must be provided exactly once.`);
  const value = process.argv[indexes[0] + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function workerOrigin(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:') throw new Error('--worker-origin must use HTTPS.');
  if (parsed.username !== '' || parsed.password !== '') {
    throw new Error('--worker-origin cannot contain credentials.');
  }
  if (parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '') {
    throw new Error('--worker-origin must be an origin without a path, query, or fragment.');
  }
  return parsed.origin;
}

function expectedBuildId(value) {
  if (value.trim() !== value || value.length === 0 || Buffer.byteLength(value, 'utf8') > 64) {
    throw new Error('--expected-build-id must be 1-64 UTF-8 bytes without outer whitespace.');
  }
  return value;
}

function containedRunPath(value) {
  const resolved = path.resolve(REPO_ROOT, value);
  const relative = path.relative(RUNS_ROOT, resolved);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`--output must be a fresh child of ${path.relative(REPO_ROOT, RUNS_ROOT)}.`);
  }
  return resolved;
}

async function exists(absolute) {
  return await stat(absolute).then(() => true).catch((error) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  });
}

async function sha256File(relative) {
  const bytes = await readFile(path.join(REPO_ROOT, relative));
  return createHash('sha256').update(bytes).digest('hex');
}

async function sourceHashes() {
  return Object.fromEntries(await Promise.all(SOURCE_FILES.map(async (relative) => (
    [relative, await sha256File(relative)]
  ))));
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function roundMilliseconds(value) {
  return Math.round(value * 1_000) / 1_000;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestJson(url, options, label) {
  const startedAt = performance.now();
  let response;
  try {
    response = await fetch(url, {
      ...options,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
    });
  } catch {
    throw new Error(`${label} request failed.`);
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`${label} returned a non-JSON response.`);
  }
  return {
    status: response.status,
    body,
    durationMs: roundMilliseconds(performance.now() - startedAt),
    finalProtocol: new URL(response.url).protocol,
  };
}

function eventSequence(eventId) {
  if (eventId === null || eventId === undefined) return 0;
  const match = /^event\.([1-9][0-9]*)$/u.exec(eventId);
  return match === null ? 0 : Number(match[1]);
}

function positionDistance(left, right) {
  if (left === undefined || right === undefined) return Number.POSITIVE_INFINITY;
  return Math.hypot(
    right.xMillimeters - left.xMillimeters,
    right.yMillimeters - left.yMillimeters,
    right.zMillimeters - left.zMillimeters,
  );
}

class ProtocolV2Probe {
  constructor(label, url, origin) {
    this.label = label;
    this.url = url;
    this.origin = origin;
    this.socket = null;
    this.messages = [];
    this.entities = new Map();
    this.resumeCredentials = new Map();
    this.snapshotBaselineId = null;
    this.snapshotTick = null;
    this.lastEventId = null;
    this.lastEventSequence = 0;
    this.openLatencyMs = null;
    this.upgradeStatus = null;
    this.closeRecord = null;
    this.sentMessages = 0;
    this.receivedMessages = 0;
    this.protocolVersionViolations = 0;
    this.binaryMessages = 0;
    this.parseFailures = 0;
    this.fullSnapshotsMaterialized = 0;
    this.deltaSnapshotsMaterialized = 0;
    this.deltaBaselineMisses = 0;
    this.fullRecoveryRequests = 0;
    this.acknowledgementsSent = 0;
    this.reliableHistoryGaps = 0;
    this.socketErrors = 0;
    this.closed = new Promise((resolve) => { this.resolveClosed = resolve; });
  }

  async open() {
    const startedAt = performance.now();
    this.socket = new WebSocket(this.url, {
      origin: this.origin,
      handshakeTimeout: REQUEST_TIMEOUT_MILLISECONDS,
      followRedirects: false,
      maxPayload: 1_048_576,
      rejectUnauthorized: true,
    });
    this.socket.on('upgrade', (response) => { this.upgradeStatus = response.statusCode ?? null; });
    this.socket.on('message', (data, isBinary) => this.receive(data, isBinary));
    this.socket.on('close', (code, reason) => {
      this.closeRecord = {
        code,
        reason: reason.toString('utf8'),
      };
      this.resolveClosed(this.closeRecord);
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`${this.label} WSS open timed out.`)),
        REQUEST_TIMEOUT_MILLISECONDS,
      );
      const opened = () => {
        clearTimeout(timer);
        this.socket.off('error', failed);
        resolve();
      };
      const failed = () => {
        clearTimeout(timer);
        this.socket.off('open', opened);
        reject(new Error(`${this.label} WSS open failed.`));
      };
      this.socket.once('open', opened);
      this.socket.once('error', failed);
    });
    this.socket.on('error', () => { this.socketErrors += 1; });
    this.openLatencyMs = roundMilliseconds(performance.now() - startedAt);
    return this;
  }

  receive(data, isBinary) {
    if (isBinary) {
      this.binaryMessages += 1;
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(data.toString('utf8'));
    } catch {
      this.parseFailures += 1;
      return;
    }
    this.receivedMessages += 1;
    if (parsed.protocolVersion !== PROTOCOL_VERSION) this.protocolVersionViolations += 1;

    let message = parsed;
    if (parsed.type === 'joinAccepted') {
      const { resumeToken, ...publicMessage } = parsed;
      if (typeof resumeToken === 'string') {
        this.resumeCredentials.set(parsed.requestId, resumeToken);
      }
      message = {
        ...publicMessage,
        resumeCredentialPresent: typeof resumeToken === 'string',
        resumeCredentialLength: typeof resumeToken === 'string' ? resumeToken.length : null,
      };
    }

    let shouldAcknowledge = false;
    if (message.type === 'fullSnapshot') {
      this.entities.clear();
      for (const entity of message.entities) this.entities.set(entity.id, entity);
      this.snapshotBaselineId = message.snapshotBaselineId;
      this.snapshotTick = message.serverTick;
      this.lastEventId = message.reliableEventBaselineId ?? null;
      this.lastEventSequence = eventSequence(this.lastEventId);
      this.fullSnapshotsMaterialized += 1;
      shouldAcknowledge = true;
    } else if (message.type === 'deltaSnapshot') {
      if (
        message.baseSnapshotBaselineId === this.snapshotBaselineId
        && message.baseTick === this.snapshotTick
      ) {
        for (const entityId of message.removedEntityIds) this.entities.delete(entityId);
        for (const entity of message.entities) this.entities.set(entity.id, entity);
        this.snapshotBaselineId = message.snapshotBaselineId;
        this.snapshotTick = message.serverTick;
        this.deltaSnapshotsMaterialized += 1;
        message = { ...message, entities: [...this.entities.values()] };
        shouldAcknowledge = true;
      } else {
        this.deltaBaselineMisses += 1;
        if (this.fullRecoveryRequests === 0) {
          const sent = this.sendIfOpen({
            protocolVersion: PROTOCOL_VERSION,
            type: 'requestFullSnapshot',
            requestId: `request.external-recovery.${this.label}`,
            reason: 'missing_baseline',
          });
          if (sent) this.fullRecoveryRequests += 1;
        }
      }
    } else if (message.type === 'reliableEventBatch') {
      for (const reliableEvent of message.events) {
        const sequence = eventSequence(reliableEvent.id);
        if (sequence > this.lastEventSequence + 1) this.reliableHistoryGaps += 1;
        if (sequence > this.lastEventSequence) {
          this.lastEventSequence = sequence;
          this.lastEventId = reliableEvent.id;
        }
        if (reliableEvent.kind === 'playerLeft') this.entities.delete(reliableEvent.subjectId);
      }
      shouldAcknowledge = true;
    }

    this.messages.push({ at: performance.now(), message });
    if (shouldAcknowledge) this.acknowledge();
  }

  send(message) {
    if (!this.sendIfOpen(message)) {
      throw new Error(`${this.label} socket is not open.`);
    }
  }

  sendIfOpen(message) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    try {
      this.socket.send(JSON.stringify(message));
    } catch (error) {
      if (this.socket?.readyState !== WebSocket.OPEN) return false;
      throw error;
    }
    this.sentMessages += 1;
    return true;
  }

  acknowledge() {
    if (this.snapshotBaselineId === null || this.snapshotTick === null) return;
    const sent = this.sendIfOpen({
      protocolVersion: PROTOCOL_VERSION,
      type: 'ack',
      snapshotBaselineVersion: 1,
      reliableEventStreamVersion: 1,
      snapshotBaselineId: this.snapshotBaselineId,
      serverTick: this.snapshotTick,
      lastEventId: this.lastEventId,
    });
    if (sent) this.acknowledgementsSent += 1;
  }

  async waitFor(predicate, label, afterIndex = 0) {
    const startedAt = performance.now();
    while (performance.now() - startedAt < REQUEST_TIMEOUT_MILLISECONDS) {
      const index = this.messages.findIndex((entry, candidate) => (
        candidate >= afterIndex && predicate(entry.message)
      ));
      if (index >= 0) return { ...this.messages[index], index };
      await delay(WAIT_POLL_MILLISECONDS);
    }
    const types = this.messages.map(({ message }) => message.type).join(',');
    throw new Error(`${this.label} timed out waiting for ${label}; received: ${types}.`);
  }

  credentialFor(requestId) {
    return this.resumeCredentials.get(requestId) ?? null;
  }

  async close(code = 1000, reason = 'external evidence complete') {
    if (this.socket === null) return this.closeRecord;
    if (this.socket.readyState === WebSocket.OPEN) this.socket.close(code, reason);
    if (this.socket.readyState === WebSocket.CONNECTING) this.socket.terminate();
    await Promise.race([this.closed, delay(2_000)]);
    return this.closeRecord;
  }

  terminate() {
    if (
      this.socket !== null
      && this.socket.readyState !== WebSocket.CLOSED
      && this.socket.readyState !== WebSocket.CLOSING
    ) this.socket.terminate();
  }

  summary() {
    return {
      wss: this.url.startsWith('wss://'),
      upgradeStatus: this.upgradeStatus,
      openLatencyMs: this.openLatencyMs,
      sentMessages: this.sentMessages,
      receivedMessages: this.receivedMessages,
      protocolVersionViolations: this.protocolVersionViolations,
      binaryMessages: this.binaryMessages,
      parseFailures: this.parseFailures,
      fullSnapshotsMaterialized: this.fullSnapshotsMaterialized,
      deltaSnapshotsMaterialized: this.deltaSnapshotsMaterialized,
      deltaBaselineMisses: this.deltaBaselineMisses,
      fullRecoveryRequests: this.fullRecoveryRequests,
      acknowledgementsSent: this.acknowledgementsSent,
      reliableHistoryGaps: this.reliableHistoryGaps,
      socketErrors: this.socketErrors,
    };
  }
}

async function joinProbe(probe, roomCode, requestId, displayName) {
  const welcome = await probe.waitFor(
    (message) => message.type === 'welcome',
    `${displayName} welcome`,
  );
  const startedAt = performance.now();
  probe.send({
    protocolVersion: PROTOCOL_VERSION,
    type: 'joinRoom',
    requestId,
    roomCode,
    displayName,
  });
  const accepted = await probe.waitFor(
    (message) => message.type === 'joinAccepted' && message.requestId === requestId,
    `${displayName} join acceptance`,
  );
  const acceptedAt = performance.now();
  const full = await probe.waitFor(
    (message) => message.type === 'fullSnapshot'
      && message.localReconciliation?.player?.id === accepted.message.playerId,
    `${displayName} initial full snapshot`,
  );
  return {
    welcome: welcome.message,
    accepted: accepted.message,
    full: full.message,
    fullIndex: full.index,
    resumeCredential: probe.credentialFor(requestId),
    joinAcceptedMs: roundMilliseconds(acceptedAt - startedAt),
    initialFullMs: roundMilliseconds(performance.now() - startedAt),
  };
}

function totalRejections(inputRejections) {
  if (inputRejections === null || typeof inputRejections !== 'object') return null;
  return Object.values(inputRejections).reduce((sum, value) => (
    Number.isSafeInteger(value) ? sum + value : sum
  ), 0);
}

function forbiddenCredentialFields(value, currentPath = '$') {
  const forbidden = new Set([
    'resumetoken',
    'accesstoken',
    'authorization',
    'cookie',
    'password',
    'secret',
    'credentials',
  ]);
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => forbiddenCredentialFields(entry, `${currentPath}[${index}]`));
  }
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, entry]) => {
    const normalized = key.replaceAll(/[^a-z0-9]/giu, '').toLowerCase();
    const nestedPath = `${currentPath}.${key}`;
    return [
      ...(forbidden.has(normalized) ? [nestedPath] : []),
      ...forbiddenCredentialFields(entry, nestedPath),
    ];
  });
}

function assertCredentialFree(value, sensitiveValues) {
  const serialized = JSON.stringify(value);
  if (forbiddenCredentialFields(value).length > 0) {
    throw new Error('Evidence contains a forbidden credential field.');
  }
  for (const sensitiveValue of sensitiveValues) {
    if (typeof sensitiveValue === 'string' && sensitiveValue.length > 0 && serialized.includes(sensitiveValue)) {
      throw new Error('Evidence contains a sensitive runtime value.');
    }
  }
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log(usage());
    return;
  }
  const startedAtIso = new Date().toISOString();
  const totalStartedAt = performance.now();
  const authorityOrigin = workerOrigin(requiredArgument('--worker-origin'));
  const buildId = expectedBuildId(requiredArgument('--expected-build-id'));
  const runRoot = containedRunPath(requiredArgument('--output'));
  if (await exists(runRoot)) {
    throw new Error('--output already exists; preserve it and choose a fresh immutable run path.');
  }

  const hashesAtStart = await sourceHashes();
  const probes = [];
  const sensitiveValues = [];
  try {
    const health = await requestJson(
      new URL('/health', authorityOrigin),
      { method: 'GET' },
      'TLS health',
    );
    const forbidden = await requestJson(
      new URL('/api/rooms/create', authorityOrigin),
      { method: 'POST', headers: { Origin: FORBIDDEN_ORIGIN } },
      'forbidden-origin room creation',
    );
    const created = await requestJson(
      new URL('/api/rooms/create', authorityOrigin),
      { method: 'POST', headers: { Origin: LOCALHOST_ORIGIN } },
      'TLS room creation',
    );
    const room = created.body;
    if (
      created.status !== 201
      || room?.ok !== true
      || typeof room.roomCode !== 'string'
      || typeof room.socketPath !== 'string'
      || typeof room.metricsPath !== 'string'
      || typeof room.metricsAccess?.headerName !== 'string'
      || typeof room.metricsAccess?.credential !== 'string'
      || typeof room.metricsAccess?.expiresAt !== 'number'
    ) throw new Error('TLS room creation contract failed.');
    sensitiveValues.push(room.metricsAccess.credential);

    const socketHttpUrl = new URL(room.socketPath, authorityOrigin);
    if (socketHttpUrl.origin !== authorityOrigin) throw new Error('Room socket escaped Worker origin.');
    socketHttpUrl.protocol = 'wss:';
    const socketUrl = socketHttpUrl.toString();

    const clientA = await new ProtocolV2Probe('client-a', socketUrl, LOCALHOST_ORIGIN).open();
    probes.push(clientA);
    const joinedA = await joinProbe(
      clientA,
      room.roomCode,
      'request.external.client-a.join',
      'External Client A',
    );
    if (joinedA.resumeCredential === null) throw new Error('Client A resume credential missing.');
    sensitiveValues.push(joinedA.resumeCredential);

    const clientB = await new ProtocolV2Probe('client-b', socketUrl, LOCALHOST_ORIGIN).open();
    probes.push(clientB);
    const joinedB = await joinProbe(
      clientB,
      room.roomCode,
      'request.external.client-b.join',
      'External Client B',
    );
    if (joinedB.resumeCredential === null) throw new Error('Client B resume credential missing.');
    sensitiveValues.push(joinedB.resumeCredential);
    const simultaneousOpen = clientA.socket?.readyState === WebSocket.OPEN
      && clientB.socket?.readyState === WebSocket.OPEN;

    const tickStartedAt = performance.now();
    const advancedA = await clientA.waitFor(
      (message) => (message.type === 'fullSnapshot' || message.type === 'deltaSnapshot')
        && message.serverTick >= joinedA.full.serverTick + 4,
      'input-independent server tick advance',
      joinedA.fullIndex,
    );
    const tickAdvanceMs = roundMilliseconds(performance.now() - tickStartedAt);
    const initialAForA = advancedA.message.entities.find(({ id }) => id === joinedA.accepted.playerId);
    const initialAForB = clientB.entities.get(joinedA.accepted.playerId);
    if (initialAForA === undefined || initialAForB === undefined) {
      throw new Error('Authoritative player A state missing before input.');
    }

    const inputStartedAt = performance.now();
    const inputAfterIndexA = clientA.messages.length;
    const inputAfterIndexB = clientB.messages.length;
    clientA.send({
      protocolVersion: PROTOCOL_VERSION,
      type: 'inputBatch',
      commands: [{
        type: 'input',
        sequence: 0,
        clientTick: advancedA.message.serverTick,
        moveX: 0,
        moveY: 127,
        lookYawDeltaMilliDegrees: 0,
        lookPitchDeltaMilliDegrees: 0,
        heldButtons: 0,
        pressedButtons: 0,
        releasedButtons: 0,
      }],
    });
    const inputAck = await clientA.waitFor(
      (message) => message.type === 'inputAck' && message.lastProcessedInputSequence === 0,
      'authoritative input acknowledgement',
      inputAfterIndexA,
    );
    const inputAckMs = roundMilliseconds(performance.now() - inputStartedAt);
    const movedA = await clientA.waitFor(
      (message) => (message.type === 'fullSnapshot' || message.type === 'deltaSnapshot')
        && message.serverTick >= inputAck.message.serverTick
        && positionDistance(
          initialAForA,
          message.entities.find(({ id }) => id === joinedA.accepted.playerId),
        ) > 0,
      'client A authoritative movement',
      inputAfterIndexA,
    );
    const clientAAuthorityMovementMs = roundMilliseconds(performance.now() - inputStartedAt);
    const observedAByB = await clientB.waitFor(
      (message) => (message.type === 'fullSnapshot' || message.type === 'deltaSnapshot')
        && message.serverTick >= inputAck.message.serverTick
        && positionDistance(
          initialAForB,
          message.entities.find(({ id }) => id === joinedA.accepted.playerId),
        ) > 0,
      'client B observation of authoritative movement',
      inputAfterIndexB,
    );
    const clientBObservedMovementMs = roundMilliseconds(performance.now() - inputStartedAt);

    await Promise.all([
      clientA.waitFor((message) => message.type === 'deltaSnapshot', 'client A delta'),
      clientB.waitFor((message) => message.type === 'deltaSnapshot', 'client B delta'),
    ]);

    const beforeForgery = clientB.entities.get(joinedB.accepted.playerId);
    const beforeForgeryTick = clientB.snapshotTick;
    if (beforeForgery === undefined || beforeForgeryTick === null) {
      throw new Error('Client B authoritative state missing before forgery probe.');
    }
    const forgeryStartedAt = performance.now();
    const forgeryAfterIndex = clientB.messages.length;
    clientB.send({
      protocolVersion: PROTOCOL_VERSION,
      type: 'SetPosition',
      xMillimeters: 999_999,
      yMillimeters: 999_999,
      zMillimeters: 999_999,
    });
    const forgedRejection = await clientB.waitFor(
      (message) => message.type === 'error' && message.code === 'PROTOCOL_FORBIDDEN_COMMAND',
      'forged-transform rejection',
      forgeryAfterIndex,
    );
    const forgedTransformRejectionMs = roundMilliseconds(performance.now() - forgeryStartedAt);
    const afterForgerySnapshot = await clientB.waitFor(
      (message) => (message.type === 'fullSnapshot' || message.type === 'deltaSnapshot')
        && message.serverTick >= beforeForgeryTick + 2,
      'post-forgery authoritative snapshot',
      forgeryAfterIndex,
    );
    const postForgerySnapshotMs = roundMilliseconds(performance.now() - forgeryStartedAt);
    const afterForgery = afterForgerySnapshot.message.entities.find(
      ({ id }) => id === joinedB.accepted.playerId,
    );
    const forgedTargetAbsent = afterForgery !== undefined
      && afterForgery.xMillimeters !== 999_999
      && afterForgery.yMillimeters !== 999_999
      && afterForgery.zMillimeters !== 999_999
      && positionDistance(beforeForgery, afterForgery) < 50_000;

    const closedA = await clientA.close(1000, 'external resume probe');
    await delay(250);
    const resumedA = await new ProtocolV2Probe(
      'client-a-resumed',
      socketUrl,
      LOCALHOST_ORIGIN,
    ).open();
    probes.push(resumedA);
    await resumedA.waitFor((message) => message.type === 'welcome', 'resume welcome');
    const resumeRequestId = 'request.external.client-a.resume';
    const resumeStartedAt = performance.now();
    resumedA.send({
      protocolVersion: PROTOCOL_VERSION,
      type: 'resumeRoom',
      requestId: resumeRequestId,
      roomCode: room.roomCode,
      resumeToken: joinedA.resumeCredential,
    });
    const resumedAccepted = await resumedA.waitFor(
      (message) => message.type === 'joinAccepted' && message.requestId === resumeRequestId,
      'authenticated resume acceptance',
    );
    const resumeAcceptedMs = roundMilliseconds(performance.now() - resumeStartedAt);
    const resumedFull = await resumedA.waitFor(
      (message) => message.type === 'fullSnapshot'
        && message.localReconciliation?.player?.id === joinedA.accepted.playerId,
      'resume full snapshot',
    );
    const resumeFullSnapshotMs = roundMilliseconds(performance.now() - resumeStartedAt);
    const rotatedResumeCredential = resumedA.credentialFor(resumeRequestId);
    if (rotatedResumeCredential === null) throw new Error('Rotated resume credential missing.');
    sensitiveValues.push(rotatedResumeCredential);
    const firstResumeSnapshot = resumedA.messages.find(
      ({ message }) => message.type === 'fullSnapshot' || message.type === 'deltaSnapshot',
    )?.message;
    await resumedA.waitFor((message) => message.type === 'deltaSnapshot', 'resumed client delta');

    const metrics = await requestJson(
      new URL(room.metricsPath, authorityOrigin),
      {
        method: 'GET',
        headers: {
          Origin: LOCALHOST_ORIGIN,
          [room.metricsAccess.headerName]: room.metricsAccess.credential,
        },
      },
      'room metrics',
    );
    const metricSnapshot = metrics.body?.metrics;
    const transportMetrics = metricSnapshot?.transport;
    const inputRejectionCount = totalRejections(metricSnapshot?.inputRejections);
    const metricsHealthy = metrics.status === 200
      && metrics.body?.ok === true
      && Number.isSafeInteger(metricSnapshot?.serverTick)
      && metricSnapshot.serverTick >= resumedFull.message.serverTick
      && (metricSnapshot.lifecycle === 'warmup' || metricSnapshot.lifecycle === 'active')
      && metricSnapshot.players === 2
      && metricSnapshot.connectedPlayers === 2
      && metricSnapshot.acceptedInputs >= 1
      && inputRejectionCount === 0
      && transportMetrics?.inboundMessagesRateRejected === 0
      && transportMetrics?.snapshotAcksRejected === 0
      && transportMetrics?.slowConsumerEvictions === 0
      && transportMetrics?.deltaSnapshotsSent >= 1
      && transportMetrics?.fullSnapshotsSent >= 3;

    const hashesAtEnd = await sourceHashes();
    const sourceFrozen = sameJson(hashesAtStart, hashesAtEnd);
    const scopeBoundaries = {
      localhostOriginAllowed: true,
      allowedOrigin: LOCALHOST_ORIGIN,
      productionOriginAuthenticationExercised: false,
      productionProductFlowExercised: false,
      externalAccessCredentialExercised: false,
      roomMetricsReadCredentialExercised: true,
      opaqueResumePossessionAuthenticationExercised: true,
      ephemeralPreviewOnly: true,
      durableStagingClaimed: false,
      remoteSourceAttestation: 'expected-build-id-only',
      g3AcceptanceClaimed: false,
    };
    const clientASummary = clientA.summary();
    const clientBSummary = clientB.summary();
    const resumedASummary = resumedA.summary();
    const assertions = {
      httpsHealthReached: health.status === 200
        && health.body?.ok === true
        && health.finalProtocol === 'https:',
      expectedBuildIdMatched: health.body?.buildId === buildId,
      roomBindingHealthy: health.body?.roomBinding === true,
      forbiddenOriginRejected: forbidden.status === 403
        && forbidden.body?.ok === false
        && forbidden.body?.code === 'ORIGIN_NOT_ALLOWED'
        && forbidden.finalProtocol === 'https:',
      httpsRoomCreated: created.status === 201
        && created.body?.ok === true
        && created.finalProtocol === 'https:'
        && /^KYX-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/u.test(room.roomCode)
        && room.socketPath === `/api/rooms/${room.roomCode}/socket`
        && room.metricsPath === `/api/rooms/${room.roomCode}/metrics`
        && /^[A-Za-z0-9_-]{43}$/u.test(room.metricsAccess.credential),
      wssTransportUsed: [clientASummary, clientBSummary, resumedASummary].every((summary) => (
        summary.wss === true && summary.upgradeStatus === 101
      )),
      twoConcurrentProtocolV2Clients: simultaneousOpen === true
        && joinedA.welcome.protocolConfig?.protocolVersion === PROTOCOL_VERSION
        && joinedB.welcome.protocolConfig?.protocolVersion === PROTOCOL_VERSION
        && clientASummary.protocolVersionViolations === 0
        && clientBSummary.protocolVersionViolations === 0,
      bothClientsJoined: joinedA.accepted.connectionMode === 'joined'
        && joinedB.accepted.connectionMode === 'joined'
        && joinedA.accepted.roomId === joinedB.accepted.roomId
        && joinedA.accepted.matchId === joinedB.accepted.matchId,
      serverTickAdvanced: advancedA.message.serverTick >= joinedA.full.serverTick + 4,
      bothClientsMaterializedDeltas: clientASummary.deltaSnapshotsMaterialized >= 1
        && clientBSummary.deltaSnapshotsMaterialized >= 1
        && clientASummary.deltaBaselineMisses === 0
        && clientBSummary.deltaBaselineMisses === 0,
      bothClientsAutoAcknowledged: clientASummary.acknowledgementsSent >= 2
        && clientBSummary.acknowledgementsSent >= 2,
      inputAcceptedByAuthority: inputAck.message.serverTick >= advancedA.message.serverTick,
      authoritativeMovementObservedByBothClients:
        positionDistance(
          initialAForA,
          movedA.message.entities.find(({ id }) => id === joinedA.accepted.playerId),
        ) > 0
        && positionDistance(
          initialAForB,
          observedAByB.message.entities.find(({ id }) => id === joinedA.accepted.playerId),
        ) > 0,
      forgedTransformRejected: forgedRejection.message.code === 'PROTOCOL_FORBIDDEN_COMMAND',
      forgedTransformDidNotMutateAuthority: forgedTargetAbsent,
      initialSocketClosedCleanly: closedA?.code === 1000,
      resumeAuthenticatedByOpaqueCredential: resumedAccepted.message.connectionMode === 'resumed'
        && resumedAccepted.message.resumeCredentialPresent === true,
      resumeIdentityPreserved: resumedAccepted.message.playerId === joinedA.accepted.playerId
        && resumedAccepted.message.roomId === joinedA.accepted.roomId
        && resumedAccepted.message.matchId === joinedA.accepted.matchId,
      resumeCredentialRotatedWithoutSerialization: rotatedResumeCredential !== joinedA.resumeCredential
        && joinedA.resumeCredential.length === 43
        && rotatedResumeCredential.length === 43,
      resumeStartedWithFullSnapshot: firstResumeSnapshot?.type === 'fullSnapshot'
        && resumedFull.message.localReconciliation?.player?.id === joinedA.accepted.playerId,
      metricsHealthy,
      sourceFrozen,
      sensitiveValuesNotSerialized: true,
      scopeBoundariesRecorded: scopeBoundaries.localhostOriginAllowed === true
        && scopeBoundaries.productionOriginAuthenticationExercised === false
        && scopeBoundaries.productionProductFlowExercised === false
        && scopeBoundaries.ephemeralPreviewOnly === true
        && scopeBoundaries.durableStagingClaimed === false
        && scopeBoundaries.g3AcceptanceClaimed === false,
    };
    if (!sameJson(Object.keys(assertions), ASSERTION_KEYS)) {
      throw new Error('Internal assertion contract drifted.');
    }
    const timings = {
      healthMs: health.durationMs,
      forbiddenOriginMs: forbidden.durationMs,
      createRoomMs: created.durationMs,
      clientAOpenMs: clientASummary.openLatencyMs,
      clientAJoinAcceptedMs: joinedA.joinAcceptedMs,
      clientAInitialFullMs: joinedA.initialFullMs,
      clientBOpenMs: clientBSummary.openLatencyMs,
      clientBJoinAcceptedMs: joinedB.joinAcceptedMs,
      clientBInitialFullMs: joinedB.initialFullMs,
      tickAdvanceMs,
      inputAckMs,
      clientAAuthorityMovementMs,
      clientBObservedMovementMs,
      forgedTransformRejectionMs,
      postForgerySnapshotMs,
      resumeOpenMs: resumedASummary.openLatencyMs,
      resumeAcceptedMs,
      resumeFullSnapshotMs,
      metricsMs: metrics.durationMs,
      totalMs: roundMilliseconds(performance.now() - totalStartedAt),
    };
    if (!sameJson(Object.keys(timings), TIMING_KEYS)) throw new Error('Timing contract drifted.');

    const runtime = {
      schemaVersion: 1,
      evidenceKind: 'g3-external-worker-transport-smoke',
      evidenceId: path.basename(runRoot),
      status: Object.values(assertions).every((value) => value === true)
        ? 'EXTERNAL_WORKER_TRANSPORT_SMOKE_PASS'
        : 'EXTERNAL_WORKER_TRANSPORT_SMOKE_FAIL',
      gateDecision: 'NONE',
      gateClaim: 'G3_NOT_ACCEPTED',
      deploymentPerformed: false,
      startedAt: startedAtIso,
      completedAt: new Date().toISOString(),
      target: {
        workerOrigin: authorityOrigin,
        targetKind: 'ephemeral-preview',
        expectedBuildId: buildId,
        observedBuildId: health.body?.buildId ?? null,
        tls: {
          httpScheme: 'https:',
          webSocketScheme: 'wss:',
          certificateVerification: 'node-default-strict',
        },
      },
      boundaries: scopeBoundaries,
      sourceFreeze: {
        files: SOURCE_FILES,
        hashesAtStart,
        hashesAtEnd,
        unchanged: sourceFrozen,
      },
      http: {
        health: {
          status: health.status,
          ok: health.body?.ok === true,
          service: health.body?.service ?? null,
          expectedBuildIdMatched: health.body?.buildId === buildId,
          roomBinding: health.body?.roomBinding === true,
        },
        forbiddenOrigin: {
          origin: FORBIDDEN_ORIGIN,
          status: forbidden.status,
          code: forbidden.body?.code ?? null,
        },
        createRoom: {
          status: created.status,
          ok: room.ok === true,
          roomCodePatternMatched: /^KYX-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/u.test(room.roomCode),
          socketPathMatched: room.socketPath === `/api/rooms/${room.roomCode}/socket`,
          metricsPathMatched: room.metricsPath === `/api/rooms/${room.roomCode}/metrics`,
          metricsCredentialIssued: /^[A-Za-z0-9_-]{43}$/u.test(
            room.metricsAccess.credential,
          ),
        },
      },
      transport: {
        protocolVersion: PROTOCOL_VERSION,
        concurrentGameplayClients: 2,
        maximumConcurrentOpenSockets: 2,
        physicalConnectionsOpened: 3,
        clientA: clientASummary,
        clientB: clientBSummary,
        resumedClientA: resumedASummary,
        tick: {
          initial: joinedA.full.serverTick,
          advanced: advancedA.message.serverTick,
          inputAcknowledged: inputAck.message.serverTick,
          resumed: resumedFull.message.serverTick,
        },
        inputAuthority: {
          acceptedSequence: inputAck.message.lastProcessedInputSequence,
          acceptedByMetrics: metricSnapshot?.acceptedInputs ?? null,
          movementObservedBySender: assertions.authoritativeMovementObservedByBothClients,
          movementObservedByPeer: assertions.authoritativeMovementObservedByBothClients,
        },
        forgedTransform: {
          rejectionCode: forgedRejection.message.code,
          authoritativeTargetAbsent: forgedTargetAbsent,
        },
        resume: {
          originalCloseCode: closedA?.code ?? null,
          connectionMode: resumedAccepted.message.connectionMode,
          playerIdentityPreserved: assertions.resumeIdentityPreserved,
          matchIdentityPreserved: assertions.resumeIdentityPreserved,
          opaqueCredentialRotated: assertions.resumeCredentialRotatedWithoutSerialization,
          fullSnapshotFirst: assertions.resumeStartedWithFullSnapshot,
        },
      },
      metrics: {
        status: metrics.status,
        ok: metrics.body?.ok === true,
        healthy: metricsHealthy,
        snapshot: {
          serverTick: metricSnapshot?.serverTick ?? null,
          lifecycle: metricSnapshot?.lifecycle ?? null,
          players: metricSnapshot?.players ?? null,
          connectedPlayers: metricSnapshot?.connectedPlayers ?? null,
          acceptedInputs: metricSnapshot?.acceptedInputs ?? null,
          inputRejections: inputRejectionCount,
          missedSchedulerTicks: metricSnapshot?.missedSchedulerTicks ?? null,
          transport: {
            inboundMessagesReceived: transportMetrics?.inboundMessagesReceived ?? null,
            inboundMessagesRateAccepted: transportMetrics?.inboundMessagesRateAccepted ?? null,
            inboundMessagesRateRejected: transportMetrics?.inboundMessagesRateRejected ?? null,
            fullSnapshotsSent: transportMetrics?.fullSnapshotsSent ?? null,
            deltaSnapshotsSent: transportMetrics?.deltaSnapshotsSent ?? null,
            snapshotAcksAccepted: transportMetrics?.snapshotAcksAccepted ?? null,
            snapshotAcksRejected: transportMetrics?.snapshotAcksRejected ?? null,
            slowConsumerEvictions: transportMetrics?.slowConsumerEvictions ?? null,
          },
        },
      },
      timings,
      security: {
        rawProtocolPayloadsSerialized: false,
        sensitiveValuesSerialized: false,
        externalAccessCredentialExercised: false,
        resumePossessionAuthenticationExercised: true,
      },
      assertions,
    };
    assertCredentialFree(runtime, sensitiveValues);

    await mkdir(RUNS_ROOT, { recursive: true });
    await mkdir(runRoot, { recursive: false });
    const outputPath = path.join(runRoot, RUNTIME_FILENAME);
    await writeFile(outputPath, `${JSON.stringify(runtime, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    console.log(JSON.stringify({
      status: runtime.status,
      output: path.relative(REPO_ROOT, outputPath).replaceAll('\\', '/'),
      gateClaim: runtime.gateClaim,
    }));
    if (runtime.status !== 'EXTERNAL_WORKER_TRANSPORT_SMOKE_PASS') process.exitCode = 1;
  } finally {
    for (const probe of probes) {
      await probe.close().catch(() => probe.terminate());
    }
  }
}

await main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown capture failure.';
  console.error(`External Worker capture failed: ${message}`);
  process.exitCode = 1;
});
