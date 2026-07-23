import {
  PROTOCOL_LIMITS,
  PROTOCOL_VERSION,
  type InputCommand,
  type LocalReconciliationStateV1,
  type SimulationIdentityV1,
  type SnapshotEntity,
} from '../net/protocol';
import {
  asQuantizedAxis,
  asSimulationTick,
  assertIntentButtonMask,
  assertMovementSimulationState,
  type MovementProfileV1,
  type MovementSimulationState,
  type PlayerIntentCommand,
} from '../sim';
import type { RemoteAuthoritativeSample } from '../client/netcode/remoteInterpolation';
import {
  parseAuthorityEvidenceImpairmentProfile,
  type AuthorityEvidenceImpairmentProfileName,
} from './authorityEvidenceImpairment';

export const AUTHORITY_EVIDENCE_ROUTE_PATH = '/__test__/authority' as const;
export const AUTHORITY_EVIDENCE_DEFAULT_URL = 'http://127.0.0.1:8787' as const;
export const AUTHORITY_EVIDENCE_LABEL = 'DEV / G3 EVIDENCE' as const;
export const AUTHORITY_EVIDENCE_PRODUCT_STATUS = 'NON_PRODUCT' as const;

const ROOM_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const ROOM_CODE_PATTERN = /^KYX-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/u;
const IDENTITY_FIELDS = Object.freeze([
  'schemaVersion',
  'mapId',
  'rulesetId',
  'rulesetRevision',
  'rulesetHash',
  'movementProfileId',
  'movementProfileRevision',
  'movementProfileHash',
  'fixtureId',
  'fixtureHash',
  'physicsAdapterId',
  'physicsAdapterVersion',
] as const);

export type AuthorityEvidenceMode = 'create' | 'join';

export interface AuthorityEvidenceConfig {
  readonly authorityUrl: string;
  readonly mode: AuthorityEvidenceMode;
  readonly roomCode: string | null;
  readonly displayName: string;
  readonly impairmentProfile: AuthorityEvidenceImpairmentProfileName;
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function normalizeAuthorityUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RangeError('authorityUrl must be an absolute HTTP or HTTPS origin');
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:')
    || url.username.length > 0
    || url.password.length > 0
    || url.pathname !== '/'
    || url.search.length > 0
    || url.hash.length > 0
  ) {
    throw new RangeError('authorityUrl must be an absolute HTTP or HTTPS origin');
  }
  return url.origin;
}

export function normalizeAuthorityRoomCode(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(normalized) ? normalized : null;
}

/** Parse the entire evidence route contract from the URL query string. */
export function parseAuthorityEvidenceConfig(search: string): AuthorityEvidenceConfig {
  const parameters = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const impairmentParameters = parameters.getAll('impairment');
  if (impairmentParameters.length > 1) {
    throw new RangeError('impairment query parameter must not be repeated');
  }
  const impairmentProfile = parseAuthorityEvidenceImpairmentProfile(
    impairmentParameters[0] ?? null,
  );
  const authorityUrl = normalizeAuthorityUrl(
    parameters.get('authorityUrl') ?? AUTHORITY_EVIDENCE_DEFAULT_URL,
  );
  const rawRoomCode = parameters.get('room');
  const roomCode = rawRoomCode === null ? null : normalizeAuthorityRoomCode(rawRoomCode);
  if (rawRoomCode !== null && roomCode === null) {
    throw new RangeError('room must match KYX- followed by six unambiguous uppercase characters');
  }
  const rawMode = parameters.get('mode');
  if (rawMode !== null && rawMode !== 'create' && rawMode !== 'join') {
    throw new RangeError('mode must be create or join');
  }
  const mode: AuthorityEvidenceMode = rawMode ?? (roomCode === null ? 'create' : 'join');
  if (mode === 'join' && roomCode === null) {
    throw new RangeError('join mode requires a room query parameter');
  }
  if (mode === 'create' && roomCode !== null) {
    throw new RangeError('create mode generates a new room and does not accept a room query parameter');
  }
  const displayName = (parameters.get('displayName') ?? 'G3 Evidence').trim();
  if (
    displayName.length < 1
    || utf8ByteLength(displayName) > PROTOCOL_LIMITS.maxDisplayNameBytes
  ) {
    throw new RangeError(
      `displayName must contain 1-${PROTOCOL_LIMITS.maxDisplayNameBytes} UTF-8 bytes`,
    );
  }
  return Object.freeze({
    authorityUrl,
    mode,
    roomCode,
    displayName,
    impairmentProfile,
  });
}

/**
 * Create mode intentionally seeds a fresh development room by connecting to a
 * cryptographically generated valid room route. The Durable Object remains the
 * authority and owns all room, match, player, and simulation facts.
 */
export function createDevelopmentRoomCode(entropy: readonly number[]): string {
  if (!Array.isArray(entropy) || entropy.length !== 6) {
    throw new RangeError('development room entropy must contain exactly six values');
  }
  const suffix = entropy.map((value) => {
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
      throw new RangeError('development room entropy must contain unsigned 32-bit integers');
    }
    return ROOM_ALPHABET[value % ROOM_ALPHABET.length];
  }).join('');
  return `KYX-${suffix}`;
}

export function authoritySocketUrl(authorityUrl: string, roomCode: string): string {
  const normalizedUrl = normalizeAuthorityUrl(authorityUrl);
  const normalizedRoom = normalizeAuthorityRoomCode(roomCode);
  if (normalizedRoom === null) throw new RangeError('authority socket room code is invalid');
  const socketUrl = new URL(`/api/rooms/${normalizedRoom}/socket`, normalizedUrl);
  socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  return socketUrl.toString();
}

export function assertAuthoritySimulationIdentity(
  actual: SimulationIdentityV1,
  expected: SimulationIdentityV1,
  source: string,
): void {
  if (actual.schemaVersion !== 1 || PROTOCOL_VERSION !== 2) {
    throw new Error(`${source}: protocol-v2 simulation identity is required`);
  }
  for (const field of IDENTITY_FIELDS) {
    if (actual[field] !== expected[field]) {
      throw new Error(
        `${source}: simulation identity mismatch at ${field}; expected ${String(expected[field])}, received ${String(actual[field])}`,
      );
    }
  }
}

export function assertAuthorityMovementIdentity(
  reconciliation: LocalReconciliationStateV1,
  expected: SimulationIdentityV1,
  source: string,
): void {
  const identity = reconciliation.identity;
  for (const field of IDENTITY_FIELDS) {
    if (field === 'schemaVersion' || field === 'mapId') continue;
    if (identity[field] !== expected[field]) {
      throw new Error(
        `${source}: movement identity mismatch at ${field}; expected ${String(expected[field])}, received ${String(identity[field])}`,
      );
    }
  }
}

/** Convert a decoded exact wire state into the simulation's branded state. */
export function movementStateFromReconciliation(
  reconciliation: LocalReconciliationStateV1,
  profile: MovementProfileV1,
): MovementSimulationState {
  const state = structuredClone(reconciliation) as unknown as MovementSimulationState;
  assertMovementSimulationState(state, profile);
  return state;
}

export interface AuthorityEvidenceAxes {
  readonly moveX: -127 | 0 | 127;
  readonly moveY: -127 | 0 | 127;
}

export interface AuthorityEvidenceCommandControls {
  readonly heldButtons: number;
  readonly pressedButtons: number;
  readonly releasedButtons: number;
  readonly selectedSlot: number;
  readonly lookYawDeltaMilliDegrees?: number;
  readonly lookPitchDeltaMilliDegrees?: number;
}

export function axesFromPressedKeys(keys: ReadonlySet<string>): AuthorityEvidenceAxes {
  const moveX = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  const moveY = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
  return Object.freeze({
    moveX: (moveX * PROTOCOL_LIMITS.maxAxisMagnitude) as AuthorityEvidenceAxes['moveX'],
    moveY: (moveY * PROTOCOL_LIMITS.maxAxisMagnitude) as AuthorityEvidenceAxes['moveY'],
  });
}

export function createEvidenceInputCommand(
  sequence: number,
  clientTick: number,
  axes: AuthorityEvidenceAxes,
  controls?: AuthorityEvidenceCommandControls,
): InputCommand {
  if (controls !== undefined) {
    assertIntentButtonMask(controls.heldButtons, 'evidence held buttons');
    assertIntentButtonMask(controls.pressedButtons, 'evidence pressed buttons');
    assertIntentButtonMask(controls.releasedButtons, 'evidence released buttons');
    if (!Number.isInteger(controls.selectedSlot) || controls.selectedSlot < 0 || controls.selectedSlot > 7) {
      throw new RangeError('evidence selected slot must be between 0 and 7');
    }
    for (const [label, value] of [
      ['yaw', controls.lookYawDeltaMilliDegrees ?? 0],
      ['pitch', controls.lookPitchDeltaMilliDegrees ?? 0],
    ] as const) {
      if (
        !Number.isInteger(value)
        || Math.abs(value) > PROTOCOL_LIMITS.maxLookDeltaMilliDegrees
      ) throw new RangeError(`evidence look ${label} delta exceeds the protocol limit`);
    }
  }
  return Object.freeze({
    type: 'input',
    sequence,
    clientTick,
    moveX: axes.moveX,
    moveY: axes.moveY,
    lookYawDeltaMilliDegrees: controls?.lookYawDeltaMilliDegrees ?? 0,
    lookPitchDeltaMilliDegrees: controls?.lookPitchDeltaMilliDegrees ?? 0,
    heldButtons: controls?.heldButtons ?? 0,
    pressedButtons: controls?.pressedButtons ?? 0,
    releasedButtons: controls?.releasedButtons ?? 0,
    ...(controls === undefined ? {} : { selectedSlot: controls.selectedSlot }),
  });
}

/** The sole diagnostic mapping from wire X/Y intent to simulation X/Z intent. */
export function evidenceWireCommandToMovement(
  command: InputCommand,
): Readonly<PlayerIntentCommand> {
  return Object.freeze({
    kind: 'player_intent',
    sequence: command.sequence,
    clientTick: asSimulationTick(command.clientTick),
    moveX: asQuantizedAxis(command.moveX),
    moveZ: asQuantizedAxis(command.moveY),
    lookYawDeltaMilliDegrees: command.lookYawDeltaMilliDegrees,
    lookPitchDeltaMilliDegrees: command.lookPitchDeltaMilliDegrees,
    heldButtons: command.heldButtons,
    pressedButtons: command.pressedButtons,
    releasedButtons: command.releasedButtons,
    ...(command.selectedSlot === undefined ? {} : { selectedSlot: command.selectedSlot }),
  });
}

/**
 * Snapshot entities currently omit remote stance/support semantics. This
 * development adapter labels the conservative projection used only for the
 * existing interpolation buffer; position and velocity remain server facts.
 */
export function remoteSampleFromSnapshotEntity(
  entity: SnapshotEntity,
  serverTick: number,
  receivedAtMilliseconds: number,
  firstSample: boolean,
): RemoteAuthoritativeSample {
  if (entity.kind !== 'player') throw new RangeError('remote interpolation requires a player entity');
  const grounded = entity.yMillimeters === 0
    && entity.velocityYMillimetersPerSecond === 0;
  return Object.freeze({
    entityId: entity.id,
    serverTick,
    receivedAtMilliseconds,
    feetPosition: Object.freeze({
      x: entity.xMillimeters,
      y: entity.yMillimeters,
      z: entity.zMillimeters,
    }),
    velocity: Object.freeze({
      x: entity.velocityXMillimetersPerSecond,
      y: entity.velocityYMillimetersPerSecond,
      z: entity.velocityZMillimetersPerSecond,
    }),
    yawMilliDegrees: entity.yawMilliDegrees < 0
      ? entity.yawMilliDegrees + 360_000
      : entity.yawMilliDegrees,
    pitchMilliDegrees: entity.pitchMilliDegrees,
    grounded,
    stance: 'standing',
    locomotion: grounded
      ? 'grounded'
      : 'airborne',
    ...(firstSample ? { discontinuity: 'spawn' as const } : {}),
  });
}

export function deepFreezeAuthorityEvidence<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object') {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreezeAuthorityEvidence(nested);
    }
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value;
}
