import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_OUTPUT = path.join(
  REPO_ROOT,
  'evidence/2026-07-21/phase-4-g3-transport-v1/runs/local-v8',
);
const VITE_ORIGIN = 'http://127.0.0.1:5173';
const AUTHORITY_ORIGIN = 'http://127.0.0.1:8787';
const CHROME_PATH = process.env.KYX_CHROME_PATH
  ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const HONEST_STREAM_MILLISECONDS = 10_500;

const SOURCE_FILES = Object.freeze([
  'src/net/protocol.ts',
  'src/net/schemas.ts',
  'src/dev/authorityEvidenceClient.ts',
  'worker/room.ts',
  'worker/security.ts',
  'worker/snapshotBaselines.ts',
  'worker/reliableEvents.ts',
  'tests/unit/worker/snapshotBaselines.test.ts',
  'tests/unit/worker/reliableEvents.test.ts',
  'tests/worker/protocolV2Socket.test.ts',
  'tests/worker/socketAttachmentCache.test.ts',
  'tools/evidence/capture-phase4-g3-transport-v1.mjs',
  'tools/evidence/verify-phase4-g3-transport-v1.mjs',
]);

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
  return body;
}

async function roomMetrics(room) {
  const response = await fetch(`${AUTHORITY_ORIGIN}${room.metricsPath}`, {
    headers: { Origin: VITE_ORIGIN },
    cache: 'no-store',
  });
  const body = await response.json();
  if (!response.ok || body.ok !== true) {
    throw new Error(`Room metrics failed for ${room.roomCode}: HTTP ${response.status}`);
  }
  return body.metrics;
}

async function sha256File(relativePath) {
  const bytes = await readFile(path.join(REPO_ROOT, relativePath));
  return createHash('sha256').update(bytes).digest('hex');
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

async function fileRecord(absolute) {
  const bytes = await readFile(absolute);
  const details = await stat(absolute);
  return {
    path: path.relative(REPO_ROOT, absolute).replaceAll('\\', '/'),
    bytes: details.size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function everyTrue(record) {
  return Object.values(record).every((value) => value === true);
}

async function captureBrowserContract(page, rooms) {
  return await page.evaluate(async ({ authorityOrigin, rooms, honestDuration }) => {
    const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
    const socketUrl = (roomCode) => {
      const url = new URL(`/api/rooms/${roomCode}/socket`, authorityOrigin);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      return url.toString();
    };
    const eventSequence = (id) => id === null ? 0 : Number(/^event\.([1-9][0-9]*)$/u.exec(id)?.[1] ?? NaN);
    const makeProbe = async (roomCode, autoAck = false) => {
      const messages = [];
      const sent = [];
      const uniqueReliableEvents = new Set();
      let resolveClosed;
      const closed = new Promise((resolve) => { resolveClosed = resolve; });
      const probe = {
        socket: new WebSocket(socketUrl(roomCode)),
        messages,
        sent,
        autoAck,
        uniqueReliableEvents,
        duplicateReliableDeliveries: 0,
        reliableHistoryGaps: 0,
        baselineTick: null,
        baselineId: null,
        lastEventId: null,
        lastEventSequence: 0,
        fullRequests: 0,
        close: null,
        closed,
      };
      const send = (message) => {
        probe.socket.send(JSON.stringify(message));
        sent.push({ at: performance.now(), type: message.type });
      };
      const sendAck = () => {
        if (probe.baselineTick === null || probe.baselineId === null) return;
        send({
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
      probe.socket.addEventListener('message', (event) => {
        if (typeof event.data !== 'string') return;
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        messages.push({ at: performance.now(), message });
        if (!probe.autoAck) return;
        if (message.type === 'fullSnapshot') {
          probe.baselineTick = message.serverTick;
          probe.baselineId = message.snapshotBaselineId;
          probe.lastEventId = message.reliableEventBaselineId;
          probe.lastEventSequence = eventSequence(message.reliableEventBaselineId);
          sendAck();
          return;
        }
        if (message.type === 'deltaSnapshot') {
          if (
            message.baseTick === probe.baselineTick
            && message.baseSnapshotBaselineId === probe.baselineId
          ) {
            probe.baselineTick = message.serverTick;
            probe.baselineId = message.snapshotBaselineId;
            sendAck();
          } else if (probe.fullRequests === 0) {
            probe.fullRequests += 1;
            send({
              protocolVersion: 2,
              type: 'requestFullSnapshot',
              requestId: `request.auto-recovery.${roomCode}`,
              reason: 'missing_baseline',
            });
          }
          return;
        }
        if (message.type === 'reliableEventBatch') {
          for (const reliableEvent of message.events) {
            const sequence = eventSequence(reliableEvent.id);
            if (sequence <= probe.lastEventSequence || uniqueReliableEvents.has(reliableEvent.id)) {
              probe.duplicateReliableDeliveries += 1;
              continue;
            }
            if (sequence !== probe.lastEventSequence + 1) {
              probe.reliableHistoryGaps += 1;
              continue;
            }
            uniqueReliableEvents.add(reliableEvent.id);
            probe.lastEventId = reliableEvent.id;
            probe.lastEventSequence = sequence;
          }
          sendAck();
        }
      });
      probe.socket.addEventListener('close', (event) => {
        probe.close = { code: event.code, reason: event.reason, wasClean: event.wasClean };
        resolveClosed(probe.close);
      }, { once: true });
      await new Promise((resolve, reject) => {
        probe.socket.addEventListener('open', resolve, { once: true });
        probe.socket.addEventListener('error', () => reject(new Error('socket failed')), { once: true });
      });
      return probe;
    };
    const waitFor = async (probe, predicate, label, afterIndex = 0, timeoutMilliseconds = 20_000) => {
      const startedAt = performance.now();
      while (performance.now() - startedAt < timeoutMilliseconds) {
        const index = probe.messages.findIndex((entry, candidate) => (
          candidate >= afterIndex && predicate(entry.message)
        ));
        if (index >= 0) return { ...probe.messages[index], index };
        await wait(10);
      }
      throw new Error(`Timed out waiting for ${label}: ${probe.messages.map(({ message }) => message.type).join(',')}`);
    };
    const waitForCount = async (probe, predicate, count, label, timeoutMilliseconds = 20_000) => {
      const startedAt = performance.now();
      while (performance.now() - startedAt < timeoutMilliseconds) {
        const matches = probe.messages.filter(({ message }) => predicate(message));
        if (matches.length >= count) return matches;
        await wait(10);
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const join = async (probe, roomCode, requestId, displayName) => {
      const welcome = await waitFor(probe, (message) => message.type === 'welcome', `${displayName} welcome`);
      probe.send({
        protocolVersion: 2,
        type: 'joinRoom',
        requestId,
        roomCode,
        displayName,
      });
      const accepted = await waitFor(
        probe,
        (message) => message.type === 'joinAccepted' && message.requestId === requestId,
        `${displayName} join`,
      );
      const full = await waitFor(
        probe,
        (message) => message.type === 'fullSnapshot'
          && message.localReconciliation?.player?.id === accepted.message.playerId,
        `${displayName} full`,
      );
      return { welcome: welcome.message, accepted: accepted.message, full: full.message };
    };
    const closeProbe = async (probe) => {
      if (probe.socket.readyState === WebSocket.OPEN) probe.socket.close(1000, 'evidence cleanup');
      await Promise.race([probe.closed, wait(1_000)]);
    };

    const contractA = await makeProbe(rooms.contract.roomCode);
    const joinedA = await join(
      contractA,
      rooms.contract.roomCode,
      'request.transport.contract-a',
      'Transport Contract A',
    );
    const selfEvent = await waitFor(
      contractA,
      (message) => message.type === 'reliableEventBatch'
        && message.events.some(({ subjectId }) => subjectId === joinedA.accepted.playerId),
      'contract A self event',
    );
    const firstEventId = selfEvent.message.events.at(-1)?.id ?? null;
    contractA.send({
      protocolVersion: 2,
      type: 'ack',
      snapshotBaselineVersion: 1,
      reliableEventStreamVersion: 1,
      snapshotBaselineId: joinedA.full.snapshotBaselineId,
      serverTick: joinedA.full.serverTick,
      lastEventId: firstEventId,
    });

    const contractB = await makeProbe(rooms.contract.roomCode, true);
    const joinedB = await join(
      contractB,
      rooms.contract.roomCode,
      'request.transport.contract-b',
      'Transport Contract B',
    );
    const lateJoinEvents = await waitForCount(
      contractA,
      (message) => message.type === 'reliableEventBatch'
        && message.events.some(({ subjectId }) => subjectId === joinedB.accepted.playerId),
      2,
      'contract reliable resend',
    );
    const lateEventId = lateJoinEvents[0].message.events.at(-1)?.id ?? null;
    const deduplicatedLateEvents = new Set(lateJoinEvents.flatMap(({ message }) => (
      message.events.filter(({ subjectId }) => subjectId === joinedB.accepted.playerId).map(({ id }) => id)
    )));
    const firstDelta = await waitFor(
      contractA,
      (message) => message.type === 'deltaSnapshot'
        && message.baseSnapshotBaselineId === joinedA.full.snapshotBaselineId,
      'first exact-baseline delta',
    );
    contractA.send({
      protocolVersion: 2,
      type: 'ack',
      snapshotBaselineVersion: 1,
      reliableEventStreamVersion: 1,
      snapshotBaselineId: firstDelta.message.snapshotBaselineId,
      serverTick: firstDelta.message.serverTick,
      lastEventId: lateEventId,
    });
    const chainedDelta = await waitFor(
      contractA,
      (message) => (message.type === 'deltaSnapshot'
        && message.baseSnapshotBaselineId === firstDelta.message.snapshotBaselineId
        && message.serverTick > firstDelta.message.serverTick)
        || message.type === 'error',
      'chained exact-baseline delta',
      firstDelta.index + 1,
    );
    if (chainedDelta.message.type === 'error') {
      throw new Error(`First delta ACK was rejected: ${JSON.stringify({
        acknowledgement: {
          serverTick: firstDelta.message.serverTick,
          snapshotBaselineId: firstDelta.message.snapshotBaselineId,
          lastEventId: lateEventId,
        },
        snapshotsSeen: contractA.messages
          .filter(({ message }) => message.type === 'fullSnapshot' || message.type === 'deltaSnapshot')
          .map(({ at, message }) => ({
            at,
            type: message.type,
            serverTick: message.serverTick,
            baseTick: message.baseTick,
            snapshotBaselineId: message.snapshotBaselineId,
            baseSnapshotBaselineId: message.baseSnapshotBaselineId,
          })),
        error: chainedDelta.message,
      })}`);
    }
    contractA.send({
      protocolVersion: 2,
      type: 'ack',
      snapshotBaselineVersion: 1,
      reliableEventStreamVersion: 1,
      snapshotBaselineId: chainedDelta.message.snapshotBaselineId,
      serverTick: chainedDelta.message.serverTick,
      lastEventId: lateEventId,
    });
    const lateEventCountAtAck = contractA.messages.filter(({ message }) => (
      message.type === 'reliableEventBatch'
      && message.events.some(({ id }) => id === lateEventId)
    )).length;
    await wait(400);
    const lateEventCountAfterAck = contractA.messages.filter(({ message }) => (
      message.type === 'reliableEventBatch'
      && message.events.some(({ id }) => id === lateEventId)
    )).length;

    const futureReliableEventId = `event.${eventSequence(lateEventId) + 100}`;
    contractA.send({
      protocolVersion: 2,
      type: 'ack',
      snapshotBaselineVersion: 1,
      reliableEventStreamVersion: 1,
      snapshotBaselineId: chainedDelta.message.snapshotBaselineId,
      serverTick: chainedDelta.message.serverTick,
      lastEventId: futureReliableEventId,
    });
    const futureReliableAckError = await waitFor(
      contractA,
      (message) => message.type === 'error'
        && message.code === 'ACK_REJECTED'
        && message.detail === 'event_unknown_event',
      'future reliable-event ACK rejection',
      chainedDelta.index + 1,
    );
    contractA.send({
      protocolVersion: 2,
      type: 'ack',
      snapshotBaselineVersion: 1,
      reliableEventStreamVersion: 1,
      snapshotBaselineId: chainedDelta.message.snapshotBaselineId,
      serverTick: chainedDelta.message.serverTick + 100,
      lastEventId: lateEventId,
    });
    const futureAckError = await waitFor(
      contractA,
      (message) => message.type === 'error'
        && message.code === 'ACK_REJECTED'
        && message.detail === 'snapshot_tick_future',
      'future ACK rejection',
      futureReliableAckError.index + 1,
    );
    contractA.send({
      protocolVersion: 2,
      type: 'ack',
      snapshotBaselineVersion: 1,
      reliableEventStreamVersion: 1,
      snapshotBaselineId: joinedA.full.snapshotBaselineId,
      serverTick: joinedA.full.serverTick,
      lastEventId: lateEventId,
    });
    const oldAckError = await waitFor(
      contractA,
      (message) => message.type === 'error'
        && message.code === 'ACK_REJECTED'
        && (message.detail === 'snapshot_tick_regression'
          || message.detail === 'snapshot_tick_not_sent'
          || message.detail === 'snapshot_baseline_id_not_sent'),
      'old ACK rejection',
      futureAckError.index + 1,
    );
    contractA.send({
      protocolVersion: 2,
      type: 'requestFullSnapshot',
      requestId: 'request.transport.missing-baseline',
      reason: 'missing_baseline',
    });
    const correlatedFull = await waitFor(
      contractA,
      (message) => message.type === 'fullSnapshot'
        && message.resyncRequestId === 'request.transport.missing-baseline',
      'correlated missing-baseline full',
      oldAckError.index + 1,
    );
    contractA.send({
      protocolVersion: 2,
      type: 'ack',
      snapshotBaselineVersion: 1,
      reliableEventStreamVersion: 1,
      snapshotBaselineId: correlatedFull.message.snapshotBaselineId,
      serverTick: correlatedFull.message.serverTick,
      lastEventId: correlatedFull.message.reliableEventBaselineId,
    });
    const unacknowledgedDelta = await waitFor(
      contractA,
      (message) => message.type === 'deltaSnapshot'
        && message.baseSnapshotBaselineId === correlatedFull.message.snapshotBaselineId,
      'unacknowledged delta before timeout fallback',
      correlatedFull.index + 1,
    );
    const timeoutFull = await waitFor(
      contractA,
      (message) => message.type === 'fullSnapshot'
        && message.resyncRequestId === undefined
        && message.serverTick > unacknowledgedDelta.message.serverTick,
      'snapshot ACK timeout full fallback',
      unacknowledgedDelta.index + 1,
    );
    const contractErrors = contractA.messages
      .filter(({ message }) => message.type === 'error')
      .map(({ message }) => ({ code: message.code, detail: message.detail }));
    const contract = {
      roomCode: rooms.contract.roomCode,
      versions: {
        protocol: joinedA.welcome.protocolConfig.protocolVersion,
        snapshotBaseline: joinedA.welcome.protocolConfig.snapshotBaselineVersion,
        reliableEvents: joinedA.welcome.protocolConfig.reliableEventStreamVersion,
      },
      sameTickBaselines: {
        first: { tick: joinedA.full.serverTick, id: joinedA.full.snapshotBaselineId },
        second: { tick: joinedB.full.serverTick, id: joinedB.full.snapshotBaselineId },
      },
      firstDelta: firstDelta.message,
      chainedDelta: chainedDelta.message,
      reliable: {
        eventId: lateEventId,
        deliveriesBeforeAck: lateEventCountAtAck,
        deliveriesAfterAckWindow: lateEventCountAfterAck,
        uniqueAppliedIds: [...deduplicatedLateEvents],
      },
      futureReliableAckError: futureReliableAckError.message,
      futureAckError: futureAckError.message,
      oldAckError: oldAckError.message,
      correlatedFull: {
        requestId: correlatedFull.message.resyncRequestId,
        serverTick: correlatedFull.message.serverTick,
        baselineId: correlatedFull.message.snapshotBaselineId,
      },
      timeoutFallback: {
        unacknowledgedDeltaTick: unacknowledgedDelta.message.serverTick,
        unacknowledgedDeltaReceivedAt: unacknowledgedDelta.at,
        fullTick: timeoutFull.message.serverTick,
        fullReceivedAt: timeoutFull.at,
        elapsedMilliseconds: timeoutFull.at - unacknowledgedDelta.at,
        fullBaselineId: timeoutFull.message.snapshotBaselineId,
      },
      errors: contractErrors,
    };
    contract.assertions = {
      protocolVersionsAdvertised: contract.versions.protocol === 2
        && contract.versions.snapshotBaseline === 1
        && contract.versions.reliableEvents === 1,
      sameTickBaselineIdsDistinct: contract.sameTickBaselines.first.tick
        === contract.sameTickBaselines.second.tick
        && contract.sameTickBaselines.first.id !== contract.sameTickBaselines.second.id,
      oldBaselineDeltaIncludesLateJoin: firstDelta.message.entities
        .some(({ id }) => id === joinedB.accepted.playerId),
      deltaChainedFromAcknowledgedBaseline: chainedDelta.message.baseTick
        === firstDelta.message.serverTick
        && chainedDelta.message.baseSnapshotBaselineId
          === firstDelta.message.snapshotBaselineId,
      reliableEventResentBeforeAck: lateEventCountAtAck >= 2,
      reliableEventDeduplicatedBySequence: deduplicatedLateEvents.size === 1,
      reliableAckStoppedPendingEvent: lateEventCountAfterAck === lateEventCountAtAck,
      futureReliableAckRejected: futureReliableAckError.message.detail === 'event_unknown_event',
      futureAckRejected: futureAckError.message.detail === 'snapshot_tick_future',
      oldAckRejected: oldAckError.message.code === 'ACK_REJECTED',
      missingBaselineFullCorrelated: correlatedFull.message.resyncRequestId
        === 'request.transport.missing-baseline',
      unacknowledgedDeltaTimedOutToFull: timeoutFull.at - unacknowledgedDelta.at >= 900,
    };
    contract.passed = Object.values(contract.assertions).every(Boolean);
    await Promise.all([closeProbe(contractA), closeProbe(contractB)]);

    const honestA = await makeProbe(rooms.honest.roomCode, true);
    const honestJoinedA = await join(
      honestA,
      rooms.honest.roomCode,
      'request.transport.honest-a',
      'Honest 20Hz A',
    );
    const honestB = await makeProbe(rooms.honest.roomCode, true);
    await join(
      honestB,
      rooms.honest.roomCode,
      'request.transport.honest-b',
      'Honest Passive B',
    );
    await waitFor(
      honestA,
      (message) => message.type === 'deltaSnapshot',
      'honest client first delta',
    );
    let sequence = 0;
    let clientTick = honestJoinedA.full.serverTick;
    const streamStartedAt = performance.now();
    const interval = setInterval(() => {
      if (honestA.socket.readyState !== WebSocket.OPEN) return;
      honestA.send({
        protocolVersion: 2,
        type: 'inputBatch',
        commands: [{
          type: 'input',
          sequence,
          clientTick,
          moveX: 0,
          moveY: 127,
          lookYawDeltaMilliDegrees: 0,
          lookPitchDeltaMilliDegrees: 0,
          heldButtons: 0,
          pressedButtons: 0,
          releasedButtons: 0,
        }],
      });
      sequence += 1;
      clientTick += 1;
    }, 50);
    await wait(honestDuration);
    clearInterval(interval);
    await wait(500);
    const streamEndedAt = performance.now();
    const gameplaySends = honestA.sent.filter(({ at }) => at >= streamStartedAt && at <= streamEndedAt);
    const inputSends = gameplaySends.filter(({ type }) => type === 'inputBatch');
    const ackSends = gameplaySends.filter(({ type }) => type === 'ack');
    let maximumRollingTenSecondMessages = 0;
    for (const { at } of gameplaySends) {
      maximumRollingTenSecondMessages = Math.max(
        maximumRollingTenSecondMessages,
        gameplaySends.filter((candidate) => candidate.at >= at - 10_000 && candidate.at <= at).length,
      );
    }
    const honestErrors = honestA.messages
      .filter(({ message }) => message.type === 'error')
      .map(({ message }) => ({ code: message.code, detail: message.detail }));
    const lastInputAck = honestA.messages
      .filter(({ message }) => message.type === 'inputAck')
      .at(-1)?.message ?? null;
    const elapsedSeconds = (streamEndedAt - streamStartedAt) / 1_000;
    const honest = {
      roomCode: rooms.honest.roomCode,
      durationMilliseconds: streamEndedAt - streamStartedAt,
      inputMessages: inputSends.length,
      snapshotAndEventAcks: ackSends.length,
      totalGameplayMessages: gameplaySends.length,
      maximumRollingTenSecondMessages,
      measuredInputHz: inputSends.length / elapsedSeconds,
      measuredAckHz: ackSends.length / elapsedSeconds,
      lastProcessedInputSequence: lastInputAck?.lastProcessedInputSequence ?? null,
      deltasReceived: honestA.messages.filter(({ message }) => message.type === 'deltaSnapshot').length,
      fullRecoveryRequests: honestA.fullRequests,
      reliableDuplicatesSuppressed: honestA.duplicateReliableDeliveries,
      reliableHistoryGaps: honestA.reliableHistoryGaps,
      errors: honestErrors,
      socketReadyState: honestA.socket.readyState,
    };
    honest.assertions = {
      inputCadenceNear20Hz: honest.measuredInputHz >= 19 && honest.measuredInputHz <= 21,
      snapshotAckCadenceNear10Hz: honest.measuredAckHz >= 9 && honest.measuredAckHz <= 12,
      rollingWindowBelow384: honest.maximumRollingTenSecondMessages < 384,
      authorityProcessedStream: honest.lastProcessedInputSequence !== null
        && honest.lastProcessedInputSequence >= honest.inputMessages - 3,
      noRateLimit: !honest.errors.some(({ code }) => code === 'RATE_LIMITED'),
      noUnexpectedErrors: honest.errors.length === 0,
      socketRemainedOpen: honest.socketReadyState === WebSocket.OPEN,
      deltasObserved: honest.deltasReceived >= 80,
      noBaselineRecoveryRequests: honest.fullRecoveryRequests === 0,
      noReliableHistoryGap: honest.reliableHistoryGaps === 0,
    };
    honest.passed = Object.values(honest.assertions).every(Boolean);
    await Promise.all([closeProbe(honestA), closeProbe(honestB)]);

    const flood = await makeProbe(rooms.abuse.roomCode);
    await waitFor(flood, (message) => message.type === 'welcome', 'flood welcome');
    for (let index = 0; index < 385; index += 1) {
      flood.send({
        protocolVersion: 2,
        type: 'ack',
        snapshotBaselineVersion: 1,
        reliableEventStreamVersion: 1,
        snapshotBaselineId: 'baseline.flood',
        serverTick: 0,
        lastEventId: null,
      });
    }
    const rateLimited = await waitFor(
      flood,
      (message) => message.type === 'error' && message.code === 'RATE_LIMITED',
      '385-message rate limit',
    );
    const floodClose = await Promise.race([flood.closed, wait(5_000).then(() => null)]);
    const abuse = {
      roomCode: rooms.abuse.roomCode,
      configuredWindowMessages: 384,
      sentMessages: flood.sent.length,
      rateLimitError: rateLimited.message,
      close: floodClose,
    };
    abuse.assertions = {
      sentExactly385Messages: abuse.sentMessages === 385,
      revisedLimitCrossed: abuse.sentMessages === abuse.configuredWindowMessages + 1,
      rateLimited: abuse.rateLimitError.code === 'RATE_LIMITED',
      policyClose1008: abuse.close?.code === 1008,
    };
    abuse.passed = Object.values(abuse.assertions).every(Boolean);

    return { contract, honest, abuse };
  }, {
    authorityOrigin: AUTHORITY_ORIGIN,
    rooms,
    honestDuration: HONEST_STREAM_MILLISECONDS,
  });
}

async function main() {
  const outputDirectory = safeOutputPath(argument('--output', DEFAULT_OUTPUT));
  const matrixPath = path.join(outputDirectory, 'transport-v1-runtime.json');
  if (await isPortOpen(5173) || await isPortOpen(8787)) {
    throw new Error('Ports 5173 and 8787 must be free so the evidence run owns its runtimes.');
  }
  const existingOutputEntries = await readdir(outputDirectory).catch((error) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  });
  if (existingOutputEntries.length > 0) {
    throw new Error('Transport evidence output is not empty; preserve it and select a fresh --output.');
  }
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
  const browserLog = [];
  try {
    const healthResponse = await waitForHttp(`${AUTHORITY_ORIGIN}/health`, 'Authority');
    const health = await healthResponse.json();
    await waitForHttp(VITE_ORIGIN, 'Vite');
    const rooms = {
      contract: await createRoom(),
      honest: await createRoom(),
      abuse: await createRoom(),
    };
    browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('console', (message) => browserLog.push({
      at: new Date().toISOString(),
      kind: 'console',
      level: message.type(),
      text: message.text(),
    }));
    page.on('pageerror', (error) => browserLog.push({
      at: new Date().toISOString(),
      kind: 'pageerror',
      level: 'error',
      text: error.message,
    }));
    await page.goto(VITE_ORIGIN, { waitUntil: 'domcontentloaded' });
    const captured = await captureBrowserContract(page, rooms);
    const metrics = {
      contract: await roomMetrics(rooms.contract),
      honest: await roomMetrics(rooms.honest),
      abuse: await roomMetrics(rooms.abuse),
    };
    const criticalBrowserLog = browserLog.filter(({ kind, level }) => (
      kind === 'pageerror' || (kind === 'console' && level === 'error')
    ));
    captured.contract.assertions.transportMetricsConfirmPaths =
      metrics.contract.transport.deltaSnapshotsSent >= 2
      && metrics.contract.transport.snapshotAcksRejected >= 2
      && metrics.contract.transport.snapshotAckTimeoutFallbacks >= 1
      && metrics.contract.transport.reliableEventResendBatches >= 1
      && metrics.contract.transport.reliableEventAcksRejected >= 1;
    captured.contract.assertions.roomHealthy = metrics.contract.lifecycle !== 'expired';
    captured.contract.passed = everyTrue(captured.contract.assertions);
    captured.honest.assertions.authorityAcceptedInputs = metrics.honest.acceptedInputs
      >= captured.honest.inputMessages - 3;
    captured.honest.assertions.workerSentDeltas = metrics.honest.transport.deltaSnapshotsSent >= 80;
    captured.honest.passed = everyTrue(captured.honest.assertions);
    const sourceHashes = Object.fromEntries(await Promise.all(SOURCE_FILES.map(async (relative) => (
      [relative, await sha256File(relative)]
    ))));
    matrix = {
      schemaVersion: 1,
      evidenceId: 'phase-4-g3-transport-v1-local-v8-2026-07-21',
      capturedAt: new Date().toISOString(),
      status: captured.contract.passed
        && captured.honest.passed
        && captured.abuse.passed
        && criticalBrowserLog.length === 0
        ? 'LOCAL_G3_TRANSPORT_V1_EVIDENCE_PASS'
        : 'LOCAL_G3_TRANSPORT_V1_EVIDENCE_FAIL',
      gateDecision: 'NONE',
      gateClaim: 'G3_NOT_ACCEPTED',
      deploymentPerformed: false,
      exactInvocation: [process.execPath, ...process.argv.slice(1)],
      serviceCommands: [authority.command, vite.command],
      runtime: {
        node: process.version,
        platform: `${process.platform}-${process.arch}`,
        chromeExecutable: CHROME_PATH,
        health,
      },
      sourceHashes,
      contract: captured.contract,
      honestClient: captured.honest,
      abuse: captured.abuse,
      metrics,
      browserLog,
      criticalBrowserLog,
      aggregateAssertions: {
        contractPassed: captured.contract.passed,
        honestClientPassed: captured.honest.passed,
        revisedAbuseLimitPassed: captured.abuse.passed,
        noCriticalBrowserErrors: criticalBrowserLog.length === 0,
      },
      scopeBoundary: [
        'This is successor local HTTP/WS evidence against a real local Wrangler Durable Object and a real Chromium WebSocket origin.',
        'It supersedes only the stale delta/reliable/rate-limit claims from the immutable expanded run; it does not rewrite that run.',
        'The reliable-event runtime row uses join/leave lifecycle events; combat reliable events remain separately unproved.',
        'Slow-consumer bufferedAmount saturation, public authentication, production origin/WSS, staging, checkpoint recovery, load/soak, cost, and human acceptance remain open.',
        'No deployment, publication, commit, reset, clean, or stash was performed.',
        'G3 remains unaccepted.',
      ],
    };
    await context.close();
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
  if (matrix === null) throw new Error('Transport evidence matrix was not created.');
  const cleanup = {
    vitePort5173Free: !(await isPortOpen(5173)),
    authorityPort8787Free: !(await isPortOpen(8787)),
  };
  matrix.cleanup = cleanup;
  matrix.aggregateAssertions.ownedPortsReleased = everyTrue(cleanup);
  if (!matrix.aggregateAssertions.ownedPortsReleased) {
    matrix.status = 'LOCAL_G3_TRANSPORT_V1_EVIDENCE_FAIL';
  }
  const inventory = await Promise.all((await recursiveFiles(outputDirectory))
    .filter((absolute) => absolute !== matrixPath)
    .sort()
    .map(fileRecord));
  matrix.artifactInventory = inventory;
  await writeFile(matrixPath, `${JSON.stringify(matrix, null, 2)}\n`, 'utf8');
  process.stdout.write(`${matrix.status}\n${matrixPath}\n`);
  if (matrix.status !== 'LOCAL_G3_TRANSPORT_V1_EVIDENCE_PASS') process.exitCode = 1;
}

await main();
