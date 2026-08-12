import { describe, expect, it } from 'vitest';

import { AuthorityEvidenceClient } from '../../../src/dev/authorityEvidenceClient';
import { createImpairedAuthorityEvidenceTransport } from '../../../src/dev/authorityEvidenceImpairment';
import {
  assertAuthoritySimulationIdentity,
  authoritySocketUrl,
  axesFromPressedKeys,
  createDevelopmentRoomCode,
  createEvidenceInputCommand,
  deepFreezeAuthorityEvidence,
  evidenceWireCommandToMovement,
  parseAuthorityEvidenceConfig,
  remoteSampleFromSnapshotEntity,
} from '../../../src/dev/authorityEvidenceModel';
import type {
  AuthorityEvidenceConnection,
  AuthorityEvidenceScheduler,
  AuthorityEvidenceTransport,
  AuthorityEvidenceTransportCallbacks,
} from '../../../src/dev/authorityEvidenceTransport';
import {
  PROTOCOL_VERSION,
  RELIABLE_EVENT_STREAM_VERSION,
  SNAPSHOT_BASELINE_VERSION,
  decodeClientMessage,
  encodeServerMessage,
  type LocalReconciliationStateV1,
  type ServerMessage,
  type SimulationIdentityV1,
  type SnapshotEntity,
} from '../../../src/net';
import {
  INTENT_BUTTON,
  PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
  type MovementSimulationState,
} from '../../../src/sim';
import {
  FakeMovementQueryPort,
  createTestMovementState,
} from '../sim/movement/fakeQueryPort';

const EXPECTED_IDENTITY: SimulationIdentityV1 = Object.freeze({
  schemaVersion: 1,
  mapId: 'phase4_flat_run',
  rulesetId: 'test_rules',
  rulesetRevision: 1,
  rulesetHash: '2222222222222222',
  movementProfileId: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.id,
  movementProfileRevision: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.revision,
  movementProfileHash: '8ab4ed437a4393c0',
  fixtureId: 'test_fixture',
  fixtureHash: '1111111111111111',
  physicsAdapterId: 'fake_query_port',
  physicsAdapterVersion: '1.0.0',
});

class FakeScheduler implements AuthorityEvidenceScheduler {
  now = 0;
  repeating: (() => void) | null = null;
  delayed: (() => void) | null = null;

  nowMilliseconds(): number {
    return this.now;
  }

  repeat(callback: () => void): unknown {
    this.repeating = callback;
    return 'repeat';
  }

  stopRepeating(): void {
    this.repeating = null;
  }

  after(callback: () => void): unknown {
    this.delayed = callback;
    return 'delay';
  }

  stopAfter(): void {
    this.delayed = null;
  }

  runTick(): void {
    this.now += 50;
    this.repeating?.();
  }

  runDelay(): void {
    const callback = this.delayed;
    this.delayed = null;
    callback?.();
  }
}

class FakeConnection implements AuthorityEvidenceConnection {
  socketState: ReturnType<AuthorityEvidenceConnection['state']> = 'connecting';
  readonly sent: string[] = [];
  lastCloseCode: number | null = null;
  lastCloseReason: string | null = null;

  constructor(readonly callbacks: AuthorityEvidenceTransportCallbacks) {}

  state(): ReturnType<AuthorityEvidenceConnection['state']> {
    return this.socketState;
  }

  send(payload: string): void {
    if (this.socketState !== 'open') throw new Error('fake socket is not open');
    this.sent.push(payload);
  }

  close(code = 1000, reason = ''): void {
    if (this.socketState === 'closed') return;
    this.lastCloseCode = code;
    this.lastCloseReason = reason;
    this.socketState = 'closed';
    this.callbacks.onClose(code, reason);
  }

  open(): void {
    this.socketState = 'open';
    this.callbacks.onOpen();
  }

  receive(message: ServerMessage): void {
    const encoded = encodeServerMessage(message);
    if (!encoded.ok) throw new Error(encoded.error.code);
    this.callbacks.onMessage(encoded.json);
  }
}

class FakeTransport implements AuthorityEvidenceTransport {
  readonly connections: FakeConnection[] = [];

  connect(_url: string, callbacks: AuthorityEvidenceTransportCallbacks): AuthorityEvidenceConnection {
    const connection = new FakeConnection(callbacks);
    this.connections.push(connection);
    return connection;
  }
}

function localWireState(state: MovementSimulationState): LocalReconciliationStateV1 {
  return structuredClone(state) as unknown as LocalReconciliationStateV1;
}

function playerEntity(state: MovementSimulationState): SnapshotEntity {
  const player = state.player;
  const signedYaw = player.yawMilliDegrees > 180_000
    ? player.yawMilliDegrees - 360_000
    : player.yawMilliDegrees;
  return {
    id: player.id,
    kind: 'player',
    xMillimeters: player.feetPosition.x,
    yMillimeters: player.feetPosition.y,
    zMillimeters: player.feetPosition.z,
    velocityXMillimetersPerSecond: player.velocity.x,
    velocityYMillimetersPerSecond: player.velocity.y,
    velocityZMillimetersPerSecond: player.velocity.z,
    yawMilliDegrees: signedYaw,
    pitchMilliDegrees: player.pitchMilliDegrees,
    healthPoints: 100,
    shieldPoints: 0,
  };
}

function welcome(connectionId: string): ServerMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: 'welcome',
    connectionId,
    serverTick: 0,
    protocolConfig: {
      protocolVersion: PROTOCOL_VERSION,
      snapshotBaselineVersion: SNAPSHOT_BASELINE_VERSION,
      reliableEventStreamVersion: RELIABLE_EVENT_STREAM_VERSION,
      simulationHz: 20,
      snapshotHz: 10,
      maxMessageBytes: 16_384,
      maxCommandsPerBatch: 32,
    },
    simulationIdentity: EXPECTED_IDENTITY,
  };
}

function joinAccepted(
  requestId: string,
  mode: 'joined' | 'resumed',
  tokenCharacter: string,
): ServerMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: 'joinAccepted',
    requestId,
    playerId: 'player.1',
    roomId: 'room.KYX-234567',
    matchId: 'match.1',
    serverTick: 0,
    connectionMode: mode,
    resumeToken: tokenCharacter.repeat(43),
    simulationIdentity: EXPECTED_IDENTITY,
  };
}

function fullSnapshot(state: MovementSimulationState): ServerMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: 'fullSnapshot',
    snapshotBaselineVersion: SNAPSHOT_BASELINE_VERSION,
    snapshotBaselineId: `baseline.${state.tick}`,
    reliableEventStreamVersion: RELIABLE_EVENT_STREAM_VERSION,
    reliableEventBaselineId: null,
    matchId: 'match.1',
    serverTick: state.tick,
    phase: 'warmup',
    phaseEndsAtTick: 40,
    simulationIdentity: EXPECTED_IDENTITY,
    localReconciliation: localWireState(state),
    entities: [playerEntity(state)],
  };
}

function stateAtTick(
  state: MovementSimulationState,
  tick: number,
): MovementSimulationState {
  return { ...structuredClone(state), tick } as unknown as MovementSimulationState;
}

function deltaSnapshot(
  state: MovementSimulationState,
  baseTick: number,
): ServerMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: 'deltaSnapshot',
    snapshotBaselineVersion: SNAPSHOT_BASELINE_VERSION,
    baseSnapshotBaselineId: `baseline.${baseTick}`,
    snapshotBaselineId: `baseline.${state.tick}`,
    matchId: 'match.1',
    baseTick,
    serverTick: state.tick,
    phase: 'warmup',
    phaseEndsAtTick: 40,
    localReconciliation: localWireState(state),
    entities: [playerEntity(state)],
    removedEntityIds: [],
  };
}

function sentMessage(connection: FakeConnection, index: number) {
  const decoded = decodeClientMessage(connection.sent[index] ?? '');
  if (!decoded.ok) throw new Error(decoded.error.code);
  return decoded.value;
}

describe('authority evidence route adapters', () => {
  it('parses create and join query contracts without silently accepting invalid scope', () => {
    expect(parseAuthorityEvidenceConfig('')).toEqual({
      authorityUrl: 'http://127.0.0.1:8787',
      mode: 'create',
      roomCode: null,
      displayName: 'G3 Evidence',
      impairmentProfile: 'nominal',
    });
    expect(parseAuthorityEvidenceConfig(
      '?mode=join&room=kyx-234567&displayName=Peer&authorityUrl=https%3A%2F%2Fauthority.example',
    )).toEqual({
      authorityUrl: 'https://authority.example',
      mode: 'join',
      roomCode: 'KYX-234567',
      displayName: 'Peer',
      impairmentProfile: 'nominal',
    });
    expect(() => parseAuthorityEvidenceConfig('?mode=join')).toThrow(/requires a room/u);
    expect(() => parseAuthorityEvidenceConfig('?mode=create&room=KYX-234567')).toThrow(
      /does not accept/u,
    );
    expect(() => parseAuthorityEvidenceConfig('?authorityUrl=javascript%3Aalert(1)')).toThrow(
      /HTTP or HTTPS origin/u,
    );
    expect(parseAuthorityEvidenceConfig('?impairment=combined-stress').impairmentProfile).toBe(
      'combined-stress',
    );
    expect(() => parseAuthorityEvidenceConfig('?impairment=custom')).toThrow(/must be one of/u);
    expect(() => parseAuthorityEvidenceConfig(
      '?impairment=nominal&impairment=loss',
    )).toThrow(/must not be repeated/u);
  });

  it('creates valid development room and socket routes from explicit entropy', () => {
    expect(createDevelopmentRoomCode([0, 1, 2, 3, 4, 5])).toBe('KYX-234567');
    expect(authoritySocketUrl('https://authority.example', 'kyx-234567')).toBe(
      'wss://authority.example/api/rooms/KYX-234567/socket',
    );
    expect(() => createDevelopmentRoomCode([0])).toThrow(/exactly six/u);
  });

  it('maps WASD and wire forward intent into the simulation Z axis', () => {
    const axes = axesFromPressedKeys(new Set(['KeyW', 'KeyD']));
    expect(axes).toEqual({ moveX: 127, moveY: 127 });
    const wire = createEvidenceInputCommand(7, 11, axes);
    const movement = evidenceWireCommandToMovement(wire);
    expect(movement).toMatchObject({ sequence: 7, clientTick: 11, moveX: 127, moveZ: 127 });
  });

  it('keeps look input zero by default and accepts bounded explicit turn deltas', () => {
    expect(createEvidenceInputCommand(1, 2, { moveX: 0, moveY: 0 })).toMatchObject({
      lookYawDeltaMilliDegrees: 0,
      lookPitchDeltaMilliDegrees: 0,
    });
    expect(createEvidenceInputCommand(2, 3, { moveX: 0, moveY: 0 }, {
      heldButtons: 0,
      pressedButtons: 0,
      releasedButtons: 0,
      selectedSlot: 0,
      lookYawDeltaMilliDegrees: 1_500,
      lookPitchDeltaMilliDegrees: -250,
    })).toMatchObject({
      lookYawDeltaMilliDegrees: 1_500,
      lookPitchDeltaMilliDegrees: -250,
    });
    expect(() => createEvidenceInputCommand(3, 4, { moveX: 0, moveY: 0 }, {
      heldButtons: 0,
      pressedButtons: 0,
      releasedButtons: 0,
      selectedSlot: 0,
      lookYawDeltaMilliDegrees: 32_768,
    })).toThrow(/look yaw delta/u);
  });

  it('fails closed on any simulation identity drift and freezes diagnostics', () => {
    expect(() => assertAuthoritySimulationIdentity(
      { ...EXPECTED_IDENTITY, rulesetHash: 'a'.repeat(64) },
      EXPECTED_IDENTITY,
      'test',
    )).toThrow(/rulesetHash/u);
    const diagnostics = deepFreezeAuthorityEvidence({ nested: { value: 1 } });
    expect(Object.isFrozen(diagnostics)).toBe(true);
    expect(Object.isFrozen(diagnostics.nested)).toBe(true);
  });

  it('projects server position and velocity through the remote interpolation sample seam', () => {
    const sample = remoteSampleFromSnapshotEntity({
      id: 'player.remote',
      kind: 'player',
      xMillimeters: 125,
      yMillimeters: 0,
      zMillimeters: -250,
      velocityXMillimetersPerSecond: 1_000,
      velocityYMillimetersPerSecond: 0,
      velocityZMillimetersPerSecond: 500,
      yawMilliDegrees: -90_000,
      pitchMilliDegrees: 0,
      healthPoints: 100,
      shieldPoints: 0,
    }, 20, 1_000, true);
    expect(sample).toMatchObject({
      entityId: 'player.remote',
      serverTick: 20,
      feetPosition: { x: 125, y: 0, z: -250 },
      velocity: { x: 1_000, y: 0, z: 500 },
      yawMilliDegrees: 270_000,
      discontinuity: 'spawn',
    });
  });
});

describe('authority evidence transport state', () => {
  it('resumes from a tab-restored credential on the first connection and persists rotation', () => {
    const transport = new FakeTransport();
    const scheduler = new FakeScheduler();
    const persisted: Array<Readonly<{
      resumeToken: string;
      matchId: string;
      playerId: string;
    }>> = [];
    let resumeRejected = 0;
    const client = new AuthorityEvidenceClient({
      config: {
        authorityUrl: 'https://authority.example.test',
        mode: 'join',
        roomCode: 'KYX-234567',
        displayName: 'Reloaded Peer',
        impairmentProfile: 'nominal',
      },
      roomCode: 'KYX-234567',
      expectedIdentity: EXPECTED_IDENTITY,
      profile: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
      queries: new FakeMovementQueryPort(),
      transport,
      scheduler,
      createRequestId: () => 'request.initial-resume',
      initialResumeCredential: {
        resumeToken: 'A'.repeat(43),
        matchId: 'match.1',
        playerId: 'player.1',
      },
      onSessionCredential: (next) => persisted.push(next),
      onResumeRejected: () => { resumeRejected += 1; },
    });

    client.start();
    expect(client.diagnostics()).toMatchObject({
      connection: { phase: 'resuming' },
      counters: { connectionAttempts: 1, resumeAttempts: 1 },
      resume: { tokenLength: 43 },
    });
    const connection = transport.connections[0]!;
    connection.open();
    connection.receive(welcome('connection.reload'));
    const resume = sentMessage(connection, 1);
    expect(resume).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      type: 'resumeRoom',
      requestId: 'request.initial-resume',
      roomCode: 'KYX-234567',
      resumeToken: 'A'.repeat(43),
    });
    connection.receive(joinAccepted(
      resume.type === 'resumeRoom' ? resume.requestId : '',
      'resumed',
      'B',
    ));
    connection.receive(fullSnapshot(stateAtTick(
      createTestMovementState({ playerId: 'player.1' }),
      10,
    )));

    expect(persisted).toEqual([{
      resumeToken: 'B'.repeat(43),
      matchId: 'match.1',
      playerId: 'player.1',
    }]);
    expect(resumeRejected).toBe(0);
    const diagnostics = client.diagnostics();
    expect(diagnostics).toMatchObject({
      connection: { phase: 'joined', connectionMode: 'resumed' },
      authority: { matchId: 'match.1', playerId: 'player.1' },
      counters: {
        resumeAttempts: 1,
        resumeSuccesses: 1,
        resumeTokenRotations: 1,
      },
      resume: { generation: 1, tokenLength: 43 },
    });
    expect(JSON.stringify(diagnostics)).not.toContain('A'.repeat(43));
    expect(JSON.stringify(diagnostics)).not.toContain('B'.repeat(43));
    client.dispose();
  });

  it('automatically resumes one unexpected joined-socket close and waits for a recovery snapshot', () => {
    const transport = new FakeTransport();
    const scheduler = new FakeScheduler();
    let requestOrdinal = 0;
    const client = new AuthorityEvidenceClient({
      config: {
        authorityUrl: 'https://authority.example.test',
        mode: 'join',
        roomCode: 'KYX-234567',
        displayName: 'Backgrounded Peer',
        impairmentProfile: 'nominal',
      },
      roomCode: 'KYX-234567',
      expectedIdentity: EXPECTED_IDENTITY,
      profile: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
      queries: new FakeMovementQueryPort(),
      transport,
      scheduler,
      enableCombatInput: true,
      createRequestId: () => `request.auto-resume.${requestOrdinal += 1}`,
    });

    client.start();
    const first = transport.connections[0]!;
    first.open();
    first.receive(welcome('connection.1'));
    const join = sentMessage(first, 1);
    expect(join.type).toBe('joinRoom');
    first.receive(joinAccepted(join.type === 'joinRoom' ? join.requestId : '', 'joined', 'A'));
    first.receive(fullSnapshot(stateAtTick(
      createTestMovementState({ playerId: 'player.1' }),
      10,
    )));
    client.setAxes({ moveX: 127, moveY: 127 });
    expect(client.setInputButtons(INTENT_BUTTON.sprint)).toBe(true);

    first.close(1012, 'service restart');
    expect(client.diagnostics()).toMatchObject({
      connection: { phase: 'resuming', lastCloseCode: 1012 },
      counters: { resumeAttempts: 1, socketCloses: 1 },
      input: { moveX: 0, moveY: 0, heldButtons: 0 },
    });

    scheduler.runDelay();
    const second = transport.connections[1]!;
    second.open();
    second.receive(welcome('connection.2'));
    const resume = sentMessage(second, 1);
    if (resume.type !== 'resumeRoom') throw new Error('expected automatic resume request');
    expect(resume).toMatchObject({
      protocolVersion: PROTOCOL_VERSION,
      type: 'resumeRoom',
      roomCode: 'KYX-234567',
      resumeToken: 'A'.repeat(43),
    });
    expect(resume.requestId).toMatch(/^request\.auto-resume\.[1-9][0-9]*$/u);
    second.receive(joinAccepted(resume.requestId, 'resumed', 'B'));
    expect(client.diagnostics().connection.phase).toBe('resuming');
    second.receive(fullSnapshot(stateAtTick(
      createTestMovementState({ playerId: 'player.1' }),
      11,
    )));

    expect(client.diagnostics()).toMatchObject({
      connection: { phase: 'joined', connectionMode: 'resumed' },
      counters: {
        resumeAttempts: 1,
        resumeSuccesses: 1,
        resumeTokenRotations: 1,
      },
      resume: { generation: 1, tokenLength: 43 },
    });
    client.dispose();
  });

  it('does not loop automatic resume when the recovery socket closes before hydration', () => {
    const transport = new FakeTransport();
    const scheduler = new FakeScheduler();
    let requestOrdinal = 0;
    const client = new AuthorityEvidenceClient({
      config: {
        authorityUrl: 'https://authority.example.test',
        mode: 'join',
        roomCode: 'KYX-234567',
        displayName: 'Bounded Recovery Peer',
        impairmentProfile: 'nominal',
      },
      roomCode: 'KYX-234567',
      expectedIdentity: EXPECTED_IDENTITY,
      profile: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
      queries: new FakeMovementQueryPort(),
      transport,
      scheduler,
      createRequestId: () => `request.bounded-resume.${requestOrdinal += 1}`,
    });

    client.start();
    const first = transport.connections[0]!;
    first.open();
    first.receive(welcome('connection.1'));
    const join = sentMessage(first, 1);
    first.receive(joinAccepted(join.type === 'joinRoom' ? join.requestId : '', 'joined', 'A'));
    first.receive(fullSnapshot(stateAtTick(
      createTestMovementState({ playerId: 'player.1' }),
      10,
    )));
    first.close(1012, 'service restart');
    scheduler.runDelay();

    const second = transport.connections[1]!;
    second.open();
    second.receive(welcome('connection.2'));
    const resume = sentMessage(second, 1);
    second.receive(joinAccepted(
      resume.type === 'resumeRoom' ? resume.requestId : '',
      'resumed',
      'B',
    ));
    second.close(1012, 'recovery failed');
    scheduler.runDelay();

    expect(transport.connections).toHaveLength(2);
    expect(client.diagnostics()).toMatchObject({
      connection: {
        phase: 'closed',
        lastCloseCode: 1012,
        lastCloseReason: 'recovery failed',
      },
      counters: { resumeAttempts: 1, socketCloses: 2 },
    });
    client.dispose();
  });

  it('keeps a joined lobby socket alive without manufacturing movement input', () => {
    const transport = new FakeTransport();
    const scheduler = new FakeScheduler();
    const initialState = stateAtTick(
      createTestMovementState({ playerId: 'player.1' }),
      10,
    );
    const client = new AuthorityEvidenceClient({
      config: {
        authorityUrl: 'http://127.0.0.1:8787',
        mode: 'join',
        roomCode: 'KYX-234567',
        displayName: 'Lobby Heartbeat Peer',
        impairmentProfile: 'nominal',
      },
      roomCode: 'KYX-234567',
      expectedIdentity: EXPECTED_IDENTITY,
      profile: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
      queries: new FakeMovementQueryPort(),
      transport,
      scheduler,
      createRequestId: () => 'request.heartbeat',
    });

    client.start();
    const connection = transport.connections[0]!;
    connection.open();
    connection.receive(welcome('connection.heartbeat'));
    const join = sentMessage(connection, 1);
    connection.receive(joinAccepted(
      join.type === 'joinRoom' ? join.requestId : '',
      'joined',
      'H',
    ));
    connection.receive({
      ...fullSnapshot(initialState),
      phase: 'lobby',
    } as ServerMessage);
    expect(client.diagnostics().local).toMatchObject({
      authoritativePlayerId: 'player.1',
      authoritativeYawMilliDegrees: initialState.player.yawMilliDegrees,
      predictedYawMilliDegrees: initialState.player.yawMilliDegrees,
    });

    for (let tick = 0; tick < 200; tick += 1) scheduler.runTick();

    const sent = connection.sent.map((_payload, index) => sentMessage(connection, index));
    expect(sent.filter((message) => message.type === 'inputBatch')).toEqual([]);
    expect(sent.filter((message) => message.type === 'ping')).toEqual([{
      protocolVersion: PROTOCOL_VERSION,
      type: 'ping',
      nonce: 0,
      clientTick: 10,
    }]);
  });

  it('keeps button input opt-in and exposes authoritative combat snapshots and events', () => {
    const transport = new FakeTransport();
    const scheduler = new FakeScheduler();
    const initialState = stateAtTick(
      createTestMovementState({ playerId: 'player.1' }),
      10,
    );
    const client = new AuthorityEvidenceClient({
      config: {
        authorityUrl: 'http://127.0.0.1:8787',
        mode: 'join',
        roomCode: 'KYX-234567',
        displayName: 'Combat Contract Peer',
        impairmentProfile: 'nominal',
      },
      roomCode: 'KYX-234567',
      expectedIdentity: EXPECTED_IDENTITY,
      profile: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
      queries: new FakeMovementQueryPort(),
      transport,
      scheduler,
      createRequestId: () => 'request.combat',
      enableCombatInput: true,
    });

    client.start();
    const connection = transport.connections[0]!;
    connection.open();
    connection.receive(welcome('connection.combat'));
    const join = sentMessage(connection, 1);
    connection.receive(joinAccepted(
      join.type === 'joinRoom' ? join.requestId : '',
      'joined',
      'C',
    ));
    connection.receive({
      ...fullSnapshot(initialState),
      combat: {
        schemaVersion: 1,
        players: [{
          playerId: 'player.1',
          connected: true,
          teamId: 'team_blue',
          lifePhase: 'alive',
          healthPoints: 100,
          shieldPoints: 0,
          deathOrdinal: 0,
          respawnEligibleAtTick: null,
          riflePhase: 'ready',
          magazineRounds: 50,
          reserveRounds: 150,
          nextShotAtTick: 10,
          reloadCompletesAtTick: null,
          acceptedShotCount: 0,
          grenadePhase: 'ready',
          grenadeCooldownEndsAtTick: 0,
          acceptedThrowCount: 0,
          activeProjectileCount: 0,
        }],
        projectiles: [],
        match: {
          phase: 'warmup',
          phaseEndsAtTick: 40,
          activeTicksRemaining: 2_400,
          teamScores: [{ teamId: 'team_blue', score: 0 }, { teamId: 'team_red', score: 0 }],
          feedSequence: 0,
          result: null,
        },
      },
    } as ServerMessage);
    expect(client.diagnostics().combat).toMatchObject({
      enabled: true,
      snapshot: { players: [{ playerId: 'player.1', magazineRounds: 50 }] },
    });

    const movementAndCombatButtons = (
      INTENT_BUTTON.jump
      | INTENT_BUTTON.sprint
      | INTENT_BUTTON.crouch
      | INTENT_BUTTON.primaryFire
      | INTENT_BUTTON.reload
    );
    expect(client.setInputButtons(movementAndCombatButtons)).toBe(true);
    expect(client.setLookDeltas(1_500)).toBe(true);
    scheduler.runTick();
    expect(sentMessage(connection, connection.sent.length - 1)).toMatchObject({
      type: 'inputBatch',
      commands: [{
        heldButtons: movementAndCombatButtons,
        pressedButtons: movementAndCombatButtons,
        releasedButtons: 0,
        selectedSlot: 0,
        lookYawDeltaMilliDegrees: 1_500,
        lookPitchDeltaMilliDegrees: 0,
      }],
    });
    client.setInputButtons(INTENT_BUTTON.primaryFire);
    scheduler.runTick();
    expect(sentMessage(connection, connection.sent.length - 1)).toMatchObject({
      type: 'inputBatch',
      commands: [{
        heldButtons: INTENT_BUTTON.primaryFire,
        pressedButtons: 0,
        releasedButtons: movementAndCombatButtons & ~INTENT_BUTTON.primaryFire,
      }],
    });
    client.setInputButtons(0);
    client.setInputButtons(INTENT_BUTTON.primaryFire);
    client.setInputButtons(0);
    scheduler.runTick();
    expect(sentMessage(connection, connection.sent.length - 1)).toMatchObject({
      type: 'inputBatch',
      commands: [{
        heldButtons: INTENT_BUTTON.primaryFire,
        pressedButtons: INTENT_BUTTON.primaryFire,
        releasedButtons: 0,
      }],
    });
    scheduler.runTick();
    expect(sentMessage(connection, connection.sent.length - 1)).toMatchObject({
      type: 'inputBatch',
      commands: [{
        heldButtons: 0,
        pressedButtons: 0,
        releasedButtons: INTENT_BUTTON.primaryFire,
      }],
    });
    connection.receive({
      protocolVersion: PROTOCOL_VERSION,
      type: 'reliableEventBatch',
      reliableEventStreamVersion: RELIABLE_EVENT_STREAM_VERSION,
      matchId: 'match.1',
      events: [{
        id: 'event.1',
        serverTick: 11,
        kind: 'shotAccepted',
        subjectId: 'combat.shot.1',
        actorId: 'player.1',
        targetId: null,
        amountHealthPoints: null,
      }],
    });
    expect(client.diagnostics().combat.recentEvents).toEqual([
      expect.objectContaining({ id: 'event.1', kind: 'shotAccepted' }),
    ]);
  });

  it('acknowledges exact delta baselines, requests one recovery full, and deduplicates reliable events', () => {
    const transport = new FakeTransport();
    const scheduler = new FakeScheduler();
    let requestSequence = 0;
    const initialState = stateAtTick(
      createTestMovementState({ playerId: 'player.1' }),
      10,
    );
    const client = new AuthorityEvidenceClient({
      config: {
        authorityUrl: 'http://127.0.0.1:8787',
        mode: 'join',
        roomCode: 'KYX-234567',
        displayName: 'Transport Contract Peer',
        impairmentProfile: 'nominal',
      },
      roomCode: 'KYX-234567',
      expectedIdentity: EXPECTED_IDENTITY,
      profile: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
      queries: new FakeMovementQueryPort(),
      transport,
      scheduler,
      createRequestId: () => `request.${requestSequence++}`,
    });

    client.start();
    const connection = transport.connections[0]!;
    connection.open();
    connection.receive(welcome('connection.transport'));
    const join = sentMessage(connection, 1);
    connection.receive(joinAccepted(
      join.type === 'joinRoom' ? join.requestId : '',
      'joined',
      'T',
    ));
    connection.receive(fullSnapshot(initialState));
    expect(sentMessage(connection, 2)).toMatchObject({
      type: 'ack',
      snapshotBaselineVersion: 1,
      reliableEventStreamVersion: 1,
      snapshotBaselineId: 'baseline.10',
      serverTick: 10,
      lastEventId: null,
    });

    connection.receive(deltaSnapshot(stateAtTick(initialState, 12), 10));
    expect(client.diagnostics()).toMatchObject({
      authority: { lastAppliedSnapshotTick: 12 },
      counters: { deltaSnapshots: 1, deltaBaselineMisses: 0 },
    });

    connection.receive(deltaSnapshot(stateAtTick(initialState, 14), 10));
    const recovery = sentMessage(connection, connection.sent.length - 1);
    expect(recovery).toMatchObject({ type: 'requestFullSnapshot', reason: 'missing_baseline' });
    const recoveryRequestId = recovery.type === 'requestFullSnapshot'
      ? recovery.requestId
      : 'unexpected';
    const sendsAfterFirstGap = connection.sent.length;
    connection.receive(deltaSnapshot(stateAtTick(initialState, 16), 10));
    expect(connection.sent).toHaveLength(sendsAfterFirstGap);
    expect(client.diagnostics()).toMatchObject({
      authority: {
        lastAppliedSnapshotTick: 12,
        pendingFullSnapshotRequestId: recoveryRequestId,
      },
      counters: { deltaSnapshots: 1, deltaBaselineMisses: 2, fullSnapshotRequests: 1 },
    });

    connection.receive({
      ...fullSnapshot(stateAtTick(initialState, 16)),
      reliableEventBaselineId: 'event.1',
      resyncRequestId: recoveryRequestId,
    } as ServerMessage);
    expect(client.diagnostics()).toMatchObject({
      authority: {
        lastAppliedSnapshotTick: 16,
        pendingFullSnapshotRequestId: null,
        lastReliableEventId: 'event.1',
      },
    });

    const reliableBatch = {
      protocolVersion: PROTOCOL_VERSION,
      type: 'reliableEventBatch',
      reliableEventStreamVersion: RELIABLE_EVENT_STREAM_VERSION,
      matchId: 'match.1',
      events: [{
        id: 'event.2',
        serverTick: 16,
        kind: 'playerJoined',
        subjectId: 'player.remote',
        actorId: null,
        targetId: null,
        amountHealthPoints: null,
      }],
    } as const satisfies ServerMessage;
    connection.receive(reliableBatch);
    connection.receive(reliableBatch);
    expect(client.diagnostics()).toMatchObject({
      authority: { lastReliableEventId: 'event.2', seenReliableEventIds: 1 },
      counters: {
        reliableEvents: 1,
        reliableEventDuplicates: 1,
        reliableEventAcksSent: 5,
      },
    });
    expect(sentMessage(connection, connection.sent.length - 1)).toMatchObject({
      type: 'ack',
      serverTick: 16,
      lastEventId: 'event.2',
    });

    connection.receive({
      ...fullSnapshot(stateAtTick(initialState, 17)),
      reliableEventBaselineId: 'event.1',
    } as ServerMessage);
    expect(client.diagnostics().authority).toMatchObject({
      lastAppliedSnapshotTick: 17,
      lastReliableEventId: 'event.2',
      lastReliableEventSequence: 2,
      lastFullSnapshotReliableEventBaselineSequence: 1,
    });
    expect(sentMessage(connection, connection.sent.length - 1)).toMatchObject({
      type: 'ack',
      serverTick: 17,
      lastEventId: 'event.2',
    });

    connection.receive({
      ...reliableBatch,
      events: [{
        ...reliableBatch.events[0],
        id: 'event.4',
        kind: 'playerLeft',
      }],
    });
    const historyRecovery = sentMessage(connection, connection.sent.length - 2);
    expect(historyRecovery).toMatchObject({
      type: 'requestFullSnapshot',
      reason: 'history_gap',
    });
    expect(client.diagnostics()).toMatchObject({
      authority: { lastReliableEventSequence: 2 },
      counters: {
        reliableEvents: 1,
        reliableEventHistoryGaps: 1,
        fullSnapshotRequests: 2,
      },
    });
    const historyRecoveryRequestId = historyRecovery.type === 'requestFullSnapshot'
      ? historyRecovery.requestId
      : 'unexpected';
    connection.receive({
      ...fullSnapshot(stateAtTick(initialState, 18)),
      reliableEventBaselineId: 'event.4',
      resyncRequestId: historyRecoveryRequestId,
    } as ServerMessage);
    expect(client.diagnostics().authority).toMatchObject({
      lastAppliedSnapshotTick: 18,
      lastReliableEventId: 'event.4',
      lastReliableEventSequence: 4,
      pendingFullSnapshotRequestId: null,
    });

    connection.receive({
      ...fullSnapshot(stateAtTick(initialState, 20)),
      reliableEventBaselineId: 'event.20',
    } as ServerMessage);
    connection.receive({
      protocolVersion: PROTOCOL_VERSION,
      type: 'reliableEventBatch',
      reliableEventStreamVersion: RELIABLE_EVENT_STREAM_VERSION,
      matchId: 'match.1',
      events: [
        {
          id: 'event.21',
          serverTick: 21,
          kind: 'shotAccepted',
          subjectId: 'player.local',
          actorId: 'player.local',
          targetId: null,
          amountHealthPoints: null,
        },
        {
          id: 'event.22',
          serverTick: 21,
          kind: 'damageApplied',
          subjectId: 'player.remote',
          actorId: 'player.local',
          targetId: 'player.remote',
          amountHealthPoints: 20,
        },
      ],
    });
    expect(client.diagnostics().authority).toMatchObject({
      lastReliableEventId: 'event.22',
      lastReliableEventSequence: 22,
    });

    connection.receive({
      ...fullSnapshot(stateAtTick(initialState, 22)),
      reliableEventBaselineId: 'event.20',
    } as ServerMessage);
    expect(client.diagnostics().authority).toMatchObject({
      lastAppliedSnapshotTick: 22,
      lastReliableEventId: 'event.22',
      lastReliableEventSequence: 22,
      lastFullSnapshotReliableEventBaselineSequence: 20,
    });
    expect(sentMessage(connection, connection.sent.length - 1)).toMatchObject({
      type: 'ack',
      serverTick: 22,
      lastEventId: 'event.22',
    });

    const event23 = {
      protocolVersion: PROTOCOL_VERSION,
      type: 'reliableEventBatch',
      reliableEventStreamVersion: RELIABLE_EVENT_STREAM_VERSION,
      matchId: 'match.1',
      events: [{
        id: 'event.23',
        serverTick: 23,
        kind: 'shotAccepted',
        subjectId: 'player.local',
        actorId: 'player.local',
        targetId: null,
        amountHealthPoints: null,
      }],
    } as const satisfies ServerMessage;
    connection.receive(event23);
    connection.receive(event23);
    expect(client.diagnostics()).toMatchObject({
      authority: {
        lastReliableEventId: 'event.23',
        lastReliableEventSequence: 23,
      },
    });
    expect(client.diagnostics().combat.recentEvents.filter(({ id }) => id === 'event.23')).toHaveLength(1);
    expect(sentMessage(connection, connection.sent.length - 1)).toMatchObject({
      type: 'ack',
      lastEventId: 'event.23',
    });
    client.dispose();
  });

  it('preserves monotonic input sequences across a history-gap full snapshot and in-flight ack', () => {
    const transport = new FakeTransport();
    const scheduler = new FakeScheduler();
    const initialState = stateAtTick(
      createTestMovementState({ playerId: 'player.1' }),
      10,
    );
    const client = new AuthorityEvidenceClient({
      config: {
        authorityUrl: 'http://127.0.0.1:8787',
        mode: 'join',
        roomCode: 'KYX-234567',
        displayName: 'History Gap Peer',
        impairmentProfile: 'nominal',
      },
      roomCode: 'KYX-234567',
      expectedIdentity: EXPECTED_IDENTITY,
      profile: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
      queries: new FakeMovementQueryPort(),
      transport,
      scheduler,
      createRequestId: () => 'request.history-gap',
      enableCombatInput: true,
    });

    client.start();
    const connection = transport.connections[0]!;
    connection.open();
    connection.receive(welcome('connection.history-gap'));
    const join = sentMessage(connection, 1);
    connection.receive(joinAccepted(
      join.type === 'joinRoom' ? join.requestId : '',
      'joined',
      'H',
    ));
    connection.receive(fullSnapshot(initialState));

    expect(client.setCombatButtons(INTENT_BUTTON.reload)).toBe(true);
    // Overflow the 256-command replay window while the authority snapshot is
    // delayed. Sequence 256 is generated but the authority still reports -1.
    for (let index = 0; index < 257; index += 1) scheduler.runTick();
    expect(sentMessage(connection, connection.sent.length - 1)).toMatchObject({
      type: 'inputBatch',
      commands: [{
        sequence: 256,
        heldButtons: INTENT_BUTTON.reload,
        pressedButtons: 0,
        releasedButtons: 0,
      }],
    });

    connection.receive(fullSnapshot(stateAtTick(initialState, 12)));
    expect(client.diagnostics()).toMatchObject({
      connection: { phase: 'joined' },
      input: { nextSequence: 257 },
      local: { lastReconciliationMode: 'history_gap_snap' },
    });

    // This ACK is valid for an already-generated command even though it arrives
    // after the fallback full snapshot that rebuilt prediction history.
    connection.receive({
      protocolVersion: PROTOCOL_VERSION,
      type: 'inputAck',
      serverTick: 13,
      lastProcessedInputSequence: 128,
    });
    expect(client.diagnostics()).toMatchObject({
      connection: { phase: 'joined' },
      input: { nextSequence: 257, lastAcknowledgedSequence: 128 },
    });

    scheduler.runTick();
    expect(sentMessage(connection, connection.sent.length - 1)).toMatchObject({
      type: 'inputBatch',
      commands: [{
        sequence: 257,
        heldButtons: INTENT_BUTTON.reload,
        pressedButtons: 0,
        releasedButtons: 0,
      }],
    });

    client.setCombatButtons(0);
    scheduler.runTick();
    expect(sentMessage(connection, connection.sent.length - 1)).toMatchObject({
      type: 'inputBatch',
      commands: [{
        sequence: 258,
        heldButtons: 0,
        pressedButtons: 0,
        releasedButtons: INTENT_BUTTON.reload,
      }],
    });
    client.setCombatButtons(INTENT_BUTTON.reload);
    scheduler.runTick();
    expect(sentMessage(connection, connection.sent.length - 1)).toMatchObject({
      type: 'inputBatch',
      commands: [{
        sequence: 259,
        heldButtons: INTENT_BUTTON.reload,
        pressedButtons: INTENT_BUTTON.reload,
        releasedButtons: 0,
      }],
    });
  });

  it('handshakes, generates predicted input, and rotates a resume token without exposing it', () => {
    const rawTransport = new FakeTransport();
    const scheduler = new FakeScheduler();
    const transport = createImpairedAuthorityEvidenceTransport({
      baseTransport: rawTransport,
      scheduler,
      policy: 'nominal',
    });
    let requestSequence = 0;
    const state = createTestMovementState({ playerId: 'player.1' });
    const client = new AuthorityEvidenceClient({
      config: {
        authorityUrl: 'http://127.0.0.1:8787',
        mode: 'join',
        roomCode: 'KYX-234567',
        displayName: 'Test Peer',
        impairmentProfile: 'nominal',
      },
      roomCode: 'KYX-234567',
      expectedIdentity: EXPECTED_IDENTITY,
      profile: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
      queries: new FakeMovementQueryPort(),
      transport,
      scheduler,
      createRequestId: () => `request.${requestSequence++}`,
      enableCombatInput: true,
    });

    client.start();
    const first = rawTransport.connections[0]!;
    first.open();
    expect(sentMessage(first, 0).type).toBe('hello');
    first.receive(welcome('connection.1'));
    const join = sentMessage(first, 1);
    expect(join.type).toBe('joinRoom');
    first.receive(joinAccepted(join.type === 'joinRoom' ? join.requestId : '', 'joined', 'A'));
    first.receive({
      ...fullSnapshot(state),
      reliableEventBaselineId: 'event.20',
    } as ServerMessage);
    first.receive({
      protocolVersion: PROTOCOL_VERSION,
      type: 'reliableEventBatch',
      reliableEventStreamVersion: RELIABLE_EVENT_STREAM_VERSION,
      matchId: 'match.1',
      events: [
        {
          id: 'event.21',
          serverTick: state.tick,
          kind: 'shotAccepted',
          subjectId: 'player.local',
          actorId: 'player.local',
          targetId: null,
          amountHealthPoints: null,
        },
        {
          id: 'event.22',
          serverTick: state.tick,
          kind: 'damageApplied',
          subjectId: 'player.remote',
          actorId: 'player.local',
          targetId: 'player.remote',
          amountHealthPoints: 20,
        },
      ],
    });
    expect(client.diagnostics().authority.lastReliableEventId).toBe('event.22');
    expect(client.diagnostics().connection.phase).toBe('joined');

    const loadoutRequestId = 'loadout.warmup-race';
    expect(client.requestLoadout({
      protocolVersion: PROTOCOL_VERSION,
      type: 'loadoutRequest',
      requestId: loadoutRequestId,
      primaryWeaponId: 'weapon.primary',
      secondaryWeaponId: null,
      meleeWeaponId: 'weapon.melee',
      damageAbilityIds: ['ability.one', 'ability.two', 'ability.three'],
      utilityAbilityId: 'ability.utility',
    })).toBe(true);
    first.receive({
      protocolVersion: PROTOCOL_VERSION,
      type: 'error',
      code: 'LOADOUT_REJECTED',
      detail: 'loadout_locked',
      requestId: loadoutRequestId,
    });
    expect(client.diagnostics()).toMatchObject({
      connection: { phase: 'joined' },
      authority: { matchPhase: 'warmup' },
      lastNotice: 'LOADOUT_LOCKED: using the authoritative in-match loadout until the next selection window',
      counters: { applicationErrors: 0 },
    });
    first.receive({
      protocolVersion: PROTOCOL_VERSION,
      type: 'matchState',
      matchId: 'match.1',
      serverTick: state.tick,
      phase: 'active',
      phaseEndsAtTick: 400,
      simulationIdentity: EXPECTED_IDENTITY,
    });
    expect(client.diagnostics().authority.matchPhase).toBe('active');
    expect(client.requestLoadout({
      protocolVersion: PROTOCOL_VERSION,
      type: 'loadoutRequest',
      requestId: 'loadout.active',
      primaryWeaponId: 'weapon.primary',
      secondaryWeaponId: null,
      meleeWeaponId: 'weapon.melee',
      damageAbilityIds: ['ability.one', 'ability.two', 'ability.three'],
      utilityAbilityId: 'ability.utility',
    })).toBe(false);

    const heldBeforeResume = (
      INTENT_BUTTON.jump
      | INTENT_BUTTON.sprint
      | INTENT_BUTTON.crouch
    );
    client.setAxes({ moveX: 0, moveY: 127 });
    expect(client.setInputButtons(heldBeforeResume)).toBe(true);
    scheduler.runTick();
    expect(sentMessage(first, first.sent.length - 1)).toMatchObject({
      type: 'inputBatch',
      commands: [{
        sequence: 0,
        moveY: 127,
        heldButtons: heldBeforeResume,
        pressedButtons: heldBeforeResume,
        releasedButtons: 0,
      }],
    });
    expect(client.diagnostics().counters.commandsGenerated).toBe(1);
    first.receive({
      protocolVersion: PROTOCOL_VERSION,
      type: 'error',
      code: 'INPUT_REJECTED',
      detail: '0:duplicate_sequence',
      requestId: null,
    });
    first.receive({
      protocolVersion: PROTOCOL_VERSION,
      type: 'error',
      code: 'INPUT_REJECTED',
      detail: '0:stale_sequence',
      requestId: null,
    });
    const rejectionDiagnostics = client.diagnostics();
    expect(rejectionDiagnostics.connection.phase).toBe('joined');
    expect(rejectionDiagnostics.input.authorityInputRejections).toEqual({
      messages: 2,
      rejectedCommands: 2,
      duplicateSequence: 1,
      staleSequence: 1,
      clientTickTooOld: 0,
      lastCategory: 'stale_sequence',
    });
    expect(rejectionDiagnostics.counters).toMatchObject({
      recoverableInputRejectionMessages: 2,
      recoverableInputRejectedCommands: 2,
    });
    expect(rejectionDiagnostics.lastNotice).toMatch(/authority ignored 1 duplicate or stale/u);
    expect(JSON.stringify(rejectionDiagnostics)).not.toContain('0:duplicate_sequence');
    expect(client.canResume()).toBe(true);
    first.receive(fullSnapshot(state));
    expect(client.diagnostics().authority.lastReliableEventId).toBe('event.22');
    expect(sentMessage(first, first.sent.length - 1)).toMatchObject({
      type: 'ack',
      lastEventId: 'event.22',
    });
    const correctionBounds = client.diagnostics().local.correctionBounds;
    expect(correctionBounds.sampleCount).toBe(1);
    expect(correctionBounds.maximumPositionErrorMillimeters).not.toBeNull();
    expect(Object.values(correctionBounds.histogram).reduce((sum, count) => sum + count, 0)).toBe(1);

    expect(client.requestResume()).toBe(true);
    expect(client.diagnostics().input).toMatchObject({
      moveX: 0,
      moveY: 0,
      heldButtons: 0,
      nextSequence: 1,
    });
    scheduler.runDelay();
    const second = rawTransport.connections[1]!;
    second.open();
    second.receive(welcome('connection.2'));
    const resume = sentMessage(second, 1);
    expect(resume.type).toBe('resumeRoom');
    first.socketState = 'closed';
    second.receive(joinAccepted(
      resume.type === 'resumeRoom' ? resume.requestId : '',
      'resumed',
      'B',
    ));
    second.receive({
      ...fullSnapshot(state),
      reliableEventBaselineId: 'event.20',
    } as ServerMessage);
    expect(client.diagnostics().authority.lastReliableEventId).toBe('event.22');
    expect(sentMessage(second, second.sent.length - 1)).toMatchObject({
      type: 'ack',
      lastEventId: 'event.22',
    });
    scheduler.runTick();
    expect(sentMessage(second, second.sent.length - 1)).toMatchObject({
      type: 'inputBatch',
      commands: [{
        sequence: 1,
        moveX: 0,
        moveY: 0,
        heldButtons: 0,
        pressedButtons: 0,
        releasedButtons: heldBeforeResume,
      }],
    });
    second.receive({
      protocolVersion: PROTOCOL_VERSION,
      type: 'reliableEventBatch',
      reliableEventStreamVersion: RELIABLE_EVENT_STREAM_VERSION,
      matchId: 'match.1',
      events: [{
        id: 'event.23',
        serverTick: state.tick,
        kind: 'shotAccepted',
        subjectId: 'player.local',
        actorId: 'player.local',
        targetId: null,
        amountHealthPoints: null,
      }],
    });
    expect(client.diagnostics().combat.recentEvents.filter(({ id }) => id === 'event.23')).toHaveLength(1);

    const diagnostics = client.diagnostics();
    expect(diagnostics.connection).toMatchObject({ phase: 'joined', connectionMode: 'resumed' });
    expect(diagnostics.resume).toMatchObject({ tokenLength: 43, generation: 1 });
    expect(diagnostics.counters).toMatchObject({
      resumeAttempts: 1,
      resumeSuccesses: 1,
      resumeTokenRotations: 1,
      resumePredictionResets: 1,
    });
    expect(diagnostics.impairment).toMatchObject({
      profile: 'nominal',
      connectionsCreated: 2,
      activeConnectionOrdinal: 2,
      sessions: [
        { connectionOrdinal: 1, socketState: 'closed' },
        { connectionOrdinal: 2, socketState: 'open' },
      ],
    });
    expect(JSON.stringify(diagnostics)).not.toContain('A'.repeat(43));
    expect(JSON.stringify(diagnostics)).not.toContain('B'.repeat(43));
    expect(Object.isFrozen(diagnostics)).toBe(true);
    client.dispose();
  });

  it('rebases a background-stale client tick and waits for fresh authority reconciliation', () => {
    const transport = new FakeTransport();
    const scheduler = new FakeScheduler();
    const state = createTestMovementState({ playerId: 'player.1' });
    let requestSequence = 0;
    const client = new AuthorityEvidenceClient({
      config: {
        authorityUrl: 'http://127.0.0.1:8787',
        mode: 'join',
        roomCode: 'KYX-234567',
        displayName: 'Background Recovery Peer',
        impairmentProfile: 'nominal',
      },
      roomCode: 'KYX-234567',
      expectedIdentity: EXPECTED_IDENTITY,
      profile: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
      queries: new FakeMovementQueryPort(),
      transport,
      scheduler,
      createRequestId: () => `request.${requestSequence++}`,
    });
    client.start();
    const connection = transport.connections[0]!;
    connection.open();
    connection.receive(welcome('connection.background-recovery'));
    const join = sentMessage(connection, 1);
    connection.receive(joinAccepted(
      join.type === 'joinRoom' ? join.requestId : '',
      'joined',
      'R',
    ));
    connection.receive(fullSnapshot(state));

    scheduler.runTick();
    expect(sentMessage(connection, connection.sent.length - 1)).toMatchObject({
      type: 'inputBatch',
      commands: [{ sequence: 0, clientTick: 0 }],
    });

    // Simulate a throttled background tab: wall time and the authority advance,
    // but the browser's fixed input callback does not run for 25 seconds.
    scheduler.now += 25_000;
    scheduler.runTick();
    expect(sentMessage(connection, connection.sent.length - 1)).toMatchObject({
      type: 'inputBatch',
      commands: [{ sequence: 1, clientTick: 1 }],
    });
    connection.receive({
      protocolVersion: PROTOCOL_VERSION,
      type: 'error',
      code: 'INPUT_REJECTED',
      detail: '1:client_tick_too_old',
      requestId: null,
    });

    expect(client.diagnostics()).toMatchObject({
      connection: { phase: 'joined' },
      input: {
        moveX: 0,
        moveY: 0,
        heldButtons: 0,
        nextSequence: 2,
        nextClientTick: 502,
        authorityInputRejections: {
          messages: 1,
          rejectedCommands: 1,
          duplicateSequence: 0,
          staleSequence: 0,
          clientTickTooOld: 1,
          lastCategory: 'client_tick_too_old',
        },
      },
      lastNotice: 'INPUT_REJECTED: rebased after 1 background-stale input command',
      counters: { applicationErrors: 0 },
    });

    const batchesBeforeReconciliation = connection.sent
      .map((_, index) => sentMessage(connection, index))
      .filter(({ type }) => type === 'inputBatch').length;
    scheduler.runTick();
    expect(connection.sent
      .map((_, index) => sentMessage(connection, index))
      .filter(({ type }) => type === 'inputBatch')).toHaveLength(batchesBeforeReconciliation);

    connection.receive(fullSnapshot(stateAtTick(state, 500)));
    scheduler.runTick();
    expect(sentMessage(connection, connection.sent.length - 1)).toMatchObject({
      type: 'inputBatch',
      commands: [{ sequence: 2, clientTick: 502 }],
    });
    expect(client.diagnostics().connection.phase).toBe('joined');
    client.dispose();
  });

  it('fails closed on unexpected, malformed, or out-of-stream authority errors', () => {
    const unexpectedErrors: readonly ServerMessage[] = [
      {
        protocolVersion: PROTOCOL_VERSION,
        type: 'error',
        code: 'INPUT_REJECTED',
        detail: '0:queue_full',
        requestId: null,
      },
      {
        protocolVersion: PROTOCOL_VERSION,
        type: 'error',
        code: 'INPUT_REJECTED',
        detail: '1:duplicate_sequence',
        requestId: null,
      },
      {
        protocolVersion: PROTOCOL_VERSION,
        type: 'error',
        code: 'INPUT_CONNECTION_INVALID',
        detail: null,
        requestId: null,
      },
      {
        protocolVersion: PROTOCOL_VERSION,
        type: 'error',
        code: 'LOADOUT_REJECTED',
        detail: 'loadout_locked',
        requestId: 'loadout.not-pending',
      },
    ];

    for (const authorityError of unexpectedErrors) {
      const transport = new FakeTransport();
      const scheduler = new FakeScheduler();
      let requestSequence = 0;
      const state = createTestMovementState({ playerId: 'player.1' });
      const client = new AuthorityEvidenceClient({
        config: {
          authorityUrl: 'http://127.0.0.1:8787',
          mode: 'join',
          roomCode: 'KYX-234567',
          displayName: 'Strict Error Peer',
          impairmentProfile: 'nominal',
        },
        roomCode: 'KYX-234567',
        expectedIdentity: EXPECTED_IDENTITY,
        profile: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
        queries: new FakeMovementQueryPort(),
        transport,
        scheduler,
        createRequestId: () => `request.${requestSequence++}`,
      });
      client.start();
      const connection = transport.connections[0]!;
      connection.open();
      connection.receive(welcome('connection.strict'));
      const join = sentMessage(connection, 1);
      connection.receive(joinAccepted(
        join.type === 'joinRoom' ? join.requestId : '',
        'joined',
        'S',
      ));
      connection.receive(fullSnapshot(state));
      scheduler.runTick();

      connection.receive(authorityError);

      expect(client.diagnostics()).toMatchObject({
        connection: { phase: 'failed' },
        counters: {
          applicationErrors: 1,
          recoverableInputRejectionMessages: 0,
          recoverableInputRejectedCommands: 0,
        },
      });
      expect(connection.lastCloseCode).toBe(4008);
      expect(connection.lastCloseReason).toBe('development evidence failed closed');
      client.dispose();
    }
  });
});
