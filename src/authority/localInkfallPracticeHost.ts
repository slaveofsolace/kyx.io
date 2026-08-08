import {
  PROTOCOL_VERSION,
  validateClientMessage,
  type InputBatchMessage,
  type InputCommand,
  type ReliableEvent,
} from '../net';
import { createRapierMovementWorld, type RapierMovementWorld } from '../physics';
import {
  INTENT_BUTTON,
  PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
} from '../sim';
import {
  RELAY_AUTHORITY_FIXTURE,
  RELAY_AUTHORITY_IDENTITY,
  createRelayAuthorityCombatOptions,
  relayAuthoritySpawn,
} from './relayAuthority';
import {
  AuthoritativeRoom,
  G4_COMBAT_RULESET_HASH,
  G4_COMBAT_RULESET_ID,
  G4_COMBAT_RULESET_REVISION,
  type AuthorityFullSnapshot,
  type AuthorityRoomTickResult,
} from './room';
import { reliableCombatEvents } from './combatEvents';
import {
  createRelayPortalAuthorityPort,
} from './portal/relayPortalAuthority';

export const LOCAL_RELAY_PRACTICE_HOST_ID =
  'local_relay_practice_authority_v1' as const;
export const LOCAL_INKFALL_PRACTICE_HOST_ID = LOCAL_RELAY_PRACTICE_HOST_ID;
export const LOCAL_INKFALL_PRACTICE_TICK_RATE_HZ = 20 as const;
export const LOCAL_INKFALL_PRACTICE_TICK_MILLISECONDS = 50 as const;
export const LOCAL_INKFALL_PRACTICE_PLAYER_ID = 'practice.local.player' as const;

export interface LocalInkfallPracticeHostOptions {
  readonly botCount?: number;
  readonly roomId?: string;
  readonly matchId?: string;
}

export type LocalInkfallPracticeInput = Readonly<Omit<
  InputCommand,
  'type' | 'sequence' | 'clientTick'
>>;

export interface LocalInkfallPracticeStep {
  readonly tick: AuthorityRoomTickResult;
  readonly snapshot: AuthorityFullSnapshot;
  readonly reliableEvents: readonly ReliableEvent[];
}

const NEUTRAL_INPUT = Object.freeze({
  moveX: 0,
  moveY: 0,
  lookYawDeltaMilliDegrees: 0,
  lookPitchDeltaMilliDegrees: 0,
  heldButtons: 0,
  pressedButtons: 0,
  releasedButtons: 0,
  selectedSlot: 0,
} as const satisfies LocalInkfallPracticeInput);

function boundedBotCount(value: number | undefined): number {
  const count = value ?? 7;
  if (!Number.isSafeInteger(count) || count < 1 || count > 7) {
    throw new RangeError('Local Relay Practice bot count must be an integer from 1 through 7');
  }
  return count;
}

function normalizeYawDelta(value: number): number {
  let normalized = value % 360_000;
  if (normalized > 180_000) normalized -= 360_000;
  if (normalized < -180_000) normalized += 360_000;
  return normalized;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function botInput(
  snapshot: AuthorityFullSnapshot,
  playerId: string,
  previousHeldButtons: number,
): LocalInkfallPracticeInput {
  const player = snapshot.players.find((candidate) => candidate.playerId === playerId);
  if (player === undefined || player.combat?.life.phase !== 'alive') return NEUTRAL_INPUT;
  const teamId = player.combat.life.teamId;
  const position = player.movement.player.feetPosition;
  const targets = snapshot.players.filter((candidate) => (
    candidate.playerId !== playerId
    && candidate.combat?.life.phase === 'alive'
    && candidate.combat.life.teamId !== teamId
  ));
  const target = targets.reduce<(typeof targets)[number] | null>((nearest, candidate) => {
    if (nearest === null) return candidate;
    const candidateDx = candidate.movement.player.feetPosition.x - position.x;
    const candidateDz = candidate.movement.player.feetPosition.z - position.z;
    const nearestDx = nearest.movement.player.feetPosition.x - position.x;
    const nearestDz = nearest.movement.player.feetPosition.z - position.z;
    return candidateDx * candidateDx + candidateDz * candidateDz
      < nearestDx * nearestDx + nearestDz * nearestDz
      ? candidate
      : nearest;
  }, null);
  if (target === null) return NEUTRAL_INPUT;

  const dx = target.movement.player.feetPosition.x - position.x;
  const dz = target.movement.player.feetPosition.z - position.z;
  const distance = Math.hypot(dx, dz);
  const desiredYaw = Math.round(Math.atan2(dx, dz) * 180_000 / Math.PI);
  const yawDelta = clamp(
    normalizeYawDelta(desiredYaw - player.movement.player.yawMilliDegrees),
    -12_000,
    12_000,
  );
  const facingTarget = Math.abs(normalizeYawDelta(
    desiredYaw - player.movement.player.yawMilliDegrees,
  )) < 18_000;
  const fire = facingTarget && distance < 32_000 && snapshot.serverTick % 3 !== 0;
  const jump = snapshot.serverTick % (82 + playerId.length) === 0;
  const heldButtons = INTENT_BUTTON.sprint
    | (fire ? INTENT_BUTTON.primaryFire : 0)
    | (jump ? INTENT_BUTTON.jump : 0);

  return Object.freeze({
    moveX: snapshot.serverTick % 160 < 80 ? 24 : -24,
    moveY: distance > 5_000 ? 96 : -32,
    lookYawDeltaMilliDegrees: yawDelta,
    lookPitchDeltaMilliDegrees: 0,
    heldButtons,
    pressedButtons: heldButtons & ~previousHeldButtons,
    releasedButtons: previousHeldButtons & ~heldButtons,
    selectedSlot: 0,
  });
}

/**
 * Browser-local adapter around the same room, collision, combat, spawn, and
 * portal contracts used by the Cloudflare Worker. Presentation code owns the
 * wall-clock accumulator; this host advances only in exact 50 ms authority
 * steps and never grants client frames authority.
 */
export class LocalInkfallPracticeHost {
  readonly hostId = LOCAL_RELAY_PRACTICE_HOST_ID;
  readonly authority: AuthoritativeRoom;
  readonly world: RapierMovementWorld;
  readonly localPlayerId = LOCAL_INKFALL_PRACTICE_PLAYER_ID;
  readonly botPlayerIds: readonly string[];

  private readonly connectionIds = new Map<string, string>();
  private readonly inputSequences = new Map<string, number>();
  private readonly heldButtons = new Map<string, number>();
  private nextReliableEventSequence = 0;
  private disposed = false;

  private constructor(
    world: RapierMovementWorld,
    authority: AuthoritativeRoom,
    botPlayerIds: readonly string[],
  ) {
    this.world = world;
    this.authority = authority;
    this.botPlayerIds = Object.freeze([...botPlayerIds]);
    for (const playerId of [this.localPlayerId, ...this.botPlayerIds]) {
      this.connectionIds.set(playerId, `connection.${playerId}`);
      this.inputSequences.set(playerId, 0);
      this.heldButtons.set(playerId, 0);
    }
  }

  static async create(
    options: LocalInkfallPracticeHostOptions = {},
  ): Promise<LocalInkfallPracticeHost> {
    const botCount = boundedBotCount(options.botCount);
    const fixture = RELAY_AUTHORITY_FIXTURE;
    const world = await createRapierMovementWorld(fixture);
    if (
      world.fixture.id !== RELAY_AUTHORITY_IDENTITY.fixtureId
      || world.fixture.revision !== RELAY_AUTHORITY_IDENTITY.mapRevision
      || world.fixtureHash !== RELAY_AUTHORITY_IDENTITY.fixtureHash
      || world.fixture.solids.length
        !== RELAY_AUTHORITY_IDENTITY.colliderCardinality
    ) {
      world.dispose();
      throw new Error('LOCAL_RELAY_PRACTICE_WORLD_IDENTITY_MISMATCH');
    }

    const botPlayerIds = Object.freeze(Array.from(
      { length: botCount },
      (_, index) => `practice.bot.${String(index + 1).padStart(2, '0')}`,
    ));
    const authority = new AuthoritativeRoom({
      identity: {
        roomId: options.roomId ?? 'room.local.relay.practice',
        matchId: options.matchId ?? 'match.local.relay.practice',
        rulesetId: G4_COMBAT_RULESET_ID,
        rulesetRevision: G4_COMBAT_RULESET_REVISION,
        rulesetHash: G4_COMBAT_RULESET_HASH,
        mapId: RELAY_AUTHORITY_IDENTITY.mapId,
        fixtureId: world.fixture.id,
        fixtureHash: world.fixtureHash,
        physicsAdapterId: 'rapier3d_deterministic_compat',
        physicsAdapterVersion: '0.19.3',
      },
      profile: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
      queries: world,
      maximumPlayers: 8,
      minimumConnectedPlayersToStart: 1,
      spawnResolver: (_playerId, ordinal) => (
        relayAuthoritySpawn(ordinal)
      ),
      combat: createRelayAuthorityCombatOptions(world),
      worldPortal: createRelayPortalAuthorityPort(world),
    });
    const host = new LocalInkfallPracticeHost(world, authority, botPlayerIds);
    try {
      for (const playerId of [host.localPlayerId, ...host.botPlayerIds]) {
        const joined = authority.joinNewPlayer({
          playerId,
          connectionId: host.requireConnectionId(playerId),
        });
        if (!joined.ok) throw new Error(`LOCAL_INKFALL_PRACTICE_JOIN_FAILED:${joined.reason}`);
      }
      if (!authority.startMatch()) {
        throw new Error('LOCAL_INKFALL_PRACTICE_MATCH_START_FAILED');
      }
      return host;
    } catch (error) {
      host.dispose();
      throw error;
    }
  }

  get snapshot(): AuthorityFullSnapshot {
    this.assertActive();
    return this.authority.fullSnapshot();
  }

  step(localInput: LocalInkfallPracticeInput = NEUTRAL_INPUT): LocalInkfallPracticeStep {
    this.assertActive();
    const before = this.authority.fullSnapshot();
    this.enqueue(this.localPlayerId, localInput);
    for (const playerId of this.botPlayerIds) {
      this.enqueue(playerId, botInput(
        before,
        playerId,
        this.heldButtons.get(playerId) ?? 0,
      ));
    }
    const tick = this.authority.advanceOneTick();
    const reliableEvents = Object.freeze(reliableCombatEvents(tick).map((event) => Object.freeze({
      id: `event.${this.nextReliableEventSequence++}`,
      ...event,
    })));
    return Object.freeze({
      tick,
      snapshot: this.authority.fullSnapshot(),
      reliableEvents,
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.world.dispose();
    this.connectionIds.clear();
    this.inputSequences.clear();
    this.heldButtons.clear();
  }

  private enqueue(playerId: string, input: LocalInkfallPracticeInput): void {
    const sequence = this.inputSequences.get(playerId) ?? 0;
    const message: InputBatchMessage = Object.freeze({
      protocolVersion: PROTOCOL_VERSION,
      type: 'inputBatch',
      commands: Object.freeze([Object.freeze({
        type: 'input',
        sequence,
        clientTick: this.authority.serverTick,
        ...input,
      })]),
    });
    const validated = validateClientMessage(message);
    if (!validated.ok) {
      throw new Error(
        `LOCAL_INKFALL_PRACTICE_INPUT_INVALID:${validated.error.code}:${validated.error.path}`,
      );
    }
    const result = this.authority.enqueueInputBatch(this.requireConnectionId(playerId), message);
    if (result.accepted !== 1 || result.rejections.length !== 0) {
      throw new Error(
        `LOCAL_INKFALL_PRACTICE_INPUT_REJECTED:${result.rejections[0]?.reason ?? 'unknown'}`,
      );
    }
    this.inputSequences.set(playerId, sequence + 1);
    this.heldButtons.set(playerId, input.heldButtons);
  }

  private requireConnectionId(playerId: string): string {
    const connectionId = this.connectionIds.get(playerId);
    if (connectionId === undefined) {
      throw new Error(`LOCAL_INKFALL_PRACTICE_CONNECTION_MISSING:${playerId}`);
    }
    return connectionId;
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('LOCAL_INKFALL_PRACTICE_HOST_DISPOSED');
  }
}
