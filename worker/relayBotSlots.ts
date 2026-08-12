import {
  deterministicCombatBotInput,
  type AuthorityFullSnapshot,
  type DeterministicCombatBotInput,
} from '../src/authority';

export const RELAY_AUTHORITY_PLAYER_SLOT_COUNT = 8 as const;
export const RELAY_AUTHORITY_BOT_STRATEGY =
  'relay_authority_safe_patrol_slot_takeover_v2' as const;
export const SWITCHYARD_AUTHORITY_BOT_STRATEGY =
  'switchyard_authority_safe_patrol_slot_takeover_v1' as const;
export const CROWNPOINT_AUTHORITY_BOT_STRATEGY =
  'crownpoint_authority_safe_patrol_slot_takeover_v1' as const;

export function authorityBotStrategy(mapId: string): string {
  if (mapId === 'relay') return RELAY_AUTHORITY_BOT_STRATEGY;
  if (mapId === 'switchyard') return SWITCHYARD_AUTHORITY_BOT_STRATEGY;
  if (mapId === 'crownpoint') return CROWNPOINT_AUTHORITY_BOT_STRATEGY;
  throw new RangeError(`Authority bot strategy does not support map ${mapId}`);
}

export const RELAY_AUTHORITY_PLAYER_SLOT_IDS = Object.freeze(Array.from(
  { length: RELAY_AUTHORITY_PLAYER_SLOT_COUNT },
  (_, index) => `player.relay.slot.${String(index + 1).padStart(2, '0')}`,
));

export function relayAuthorityPlayerSlotOrdinal(playerId: string): number | null {
  const match = /^player\.relay\.slot\.(0[1-8])$/u.exec(playerId);
  if (match === null) return null;
  return Number(match[1]);
}

export function relayAuthorityBotConnectionId(playerId: string): string {
  const ordinal = relayAuthorityPlayerSlotOrdinal(playerId);
  if (ordinal === null) throw new RangeError('Relay authority bot requires a player slot id');
  return `connection.relay.bot.${String(ordinal).padStart(2, '0')}`;
}

export function nextRelayAuthorityBotTakeover(
  botPlayerIds: ReadonlySet<string>,
): string | null {
  return RELAY_AUTHORITY_PLAYER_SLOT_IDS.find((playerId) => botPlayerIds.has(playerId)) ?? null;
}

type RelayPatrolPoint = Readonly<{ x: number; y: number; z: number }>;

interface RelayPatrolLane {
  readonly laneId: string;
  readonly minimum: RelayPatrolPoint;
  readonly maximum: RelayPatrolPoint;
  readonly anchors: readonly [RelayPatrolPoint, RelayPatrolPoint];
}

function point(x: number, y: number, z: number): RelayPatrolPoint {
  return Object.freeze({ x, y, z });
}

function lane(
  laneId: string,
  minimum: RelayPatrolPoint,
  maximum: RelayPatrolPoint,
  first: RelayPatrolPoint,
  second: RelayPatrolPoint,
): RelayPatrolLane {
  return Object.freeze({
    laneId,
    minimum,
    maximum,
    anchors: Object.freeze([first, second] as const),
  });
}

// Each lane is a convex inset of one named Relay floor rectangle. Straight
// travel between its anchors cannot cross a map gap; bots outside their own
// lane fail closed to sentry behavior instead of attempting recovery travel.
export const RELAY_AUTHORITY_BOT_PATROL_LANES = Object.freeze([
  lane('west_spawn_a', point(-32_000, -250, -5_500), point(-24_000, 1_500, 5_500), point(-30_000, 0, -3_200), point(-27_000, 0, 3_200)),
  lane('east_spawn_a', point(24_000, -250, -5_500), point(32_000, 1_500, 5_500), point(30_000, 0, 3_200), point(27_000, 0, -3_200)),
  lane('west_spawn_b', point(-32_000, -250, -5_500), point(-24_000, 1_500, 5_500), point(-27_000, 0, 3_200), point(-30_000, 0, -3_200)),
  lane('east_spawn_b', point(24_000, -250, -5_500), point(32_000, 1_500, 5_500), point(27_000, 0, -3_200), point(30_000, 0, 3_200)),
  lane('north_west', point(-27_000, -250, 11_500), point(-17_000, 1_500, 18_500), point(-23_000, 0, 13_000), point(-18_000, 0, 17_000)),
  lane('north_east', point(17_000, -250, 11_500), point(27_000, 1_500, 18_500), point(23_000, 0, 17_000), point(18_000, 0, 13_000)),
  lane('lower_west', point(-22_000, -3_500, -19_500), point(-12_000, -1_500, -14_500), point(-20_000, -3_000, -18_000), point(-14_000, -3_000, -16_000)),
  lane('lower_east', point(12_000, -3_500, -19_500), point(22_000, -1_500, -14_500), point(20_000, -3_000, -16_000), point(14_000, -3_000, -18_000)),
] as const);

export const SWITCHYARD_AUTHORITY_BOT_PATROL_LANES = Object.freeze([
  lane('switchyard_west_north', point(-29_000, -250, 11_500), point(-23_000, 1_500, 20_000), point(-27_000, 0, 12_500), point(-24_000, 0, 18_500)),
  lane('switchyard_east_south', point(23_000, -250, -20_000), point(29_000, 1_500, -11_500), point(27_000, 0, -12_500), point(24_000, 0, -18_500)),
  lane('switchyard_west_south', point(-29_000, -250, -20_000), point(-23_000, 1_500, -11_500), point(-27_000, 0, -12_500), point(-24_000, 0, -18_500)),
  lane('switchyard_east_north', point(23_000, -250, 11_500), point(29_000, 1_500, 20_000), point(27_000, 0, 12_500), point(24_000, 0, 18_500)),
  lane('switchyard_north_west', point(-18_000, -250, 16_500), point(-7_500, 1_500, 20_500), point(-14_000, 0, 18_000), point(-9_000, 0, 19_000)),
  lane('switchyard_south_east', point(7_500, -250, -20_500), point(18_000, 1_500, -16_500), point(14_000, 0, -18_000), point(9_000, 0, -19_000)),
  lane('switchyard_south_west', point(-18_000, -250, -20_500), point(-7_500, 1_500, -16_500), point(-14_000, 0, -18_000), point(-9_000, 0, -19_000)),
  lane('switchyard_north_east', point(7_500, -250, 16_500), point(18_000, 1_500, 20_500), point(14_000, 0, 18_000), point(9_000, 0, 19_000)),
] as const);

export const CROWNPOINT_AUTHORITY_BOT_PATROL_LANES = Object.freeze([
  lane('crownpoint_west_north', point(-24_000, -250, 7_000), point(-17_000, 1_500, 16_000), point(-22_000, 0, 9_000), point(-18_000, 0, 15_000)),
  lane('crownpoint_east_south', point(17_000, -250, -16_000), point(24_000, 1_500, -7_000), point(22_000, 0, -9_000), point(18_000, 0, -15_000)),
  lane('crownpoint_west_south', point(-24_000, -250, -16_000), point(-17_000, 1_500, -7_000), point(-22_000, 0, -9_000), point(-18_000, 0, -15_000)),
  lane('crownpoint_east_north', point(17_000, -250, 7_000), point(24_000, 1_500, 16_000), point(22_000, 0, 9_000), point(18_000, 0, 15_000)),
  lane('crownpoint_north_west', point(-16_000, -250, 17_000), point(-7_000, 1_500, 24_000), point(-9_000, 0, 22_000), point(-15_000, 0, 18_000)),
  lane('crownpoint_south_east', point(7_000, -250, -24_000), point(16_000, 1_500, -17_000), point(9_000, 0, -22_000), point(15_000, 0, -18_000)),
  lane('crownpoint_south_west', point(-16_000, -250, -24_000), point(-7_000, 1_500, -17_000), point(-9_000, 0, -22_000), point(-15_000, 0, -18_000)),
  lane('crownpoint_north_east', point(7_000, -250, 17_000), point(16_000, 1_500, 24_000), point(9_000, 0, 22_000), point(15_000, 0, 18_000)),
] as const);

export interface RelayAuthorityBotPatrolDecision {
  readonly laneId: string;
  readonly active: boolean;
  readonly target: RelayPatrolPoint;
  readonly moveX: number;
  readonly moveY: number;
}

function insideLane(position: RelayPatrolPoint, patrol: RelayPatrolLane): boolean {
  return position.x >= patrol.minimum.x && position.x <= patrol.maximum.x
    && position.y >= patrol.minimum.y && position.y <= patrol.maximum.y
    && position.z >= patrol.minimum.z && position.z <= patrol.maximum.z;
}

function patrolLanesForMap(mapId: string): readonly RelayPatrolLane[] {
  if (mapId === 'relay') return RELAY_AUTHORITY_BOT_PATROL_LANES;
  if (mapId === 'switchyard') return SWITCHYARD_AUTHORITY_BOT_PATROL_LANES;
  if (mapId === 'crownpoint') return CROWNPOINT_AUTHORITY_BOT_PATROL_LANES;
  throw new RangeError(`Authority bot patrol does not support map ${mapId}`);
}

export function authorityBotPatrolDecision(
  snapshot: AuthorityFullSnapshot,
  playerId: string,
  mapId: string,
): RelayAuthorityBotPatrolDecision {
  const ordinal = relayAuthorityPlayerSlotOrdinal(playerId);
  if (ordinal === null) throw new RangeError('Relay bot patrol requires a player slot id');
  const patrol = patrolLanesForMap(mapId)[ordinal - 1];
  if (patrol === undefined) throw new Error('Relay bot patrol lane is missing');
  const player = snapshot.players.find((candidate) => candidate.playerId === playerId);
  if (player === undefined) throw new Error('Relay bot patrol player is missing');
  const position = player.movement.player.feetPosition;
  const phase = Math.floor(snapshot.serverTick / 120) + ordinal;
  const target = patrol.anchors[phase % patrol.anchors.length] as RelayPatrolPoint;
  if (!insideLane(position, patrol) || player.combat?.life.phase !== 'alive') {
    return Object.freeze({ laneId: patrol.laneId, active: false, target, moveX: 0, moveY: 0 });
  }

  const deltaX = target.x - position.x;
  const deltaZ = target.z - position.z;
  const distance = Math.hypot(deltaX, deltaZ);
  if (distance <= 600) {
    return Object.freeze({ laneId: patrol.laneId, active: true, target, moveX: 0, moveY: 0 });
  }
  const yaw = player.movement.player.yawMilliDegrees * Math.PI / 180_000;
  const directionX = deltaX / distance;
  const directionZ = deltaZ / distance;
  const moveX = Math.round((directionX * Math.cos(yaw) - directionZ * Math.sin(yaw)) * 64);
  const moveY = Math.round((directionX * Math.sin(yaw) + directionZ * Math.cos(yaw)) * 64);
  return Object.freeze({ laneId: patrol.laneId, active: true, target, moveX, moveY });
}

export function relayAuthorityBotPatrolDecision(
  snapshot: AuthorityFullSnapshot,
  playerId: string,
): RelayAuthorityBotPatrolDecision {
  return authorityBotPatrolDecision(snapshot, playerId, 'relay');
}

export function authorityBotInput(
  snapshot: AuthorityFullSnapshot,
  playerId: string,
  previousHeldButtons: number,
  mapId: string,
): DeterministicCombatBotInput {
  const ordinal = relayAuthorityPlayerSlotOrdinal(playerId);
  if (ordinal === null) throw new RangeError('Authority bot input requires a player slot id');
  const combat = deterministicCombatBotInput(
    snapshot,
    playerId,
    previousHeldButtons,
    ordinal,
    { locomotion: 'sentry', strategy: 'adaptive' },
  );
  const patrol = authorityBotPatrolDecision(snapshot, playerId, mapId);
  return Object.freeze({
    ...combat,
    moveX: patrol.moveX,
    moveY: patrol.moveY,
  });
}

export function relayAuthorityBotInput(
  snapshot: AuthorityFullSnapshot,
  playerId: string,
  previousHeldButtons: number,
): DeterministicCombatBotInput {
  return authorityBotInput(snapshot, playerId, previousHeldButtons, 'relay');
}
