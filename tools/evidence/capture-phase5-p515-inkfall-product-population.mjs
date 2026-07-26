import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const PROFILE = 'p511-inkfall-foundry-revision-2-combat-v1';
const FLAT_COMBAT_PROFILE = 'p58d-rev3-combat-v1';
const PROFILE_HEADER = 'x-kyx-evidence-profile';
const FRONTEND_ORIGIN = 'http://127.0.0.1:5173';
const AUTHORITY_ORIGIN = 'http://127.0.0.1:8787';
const AUTHORITY_WEBSOCKET_ORIGIN = AUTHORITY_ORIGIN.replace(/^http/u, 'ws');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const output = path.resolve(
  repo,
  process.argv[2] ?? 'evidence/2026-07-22/phase-5-p5-15/runtime-v1',
);
const screenshotDirectory = path.join(output, 'screenshots');
const nodeExecutable = process.execPath;
const browserLaunchArguments = Object.freeze([
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-features=IntensiveWakeUpThrottling,CalculateNativeWinOcclusion',
]);
const SHARED_AUTHORITY_SHOT_PULSE_MILLISECONDS = 90;

const expectedBinding = Object.freeze({
  mapReference: 'inkfall_foundry@2',
  mapId: 'inkfall_foundry',
  mapRevision: 2,
  packageDigest: '77a7b6c41416f9caaf615f3af5dacda1153cee65a239c04f2004e30fc1663520',
  fixtureId: 'inkfall_foundry_map_collision',
  fixtureHash: 'bf85e42731fd088e',
  xAxis: 'east',
  yAxis: 'up',
  zAxis: 'north',
  origin: 'press_core_floor_contact',
  gltfToMap: 'x_y_negative_z',
  distanceUnit: 'millimeters',
  angleUnit: 'milli_degrees',
  colliderCardinality: 339,
});
const expectedSpawns = Object.freeze([
  Object.freeze({ spawnId: 'spawn_w_press_a', set: 'west_team', feetPosition: Object.freeze({ x: -33_500, y: 0, z: -3_500 }), yawMilliDegrees: 0 }),
  Object.freeze({ spawnId: 'spawn_e_press_a', set: 'east_team', feetPosition: Object.freeze({ x: 33_500, y: 0, z: 3_500 }), yawMilliDegrees: 180_000 }),
  Object.freeze({ spawnId: 'spawn_w_press_b', set: 'west_team', feetPosition: Object.freeze({ x: -33_500, y: 0, z: 3_500 }), yawMilliDegrees: 0 }),
  Object.freeze({ spawnId: 'spawn_e_press_b', set: 'east_team', feetPosition: Object.freeze({ x: 33_500, y: 0, z: -3_500 }), yawMilliDegrees: 180_000 }),
  Object.freeze({ spawnId: 'spawn_w_ink', set: 'west_team', feetPosition: Object.freeze({ x: -30_500, y: 0, z: -7_000 }), yawMilliDegrees: -25_000 }),
  Object.freeze({ spawnId: 'spawn_e_ink', set: 'east_team', feetPosition: Object.freeze({ x: 30_500, y: 0, z: -7_000 }), yawMilliDegrees: -155_000 }),
  Object.freeze({ spawnId: 'spawn_w_archive', set: 'west_team', feetPosition: Object.freeze({ x: -30_500, y: 0, z: 7_000 }), yawMilliDegrees: 25_000 }),
  Object.freeze({ spawnId: 'spawn_e_archive', set: 'east_team', feetPosition: Object.freeze({ x: 30_500, y: 0, z: 7_000 }), yawMilliDegrees: 155_000 }),
]);
const expectedIdentity = Object.freeze({
  mapId: 'inkfall_foundry',
  rulesetId: 'revamped_classic',
  rulesetRevision: 3,
  rulesetHash: 'd5f0418d1d927370',
  fixtureId: 'inkfall_foundry_map_collision',
  fixtureHash: 'bf85e42731fd088e',
  physicsAdapterId: 'rapier3d_deterministic_compat',
  physicsAdapterVersion: '0.19.3',
});
const westRoute = Object.freeze([
  Object.freeze({ x: -27_500, z: 1_000 }),
  Object.freeze({ x: -22_000, z: 0 }),
  Object.freeze({ x: -25_000, z: -7_000 }),
  Object.freeze({ x: -25_000, z: -12_000 }),
  Object.freeze({ x: -22_000, z: -17_000 }),
  Object.freeze({ x: -15_000, z: -21_000 }),
  Object.freeze({ x: -8_000, z: -20_000 }),
  Object.freeze({ x: -5_000, z: -15_000 }),
  Object.freeze({ x: -3_000, z: -16_000 }),
]);
const eastRoute = Object.freeze([
  Object.freeze({ x: 27_500, z: -1_000 }),
  Object.freeze({ x: 22_000, z: 0 }),
  Object.freeze({ x: 25_000, z: -7_000 }),
  Object.freeze({ x: 25_000, z: -12_000 }),
  Object.freeze({ x: 22_000, z: -17_000 }),
  Object.freeze({ x: 15_000, z: -20_000 }),
  Object.freeze({ x: 8_000, z: -16_000 }),
  Object.freeze({ x: 5_000, z: -15_000 }),
  Object.freeze({ x: 3_000, z: -15_000 }),
]);
const verifiedInkChannelCombatPair = Object.freeze({
  west: Object.freeze({ x: 400, z: -15_550 }),
  east: Object.freeze({ x: 2_323, z: -15_175 }),
  arrivalToleranceMillimeters: 100,
  minimumPulseMilliseconds: 40,
  settleMilliseconds: 750,
  maximumSeparationMillimeters: 2_200,
  minimumVerticalMarginMillimeters: 90,
});
const sourceFiles = Object.freeze([
  'src/app/onlineAuthorityProfiles.ts',
  'src/app/onlineAuthorityGateway.ts',
  'src/app/onlineAuthorityInkfallWorld.ts',
  'src/app/onlineAuthorityRoute.ts',
  'src/dev/authorityEvidenceClient.ts',
  'src/dev/authorityEvidenceModel.ts',
  'src/dev/authorityEvidenceTransport.ts',
  'src/client/combat/presentationAdapter.ts',
  'src/client/netcode/localPrediction.ts',
  'src/client/netcode/remoteInterpolation.ts',
  'src/authority/room.ts',
  'src/authority/fixedTickScheduler.ts',
  'src/physics/collisionLayers.ts',
  'src/physics/fixtureSchema.ts',
  'src/physics/fixtures/catalog.ts',
  'src/physics/fixtures/flatRun.ts',
  'src/physics/rapier/contracts.ts',
  'src/physics/rapier/runtime.ts',
  'src/physics/rapier/world.ts',
  'src/net/protocol.ts',
  'src/net/schemas.ts',
  'src/sim/index.ts',
  'src/sim/canonical.ts',
  'src/sim/commands.ts',
  'src/sim/rng.ts',
  'src/sim/state.ts',
  'src/sim/step.ts',
  'src/sim/tickClock.ts',
  'src/sim/units.ts',
  'src/sim/movement/canonical.ts',
  'src/sim/movement/controller.ts',
  'src/sim/movement/events.ts',
  'src/sim/movement/fixedMath.ts',
  'src/sim/movement/hash.ts',
  'src/sim/movement/index.ts',
  'src/sim/movement/profile.ts',
  'src/sim/movement/profileIdentity.ts',
  'src/sim/movement/queryPort.ts',
  'src/sim/movement/replay.ts',
  'src/sim/movement/state.ts',
  'assets/source/maps/inkfall-foundry/runtime/combat-authority-fixture.p5-10.v1.json',
  'worker/combatRuntime.ts',
  'worker/env.ts',
  'worker/rapierRuntime.ts',
  'worker/reliableEvents.ts',
  'worker/resumeSessions.ts',
  'worker/room.ts',
  'worker/routes.ts',
  'worker/security.ts',
  'worker/snapshotBaselines.ts',
  'worker/worker.ts',
  'tests/worker/protocolV2Socket.test.ts',
  'tests/worker/socketAttachmentCache.test.ts',
  'tests/worker/slowConsumerBackpressure.test.ts',
  'tests/worker/inkfallPopulation.test.ts',
  'tests/integration/authority/inkfallAuthorityPlaytest.test.ts',
  'tests/integration/movement/inkfallCanonicalTraversalSnag.test.ts',
  'tests/unit/authority/fixedTickScheduler.test.ts',
  'tests/unit/authority/combat/roomCombatIntegration.test.ts',
  'tests/unit/dev/authorityEvidence.test.ts',
  'tests/unit/net/protocol-v2.test.ts',
  'tests/unit/worker/reliableEvents.test.ts',
  'tests/unit/worker/security.test.ts',
  'assets/source/maps/inkfall-foundry/inkfall-foundry.layout-seed.v1.json',
  'evidence/2026-07-22/phase-5-p5-15/runtime-v10/p515-canonical-traversal-defect.json',
  '.env.production',
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'public/_headers',
  'tsconfig.json',
  'tsconfig.worker.json',
  'vite.config.js',
  'wrangler.jsonc',
  'tools/evidence/capture-phase5-p515-inkfall-product-population.mjs',
  'tools/evidence/verify-phase5-p515-inkfall-product-population-failure.mjs',
  'tools/evidence/verify-phase5-p515-inkfall-product-population.mjs',
]);

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function distanceXZ(left, right) {
  if (!left || !right) return Number.POSITIVE_INFINITY;
  return Math.hypot(left.x - right.x, left.z - right.z);
}

function digestText(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function sha256(file) {
  return createHash('sha256').update(await fs.readFile(file)).digest('hex');
}

function commandOutput(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repo,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed: ${JSON.stringify({
        code,
        signal,
        stderr: stderr.trim(),
      })}`));
    });
  });
}

async function repositoryState() {
  const [head, rawStatus] = await Promise.all([
    commandOutput('git', ['rev-parse', 'HEAD']),
    commandOutput('git', ['status', '--short', '--untracked-files=normal']),
  ]);
  const outputRelative = path.relative(repo, output).split(path.sep).join('/');
  const statusLines = rawStatus
    .split(/\r?\n/u)
    .filter(Boolean)
    .filter((line) => {
      if (outputRelative.startsWith('../') || path.isAbsolute(outputRelative)) return true;
      const statusPath = line.slice(3).replaceAll('\\', '/');
      return statusPath !== outputRelative && !statusPath.startsWith(`${outputRelative}/`);
    });
  const status = statusLines.join('\n');
  return Object.freeze({
    head,
    status,
    statusSha256: digestText(status),
    excludedGeneratedOutput: outputRelative,
  });
}

function service(command, args, environment = process.env) {
  const lines = [];
  const child = spawn(command, args, {
    cwd: repo,
    env: environment,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const append = (chunk) => {
    lines.push(...String(chunk).split(/\r?\n/u).filter(Boolean));
    if (lines.length > 240) lines.splice(0, lines.length - 240);
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  return { child, lines };
}

async function stopService(handle) {
  if (handle?.child.exitCode !== null) return;
  handle.child.kill();
  await Promise.race([
    new Promise((resolve) => handle.child.once('exit', resolve)),
    delay(3_000),
  ]);
  if (handle.child.exitCode === null) handle.child.kill('SIGKILL');
}

async function waitForHttp(url, timeoutMilliseconds = 30_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // Continue while the local service binds.
    }
    await delay(200);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function recordRoomMetrics(label, roomCode, force = false) {
  if (roomCode === null || (!force && Date.now() - lastRoomMetricsAt < 1_000)) return;
  lastRoomMetricsAt = Date.now();
  try {
    const response = await fetch(`${AUTHORITY_ORIGIN}/api/rooms/${roomCode}/metrics`, {
      headers: { Origin: FRONTEND_ORIGIN, [PROFILE_HEADER]: PROFILE },
    });
    const body = await response.json();
    roomMetricsTimeline.push(Object.freeze({
      observedAt: new Date().toISOString(),
      observedAtMilliseconds: Date.now(),
      label,
      status: response.status,
      body,
    }));
  } catch (error) {
    roomMetricsTimeline.push(Object.freeze({
      observedAt: new Date().toISOString(),
      observedAtMilliseconds: Date.now(),
      label,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

function recordConnectionState(label, clientId, value) {
  const state = {
    connection: value?.connection ?? null,
    lastError: value?.lastError ?? null,
    fullSnapshots: value?.fullSnapshots ?? null,
    deltaSnapshots: value?.deltaSnapshots ?? null,
    inputAcks: value?.inputAcks ?? null,
    snapshotAcksSent: value?.snapshotAcksSent ?? null,
  };
  const fingerprint = JSON.stringify([state.connection, state.lastError]);
  if (lastConnectionFingerprints.get(clientId) === fingerprint) return;
  lastConnectionFingerprints.set(clientId, fingerprint);
  connectionTimeline.push(Object.freeze({
    observedAt: new Date().toISOString(),
    observedAtMilliseconds: Date.now(),
    label,
    clientId,
    ...state,
  }));
}

async function browserProcessId(browser) {
  try {
    const session = await browser.newBrowserCDPSession();
    const result = await session.send('SystemInfo.getProcessInfo');
    await session.detach();
    return result.processInfo.find(({ type }) => type === 'browser')?.id ?? null;
  } catch {
    return null;
  }
}

function summarizedCombat(combat) {
  if (!combat) return null;
  return {
    players: combat.players.map((player) => ({
      playerId: player.playerId,
      teamId: player.teamId,
      lifePhase: player.lifePhase,
      healthPoints: player.healthPoints,
      shieldPoints: player.shieldPoints,
      deathOrdinal: player.deathOrdinal,
      acceptedShotCount: player.acceptedShotCount,
      acceptedThrowCount: player.acceptedThrowCount,
      activeProjectileCount: player.activeProjectileCount,
    })),
    projectiles: combat.projectiles.map((projectile) => ({
      projectileId: projectile.projectileId,
      ownerPlayerId: projectile.ownerPlayerId,
      phase: projectile.phase,
    })),
    match: {
      phase: combat.match.phase,
      feedSequence: combat.match.feedSequence,
      teamScores: combat.match.teamScores,
      feed: combat.match.feed,
    },
    sha256: digestText(JSON.stringify(combat)),
  };
}

function normalizeWireMessage(message, direction) {
  const base = {
    protocolVersion: message.protocolVersion ?? null,
    type: typeof message.type === 'string' ? message.type : 'unknown',
  };
  switch (message.type) {
    case 'welcome':
      return { ...base, connectionId: message.connectionId, serverTick: message.serverTick, protocolConfig: message.protocolConfig, simulationIdentity: message.simulationIdentity };
    case 'joinRoom':
      return { ...base, requestId: message.requestId, roomCode: message.roomCode, displayName: message.displayName };
    case 'resumeRoom':
      return { ...base, requestId: message.requestId, roomCode: message.roomCode, resumeTokenSha256: digestText(message.resumeToken) };
    case 'joinAccepted':
      return { ...base, requestId: message.requestId, playerId: message.playerId, roomId: message.roomId, matchId: message.matchId, serverTick: message.serverTick, connectionMode: message.connectionMode, resumeTokenSha256: digestText(message.resumeToken), simulationIdentity: message.simulationIdentity };
    case 'joinRejected':
      return { ...base, requestId: message.requestId, code: message.code };
    case 'fullSnapshot':
    case 'deltaSnapshot':
      return {
        ...base,
        snapshotBaselineId: message.snapshotBaselineId,
        baseSnapshotBaselineId: message.baseSnapshotBaselineId ?? null,
        baseTick: message.baseTick ?? null,
        serverTick: message.serverTick,
        phase: message.phase,
        localReconciliation: {
          playerId: message.localReconciliation.player.id,
          feetPosition: message.localReconciliation.player.feetPosition,
          yawMilliDegrees: message.localReconciliation.player.yawMilliDegrees,
          lastProcessedSequence: message.localReconciliation.player.lastProcessedSequence,
        },
        entities: message.entities.filter(({ kind }) => kind === 'player').map((entity) => ({
          id: entity.id,
          xMillimeters: entity.xMillimeters,
          yMillimeters: entity.yMillimeters,
          zMillimeters: entity.zMillimeters,
          yawMilliDegrees: entity.yawMilliDegrees,
        })),
        combat: summarizedCombat(message.combat),
      };
    case 'reliableEventBatch':
      return { ...base, matchId: message.matchId, events: message.events };
    case 'inputBatch': {
      const first = message.commands?.[0];
      const last = message.commands?.at(-1);
      return { ...base, commands: message.commands?.length ?? 0, firstSequence: first?.sequence ?? null, lastSequence: last?.sequence ?? null, firstClientTick: first?.clientTick ?? null, lastClientTick: last?.clientTick ?? null };
    }
    case 'inputAck':
      return { ...base, serverTick: message.serverTick, lastProcessedInputSequence: message.lastProcessedInputSequence };
    case 'ack':
      return { ...base, serverTick: message.serverTick, snapshotBaselineId: message.snapshotBaselineId, lastEventId: message.lastEventId };
    case 'ping':
    case 'pong':
      return { ...base, nonce: message.nonce, clientTick: message.clientTick ?? null, serverTick: message.serverTick ?? null };
    case 'error':
      return { ...base, code: message.code, detail: message.detail, requestId: message.requestId };
    default:
      return direction === 'sent' ? base : { ...base, sha256: digestText(JSON.stringify(message)) };
  }
}

let wireSequence = 0;
const movementDriverRecoveries = [];

function attachWireRecorder(page, clientId, records) {
  let lastInputAckSequence = null;
  const record = (direction, message) => {
    if (
      message.type === 'inputAck'
      && lastInputAckSequence === message.lastProcessedInputSequence
    ) return;
    if (message.type === 'inputAck') lastInputAckSequence = message.lastProcessedInputSequence;
    records.push(Object.freeze({
      sequence: wireSequence,
      observedAt: new Date().toISOString(),
      observedAtMilliseconds: Date.now(),
      clientId,
      direction,
      message: normalizeWireMessage(message, direction),
    }));
    wireSequence += 1;
  };
  page.on('websocket', (socket) => {
    records.push(Object.freeze({
      sequence: wireSequence,
      observedAt: new Date().toISOString(),
      observedAtMilliseconds: Date.now(),
      clientId,
      direction: 'lifecycle',
      message: { type: 'socket_open', url: socket.url() },
    }));
    wireSequence += 1;
    for (const [eventName, direction] of [['framesent', 'sent'], ['framereceived', 'received']]) {
      socket.on(eventName, ({ payload }) => {
        try {
          const text = typeof payload === 'string' ? payload : Buffer.from(payload).toString('utf8');
          record(direction, JSON.parse(text));
        } catch (error) {
          records.push(Object.freeze({
            sequence: wireSequence,
            observedAt: new Date().toISOString(),
            observedAtMilliseconds: Date.now(),
            clientId,
            direction: 'decode_error',
            message: { type: 'wire_decode_error', error: String(error) },
          }));
          wireSequence += 1;
        }
      });
    }
    socket.on('close', () => {
      records.push(Object.freeze({
        sequence: wireSequence,
        observedAt: new Date().toISOString(),
        observedAtMilliseconds: Date.now(),
        clientId,
        direction: 'lifecycle',
        message: { type: 'socket_close' },
      }));
      wireSequence += 1;
    });
  });
}

async function productSnapshot(page) {
  return await page.evaluate(() => globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot() ?? null);
}

async function presentationMarkerProof(page) {
  return await page.evaluate(() => {
    const snapshot = globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot();
    const proof = document.querySelector('[data-testid="online-presentation-status"]');
    const hud = document.querySelector('[data-testid="online-confirmed-hud"]');
    const vfx = document.querySelector('[data-testid="online-confirmed-vfx"]');
    if (!snapshot || !(proof instanceof HTMLElement) || !(hud instanceof HTMLElement) || !(vfx instanceof HTMLElement)) return null;
    return {
      diagnostics: snapshot.presentation,
      body: {
        status: document.body.dataset.onlinePresentationStatus ?? null,
        lastCue: document.body.dataset.onlinePresentationLastCue ?? null,
        confirmedIntents: document.body.dataset.onlinePresentationConfirmed ?? null,
      },
      proof: {
        text: proof.textContent,
        lastCue: proof.dataset.lastCue ?? null,
        confirmedIntents: proof.dataset.confirmedIntents ?? null,
        duplicateEvents: proof.dataset.duplicateEvents ?? null,
      },
      hud: {
        text: hud.textContent,
        cue: hud.dataset.cue ?? null,
        authorityEventId: hud.dataset.authorityEventId ?? null,
        active: hud.dataset.active ?? null,
        audio: hud.dataset.audio ?? null,
      },
      vfx: {
        cue: vfx.dataset.cue ?? null,
        authorityEventId: vfx.dataset.authorityEventId ?? null,
        active: vfx.dataset.active ?? null,
        reducedMotion: vfx.dataset.reducedMotion ?? null,
      },
    };
  });
}

function assertPresentationMarker(value, cue, minimumConfirmedIntents) {
  assert.notEqual(value, null);
  assert.equal(value.diagnostics.status, 'ready');
  assert.equal(value.diagnostics.lastCue, cue);
  assert.equal(value.diagnostics.duplicateAuthorityEvents, 0);
  assert.equal(value.diagnostics.staleAuthorityEvents, 0);
  assert.ok(value.diagnostics.confirmedIntentCount >= minimumConfirmedIntents);
  assert.equal(value.diagnostics.rejectedIntentCount, 0);
  assert.ok(value.diagnostics.audioCueAttempts >= minimumConfirmedIntents);
  assert.equal(value.body.status, 'ready');
  assert.equal(value.body.lastCue, cue);
  assert.equal(value.body.confirmedIntents, String(value.diagnostics.confirmedIntentCount));
  assert.match(value.proof.text, new RegExp(`READY.*CONFIRMED.*${cue}`, 'iu'));
  assert.deepEqual(
    { proofCue: value.proof.lastCue, hudCue: value.hud.cue, vfxCue: value.vfx.cue },
    { proofCue: cue, hudCue: cue, vfxCue: cue },
  );
  assert.equal(value.proof.duplicateEvents, '0');
  assert.equal(value.hud.authorityEventId, value.diagnostics.lastAuthorityEventId);
  assert.equal(value.vfx.authorityEventId, value.diagnostics.lastAuthorityEventId);
  assert.equal(value.hud.active, 'true');
  assert.equal(value.vfx.active, 'true');
}

function normalizedYawDelta(from, to) {
  return ((to - from + 540_000) % 360_000) - 180_000;
}

async function face(page, targetYawMilliDegrees, toleranceMilliDegrees = 2_200) {
  for (let attempt = 0; attempt < 14; attempt += 1) {
    const current = await productSnapshot(page);
    assert.notEqual(current, null);
    const delta = normalizedYawDelta(current.localPredictedYawMilliDegrees, targetYawMilliDegrees);
    if (Math.abs(delta) <= toleranceMilliDegrees) return current;
    const key = delta > 0 ? 'e' : 'q';
    // Below three discrete 1.5-degree input steps, use a sub-sample pulse and
    // bounded retries so tight combat alignment can land one step instead of
    // oscillating by two steps around an otherwise unreachable target angle.
    const duration = Math.abs(delta) <= 4_500
      ? 35
      : Math.max(70, Math.min(700, Math.abs(delta) / 30_000 * 1_000));
    await page.keyboard.down(key);
    await delay(duration);
    await page.keyboard.up(key);
    await delay(110);
  }
  // The final input pulse can be the one that enters tolerance. Observe its
  // reconciled result before declaring convergence failure.
  const final = await productSnapshot(page);
  assert.notEqual(final, null);
  if (Math.abs(normalizedYawDelta(final.localPredictedYawMilliDegrees, targetYawMilliDegrees)) <= toleranceMilliDegrees) {
    return final;
  }
  throw new Error(`Failed to face ${targetYawMilliDegrees}: ${JSON.stringify({
    finalYawMilliDegrees: final.localPredictedYawMilliDegrees,
    finalDeltaMilliDegrees: normalizedYawDelta(
      final.localPredictedYawMilliDegrees,
      targetYawMilliDegrees,
    ),
    toleranceMilliDegrees,
  })}`);
}

async function moveTo(
  page,
  target,
  label,
  arrivalToleranceMillimeters = 850,
  minimumPulseMilliseconds = 80,
) {
  let bestDistance = Number.POSITIVE_INFINITY;
  let stalledAttempts = 0;
  let lastPosition = null;
  for (let attempt = 0; attempt < 48; attempt += 1) {
    const current = await productSnapshot(page);
    assert.notEqual(current, null);
    const position = current.localPredictedPosition;
    assert.notEqual(position, null);
    if (position.y < -10_000) throw new Error(`${label} fell through at ${JSON.stringify(position)}`);
    const deltaX = target.x - position.x;
    const deltaZ = target.z - position.z;
    const distance = Math.hypot(deltaX, deltaZ);
    if (distance <= arrivalToleranceMillimeters) return current;
    if (distance <= bestDistance - 120) {
      bestDistance = distance;
      stalledAttempts = 0;
    } else {
      stalledAttempts += 1;
    }
    if (stalledAttempts >= 3) {
      // This alternate route deliberately enters the negative-Z Ink channel.
      // Prefer the lateral key that moves south when yaw makes lateral input
      // materially affect Z. Near due north/south, lateral input is almost
      // pure X instead, so move toward the map centerline to route around the
      // blocker rather than repeating the same ineffective west/east pulse.
      const yawRadians = current.localPredictedYawMilliDegrees * Math.PI / 180_000;
      const sine = Math.sin(yawRadians);
      const cosine = Math.cos(yawRadians);
      const recoveryKey = Math.abs(sine) >= 0.25
        ? (sine >= 0 ? 'd' : 'a')
        : (cosine * -Math.sign(position.x || 1) > 0 ? 'd' : 'a');
      movementDriverRecoveries.push(Object.freeze({
        label,
        attempt,
        recoveryKey,
        recoveryPolicy: 'strafe_toward_negative_map_z_or_centerline',
        distanceBeforeMillimeters: distance,
        positionBefore: { ...position },
        yawBeforeMilliDegrees: current.localPredictedYawMilliDegrees,
        target: { ...target },
      }));
      await page.keyboard.down('s');
      await delay(110);
      await page.keyboard.up('s');
      await page.keyboard.down(recoveryKey);
      await delay(260);
      await page.keyboard.up(recoveryKey);
      await delay(140);
      stalledAttempts = 0;
      lastPosition = position;
      continue;
    }
    await face(page, Math.round(Math.atan2(deltaX, deltaZ) * 180_000 / Math.PI));
    // Keep automation pulses below one body radius of travel so prediction
    // cannot overshoot a waypoint into a nearby collider before reconciliation.
    const duration = Math.max(
      minimumPulseMilliseconds,
      Math.min(180, distance / 6_500 * 1_000),
    );
    await page.keyboard.down('w');
    await delay(duration);
    await page.keyboard.up('w');
    await delay(120);
    lastPosition = position;
  }
  throw new Error(`${label} did not reach ${JSON.stringify(target)}: ${JSON.stringify({
    bestDistance,
    lastPosition,
    recoveries: movementDriverRecoveries.filter((entry) => entry.label === label),
  })}`);
}

async function routePair(westPage, eastPage) {
  const checkpoints = [];
  for (let index = 0; index < westRoute.length; index += 1) {
    const arrivalToleranceMillimeters = index === westRoute.length - 1 ? 350 : 850;
    // The final 350 mm target cannot converge with the general 80 ms pulse,
    // which travels about 520 mm at full run speed. Preserve the tighter
    // acceptance radius and reduce only the final real-input pulse.
    const minimumPulseMilliseconds = index === westRoute.length - 1 ? 35 : 80;
    const [west, east] = await Promise.all([
      moveTo(
        westPage,
        westRoute[index],
        `west alternate-ink leg ${index}`,
        arrivalToleranceMillimeters,
        minimumPulseMilliseconds,
      ),
      moveTo(
        eastPage,
        eastRoute[index],
        `east alternate-ink leg ${index}`,
        arrivalToleranceMillimeters,
        minimumPulseMilliseconds,
      ),
    ]);
    checkpoints.push(Object.freeze({ index, west: west.localPredictedPosition, east: east.localPredictedPosition }));
  }
  return Object.freeze(checkpoints);
}

async function faceEachOther(westPage, eastPage) {
  const [west, east] = await Promise.all([productSnapshot(westPage), productSnapshot(eastPage)]);
  assert.notEqual(west?.localPredictedPosition, null);
  assert.notEqual(east?.localPredictedPosition, null);
  const westPosition = west.localPredictedPosition;
  const eastPosition = east.localPredictedPosition;
  const westYaw = Math.round(Math.atan2(eastPosition.x - westPosition.x, eastPosition.z - westPosition.z) * 180_000 / Math.PI);
  const eastYaw = Math.round(Math.atan2(westPosition.x - eastPosition.x, westPosition.z - eastPosition.z) * 180_000 / Math.PI);
  // Combat alignment is tighter than traversal steering. At the bounded
  // Ink Channel pair this keeps the full deterministic recoil/spread envelope
  // inside the scaled 1.8 m humanoid head volumes.
  await Promise.all([face(westPage, westYaw, 800), face(eastPage, eastYaw, 800)]);
  await delay(180);
  return Object.freeze({ westYaw, eastYaw });
}

async function stageVerifiedInkChannelCombatPair(westPage, eastPage, label) {
  const [westBefore, eastBefore] = await Promise.all([
    productSnapshot(westPage),
    productSnapshot(eastPage),
  ]);
  await Promise.all([
    moveTo(
      westPage,
      verifiedInkChannelCombatPair.west,
      `${label} west`,
      verifiedInkChannelCombatPair.arrivalToleranceMillimeters,
      verifiedInkChannelCombatPair.minimumPulseMilliseconds,
    ),
    moveTo(
      eastPage,
      verifiedInkChannelCombatPair.east,
      `${label} east`,
      verifiedInkChannelCombatPair.arrivalToleranceMillimeters,
      verifiedInkChannelCombatPair.minimumPulseMilliseconds,
    ),
  ]);
  await delay(verifiedInkChannelCombatPair.settleMilliseconds);
  const [westAfter, eastAfter] = await Promise.all([
    productSnapshot(westPage),
    productSnapshot(eastPage),
  ]);
  return Object.freeze({
    beforeSeparationMillimeters: distanceXZ(
      westBefore.localPredictedPosition,
      eastBefore.localPredictedPosition,
    ),
    afterSeparationMillimeters: distanceXZ(
      westAfter.localPredictedPosition,
      eastAfter.localPredictedPosition,
    ),
    westTarget: verifiedInkChannelCombatPair.west,
    eastTarget: verifiedInkChannelCombatPair.east,
    westPosition: westAfter.localPredictedPosition,
    eastPosition: eastAfter.localPredictedPosition,
  });
}

async function driveVictimHealth(shooterPage, victimPage, predicate, label) {
  const deadline = Date.now() + 20_000;
  let lastShooter = null;
  let lastVictim = null;
  const pulses = [];
  while (Date.now() < deadline) {
    [lastShooter, lastVictim] = await Promise.all([
      productSnapshot(shooterPage),
      productSnapshot(victimPage),
    ]);
    const shooterBefore = localCombatPlayer(lastShooter);
    const victimBefore = localCombatPlayer(lastVictim);
    if (predicate(victimBefore)) return Object.freeze({ shooter: lastShooter, victim: victimBefore, pulses: Object.freeze(pulses) });
    await faceEachOther(shooterPage, victimPage);
    await shooterPage.keyboard.down(' ');
    try {
      await delay(90);
    } finally {
      await shooterPage.keyboard.up(' ');
    }
    await delay(140);
    const [shooterAfterSnapshot, victimAfterSnapshot] = await Promise.all([
      productSnapshot(shooterPage),
      productSnapshot(victimPage),
    ]);
    const shooterAfter = localCombatPlayer(shooterAfterSnapshot);
    const victimAfter = localCombatPlayer(victimAfterSnapshot);
    const acceptedShotDelta = shooterAfter.acceptedShotCount - shooterBefore.acceptedShotCount;
    const healthDamagePoints = victimBefore.healthPoints - victimAfter.healthPoints;
    assert.ok(acceptedShotDelta >= 0);
    assert.ok(healthDamagePoints >= 0);
    pulses.push(Object.freeze({
      index: pulses.length,
      acceptedShotDelta,
      healthDamagePoints,
      victimHealthBefore: victimBefore.healthPoints,
      victimHealthAfter: victimAfter.healthPoints,
      shooterRiflePhaseAfter: shooterAfter.riflePhase,
      outcome: healthDamagePoints > 0
        ? 'authority_damage'
        : acceptedShotDelta > 0 ? 'accepted_miss_or_occluded' : 'cadence_no_shot',
    }));
    lastShooter = shooterAfterSnapshot;
    lastVictim = victimAfterSnapshot;
    if (predicate(victimAfter)) {
      return Object.freeze({
        shooter: shooterAfterSnapshot,
        victim: victimAfter,
        pulses: Object.freeze(pulses),
      });
    }
  }
  await shooterPage.keyboard.up(' ').catch(() => undefined);
  throw new Error(`${label} timed out: ${JSON.stringify({
    shooter: lastShooter === null ? null : localCombatPlayer(lastShooter),
    victim: lastVictim === null ? null : localCombatPlayer(lastVictim),
    shooterPosition: lastShooter?.localPredictedPosition ?? null,
    victimPosition: lastVictim?.localPredictedPosition ?? null,
  })}`);
}

function localCombatPlayer(value) {
  return value.combat.snapshot.players.find(({ playerId }) => playerId === value.playerId);
}

function peerCombatPlayer(value) {
  return value.combat.snapshot.players.find(({ playerId }) => playerId !== value.playerId);
}

function latestRecord(client, predicate) {
  return [...client.wire].reverse().find(predicate) ?? null;
}

function initialJoinProof(client) {
  const join = client.wire.find(({ direction, message }) => (
    direction === 'received'
    && message.type === 'joinAccepted'
    && message.connectionMode === 'joined'
  ));
  assert.notEqual(join, undefined, `${client.clientId} joinAccepted`);
  const snapshot = client.wire.find(({ sequence, direction, message }) => (
    sequence > join.sequence
    && direction === 'received'
    && message.type === 'fullSnapshot'
    && message.localReconciliation.playerId === join.message.playerId
  ));
  assert.notEqual(snapshot, undefined, `${client.clientId} initial fullSnapshot`);
  const localCombat = snapshot.message.combat?.players.find(({ playerId }) => (
    playerId === join.message.playerId
  ));
  assert.notEqual(localCombat, undefined, `${client.clientId} initial combat player`);
  return Object.freeze({
    clientId: client.clientId,
    playerId: join.message.playerId,
    matchId: join.message.matchId,
    serverTick: snapshot.message.serverTick,
    resumeTokenSha256: join.message.resumeTokenSha256,
    feetPosition: snapshot.message.localReconciliation.feetPosition,
    yawMilliDegrees: snapshot.message.localReconciliation.yawMilliDegrees,
    teamId: localCombat.teamId,
  });
}

async function capturePopulation(clients, count) {
  const readinessDeadline = Date.now() + 60_000;
  let readiness = [];
  while (Date.now() < readinessDeadline) {
    readiness = await Promise.all(clients.map(async ({ clientId, page }) => {
      const value = await productSnapshot(page);
      return {
        clientId,
        value,
        ready: value?.connection === 'joined'
          && value.remotePlayers === count - 1
          && value.combat?.snapshot?.players.length === count
          && value.fullSnapshots >= 1
          && value.inputAcks >= 1
          && value.presentation.status === 'ready',
      };
    }));
    for (const { clientId, value } of readiness) {
      recordConnectionState(`population-${count}`, clientId, value);
    }
    await recordRoomMetrics(
      `population-${count}`,
      readiness.find(({ value }) => value?.roomCode)?.value.roomCode ?? null,
    );
    if (readiness.every(({ ready }) => ready)) break;
    await delay(250);
  }
  if (!readiness.every(({ ready }) => ready)) {
    throw new Error(`Population ${count} readiness timeout: ${JSON.stringify(readiness.map(({ clientId, value }) => ({
      clientId,
      connection: value?.connection ?? null,
      remotePlayers: value?.remotePlayers ?? null,
      combatPlayers: value?.combat?.snapshot?.players.length ?? null,
      fullSnapshots: value?.fullSnapshots ?? null,
      deltaSnapshots: value?.deltaSnapshots ?? null,
      inputAcks: value?.inputAcks ?? null,
      presentationStatus: value?.presentation.status ?? null,
      lastError: value?.lastError ?? null,
    })))}`);
  }
  const values = await Promise.all(clients.map(({ page }) => productSnapshot(page)));
  const roomCodes = new Set(values.map(({ roomCode }) => roomCode));
  const matchIds = new Set(values.map(({ matchId }) => matchId));
  const playerIds = new Set(values.map(({ playerId }) => playerId));
  assert.equal(roomCodes.size, 1);
  assert.equal(matchIds.size, 1);
  assert.equal(playerIds.size, count);
  for (const value of values) {
    assert.equal(value.roomVerification.roomProfile, PROFILE);
    assert.equal(value.roomVerification.mapBinding.mapReference, expectedBinding.mapReference);
    assert.equal(value.roomVerification.mapBinding.fixtureHash, expectedBinding.fixtureHash);
    for (const [key, expected] of Object.entries(expectedIdentity)) {
      assert.equal(value.roomVerification.simulationIdentity[key], expected, `simulation identity ${key}`);
    }
    assert.ok(value.roomVerification.identityChecks >= 4);
    assert.equal(value.lastError, null);
    assert.equal(value.presentation.status, 'ready');
    assert.ok(value.presentation.hydrationCount >= 1);
    assert.equal(value.presentation.duplicateAuthorityEvents, 0);
    assert.equal(value.presentation.staleAuthorityEvents, 0);
  }
  const players = values[0].combat.snapshot.players.map((player) => ({
    playerId: player.playerId,
    teamId: player.teamId,
    lifePhase: player.lifePhase,
    healthPoints: player.healthPoints,
    shieldPoints: player.shieldPoints,
  })).sort((left, right) => left.playerId.localeCompare(right.playerId));
  return Object.freeze({
    count,
    roomCode: values[0].roomCode,
    matchId: values[0].matchId,
    commonAuthorityTick: null,
    uniquePlayerIds: playerIds.size,
    remotePlayersPerClient: values.map(({ remotePlayers }) => remotePlayers),
    fullSnapshotsPerClient: values.map(({ fullSnapshots }) => fullSnapshots),
    deltaSnapshotsPerClient: values.map(({ deltaSnapshots }) => deltaSnapshots),
    inputAcksPerClient: values.map(({ inputAcks }) => inputAcks),
    identityChecksPerClient: values.map(({ roomVerification }) => roomVerification.identityChecks),
    presentationPerClient: values.map(({ playerId, presentation }) => ({
      playerId,
      ...presentation,
    })),
    players,
    teamDistribution: Object.fromEntries(['team_blue', 'team_red'].map((teamId) => [
      teamId,
      players.filter((player) => player.teamId === teamId).length,
    ])),
  });
}

function combatHealthState(snapshot) {
  return snapshot.combat.snapshot.players.map(({ playerId, healthPoints }) => ({
    playerId,
    healthPoints,
  })).sort((left, right) => left.playerId.localeCompare(right.playerId));
}

function scoreFeedState(snapshot) {
  return Object.freeze({
    teamScores: snapshot.combat.snapshot.match.teamScores,
    feedSequence: snapshot.combat.snapshot.match.feedSequence,
    feed: snapshot.combat.snapshot.match.feed,
  });
}

function presentationConsequenceState(snapshot, marker) {
  return Object.freeze({
    diagnostics: Object.freeze({
      confirmedIntentCount: snapshot.presentation.confirmedIntentCount,
      duplicateAuthorityEvents: snapshot.presentation.duplicateAuthorityEvents,
      staleAuthorityEvents: snapshot.presentation.staleAuthorityEvents,
      lastCue: snapshot.presentation.lastCue,
      lastAuthorityEventId: snapshot.presentation.lastAuthorityEventId,
      audioCueAttempts: snapshot.presentation.audioCueAttempts,
    }),
    body: marker?.body ?? null,
    hud: marker?.hud ?? null,
    vfx: marker?.vfx ?? null,
  });
}

function reliableEventOccurrences(client, minimumSequence, expectedEvent) {
  return client.wire.flatMap((record) => {
    if (
      record.sequence < minimumSequence
      || record.direction !== 'received'
      || record.message.type !== 'reliableEventBatch'
    ) return [];
    return record.message.events.filter((event) => (
      event.id === expectedEvent.id
      && event.subjectId === expectedEvent.subjectId
      && event.serverTick === expectedEvent.serverTick
      && event.kind === expectedEvent.kind
      && event.actorId === expectedEvent.actorId
    )).map((event) => ({ record, event }));
  });
}

async function establishSharedAuthorityTick(clients, driver, label) {
  await face(driver.page, -90_000);
  const participantsBefore = await Promise.all(clients.map(async (client) => {
    const [snapshot, marker] = await Promise.all([
      productSnapshot(client.page),
      presentationMarkerProof(client.page),
    ]);
    return Object.freeze({
      clientId: client.clientId,
      snapshot,
      presentationConsequence: presentationConsequenceState(snapshot, marker),
    });
  }));
  const before = participantsBefore.find(({ clientId }) => clientId === driver.clientId).snapshot;
  const driverBefore = localCombatPlayer(before);
  const healthBefore = combatHealthState(before);
  const scoreFeedBefore = scoreFeedState(before);
  const preStimulusShotEventIds = new Set(driver.wire.flatMap((record) => (
    record.direction === 'received' && record.message.type === 'reliableEventBatch'
      ? record.message.events.filter((event) => (
          event.kind === 'shotAccepted' && event.actorId === before.playerId
        )).map(({ id }) => id)
      : []
  )));
  const preStimulusSnapshotTick = driver.wire.reduce((latest, record) => (
    record.direction === 'received'
      && (record.message.type === 'fullSnapshot' || record.message.type === 'deltaSnapshot')
      ? Math.max(latest, record.message.serverTick)
      : latest
  ), -1);
  assert.ok(preStimulusSnapshotTick >= 0, `${label} pre-stimulus snapshot cursor`);
  const minimumSequence = wireSequence;
  const requestedAtMilliseconds = Date.now();
  let after = before;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await driver.page.keyboard.down(' ');
    try {
      // Span the client's 50 ms fixed-input period while staying below the
      // rifle's 100 ms authority cadence. This remains a real keyboard-driven
      // product command and can produce at most one accepted authority shot.
      await delay(SHARED_AUTHORITY_SHOT_PULSE_MILLISECONDS);
    } finally {
      await driver.page.keyboard.up(' ');
    }
    const acceptedDeadline = Date.now() + 1_000;
    while (Date.now() < acceptedDeadline) {
      after = await productSnapshot(driver.page);
      if (localCombatPlayer(after).acceptedShotCount > driverBefore.acceptedShotCount) break;
      await delay(50);
    }
    if (localCombatPlayer(after).acceptedShotCount > driverBefore.acceptedShotCount) break;
    await delay(150);
  }
  const driverAfter = localCombatPlayer(after);
  const acceptedStateObservedAtMilliseconds = Date.now();
  assert.equal(
    driverAfter.acceptedShotCount - driverBefore.acceptedShotCount,
    1,
    `${label} must produce exactly one accepted outward shot`,
  );

  const matchingDriverEvents = () => driver.wire.flatMap((record) => {
    if (
      record.sequence < minimumSequence
      || record.direction !== 'received'
      || record.message.type !== 'reliableEventBatch'
    ) return [];
    return record.message.events.filter((event) => (
      event.kind === 'shotAccepted'
      && event.actorId === after.playerId
      && !preStimulusShotEventIds.has(event.id)
      && event.serverTick > preStimulusSnapshotTick
    )).map((event) => ({ record, event }));
  });
  const driverEventWaitStartedAtMilliseconds = Date.now();
  const driverEventDeadline = Date.now() + 5_000;
  let driverEvents = matchingDriverEvents();
  while (driverEvents.length < 1 && Date.now() < driverEventDeadline) {
    await delay(50);
    driverEvents = matchingDriverEvents();
  }
  assert.ok(driverEvents.length >= 1, `${label} driver reliable shot event`);
  const authorityEventObservation = driverEvents.reduce((latest, candidate) => (
    latest === null || candidate.event.serverTick > latest.event.serverTick ? candidate : latest
  ), null);
  const authorityEvent = authorityEventObservation.event;
  assert.equal(preStimulusShotEventIds.has(authorityEvent.id), false);
  assert.ok(authorityEvent.serverTick > preStimulusSnapshotTick);

  const deliveryDeadline = Date.now() + 5_000;
  while (
    Date.now() < deliveryDeadline
    && clients.some((client) => reliableEventOccurrences(
      client,
      minimumSequence,
      authorityEvent,
    ).length < 1)
  ) await delay(50);
  await delay(250);
  const deliveries = await Promise.all(clients.map(async (client) => {
    const occurrences = reliableEventOccurrences(client, minimumSequence, authorityEvent);
    assert.ok(occurrences.length >= 1, `${label} ${client.clientId} reliable shot occurrence`);
    const [{ record }] = occurrences;
    const latencyMilliseconds = record.observedAtMilliseconds - requestedAtMilliseconds;
    assert.ok(latencyMilliseconds >= 0 && latencyMilliseconds <= 5_000);
    const clientSnapshot = await productSnapshot(client.page);
    const clientMarker = await presentationMarkerProof(client.page);
    const logicalApplicationCount = clientSnapshot.combat.recentEvents.filter((event) => (
      event.id === authorityEvent.id
      && event.subjectId === authorityEvent.subjectId
      && event.serverTick === authorityEvent.serverTick
      && event.kind === authorityEvent.kind
    )).length;
    assert.equal(logicalApplicationCount, 1, `${label} ${client.clientId} logical application`);
    const presentationBefore = participantsBefore.find(({ clientId }) => (
      clientId === client.clientId
    )).presentationConsequence;
    const presentationAfter = presentationConsequenceState(clientSnapshot, clientMarker);
    const presentationConsequenceUnchanged = JSON.stringify(presentationAfter)
      === JSON.stringify(presentationBefore);
    assert.equal(
      presentationConsequenceUnchanged,
      true,
      `${label} ${client.clientId} shot must not duplicate HUD/VFX/audio consequence`,
    );
    return Object.freeze({
      clientId: client.clientId,
      observedAt: record.observedAt,
      observedAtMilliseconds: record.observedAtMilliseconds,
      latencyMilliseconds,
      rawOccurrenceCount: occurrences.length,
      duplicateWireDeliveries: occurrences.length - 1,
      logicalApplicationCount,
      presentationBefore,
      presentationAfter,
      presentationConsequenceUnchanged,
    });
  }));
  await delay(150);
  const driverFinal = await productSnapshot(driver.page);
  const healthAfter = combatHealthState(driverFinal);
  const scoreFeedAfter = scoreFeedState(driverFinal);
  assert.deepEqual(
    healthAfter.map(({ playerId }) => playerId),
    healthBefore.map(({ playerId }) => playerId),
    `${label} player health roster must remain stable`,
  );
  const healthTransitions = healthBefore.map((beforeHealth, index) => {
    const afterHealth = healthAfter[index];
    assert.equal(afterHealth.playerId, beforeHealth.playerId);
    return Object.freeze({
      playerId: beforeHealth.playerId,
      beforeHealthPoints: beforeHealth.healthPoints,
      afterHealthPoints: afterHealth.healthPoints,
      deltaHealthPoints: afterHealth.healthPoints - beforeHealth.healthPoints,
    });
  });
  const healthNeverDecreased = healthTransitions.every(({ deltaHealthPoints }) => (
    deltaHealthPoints >= 0
  ));
  // A previously dead participant can complete its normal respawn while the
  // reliable-event delivery proof is sampled. Healing is allowed; a per-player
  // health decrease would mean the outward shot caused damage.
  assert.equal(healthNeverDecreased, true, `${label} outward shot must not damage a player`);
  assert.deepEqual(scoreFeedAfter, scoreFeedBefore, `${label} shot must not change score/feed`);
  return Object.freeze({
    commonAuthorityTick: authorityEvent.serverTick,
    stimulus: Object.freeze({
      kind: 'real_product_shot_accepted_reliable_tick',
      directStateMutation: false,
      serverOwned: true,
      roomWide: true,
      driverClientId: driver.clientId,
      firePulseMilliseconds: SHARED_AUTHORITY_SHOT_PULSE_MILLISECONDS,
      reliableEventId: authorityEvent.id,
      subjectId: authorityEvent.subjectId,
      actorId: authorityEvent.actorId,
      serverTick: authorityEvent.serverTick,
      requestedAtMilliseconds,
      acceptedShotCountBefore: driverBefore.acceptedShotCount,
      acceptedShotCountAfter: driverAfter.acceptedShotCount,
      preStimulusSnapshotTick,
      preStimulusShotEventIds: [...preStimulusShotEventIds].sort(),
      newAuthorityEventIdentityRequired: true,
      acceptedStateObservedAtMilliseconds,
      driverEventObservedAtMilliseconds: authorityEventObservation.record.observedAtMilliseconds,
      diagnosticToEventObservationMilliseconds:
        authorityEventObservation.record.observedAtMilliseconds
        - acceptedStateObservedAtMilliseconds,
      driverEventWaitMilliseconds: Date.now() - driverEventWaitStartedAtMilliseconds,
      healthBefore,
      healthAfter,
      healthTransitions,
      healthNeverDecreased,
      healthUnchanged: JSON.stringify(healthAfter) === JSON.stringify(healthBefore),
      scoreFeedBefore,
      scoreFeedAfter,
      scoreFeedUnchanged: true,
      transportDeliverySemantics: 'at_least_once_with_client_deduplication',
      deliveryClients: deliveries.length,
      deliveries,
      totalRawDeliveries: deliveries.reduce((sum, { rawOccurrenceCount }) => (
        sum + rawOccurrenceCount
      ), 0),
      totalLogicalApplications: deliveries.reduce((sum, { logicalApplicationCount }) => (
        sum + logicalApplicationCount
      ), 0),
      presentationConsequencesUnchanged: deliveries.every(({ presentationConsequenceUnchanged }) => (
        presentationConsequenceUnchanged
      )),
      maximumDeliveryLatencyMilliseconds: Math.max(...deliveries.map(({ latencyMilliseconds }) => (
        latencyMilliseconds
      ))),
    }),
  });
}

function remoteEntity(snapshot, entityId) {
  return snapshot.remoteEntities?.find((remote) => remote.entityId === entityId) ?? null;
}

async function waitForLocalAuthoritySettlement(
  page,
  label,
  {
    timeoutMilliseconds = 10_000,
    maximumPredictionErrorMillimeters = 750,
    maximumSampleDriftMillimeters = 80,
    requiredStableSamples = 3,
  } = {},
) {
  const startedAtMilliseconds = Date.now();
  let previous = null;
  let stableSamples = 0;
  let samples = 0;
  let maximumObservedPredictionErrorMillimeters = 0;
  let last = null;
  while (Date.now() - startedAtMilliseconds <= timeoutMilliseconds) {
    const snapshot = await productSnapshot(page);
    const predicted = snapshot?.localPredictedPosition ?? null;
    const authoritative = snapshot?.localAuthoritativePosition ?? null;
    if (snapshot !== null && predicted !== null && authoritative !== null) {
      const predictionErrorMillimeters = distanceXZ(predicted, authoritative);
      maximumObservedPredictionErrorMillimeters = Math.max(
        maximumObservedPredictionErrorMillimeters,
        predictionErrorMillimeters,
      );
      const predictedDriftMillimeters = previous === null
        ? Number.POSITIVE_INFINITY
        : distanceXZ(previous.predicted, predicted);
      const authoritativeDriftMillimeters = previous === null
        ? Number.POSITIVE_INFINITY
        : distanceXZ(previous.authoritative, authoritative);
      const stable = predictionErrorMillimeters <= maximumPredictionErrorMillimeters
        && predictedDriftMillimeters <= maximumSampleDriftMillimeters
        && authoritativeDriftMillimeters <= maximumSampleDriftMillimeters;
      stableSamples = stable ? stableSamples + 1 : 0;
      samples += 1;
      last = Object.freeze({
        snapshot,
        predicted: Object.freeze({ ...predicted }),
        authoritative: Object.freeze({ ...authoritative }),
        predictionErrorMillimeters,
        predictedDriftMillimeters,
        authoritativeDriftMillimeters,
      });
      if (stableSamples >= requiredStableSamples) {
        return Object.freeze({
          ...last,
          samples,
          stableSamples,
          maximumObservedPredictionErrorMillimeters,
          settledAfterMilliseconds: Date.now() - startedAtMilliseconds,
        });
      }
      previous = Object.freeze({
        predicted: Object.freeze({ ...predicted }),
        authoritative: Object.freeze({ ...authoritative }),
      });
    }
    await delay(100);
  }
  throw new Error(`${label} local authority did not settle: ${JSON.stringify({
    timeoutMilliseconds,
    maximumPredictionErrorMillimeters,
    maximumSampleDriftMillimeters,
    requiredStableSamples,
    samples,
    maximumObservedPredictionErrorMillimeters,
    last,
  })}`);
}

async function waitForRemoteEntityMovement(
  page,
  {
    entityId,
    authorityPosition,
    remoteBefore,
    label,
    timeoutMilliseconds = 10_000,
    maximumPeerDistanceMillimeters = 750,
    minimumRemoteMovementMillimeters = 500,
  },
) {
  const startedAtMilliseconds = Date.now();
  let last = null;
  while (Date.now() - startedAtMilliseconds <= timeoutMilliseconds) {
    const snapshot = await productSnapshot(page);
    const remote = snapshot === null ? null : remoteEntity(snapshot, entityId);
    if (snapshot !== null && remote !== null) {
      const peerDistanceMillimeters = distanceXZ(authorityPosition, remote.position);
      const remoteTransformMovementMillimeters = distanceXZ(remoteBefore, remote.position);
      last = Object.freeze({
        snapshot,
        remote,
        peerDistanceMillimeters,
        remoteTransformMovementMillimeters,
      });
      if (
        peerDistanceMillimeters <= maximumPeerDistanceMillimeters
        && remoteTransformMovementMillimeters >= minimumRemoteMovementMillimeters
      ) {
        return Object.freeze({
          ...last,
          observedAfterMilliseconds: Date.now() - startedAtMilliseconds,
        });
      }
    }
    await delay(100);
  }
  throw new Error(`${label} exact remote entity did not converge: ${JSON.stringify({
    entityId,
    authorityPosition,
    remoteBefore,
    timeoutMilliseconds,
    maximumPeerDistanceMillimeters,
    minimumRemoteMovementMillimeters,
    last,
  })}`);
}

async function movementInterpolationProof(
  mover,
  observer,
  populationClients,
  target,
  populationAuthorityTick,
  label,
  arrivalToleranceMillimeters = 850,
) {
  const populationBeforeMovement = await Promise.all(populationClients.map(({ page }) => (
    productSnapshot(page)
  )));
  const before = populationBeforeMovement[populationClients.indexOf(mover)];
  const observerBefore = populationBeforeMovement[populationClients.indexOf(observer)];
  const moverPositionBefore = before.localAuthoritativePosition ?? before.localPredictedPosition;
  assert.notEqual(moverPositionBefore, null);
  const observedMoverEntityBefore = remoteEntity(observerBefore, before.playerId);
  assert.notEqual(observedMoverEntityBefore, null);
  const observedMoverBefore = observedMoverEntityBefore.position;
  await moveTo(mover.page, target, label, arrivalToleranceMillimeters);
  const settlement = await waitForLocalAuthoritySettlement(mover.page, label);
  const after = settlement.snapshot;
  const moverAuthorityAfter = settlement.authoritative;
  const movementMillimeters = distanceXZ(before.localPredictedPosition, after.localPredictedPosition);
  assert.ok(movementMillimeters >= 500, `${label} local prediction did not advance`);
  const remoteObservation = await waitForRemoteEntityMovement(observer.page, {
    entityId: after.playerId,
    authorityPosition: moverAuthorityAfter,
    remoteBefore: observedMoverBefore,
    label,
  });
  const observed = remoteObservation.snapshot;
  const peerDistanceMillimeters = remoteObservation.peerDistanceMillimeters;
  const remoteTransformMovementMillimeters =
    remoteObservation.remoteTransformMovementMillimeters;
  assert.ok(remoteTransformMovementMillimeters >= 500, `${label} remote transform did not progress`);
  const populationAfterMovement = await Promise.all(populationClients.map(({ page }) => (
    productSnapshot(page)
  )));
  const populationDeltaSnapshotDeltasAfterMovement = populationAfterMovement.map((value, index) => (
    value.deltaSnapshots - populationBeforeMovement[index].deltaSnapshots
  ));
  const populationInputAckDeltasAfterMovement = populationAfterMovement.map((value, index) => (
    value.inputAcks - populationBeforeMovement[index].inputAcks
  ));
  assert.ok(populationDeltaSnapshotDeltasAfterMovement.every((value) => value >= 1));
  assert.ok(populationInputAckDeltasAfterMovement.every((value) => value >= 1));
  const postMovementAuthority = await establishSharedAuthorityTick(
    populationClients,
    mover,
    `${label} post-movement authority clock`,
  );
  assert.ok(postMovementAuthority.commonAuthorityTick > populationAuthorityTick);
  return Object.freeze({
    moverClientId: mover.clientId,
    observerClientId: observer.clientId,
    before: before.localPredictedPosition,
    after: after.localPredictedPosition,
    authorityBefore: moverPositionBefore,
    authorityAfter: moverAuthorityAfter,
    target,
    requestedArrivalToleranceMillimeters: arrivalToleranceMillimeters,
    targetDistanceAfterSettlementMillimeters: distanceXZ(target, moverAuthorityAfter),
    predictionToAuthorityDistanceAfterSettlementMillimeters:
      settlement.predictionErrorMillimeters,
    predictionSettlementSamples: settlement.samples,
    predictionStableSamples: settlement.stableSamples,
    predictionMaximumObservedErrorMillimeters:
      settlement.maximumObservedPredictionErrorMillimeters,
    predictionSettledAfterMilliseconds: settlement.settledAfterMilliseconds,
    movementMillimeters,
    peerDistanceMillimeters,
    remoteTransformMovementMillimeters,
    observerEntityId: remoteObservation.remote.entityId,
    observerInterpolationMode: remoteObservation.remote.interpolationMode,
    observerConvergedAfterMilliseconds: remoteObservation.observedAfterMilliseconds,
    commonAuthorityTickAfterMovement: postMovementAuthority.commonAuthorityTick,
    tickStimulusAfterMovement: postMovementAuthority.stimulus,
    populationDeltaSnapshotsAfterMovement: populationAfterMovement.map(({ deltaSnapshots }) => deltaSnapshots),
    populationInputAcksAfterMovement: populationAfterMovement.map(({ inputAcks }) => inputAcks),
    populationDeltaSnapshotDeltasAfterMovement,
    populationInputAckDeltasAfterMovement,
    moverReconciliations: after.reconciliations,
    observerRemotePlayers: observed.remotePlayers,
  });
}

async function createClient(browser, index, wireRecords) {
  const context = await browser.newContext({
    viewport: index < 2 ? { width: 1_440, height: 900 } : { width: 1_024, height: 720 },
  });
  const displayName = `P515 Client ${index + 1}`;
  await context.addInitScript((profile) => localStorage.setItem(
    'kyx_local_profile',
    JSON.stringify({ kind: 'local_guest', version: 1, displayName: profile }),
  ), displayName);
  const page = await context.newPage();
  const clientId = `client-${index}`;
  const wire = [];
  wireRecords.push(wire);
  attachWireRecorder(page, clientId, wire);
  const consoleErrors = [];
  const transientOptimizerErrors = [];
  const consoleWarnings = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      if (message.text().includes('504 (Outdated Optimize Dep)')) {
        transientOptimizerErrors.push(message.text());
      } else {
        consoleErrors.push(message.text());
      }
    }
    if (message.type() === 'warning') consoleWarnings.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  return {
    index,
    clientId,
    displayName,
    context,
    page,
    wire,
    consoleErrors,
    transientOptimizerErrors,
    consoleWarnings,
    pageErrors,
  };
}

async function prewarmClient(client) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await client.page.goto(`${FRONTEND_ORIGIN}/online`, { waitUntil: 'domcontentloaded' });
    try {
      await client.page.waitForFunction(
        () => document.body.dataset.onlinePreviewStatus === 'lobby',
        undefined,
        { timeout: 15_000 },
      );
      assert.equal(await client.page.getByTestId('online-create-room').isVisible(), true);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await delay(1_000);
    }
  }
  throw lastError;
}

async function joinPrewarmedClient(client, joinUrl) {
  await client.page.goto(joinUrl, { waitUntil: 'domcontentloaded' });
  await client.page.waitForFunction(
    () => document.body.dataset.onlinePreviewStatus === 'joined',
    undefined,
    { timeout: 45_000 },
  );
}

function boardHtml(board) {
  const cards = [
    ['Exact authority', `${board.profile}<br>${board.mapReference}<br>${board.fixtureHash}`],
    ['Shared authority events', `2 clients @ tick ${board.ticks.two}<br>4 clients @ tick ${board.ticks.four}<br>8 clients @ tick ${board.ticks.eight}`],
    ['Spawns and teams', `${board.uniqueSpawns}/8 locked spawns<br>${board.blue} blue / ${board.red} red`],
    ['Prediction and interpolation', `4-client move ${Math.round(board.fourMove)} mm<br>peer error ${Math.round(board.fourPeer)} mm<br>8-client move ${Math.round(board.eightMove)} mm<br>peer error ${Math.round(board.eightPeer)} mm`],
    ['World and combat', `cross-map damage blocked: ${board.occluded}<br>death ${board.death}<br>score ${board.score}<br>feed sequence ${board.feedSequence}<br>confirmed cues ${board.presentationCues}`],
    ['Recovery and identity', `same player: ${board.samePlayer}<br>token rotated: ${board.tokenRotated}<br>state preserved: ${board.statePreserved}<br>profile alias: HTTP ${board.mismatchStatus}`],
  ];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;background:#070b0f;color:#eff8fa;font-family:Inter,Arial,sans-serif;padding:48px}h1{font:900 38px/1.05 ui-monospace,monospace;letter-spacing:-.04em;margin:0 0 10px}p{color:#97abb2;margin:0 0 34px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.card{min-height:180px;border:1px solid #26343a;background:linear-gradient(145deg,#11191e,#0b1014);padding:22px;border-radius:12px}.card h2{margin:0 0 16px;color:#69e5f4;font:800 15px/1.2 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em}.card div{font:700 19px/1.55 ui-monospace,monospace}.footer{margin-top:26px;border-top:1px solid #26343a;padding-top:18px;color:#e6b75c;font:700 14px/1.5 ui-monospace,monospace}</style></head><body>
    <h1>P5.15 PRODUCT RUNTIME EVIDENCE</h1><p>Derived summary of the hashed product screenshots and normalized WebSocket log.</p>
    <div class="grid">${cards.map(([title, value]) => `<section class="card"><h2>${title}</h2><div>${value}</div></section>`).join('')}</div>
    <div class="footer">BOUNDED EVIDENCE ONLY · NO G3/G4/G5 OR HUMAN PLAYTEST ACCEPTANCE CLAIM</div>
  </body></html>`;
}

let vite = null;
let wrangler = null;
const browsers = [];
const browserProcessIds = [];
const clients = [];
const wireRecords = [];
const connectionTimeline = [];
const roomMetricsTimeline = [];
const lastConnectionFingerprints = new Map();
let lastRoomMetricsAt = 0;

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.mkdir(output, { recursive: false });
await fs.mkdir(screenshotDirectory);
const sourceSha256AtStart = Object.fromEntries(await Promise.all(sourceFiles.map(async (relative) => [
  relative,
  await sha256(path.join(repo, relative)),
])));
const repositoryStateAtStart = await repositoryState();
const runtimeEnvironment = Object.freeze({
  nodeVersion: process.version,
  platform: process.platform,
  architecture: process.arch,
  nodeExecutable,
  browserLaunchArguments,
});

try {
  wrangler = service(nodeExecutable, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--local', '--port', '8787']);
  vite = service(nodeExecutable, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
    ...process.env,
    VITE_KYX_AUTHORITY_ORIGIN: AUTHORITY_ORIGIN,
  });
  await Promise.all([waitForHttp(`${AUTHORITY_ORIGIN}/health`), waitForHttp(`${FRONTEND_ORIGIN}/online`)]);

  const chromeCandidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ];
  let chromeExecutable = null;
  for (const candidate of chromeCandidates) {
    try {
      await fs.access(candidate);
      chromeExecutable = candidate;
      break;
    } catch {
      // Try the next system Chrome path.
    }
  }
  if (chromeExecutable === null) throw new Error('System Chrome was not found');

  const launchProductBrowser = async () => {
    const browser = await chromium.launch({
      executablePath: chromeExecutable,
      headless: true,
      args: [...browserLaunchArguments],
    });
    const processId = await browserProcessId(browser);
    if (processId === null) {
      await browser.close();
      throw new Error('Chrome launch did not expose a browser process id');
    }
    if (browserProcessIds.includes(processId)) {
      await browser.close();
      throw new Error(`Chrome launch reused browser process ${processId}`);
    }
    browsers.push(browser);
    browserProcessIds.push(processId);
    return browser;
  };

  const browserPrewarmStartedAt = new Date().toISOString();
  for (let index = 0; index < 8; index += 1) {
    clients.push(await createClient(await launchProductBrowser(), index, wireRecords));
  }
  assert.equal(browsers.length, 8);
  assert.equal(browserProcessIds.length, 8);
  assert.equal(new Set(browserProcessIds).size, 8);
  assert.equal(clients.length, 8);
  // Let Vite finish any one-time dependency optimization before the next
  // isolated Chrome process requests the module graph.
  for (const client of clients) await prewarmClient(client);
  const browserPrewarmCompletedAt = new Date().toISOString();
  const prewarmStatuses = await Promise.all(clients.map(({ page }) => (
    page.evaluate(() => document.body.dataset.onlinePreviewStatus)
  )));
  assert.deepEqual(prewarmStatuses, Array.from({ length: 8 }, () => 'lobby'));

  const first = clients[0];
  const second = clients[1];
  assert.notEqual(first, undefined);
  assert.notEqual(second, undefined);
  const profileSelector = first.page.getByTestId('online-inkfall-profile');
  assert.equal(await profileSelector.isVisible(), true);
  assert.equal(await profileSelector.isChecked(), false);
  await profileSelector.check();
  const roomCreationRequestedAt = new Date().toISOString();
  assert.ok(Date.parse(roomCreationRequestedAt) >= Date.parse(browserPrewarmCompletedAt));
  await first.page.getByTestId('online-create-room').click();
  await first.page.waitForFunction(
    () => document.body.dataset.onlinePreviewStatus === 'joined',
    undefined,
    { timeout: 45_000 },
  );
  const joinUrl = first.page.url();
  assert.equal(new URL(joinUrl).searchParams.get('profile'), PROFILE);

  await joinPrewarmedClient(second, joinUrl);
  const twoClients = clients.slice(0, 2);
  assert.equal(twoClients.length, 2);
  const twoPopulationReadiness = await capturePopulation(twoClients, 2);
  const twoPopulationTick = await establishSharedAuthorityTick(
    twoClients,
    first,
    'two-client population authority clock',
  );
  const twoPopulation = Object.freeze({
    ...twoPopulationReadiness,
    commonAuthorityTick: twoPopulationTick.commonAuthorityTick,
    tickStimulus: twoPopulationTick.stimulus,
  });
  const initialJoins = twoClients.map(initialJoinProof);
  assert.deepEqual(initialJoins.map(({ feetPosition }) => feetPosition), expectedSpawns.slice(0, 2).map(({ feetPosition }) => feetPosition));
  await first.page.screenshot({ path: path.join(screenshotDirectory, 'p515-01-client-0-two-rendered.png'), fullPage: true });
  await second.page.screenshot({ path: path.join(screenshotDirectory, 'p515-02-client-1-two-rendered.png'), fullPage: true });

  const spawnProtectionExpiryWaitMilliseconds = 1_500;
  await delay(spawnProtectionExpiryWaitMilliseconds);
  const crossAim = await faceEachOther(first.page, second.page);
  const crossBefore = await productSnapshot(first.page);
  const crossVictimBefore = peerCombatPlayer(crossBefore);
  const crossShooterBefore = localCombatPlayer(crossBefore);
  await first.page.keyboard.down(' ');
  await delay(650);
  await first.page.keyboard.up(' ');
  await delay(350);
  const crossAfter = await productSnapshot(first.page);
  const crossVictimAfter = peerCombatPlayer(crossAfter);
  const crossShooterAfter = localCombatPlayer(crossAfter);
  assert.ok(crossShooterAfter.acceptedShotCount > crossShooterBefore.acceptedShotCount);
  assert.equal(crossVictimAfter.healthPoints, crossVictimBefore.healthPoints);
  await first.page.getByTestId('online-arena').screenshot({ path: path.join(screenshotDirectory, 'p515-03-real-occlusion.png') });

  await first.page.keyboard.down('r');
  await delay(250);
  await first.page.keyboard.up('r');
  await first.page.waitForFunction(() => {
    const value = globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot();
    const local = value?.combat.snapshot?.players.find(({ playerId }) => playerId === value.playerId);
    return local?.magazineRounds === 50 && local.reserveRounds < 150;
  }, undefined, { timeout: 8_000 });
  const routeCheckpoints = await routePair(first.page, second.page);
  const bodyHitConvergence = await stageVerifiedInkChannelCombatPair(
    first.page,
    second.page,
    'pre-body-hit verified Ink Channel setup',
  );
  assert.ok(
    bodyHitConvergence.afterSeparationMillimeters
      <= verifiedInkChannelCombatPair.maximumSeparationMillimeters,
  );
  const [bodyHitShooterSetup, bodyHitVictimSetup] = await Promise.all([
    productSnapshot(first.page),
    productSnapshot(second.page),
  ]);
  const bodyHitVerticalMarginMillimeters = bodyHitVictimSetup.localPredictedPosition.y
    + 1_800
    - (bodyHitShooterSetup.localPredictedPosition.y + 1_700);
  assert.ok(
    bodyHitVerticalMarginMillimeters
      >= verifiedInkChannelCombatPair.minimumVerticalMarginMillimeters,
  );
  const closeAim = await faceEachOther(first.page, second.page);
  const bodyDamageDrive = await driveVictimHealth(
    first.page,
    second.page,
    ({ healthPoints, lifePhase }) => lifePhase === 'alive' && healthPoints <= 70,
    'close body damage',
  );
  const damaged = await productSnapshot(second.page);
  assert.ok(damaged.combat.recentEvents.some(({ kind }) => kind === 'damageApplied'));
  await first.page.waitForFunction(() => (
    globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot().presentation.lastCue === 'body'
  ), undefined, { timeout: 5_000 });
  const presentationAtDamage = await presentationMarkerProof(first.page);
  assertPresentationMarker(presentationAtDamage, 'body', 1);
  await first.page.screenshot({ path: path.join(screenshotDirectory, 'p515-04-confirmed-body-hit.png'), fullPage: true });
  const lethalConvergence = await stageVerifiedInkChannelCombatPair(
    first.page,
    second.page,
    'post-body-hit lethal setup',
  );
  assert.ok(
    lethalConvergence.afterSeparationMillimeters
      <= verifiedInkChannelCombatPair.maximumSeparationMillimeters,
  );
  const lethalDamageDrive = await driveVictimHealth(
    first.page,
    second.page,
    ({ lifePhase }) => lifePhase === 'dead',
    'close lethal damage',
  );
  await first.page.waitForFunction(() => (
    globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot().presentation.lastCue === 'kill'
  ), undefined, { timeout: 5_000 });
  const [deathShooter, deathVictim] = await Promise.all([
    productSnapshot(first.page),
    productSnapshot(second.page),
  ]);
  const victimAtDeath = localCombatPlayer(deathVictim);
  assert.deepEqual({ lifePhase: victimAtDeath.lifePhase, healthPoints: victimAtDeath.healthPoints }, { lifePhase: 'dead', healthPoints: 0 });
  assert.ok(deathShooter.combat.recentEvents.some(({ kind }) => kind === 'playerKilled'));
  const presentationAtDeath = await presentationMarkerProof(first.page);
  assertPresentationMarker(presentationAtDeath, 'kill', 2);
  await first.page.screenshot({ path: path.join(screenshotDirectory, 'p515-05-authoritative-death-score.png'), fullPage: true });

  // Teleport east onto either the route rail (partial) or the large Ink-mid
  // node floor (full). North, south, and west all end over unsupported void.
  await face(first.page, 90_000);
  const teleportBefore = await productSnapshot(first.page);
  const teleportWireSequence = wireSequence;
  const teleportRequestedAtMilliseconds = Date.now();
  await first.page.getByTestId('online-teleport').click();
  await first.page.waitForFunction((before) => {
    const value = globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot();
    return value?.presentation.lastCue === 'teleport'
      && Math.hypot(
        value.localPredictedPosition.x - before.x,
        value.localPredictedPosition.z - before.z,
      ) >= 500;
  }, teleportBefore.localPredictedPosition, { timeout: 10_000 });
  await delay(500);
  const teleportAfter = await productSnapshot(first.page);
  assert.ok(teleportAfter.localPredictedPosition.y > -10_000);
  const teleportPresentation = await presentationMarkerProof(first.page);
  assertPresentationMarker(teleportPresentation, 'teleport', 3);
  const teleportDistanceMillimeters = distanceXZ(
    teleportBefore.localPredictedPosition,
    teleportAfter.localPredictedPosition,
  );
  assert.ok(teleportDistanceMillimeters >= 500);
  const teleportReliableEvent = latestRecord(first, ({ sequence, direction, message }) => (
    sequence >= teleportWireSequence
    && direction === 'received'
    && message.type === 'reliableEventBatch'
    && message.events.some((event) => event.presentation?.kind === 'teleport_resource_confirmed')
  ))?.message.events.find((event) => event.presentation?.kind === 'teleport_resource_confirmed') ?? null;
  assert.notEqual(teleportReliableEvent, null);
  assert.equal(teleportReliableEvent.kind, 'abilityActivated');
  assert.equal(teleportReliableEvent.actorId, teleportAfter.playerId);
  assert.ok(teleportReliableEvent.presentation.outcome === 'full' || teleportReliableEvent.presentation.outcome === 'partial');
  const teleportRecords = (client) => client.wire.filter(({ sequence, direction, message }) => (
    sequence >= teleportWireSequence
      && direction === 'received'
      && message.type === 'reliableEventBatch'
      && message.events.some((event) => event.presentation?.eventId === teleportReliableEvent.presentation.eventId)
  ));
  const teleportDeliveryDeadline = Date.now() + 5_000;
  while (
    Date.now() < teleportDeliveryDeadline
    && clients.slice(0, 2).filter((client) => teleportRecords(client).length >= 1).length < 2
  ) await delay(50);
  const teleportDeliveries = clients.slice(0, 2).map((client) => {
    const records = teleportRecords(client);
    assert.equal(records.length, 1, `${client.clientId} teleport reliable occurrences`);
    const [record] = records;
    const latencyMilliseconds = record.observedAtMilliseconds - teleportRequestedAtMilliseconds;
    assert.ok(latencyMilliseconds >= 0 && latencyMilliseconds <= 5_000);
    return Object.freeze({
      clientId: client.clientId,
      observedAt: record.observedAt,
      observedAtMilliseconds: record.observedAtMilliseconds,
      latencyMilliseconds,
      occurrenceCount: records.length,
    });
  });
  const teleportReliableDeliveryClients = teleportDeliveries.length;
  assert.equal(teleportReliableDeliveryClients, 2);
  await first.page.screenshot({ path: path.join(screenshotDirectory, 'p515-06-confirmed-teleport.png'), fullPage: true });

  const beforeResume = await productSnapshot(first.page);
  const originalJoin = initialJoins[0];
  const wireBeforeResume = wireSequence;
  await first.page.getByTestId('online-resume').click();
  await first.page.waitForFunction(() => {
    const value = globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot();
    return value?.connection === 'joined' && value.resumeSuccesses >= 1;
  }, undefined, { timeout: 30_000 });
  await first.page.waitForFunction((minimumHydrations) => {
    const value = globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot();
    return value?.presentation.status === 'ready'
      && value.presentation.hydrationCount > minimumHydrations;
  }, beforeResume.presentation.hydrationCount, { timeout: 10_000 });
  const afterResume = await productSnapshot(first.page);
  const resumedJoin = latestRecord(first, ({ sequence, direction, message }) => (
    sequence >= wireBeforeResume
    && direction === 'received'
    && message.type === 'joinAccepted'
    && message.connectionMode === 'resumed'
  ));
  assert.notEqual(resumedJoin, null);
  assert.equal(resumedJoin.message.playerId, originalJoin.playerId);
  assert.notEqual(resumedJoin.message.resumeTokenSha256, originalJoin.resumeTokenSha256);
  assert.equal(afterResume.matchId, beforeResume.matchId);
  assert.deepEqual(afterResume.combat.snapshot.match.teamScores, beforeResume.combat.snapshot.match.teamScores);
  assert.equal(afterResume.combat.snapshot.match.feedSequence, beforeResume.combat.snapshot.match.feedSequence);
  assert.equal(afterResume.presentation.lastCue, 'snapshot');
  assert.equal(afterResume.presentation.confirmedIntentCount, beforeResume.presentation.confirmedIntentCount);
  assert.equal(afterResume.presentation.audioCueAttempts, beforeResume.presentation.audioCueAttempts);
  await first.page.screenshot({ path: path.join(screenshotDirectory, 'p515-07-resume-preserved-state.png'), fullPage: true });

  for (let index = 2; index < 4; index += 1) {
    await joinPrewarmedClient(clients[index], joinUrl);
  }
  const fourClients = clients.slice(0, 4);
  assert.equal(fourClients.length, 4);
  const fourPopulationReadiness = await capturePopulation(fourClients, 4);
  const fourPopulationTick = await establishSharedAuthorityTick(
    fourClients,
    clients[2],
    'four-client population authority clock',
  );
  const fourPopulation = Object.freeze({
    ...fourPopulationReadiness,
    commonAuthorityTick: fourPopulationTick.commonAuthorityTick,
    tickStimulus: fourPopulationTick.stimulus,
  });
  initialJoins.push(...clients.slice(2, 4).map(initialJoinProof));
  const fourInterpolation = await movementInterpolationProof(
    clients[2],
    clients[3],
    fourClients,
    { x: -33_500, z: 6_500 },
    fourPopulation.commonAuthorityTick,
    'four-client interpolation movement',
  );
  await first.page.screenshot({ path: path.join(screenshotDirectory, 'p515-08-four-product-clients.png'), fullPage: true });

  for (let index = 4; index < 8; index += 1) {
    await joinPrewarmedClient(clients[index], joinUrl);
  }
  const eightClients = clients.slice(0, 8);
  assert.equal(eightClients.length, 8);
  const eightPopulationReadiness = await capturePopulation(eightClients, 8);
  const eightPopulationTick = await establishSharedAuthorityTick(
    eightClients,
    clients[6],
    'eight-client population authority clock',
  );
  const eightPopulation = Object.freeze({
    ...eightPopulationReadiness,
    commonAuthorityTick: eightPopulationTick.commonAuthorityTick,
    tickStimulus: eightPopulationTick.stimulus,
  });
  initialJoins.push(...clients.slice(4, 8).map(initialJoinProof));
  assert.deepEqual(initialJoins.map(({ feetPosition }) => feetPosition), expectedSpawns.map(({ feetPosition }) => feetPosition));
  assert.deepEqual(initialJoins.map(({ teamId }) => teamId), [
    'team_blue', 'team_red', 'team_blue', 'team_red',
    'team_blue', 'team_red', 'team_blue', 'team_red',
  ]);
  const eightInterpolation = await movementInterpolationProof(
    clients[6],
    clients[7],
    eightClients,
    // Move south across the continuous west spawn-pocket floor. This stays
    // clear of the north wall at z=8.5 m and the Archive sight blocker at
    // x=-28.75 m while producing a remote transform comfortably over 1 m.
    { x: -30_500, z: 4_500 },
    eightPopulation.commonAuthorityTick,
    'eight-client interpolation movement',
    350,
  );
  await first.page.screenshot({ path: path.join(screenshotDirectory, 'p515-09-eight-product-clients.png'), fullPage: true });

  const reliableKillClients = clients.slice(0, 2).filter((client) => client.wire.some(({ direction, message }) => (
    direction === 'received'
    && message.type === 'reliableEventBatch'
    && message.events.some(({ kind }) => kind === 'playerKilled')
  ))).length;
  assert.equal(reliableKillClients, 2);

  const flatResponse = await fetch(`${AUTHORITY_ORIGIN}/api/rooms/create`, {
    method: 'POST',
    headers: { Origin: FRONTEND_ORIGIN, [PROFILE_HEADER]: FLAT_COMBAT_PROFILE },
  });
  assert.equal(flatResponse.status, 201);
  const flatRoom = await flatResponse.json();
  const mismatchClient = clients[7];
  const mismatchStartSequence = wireSequence;
  await mismatchClient.page.goto(
    `${FRONTEND_ORIGIN}/online?mode=join&room=${flatRoom.roomCode}&profile=${PROFILE}`,
    { waitUntil: 'domcontentloaded' },
  );
  await mismatchClient.page.waitForFunction(
    () => document.body.dataset.onlinePreviewStatus === 'room-profile-mismatch',
    undefined,
    { timeout: 15_000 },
  );
  const mismatchCopy = await mismatchClient.page.locator('.online-preview__notice').innerText();
  assert.match(mismatchCopy, /HTTP 409/u);
  assert.equal(await mismatchClient.page.evaluate(() => globalThis.__KYX_ONLINE_PREVIEW__), undefined);
  const mismatchSocketOpens = mismatchClient.wire.filter(({ sequence, message }) => (
    sequence >= mismatchStartSequence && message.type === 'socket_open'
  ));
  const mismatchAuthoritySocketOpens = mismatchSocketOpens.filter(({ message }) => (
    message.url.startsWith(`${AUTHORITY_WEBSOCKET_ORIGIN}/api/rooms/`)
  ));
  const mismatchDevelopmentSocketOpens = mismatchSocketOpens.filter(({ message }) => (
    !message.url.startsWith(`${AUTHORITY_WEBSOCKET_ORIGIN}/api/rooms/`)
  ));
  // A Vite page navigation opens a fresh HMR socket on :5173. Fail-closed means
  // the product must not construct the room-authority socket on :8787.
  assert.deepEqual(mismatchAuthoritySocketOpens, []);
  await mismatchClient.page.screenshot({ path: path.join(screenshotDirectory, 'p515-10-profile-mismatch-fails-closed.png'), fullPage: true });

  const expectedMismatchConsoleError = 'Failed to load resource: the server responded with a status of 409 (Conflict)';
  for (const client of clients) {
    assert.deepEqual(client.pageErrors, [], `${client.clientId} page errors`);
    assert.equal(
      client.wire.filter(({ direction }) => direction === 'decode_error').length,
      0,
      `${client.clientId} wire decode errors`,
    );
    assert.deepEqual(
      client.consoleErrors,
      client === mismatchClient ? [expectedMismatchConsoleError] : [],
      `${client.clientId} console errors`,
    );
  }

  await recordRoomMetrics('capture-complete', twoPopulation.roomCode, true);
  const finalRoomMetrics = roomMetricsTimeline.at(-1);
  assert.equal(finalRoomMetrics.status, 200);
  assert.equal(finalRoomMetrics.body.metrics.transport.snapshotAcksRejected, 0);
  assert.equal(finalRoomMetrics.body.metrics.transport.snapshotAckDebtEvictions, 0);
  assert.equal(finalRoomMetrics.body.metrics.transport.reliableEventAcksRejected, 0);

  const proofCore = Object.freeze({
    schemaVersion: 1,
    phase: 'P5.15',
    capturedAt: new Date().toISOString(),
    status: 'BOUNDED_PASS',
    gateClaim: 'G3_NOT_CLAIMED_G4_NOT_CLAIMED_G5_NOT_CLAIMED',
    topology: {
      route: '/online',
      frontendOrigin: FRONTEND_ORIGIN,
      authorityOrigin: AUTHORITY_ORIGIN,
      exactProfile: PROFILE,
      productClients: 8,
      isolatedBrowserContexts: 8,
      browserLaunches: 8,
      browserProcesses: 8,
      browserProcessIds: Object.freeze([...browserProcessIds]),
      oneBrowserProcessPerProductClient: true,
      independentlyScheduledActiveBrowserClients: 8,
      browserProcessesPrelaunchedBeforeRoomCreation: 8,
      browserContextsPrecreatedBeforeRoomCreation: 8,
      productPagesPrewarmedBeforeRoomCreation: 8,
      prewarmRoute: '/online',
      prewarmStatus: 'lobby',
      browserPrewarmStartedAt,
      browserPrewarmCompletedAt,
      roomCreationRequestedAt,
      executable: chromeExecutable,
      headless: true,
      browserLaunchArguments,
      activeClientHarnessAssumption: 'Each isolated context and dedicated Chrome process models an actively played client on a separate player machine.',
      backgroundedOrSuspendedTabRobustnessClaimed: false,
      syntheticProductClient: false,
    },
    authority: {
      roomCode: twoPopulation.roomCode,
      matchId: twoPopulation.matchId,
      mapBinding: (await productSnapshot(first.page)).roomVerification.mapBinding,
      simulationIdentity: (await productSnapshot(first.page)).roomVerification.simulationIdentity,
      initialJoins,
      synchronizationContract: {
        source: 'server_owned_room_wide_reliable_event',
        eventKind: 'shotAccepted',
        rationale: 'Snapshot cadence and baselines are per connection; cross-client snapshot-tick equality is not the protocol contract.',
        snapshotReplicationStillRequired: true,
      },
    },
    populations: {
      two: twoPopulation,
      four: fourPopulation,
      eight: eightPopulation,
    },
    movementAndWorld: {
      routeId: 'alternate_ink_channel_after_press_cross_snag',
      routeCheckpoints,
      crossAim,
      crossAcceptedShotsBefore: crossShooterBefore.acceptedShotCount,
      crossAcceptedShotsAfter: crossShooterAfter.acceptedShotCount,
      crossVictimHealthBefore: crossVictimBefore.healthPoints,
      crossVictimHealthAfter: crossVictimAfter.healthPoints,
      spawnProtectionExpiryWaitMilliseconds,
      realOcclusionBlockedCrossMapDamage: true,
      driverRecoveries: movementDriverRecoveries,
      traversalCollisionWarning: movementDriverRecoveries.length > 0,
      fourInterpolation,
      eightInterpolation,
    },
    combat: {
      closeAim,
      setupContract: verifiedInkChannelCombatPair,
      bodyHitConvergence,
      bodyHitShooterPosition: bodyHitShooterSetup.localPredictedPosition,
      bodyHitVictimPosition: bodyHitVictimSetup.localPredictedPosition,
      bodyHitVerticalMarginMillimeters,
      lethalConvergence,
      damageEventObserved: true,
      bodyDamageDrive: bodyDamageDrive.pulses,
      lethalDamageDrive: lethalDamageDrive.pulses,
      death: {
        lifePhase: victimAtDeath.lifePhase,
        healthPoints: victimAtDeath.healthPoints,
        deathOrdinal: victimAtDeath.deathOrdinal,
      },
      match: deathShooter.combat.snapshot.match,
      playerKilledReliableDeliveryClientsAtEvent: reliableKillClients,
      confirmedPresentationAtDamage: presentationAtDamage,
      confirmedPresentationAtDeath: presentationAtDeath,
      teleport: {
        beforePosition: teleportBefore.localPredictedPosition,
        afterPosition: teleportAfter.localPredictedPosition,
        distanceMillimeters: teleportDistanceMillimeters,
        reliableEvent: teleportReliableEvent,
        reliableDeliveryClients: teleportReliableDeliveryClients,
        requestedAtMilliseconds: teleportRequestedAtMilliseconds,
        deliveries: teleportDeliveries,
        maximumDeliveryLatencyMilliseconds: Math.max(...teleportDeliveries.map(({ latencyMilliseconds }) => latencyMilliseconds)),
        confirmedPresentation: teleportPresentation,
      },
    },
    resume: {
      samePlayerId: resumedJoin.message.playerId === originalJoin.playerId,
      sameMatchId: afterResume.matchId === beforeResume.matchId,
      resumeTokenRotated: resumedJoin.message.resumeTokenSha256 !== originalJoin.resumeTokenSha256,
      scorePreserved: JSON.stringify(afterResume.combat.snapshot.match.teamScores) === JSON.stringify(beforeResume.combat.snapshot.match.teamScores),
      feedSequencePreserved: afterResume.combat.snapshot.match.feedSequence === beforeResume.combat.snapshot.match.feedSequence,
      originalResumeTokenSha256: originalJoin.resumeTokenSha256,
      rotatedResumeTokenSha256: resumedJoin.message.resumeTokenSha256,
      resumeSuccesses: afterResume.resumeSuccesses,
      presentationBeforeResume: beforeResume.presentation,
      presentationAfterResume: afterResume.presentation,
      noConfirmedPresentationReplay:
        afterResume.presentation.confirmedIntentCount === beforeResume.presentation.confirmedIntentCount,
      noDuplicatePresentationReplay: afterResume.presentation.duplicateAuthorityEvents === 0,
    },
    failClosed: {
      requestedProfile: PROFILE,
      actualRoomProfile: FLAT_COMBAT_PROFILE,
      httpStatus: 409,
      copy: mismatchCopy,
      productClientCreated: false,
      websocketScope: 'room_authority_only_dev_hmr_excluded',
      wireSequenceStart: mismatchStartSequence,
      websocketOpenedAfterMismatch: mismatchAuthoritySocketOpens.length > 0,
      authorityWebsocketUrlsAfterMismatch: mismatchAuthoritySocketOpens.map(({ message }) => message.url),
      developmentWebsocketUrlsAfterMismatch: mismatchDevelopmentSocketOpens.map(({ message }) => message.url),
      expectedConsoleError: expectedMismatchConsoleError,
    },
    clientDiagnostics: clients.map((client) => ({
      clientId: client.clientId,
      consoleErrors: client.consoleErrors,
      transientOptimizerErrors: client.transientOptimizerErrors,
      consoleWarnings: client.consoleWarnings,
      pageErrors: client.pageErrors,
      wireDecodeErrors: client.wire.filter(({ direction }) => direction === 'decode_error').length,
    })),
    transportDiagnostics: {
      connectionTimeline,
      roomMetricsTimeline,
      finalRoomMetrics,
    },
    knownLimits: [
      'This capture is bounded product/browser evidence, not broad playtest acceptance.',
      'This capture does not close G3, G4, or G5.',
      'Inkfall revision-2 players begin with zero shield; no synthetic shield cue is manufactured.',
      'Reliable event transport is at least once; raw retransmissions are disclosed and client dedupe is required for exactly-once logical application.',
      'Canonical press-cross traversal snag is retained in runtime-v10; this alternate route does not support G5 no-snag acceptance.',
      ...(movementDriverRecoveries.length > 0
        ? ['Alternate Ink-channel automation required bounded collision recovery; this run cannot support G5 no-snag acceptance.']
        : ['Alternate Ink-channel automation completed with zero additional collision recoveries.']),
      'Human visual approval remains separate.',
    ],
  });

  const boardPage = await first.context.newPage();
  await boardPage.setViewportSize({ width: 1_440, height: 900 });
  await boardPage.setContent(boardHtml({
    profile: PROFILE,
    mapReference: expectedBinding.mapReference,
    fixtureHash: expectedBinding.fixtureHash,
    ticks: { two: twoPopulation.commonAuthorityTick, four: fourPopulation.commonAuthorityTick, eight: eightPopulation.commonAuthorityTick },
    uniqueSpawns: new Set(initialJoins.map(({ feetPosition }) => JSON.stringify(feetPosition))).size,
    blue: eightPopulation.teamDistribution.team_blue,
    red: eightPopulation.teamDistribution.team_red,
    fourMove: fourInterpolation.movementMillimeters,
    fourPeer: fourInterpolation.peerDistanceMillimeters,
    eightMove: eightInterpolation.movementMillimeters,
    eightPeer: eightInterpolation.peerDistanceMillimeters,
    occluded: proofCore.movementAndWorld.realOcclusionBlockedCrossMapDamage,
    death: `${victimAtDeath.lifePhase} / ${victimAtDeath.healthPoints} HP`,
    score: deathShooter.combat.snapshot.match.teamScores.map(({ teamId, score }) => `${teamId} ${score}`).join(' · '),
    feedSequence: deathShooter.combat.snapshot.match.feedSequence,
    presentationCues: `${presentationAtDamage.diagnostics.lastCue} → ${presentationAtDeath.diagnostics.lastCue} → ${teleportPresentation.diagnostics.lastCue}`,
    samePlayer: proofCore.resume.samePlayerId,
    tokenRotated: proofCore.resume.resumeTokenRotated,
    statePreserved: proofCore.resume.scorePreserved && proofCore.resume.feedSequencePreserved,
    mismatchStatus: proofCore.failClosed.httpStatus,
  }), { waitUntil: 'load' });
  await boardPage.screenshot({ path: path.join(screenshotDirectory, 'p515-11-runtime-evidence-board.png'), fullPage: true });
  await boardPage.close();

  const flattenedWire = wireRecords.flat().sort((left, right) => left.sequence - right.sequence);
  const wireLogPath = path.join(output, 'p515-normalized-wire-log.jsonl');
  await fs.writeFile(wireLogPath, `${flattenedWire.map((entry) => JSON.stringify(entry)).join('\n')}\n`, 'utf8');

  const traversalWarningRelative = movementDriverRecoveries.length > 0
    ? 'p515-traversal-collision-warning.json'
    : null;
  if (traversalWarningRelative !== null) {
    await fs.writeFile(path.join(output, traversalWarningRelative), `${JSON.stringify({
      schemaVersion: 1,
      phase: 'P5.15',
      capturedAt: new Date().toISOString(),
      status: 'TRAVERSAL_COLLISION_WARNING',
      gateImpact: 'CANNOT_SUPPORT_G5_NO_SNAG_ACCEPTANCE',
      recoveryCount: movementDriverRecoveries.length,
      recoveries: movementDriverRecoveries,
    }, null, 2)}\n`, 'utf8');
  }

  const sourceSha256 = Object.fromEntries(await Promise.all(sourceFiles.map(async (relative) => [
    relative,
    await sha256(path.join(repo, relative)),
  ])));
  assert.deepEqual(sourceSha256, sourceSha256AtStart, 'source changed during capture');
  const repositoryStateAtEnd = await repositoryState();
  assert.deepEqual(
    repositoryStateAtEnd,
    repositoryStateAtStart,
    'repository HEAD or dirty-tree state changed during capture',
  );
  const proof = Object.freeze({
    ...proofCore,
    wire: {
      entries: flattenedWire.length,
      receivedSnapshots: flattenedWire.filter(({ direction, message }) => direction === 'received' && (message.type === 'fullSnapshot' || message.type === 'deltaSnapshot')).length,
      receivedReliableBatches: flattenedWire.filter(({ direction, message }) => direction === 'received' && message.type === 'reliableEventBatch').length,
      decodeErrors: flattenedWire.filter(({ direction }) => direction === 'decode_error').length,
      sha256: await sha256(wireLogPath),
    },
    sourceSha256,
    repositoryState: {
      unchangedDuringCapture: true,
      start: repositoryStateAtStart,
      end: repositoryStateAtEnd,
    },
    runtimeEnvironment,
  });
  const proofPath = path.join(output, 'p515-product-population-proof.json');
  await fs.writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');

  const screenshotNames = (await fs.readdir(screenshotDirectory)).sort();
  const artifactFiles = [
    ...screenshotNames.map((name) => `screenshots/${name}`),
    'p515-normalized-wire-log.jsonl',
    'p515-product-population-proof.json',
    ...(traversalWarningRelative === null ? [] : [traversalWarningRelative]),
  ];
  const manifest = {
    schemaVersion: 1,
    files: Object.fromEntries(await Promise.all(artifactFiles.map(async (relative) => [
      relative,
      { sha256: await sha256(path.join(output, relative)), bytes: (await fs.stat(path.join(output, relative))).size },
    ]))),
  };
  await fs.writeFile(path.join(output, 'artifact-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  process.stdout.write(`${JSON.stringify({
    output,
    roomCode: proof.authority.roomCode,
    productClients: proof.topology.productClients,
    commonAuthorityTicks: {
      two: proof.populations.two.commonAuthorityTick,
      four: proof.populations.four.commonAuthorityTick,
      eight: proof.populations.eight.commonAuthorityTick,
    },
    screenshots: screenshotNames.length,
    wireEntries: proof.wire.entries,
  }, null, 2)}\n`);
} catch (error) {
  const sourceSha256AtFailure = Object.fromEntries(await Promise.all(sourceFiles.map(async (relative) => [
    relative,
    await sha256(path.join(repo, relative)),
  ])));
  const sourceUnchanged = JSON.stringify(sourceSha256AtFailure)
    === JSON.stringify(sourceSha256AtStart);
  const repositoryStateAtFailure = await repositoryState();
  const repositoryStateUnchanged = JSON.stringify(repositoryStateAtFailure)
    === JSON.stringify(repositoryStateAtStart);
  const failureWire = wireRecords.flat().sort((left, right) => left.sequence - right.sequence);
  const failureWireRelative = 'p515-failure-normalized-wire-log.jsonl';
  const failureWirePath = path.join(output, failureWireRelative);
  await fs.writeFile(
    failureWirePath,
    failureWire.length === 0
      ? ''
      : `${failureWire.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
    'utf8',
  );
  const failureClientStates = await Promise.all(clients.map(async (client) => ({
    clientId: client.clientId,
    snapshot: await productSnapshot(client.page).catch(() => null),
    consoleErrors: client.consoleErrors,
    transientOptimizerErrors: client.transientOptimizerErrors,
    consoleWarnings: client.consoleWarnings,
    pageErrors: client.pageErrors,
  })));
  await recordRoomMetrics(
    'capture-failure',
    failureClientStates.find(({ snapshot }) => snapshot?.roomCode)?.snapshot.roomCode ?? null,
  );
  await fs.writeFile(path.join(output, 'capture-failure.json'), `${JSON.stringify({
    capturedAt: new Date().toISOString(),
    error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
    sourceFreeze: {
      status: sourceUnchanged ? 'UNCHANGED' : 'CHANGED_DURING_CAPTURE',
      files: sourceFiles.length,
      sourceSha256AtStart,
      sourceSha256AtFailure,
    },
    repositoryState: {
      unchangedDuringCapture: repositoryStateUnchanged,
      start: repositoryStateAtStart,
      failure: repositoryStateAtFailure,
    },
    runtimeEnvironment,
    wireDiagnostics: {
      file: failureWireRelative,
      entries: failureWire.length,
      sha256: await sha256(failureWirePath),
      receivedSnapshots: failureWire.filter(({ direction, message }) => (
        direction === 'received'
        && (message.type === 'fullSnapshot' || message.type === 'deltaSnapshot')
      )).length,
      sentSnapshotAcknowledgements: failureWire.filter(({ direction, message }) => (
        direction === 'sent' && message.type === 'ack'
      )).length,
      acknowledgementRejections: failureWire.filter(({ direction, message }) => (
        direction === 'received'
        && message.type === 'error'
        && message.code === 'ACK_REJECTED'
      )).length,
      socketClosures: failureWire.filter(({ direction, message }) => (
        direction === 'lifecycle' && message.type === 'socket_close'
      )).map(({ sequence, observedAt, observedAtMilliseconds, clientId }) => ({
        sequence,
        observedAt,
        observedAtMilliseconds,
        clientId,
      })),
    },
    clients: failureClientStates,
    movementDriverRecoveries,
    connectionTimeline,
    roomMetricsTimeline,
    vite: vite?.lines ?? [],
    wrangler: wrangler?.lines ?? [],
  }, null, 2)}\n`, 'utf8');
  throw error;
} finally {
  await Promise.allSettled(clients.map(({ context }) => context.close()));
  await Promise.allSettled(browsers.map((browser) => browser.close()));
  await Promise.allSettled([stopService(vite), stopService(wrangler)]);
}
