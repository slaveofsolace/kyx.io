import {
  INTENT_BUTTON,
  assertPlayerIntentCommand,
  type PlayerIntentCommand,
} from '../commands';
import {
  asMillimeters,
  asMillimetersPerSecond,
  asQuantizedAxis,
  asSimulationTick,
  clampMilliDegrees,
  normalizeYawMilliDegrees,
} from '../units';
import {
  EMPTY_MOVEMENT_QUERY_METRICS,
  type MovementQueryMetrics,
  type MovementSemanticEvent,
} from './events';
import {
  assertContactNormalQ15,
  assertSafeInteger,
  integerSquareRootFloor,
  lookDirectionQ15,
  planarLength,
  roundDivideSigned,
  scaleQ15,
  sinCosMilliDegreesQ15,
  yawRelativePlanarIntentQ15,
} from './fixedMath';
import type { MovementProfileV1 } from './profile';
import { assertMovementProfile } from './profileIdentity';
import {
  MOVEMENT_PITCH_MAX_MILLI_DEGREES,
  MOVEMENT_PITCH_MIN_MILLI_DEGREES,
  assertMovementSimulationState,
  type MovementAppliedIntent,
  type MovementPlayerState,
  type MovementSimulationState,
  type MovementStance,
} from './state';
import {
  CONTACT_NORMAL_Q15_SCALE,
  MOVEMENT_QUERY_SCHEMA_VERSION,
  type CapsuleCastResult,
  type CapsuleMoveResult,
  type CapsuleOverlapResult,
  type CapsuleShapeMillimeters,
  type CapsuleVolumeResult,
  type MovementContact,
  type MovementCollisionLayer,
  type MovementQueryPort,
  type MovementSupport,
  type MovementVolumeHit,
  type Vector3Millimeters,
  type Vector3MillimetersPerSecond,
} from './queryPort';

const SOLID_MOVEMENT_LAYERS = Object.freeze([
  'world_static',
  'dynamic_platform',
  'player_body',
  'door',
  'spawn_barrier',
] as const);

const MOVEMENT_LAYERS = new Set<MovementCollisionLayer>([
  ...SOLID_MOVEMENT_LAYERS,
  'kill_volume',
  'forbidden_volume',
  'recovery_volume',
]);

interface MutableQueryMetrics {
  moveCapsuleCalls: number;
  overlapCapsuleCalls: number;
  castCapsuleCalls: number;
  volumeCalls: number;
  shapeCasts: number;
  overlapTests: number;
  contacts: number;
}

export interface MovementStepResult {
  readonly state: MovementSimulationState;
  readonly events: readonly MovementSemanticEvent[];
  readonly metrics: MovementQueryMetrics;
}

interface PlanarVelocityResult {
  readonly x: number;
  readonly z: number;
  readonly remainder: number;
}

function createMetrics(): MutableQueryMetrics {
  return { ...EMPTY_MOVEMENT_QUERY_METRICS };
}

function assertNonNegativeCounter(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) {
    throw new RangeError(`${label} must be a non-negative bounded integer`);
  }
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertColliderId(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > 96
    || !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value)
    || value === '__proto__'
    || value === 'prototype'
    || value === 'constructor'
  ) {
    throw new RangeError(`${label} must be a safe 1-96 character identifier`);
  }
}

function assertLayer(value: unknown, label: string): asserts value is MovementCollisionLayer {
  if (typeof value !== 'string' || !MOVEMENT_LAYERS.has(value as MovementCollisionLayer)) {
    throw new RangeError(`${label} is unsupported`);
  }
}

function assertBoolean(value: unknown, label: string): asserts value is boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be a boolean`);
}

function assertVector(value: unknown, label: string): void {
  assertRecord(value, label);
  for (const axis of ['x', 'y', 'z'] as const) {
    if (!Object.prototype.hasOwnProperty.call(value, axis)) {
      throw new RangeError(`${label} is missing ${axis}`);
    }
    assertSafeInteger(value[axis] as number, `${label}.${axis}`);
  }
}

function stableContacts(contacts: readonly MovementContact[], maximum: number): readonly MovementContact[] {
  if (!Array.isArray(contacts)) throw new TypeError('movement query contacts must be an array');
  if (contacts.length > maximum) throw new RangeError('movement query exceeded maximum contacts');
  for (const contact of contacts as readonly unknown[]) {
    assertRecord(contact, 'movement contact');
    assertColliderId(contact.colliderId, 'movement contact collider ID');
    assertLayer(contact.layer, 'movement contact layer');
    assertContactNormalQ15(contact.normalQ15, 'movement contact normal');
    if (
      typeof contact.timeOfImpactPermille !== 'number'
      || !Number.isInteger(contact.timeOfImpactPermille)
      || contact.timeOfImpactPermille < 0
      || contact.timeOfImpactPermille > 1_000
    ) {
      throw new RangeError('movement contact time of impact must be 0..1000');
    }
  }
  return [...contacts].sort((left, right) => (
    compareAscii(left.colliderId, right.colliderId)
    || left.timeOfImpactPermille - right.timeOfImpactPermille
    || compareAscii(left.layer, right.layer)
    || left.normalQ15.x - right.normalQ15.x
    || left.normalQ15.y - right.normalQ15.y
    || left.normalQ15.z - right.normalQ15.z
  ));
}

function validateSupport(support: MovementSupport | null): MovementSupport | null {
  if (support === null) return null;
  assertRecord(support, 'movement support');
  assertColliderId(support.colliderId, 'movement support collider ID');
  assertLayer(support.layer, 'movement support layer');
  assertContactNormalQ15(support.normalQ15, 'movement support normal');
  assertVector(support.velocity, 'movement support velocity');
  return {
    colliderId: support.colliderId,
    layer: support.layer,
    normalQ15: { ...support.normalQ15 },
    velocity: { ...support.velocity },
  };
}

function recordMove(
  result: CapsuleMoveResult,
  metrics: MutableQueryMetrics,
  maximumContacts: number,
): CapsuleMoveResult {
  assertRecord(result, 'capsule move result');
  assertVector(result.appliedTranslation, 'applied translation');
  assertBoolean(result.grounded, 'capsule move grounded');
  assertBoolean(result.hitCeiling, 'capsule move hitCeiling');
  if (result.support !== null && (result.support === undefined || typeof result.support !== 'object')) {
    throw new TypeError('capsule move support must be an object or null');
  }
  assertNonNegativeCounter(result.shapeCasts, 'move shape casts');
  assertNonNegativeCounter(result.overlapTests, 'move overlap tests');
  const contacts = stableContacts(result.contacts, maximumContacts);
  metrics.moveCapsuleCalls += 1;
  metrics.shapeCasts += result.shapeCasts;
  metrics.overlapTests += result.overlapTests;
  metrics.contacts += contacts.length;
  return {
    ...result,
    appliedTranslation: { ...result.appliedTranslation },
    support: validateSupport(result.support),
    contacts,
  };
}

function recordOverlap(
  result: CapsuleOverlapResult,
  metrics: MutableQueryMetrics,
): CapsuleOverlapResult {
  assertRecord(result, 'capsule overlap result');
  if (!Array.isArray(result.blockingColliderIds)) {
    throw new TypeError('blocking collider IDs must be an array');
  }
  assertNonNegativeCounter(result.overlapTests, 'capsule overlap tests');
  const blockingColliderIds = [...result.blockingColliderIds];
  for (const colliderId of blockingColliderIds) {
    assertColliderId(colliderId, 'blocking collider ID');
  }
  blockingColliderIds.sort(compareAscii);
  if (new Set(blockingColliderIds).size !== blockingColliderIds.length) {
    throw new RangeError('capsule overlap result contains duplicate collider IDs');
  }
  metrics.overlapCapsuleCalls += 1;
  metrics.overlapTests += result.overlapTests;
  return { blockingColliderIds, overlapTests: result.overlapTests };
}

function recordCast(result: CapsuleCastResult, metrics: MutableQueryMetrics): CapsuleCastResult {
  assertRecord(result, 'capsule cast result');
  assertVector(result.allowedTranslation, 'capsule cast translation');
  assertNonNegativeCounter(result.shapeCasts, 'capsule cast count');
  if (result.hit !== null) {
    if (result.hit === undefined) {
      throw new TypeError('capsule cast hit must be an object or null');
    }
    assertRecord(result.hit, 'capsule cast hit');
    assertColliderId(result.hit.colliderId, 'capsule cast collider ID');
    assertLayer(result.hit.layer, 'capsule cast layer');
    assertContactNormalQ15(result.hit.normalQ15, 'capsule cast normal');
    if (
      typeof result.hit.timeOfImpactPermille !== 'number'
      || !Number.isInteger(result.hit.timeOfImpactPermille)
      || result.hit.timeOfImpactPermille < 0
      || result.hit.timeOfImpactPermille > 1_000
    ) {
      throw new RangeError('capsule cast time of impact must be 0..1000');
    }
  }
  metrics.castCapsuleCalls += 1;
  metrics.shapeCasts += result.shapeCasts;
  return {
    allowedTranslation: { ...result.allowedTranslation },
    hit: result.hit ? { ...result.hit, normalQ15: { ...result.hit.normalQ15 } } : null,
    shapeCasts: result.shapeCasts,
  };
}

function recordVolumes(result: CapsuleVolumeResult, metrics: MutableQueryMetrics): CapsuleVolumeResult {
  assertRecord(result, 'capsule volume result');
  if (!Array.isArray(result.volumes)) throw new TypeError('movement volumes must be an array');
  assertNonNegativeCounter(result.overlapTests, 'volume overlap tests');
  const volumes = [...result.volumes];
  const seen = new Set<string>();
  for (const volume of volumes as readonly unknown[]) {
    assertRecord(volume, 'movement volume');
    assertColliderId(volume.colliderId, 'movement volume collider ID');
    if (seen.has(volume.colliderId)) throw new RangeError('volume result contains duplicate collider IDs');
    if (volume.kind !== 'kill' && volume.kind !== 'forbidden' && volume.kind !== 'recovery') {
      throw new RangeError('volume result contains an unsupported kind');
    }
    seen.add(volume.colliderId);
  }
  const detachedVolumes = volumes.map((volume) => Object.freeze({
    colliderId: volume.colliderId,
    kind: volume.kind,
  }));
  detachedVolumes.sort((left, right) => compareAscii(left.colliderId, right.colliderId));
  metrics.volumeCalls += 1;
  metrics.overlapTests += result.overlapTests;
  return { volumes: detachedVolumes, overlapTests: result.overlapTests };
}

function shapeForStance(profile: MovementProfileV1, stance: MovementStance): CapsuleShapeMillimeters {
  return stance === 'standing' ? profile.standingShape : profile.crouchedShape;
}

function decrement(value: number): number {
  return Math.max(0, value - 1);
}

function accelerationPerTick(
  accelerationMmPerSecondSquared: number,
  remainder: number,
  rateHz: number,
): readonly [number, number] {
  const numerator = accelerationMmPerSecondSquared + remainder;
  assertSafeInteger(numerator, 'acceleration numerator');
  const delta = Math.floor(numerator / rateHz);
  return [delta, numerator - delta * rateHz];
}

function approachPlanarVelocity(
  currentX: number,
  currentZ: number,
  targetX: number,
  targetZ: number,
  acceleration: number,
  remainder: number,
  rateHz: number,
): PlanarVelocityResult {
  const deltaX = targetX - currentX;
  const deltaZ = targetZ - currentZ;
  const distance = planarLength(deltaX, deltaZ);
  if (distance === 0) return { x: targetX, z: targetZ, remainder: 0 };
  const [maximumDelta, nextRemainder] = accelerationPerTick(acceleration, remainder, rateHz);
  if (maximumDelta <= 0) return { x: currentX, z: currentZ, remainder: nextRemainder };
  if (distance <= maximumDelta) return { x: targetX, z: targetZ, remainder: 0 };
  return {
    x: currentX + roundDivideSigned(deltaX * maximumDelta, distance),
    z: currentZ + roundDivideSigned(deltaZ * maximumDelta, distance),
    remainder: nextRemainder,
  };
}

function targetPlanarVelocity(
  player: MovementPlayerState,
  profile: MovementProfileV1,
  speed: number,
): readonly [number, number] {
  const direction = yawRelativePlanarIntentQ15(
    player.intent.moveX,
    player.intent.moveZ,
    player.yawMilliDegrees,
  );
  return [scaleQ15(direction.x, speed), scaleQ15(direction.z, speed)];
}

function updateNormalLocomotionVelocity(
  player: MovementPlayerState,
  profile: MovementProfileV1,
): PlanarVelocityResult {
  const hasIntent = player.intent.moveX !== 0 || player.intent.moveZ !== 0;
  const sprinting = (player.intent.heldButtons & INTENT_BUTTON.sprint) !== 0;
  const baseSpeed = player.stance === 'crouched'
    ? profile.locomotion.crouchSpeedMmPerSecond
    : sprinting
      ? profile.locomotion.sprintSpeedMmPerSecond
      : profile.locomotion.walkSpeedMmPerSecond;

  if (player.grounded) {
    const [targetX, targetZ] = hasIntent
      ? targetPlanarVelocity(player, profile, baseSpeed)
      : [0, 0];
    const opposing = player.velocity.x * targetX + player.velocity.z * targetZ < 0;
    const acceleration = !hasIntent
      ? profile.locomotion.groundBrakingMmPerSecondSquared
      : opposing
        ? profile.locomotion.reverseAccelerationMmPerSecondSquared
        : profile.locomotion.groundAccelerationMmPerSecondSquared;
    return approachPlanarVelocity(
      player.velocity.x,
      player.velocity.z,
      targetX,
      targetZ,
      acceleration,
      player.integrationRemainders.planarAcceleration,
      profile.simulationRateHz,
    );
  }

  if (!hasIntent) {
    return {
      x: player.velocity.x,
      z: player.velocity.z,
      remainder: player.integrationRemainders.planarAcceleration,
    };
  }
  const currentSpeed = planarLength(player.velocity.x, player.velocity.z);
  const targetSpeed = Math.max(currentSpeed, profile.locomotion.airSpeedCapMmPerSecond);
  const [targetX, targetZ] = targetPlanarVelocity(player, profile, targetSpeed);
  const approached = approachPlanarVelocity(
    player.velocity.x,
    player.velocity.z,
    targetX,
    targetZ,
    profile.locomotion.airAccelerationMmPerSecondSquared,
    player.integrationRemainders.planarAcceleration,
    profile.simulationRateHz,
  );
  const nextSpeed = planarLength(approached.x, approached.z);
  const maximumSpeed = Math.max(currentSpeed, profile.locomotion.airSpeedCapMmPerSecond);
  if (nextSpeed <= maximumSpeed || nextSpeed === 0) return approached;
  return {
    x: roundDivideSigned(approached.x * maximumSpeed, nextSpeed),
    z: roundDivideSigned(approached.z * maximumSpeed, nextSpeed),
    remainder: approached.remainder,
  };
}

function updateSlideVelocity(
  player: MovementPlayerState,
  profile: MovementProfileV1,
): PlanarVelocityResult {
  let steered: PlanarVelocityResult = {
    x: player.velocity.x,
    z: player.velocity.z,
    remainder: player.integrationRemainders.planarAcceleration,
  };
  if (player.intent.moveX !== 0 || player.intent.moveZ !== 0) {
    const speed = planarLength(player.velocity.x, player.velocity.z);
    const [targetX, targetZ] = targetPlanarVelocity(player, profile, speed);
    steered = approachPlanarVelocity(
      player.velocity.x,
      player.velocity.z,
      targetX,
      targetZ,
      profile.slide.steeringAccelerationMmPerSecondSquared,
      steered.remainder,
      profile.simulationRateHz,
    );
  }
  return approachPlanarVelocity(
    steered.x,
    steered.z,
    0,
    0,
    profile.slide.frictionMmPerSecondSquared,
    steered.remainder,
    profile.simulationRateHz,
  );
}

function boostedSlideVelocity(
  velocity: Vector3MillimetersPerSecond,
  profile: MovementProfileV1,
): Vector3MillimetersPerSecond {
  const speed = planarLength(velocity.x, velocity.z);
  if (speed === 0) return velocity;
  const boostedSpeed = Math.min(
    profile.slide.maximumSpeedMmPerSecond,
    speed + profile.slide.entryBoostMmPerSecond,
  );
  return {
    x: asMillimetersPerSecond(roundDivideSigned(velocity.x * boostedSpeed, speed)),
    y: velocity.y,
    z: asMillimetersPerSecond(roundDivideSigned(velocity.z * boostedSpeed, speed)),
  };
}

function applyCommands(
  player: MovementPlayerState,
  commands: readonly PlayerIntentCommand[],
  profile: MovementProfileV1,
  tick: ReturnType<typeof asSimulationTick>,
  events: MovementSemanticEvent[],
): MovementPlayerState {
  let next: MovementPlayerState = {
    ...player,
    intent: { ...player.intent, pressedButtons: 0, releasedButtons: 0 },
  };
  let accepted = false;
  const ordered = [...commands].sort((left, right) => left.sequence - right.sequence);
  for (const command of ordered) {
    assertPlayerIntentCommand(command);
    if (command.sequence <= next.lastProcessedSequence) {
      events.push({
        kind: 'movement_intent_rejected',
        tick,
        entityId: player.id,
        sequence: command.sequence,
        reason: 'stale_sequence',
      });
      continue;
    }
    accepted = true;
    next = {
      ...next,
      yawMilliDegrees: normalizeYawMilliDegrees(
        next.yawMilliDegrees + command.lookYawDeltaMilliDegrees,
      ),
      pitchMilliDegrees: clampMilliDegrees(
        next.pitchMilliDegrees + command.lookPitchDeltaMilliDegrees,
        MOVEMENT_PITCH_MIN_MILLI_DEGREES,
        MOVEMENT_PITCH_MAX_MILLI_DEGREES,
      ),
      lastProcessedSequence: command.sequence,
      ticksSinceAcceptedCommand: 0,
      intent: {
        moveX: asQuantizedAxis(command.moveX),
        moveZ: asQuantizedAxis(command.moveZ),
        heldButtons: command.heldButtons,
        pressedButtons: (next.intent.pressedButtons | command.pressedButtons) >>> 0,
        releasedButtons: (next.intent.releasedButtons | command.releasedButtons) >>> 0,
        selectedSlot: command.selectedSlot ?? next.intent.selectedSlot,
      },
    };
    events.push({
      kind: 'movement_intent_applied',
      tick,
      entityId: player.id,
      sequence: command.sequence,
    });
  }

  if (accepted) return next;
  const ticksSinceAcceptedCommand = next.ticksSinceAcceptedCommand + 1;
  if (ticksSinceAcceptedCommand <= profile.locomotion.heldCommandReuseTicks) {
    return { ...next, ticksSinceAcceptedCommand };
  }
  const neutralIntent: MovementAppliedIntent = {
    ...next.intent,
    moveX: asQuantizedAxis(0),
    moveZ: asQuantizedAxis(0),
    heldButtons: 0,
  };
  return { ...next, ticksSinceAcceptedCommand, intent: neutralIntent };
}

function tryUpdateStance(
  player: MovementPlayerState,
  profile: MovementProfileV1,
  queries: MovementQueryPort,
  metrics: MutableQueryMetrics,
  tick: ReturnType<typeof asSimulationTick>,
  events: MovementSemanticEvent[],
): MovementPlayerState {
  if (player.locomotion === 'sliding') return { ...player, stance: 'crouched', standBlocked: false };
  const crouchHeld = (player.intent.heldButtons & INTENT_BUTTON.crouch) !== 0;
  if (crouchHeld) {
    if (player.stance === 'standing') {
      events.push({ kind: 'stance_changed', tick, entityId: player.id, stance: 'crouched' });
    }
    return { ...player, stance: 'crouched', standBlocked: false };
  }
  if (player.stance === 'standing') return { ...player, standBlocked: false };

  const overlap = recordOverlap(queries.overlapCapsule({
    feetPosition: player.feetPosition,
    shape: profile.standingShape,
    solidLayers: SOLID_MOVEMENT_LAYERS,
  }), metrics);
  if (overlap.blockingColliderIds.length > 0) {
    if (!player.standBlocked) {
      events.push({ kind: 'stand_blocked', tick, entityId: player.id });
    }
    return { ...player, standBlocked: true };
  }
  events.push({ kind: 'stance_changed', tick, entityId: player.id, stance: 'standing' });
  return { ...player, stance: 'standing', standBlocked: false };
}

function vectorLength3(value: Vector3Millimeters): number {
  const squared = value.x * value.x + value.y * value.y + value.z * value.z;
  assertSafeInteger(squared, '3D squared vector length');
  return integerSquareRootFloor(squared);
}

function addPosition(
  position: Vector3Millimeters,
  translation: Vector3Millimeters,
): Vector3Millimeters {
  return {
    x: asMillimeters(position.x + translation.x),
    y: asMillimeters(position.y + translation.y),
    z: asMillimeters(position.z + translation.z),
  };
}

function zeroTranslation(): Vector3Millimeters {
  return { x: asMillimeters(0), y: asMillimeters(0), z: asMillimeters(0) };
}

function volumeEntryExitEvents(
  previous: readonly MovementVolumeHit[],
  next: readonly MovementVolumeHit[],
  tick: ReturnType<typeof asSimulationTick>,
  entityId: MovementPlayerState['id'],
): MovementSemanticEvent[] {
  const previousById = new Map(previous.map((volume) => [volume.colliderId, volume]));
  const nextById = new Map(next.map((volume) => [volume.colliderId, volume]));
  const events: MovementSemanticEvent[] = [];
  for (const volume of next) {
    if (!previousById.has(volume.colliderId)) {
      events.push({
        kind: 'movement_volume_entered',
        tick,
        entityId,
        colliderId: volume.colliderId,
        volumeKind: volume.kind,
      });
    }
  }
  for (const volume of previous) {
    if (!nextById.has(volume.colliderId)) {
      events.push({
        kind: 'movement_volume_exited',
        tick,
        entityId,
        colliderId: volume.colliderId,
        volumeKind: volume.kind,
      });
    }
  }
  return events;
}

interface TeleportAttemptResult {
  readonly player: MovementPlayerState;
  readonly completed: boolean;
}

function attemptTeleport(
  player: MovementPlayerState,
  profile: MovementProfileV1,
  queries: MovementQueryPort,
  metrics: MutableQueryMetrics,
  tick: ReturnType<typeof asSimulationTick>,
  events: MovementSemanticEvent[],
): TeleportAttemptResult {
  if ((player.intent.pressedButtons & INTENT_BUTTON.utility) === 0) {
    return { player, completed: false };
  }
  if (player.teleportCooldownTicksRemaining > 0) {
    events.push({ kind: 'teleport_rejected', tick, entityId: player.id, reason: 'cooldown' });
    return { player, completed: false };
  }

  const shape = shapeForStance(profile, player.stance);
  const direction = lookDirectionQ15(player.yawMilliDegrees, player.pitchMilliDegrees);
  const requestedTranslation: Vector3Millimeters = {
    x: asMillimeters(scaleQ15(direction.x, profile.teleport.maximumRangeMm)),
    y: asMillimeters(scaleQ15(direction.y, profile.teleport.maximumRangeMm)),
    z: asMillimeters(scaleQ15(direction.z, profile.teleport.maximumRangeMm)),
  };
  const cast = recordCast(queries.castCapsule({
    feetPosition: player.feetPosition,
    shape,
    translation: requestedTranslation,
    contactSkin: profile.query.contactSkin,
    solidLayers: SOLID_MOVEMENT_LAYERS,
  }), metrics);
  const allowedDistance = vectorLength3(cast.allowedTranslation);
  if (allowedDistance > profile.teleport.maximumRangeMm + profile.query.contactSkin) {
    throw new RangeError('teleport cast returned translation beyond the requested range');
  }

  let rejectionReason: Extract<MovementSemanticEvent, { kind: 'teleport_rejected' }>['reason'] = 'blocked';
  for (let searchIndex = 0; searchIndex <= profile.teleport.maximumBackwardSearchSteps; searchIndex += 1) {
    const distance = Math.max(
      0,
      allowedDistance - searchIndex * profile.teleport.backwardSearchStepMm,
    );
    if (distance <= profile.query.contactSkin) break;
    const translation: Vector3Millimeters = searchIndex === 0
      ? cast.allowedTranslation
      : {
          x: asMillimeters(scaleQ15(direction.x, distance)),
          y: asMillimeters(scaleQ15(direction.y, distance)),
          z: asMillimeters(scaleQ15(direction.z, distance)),
        };
    let candidate = addPosition(player.feetPosition, translation);
    const overlap = recordOverlap(queries.overlapCapsule({
      feetPosition: candidate,
      shape,
      solidLayers: SOLID_MOVEMENT_LAYERS,
    }), metrics);
    if (overlap.blockingColliderIds.length > 0) continue;

    const groundProbe = recordMove(queries.moveCapsule({
      feetPosition: candidate,
      shape,
      desiredTranslation: zeroTranslation(),
      settings: profile.query,
      solidLayers: SOLID_MOVEMENT_LAYERS,
    }), metrics, profile.query.maximumContacts);
    candidate = addPosition(candidate, groundProbe.appliedTranslation);
    if (profile.teleport.requireGroundedDestination && !groundProbe.grounded) {
      rejectionReason = 'no_ground';
      continue;
    }

    const volumeResult = recordVolumes(queries.volumesAtCapsule({
      feetPosition: candidate,
      shape,
    }), metrics);
    if (volumeResult.volumes.some((volume) => volume.kind === 'kill')) {
      rejectionReason = 'kill_volume';
      continue;
    }
    if (volumeResult.volumes.some((volume) => volume.kind === 'forbidden')) {
      rejectionReason = 'forbidden_volume';
      continue;
    }

    const outcome = cast.hit === null && searchIndex === 0
      && distance >= profile.teleport.maximumRangeMm - profile.query.contactSkin
      ? 'full'
      : 'partial';
    events.push({
      kind: 'teleport_succeeded',
      tick,
      entityId: player.id,
      outcome,
      from: { ...player.feetPosition },
      to: { ...candidate },
    });
    events.push(...volumeEntryExitEvents(player.activeVolumes, volumeResult.volumes, tick, player.id));
    return {
      completed: true,
      player: {
        ...player,
        feetPosition: candidate,
        velocity: {
          x: asMillimetersPerSecond(roundDivideSigned(
            player.velocity.x * profile.teleport.retainPlanarVelocityPermille,
            1_000,
          )),
          y: asMillimetersPerSecond(roundDivideSigned(
            player.velocity.y * profile.teleport.retainVerticalVelocityPermille,
            1_000,
          )),
          z: asMillimetersPerSecond(roundDivideSigned(
            player.velocity.z * profile.teleport.retainPlanarVelocityPermille,
            1_000,
          )),
        },
        integrationRemainders: {
          positionX: 0,
          positionY: 0,
          positionZ: 0,
          planarAcceleration: 0,
          gravity: 0,
        },
        grounded: groundProbe.grounded,
        support: groundProbe.support,
        locomotion: groundProbe.grounded ? 'grounded' : 'airborne',
        coyoteTicksRemaining: groundProbe.grounded ? profile.locomotion.coyoteTicks : 0,
        jumpBufferTicksRemaining: 0,
        slideTicksRemaining: 0,
        teleportCooldownTicksRemaining: profile.teleport.cooldownTicks,
        activeVolumes: volumeResult.volumes,
      },
    };
  }

  events.push({ kind: 'teleport_rejected', tick, entityId: player.id, reason: rejectionReason });
  return {
    completed: false,
    player: profile.teleport.cooldownOnFailure
      ? { ...player, teleportCooldownTicksRemaining: profile.teleport.cooldownTicks }
      : player,
  };
}

function integrateVelocity(
  velocity: number,
  remainder: number,
  rateHz: number,
): readonly [number, number] {
  const numerator = velocity + remainder;
  assertSafeInteger(numerator, 'position integration numerator');
  const translation = Math.trunc(numerator / rateHz);
  return [translation, numerator - translation * rateHz];
}

function clipVelocity(
  velocity: Vector3MillimetersPerSecond,
  contacts: readonly MovementContact[],
  maximumSlopeClimbMilliDegrees: number,
  ignoreHorizontalStepFaces: boolean,
): Vector3MillimetersPerSecond {
  let x: number = velocity.x;
  let y: number = velocity.y;
  let z: number = velocity.z;
  const maximumSlope = sinCosMilliDegreesQ15(maximumSlopeClimbMilliDegrees);
  for (const contact of contacts) {
    const normal = contact.normalQ15;
    if (ignoreHorizontalStepFaces && Math.abs(normal.y) <= 4) continue;
    const dot = roundDivideSigned(
      x * normal.x + y * normal.y + z * normal.z,
      CONTACT_NORMAL_Q15_SCALE,
    );
    if (dot >= 0) continue;
    const horizontalNormalLength = planarLength(normal.x, normal.z);
    const upwardFacing = normal.y > 0;
    const walkable = upwardFacing && (
      horizontalNormalLength * maximumSlope.cosQ15
      <= normal.y * maximumSlope.sinQ15 + CONTACT_NORMAL_Q15_SCALE * 4
    );
    const fullyProjectedY = y - scaleQ15(normal.y, dot);
    if (upwardFacing && !walkable && (y >= 0 || fullyProjectedY > 0)) {
      // A non-walkable face behaves as a wall for horizontal motion. Full
      // projection would turn forward speed into an artificial upward launch.
      if (horizontalNormalLength > 0) {
        const horizontalNormalX = roundDivideSigned(
          normal.x * CONTACT_NORMAL_Q15_SCALE,
          horizontalNormalLength,
        );
        const horizontalNormalZ = roundDivideSigned(
          normal.z * CONTACT_NORMAL_Q15_SCALE,
          horizontalNormalLength,
        );
        const horizontalDot = roundDivideSigned(
          x * horizontalNormalX + z * horizontalNormalZ,
          CONTACT_NORMAL_Q15_SCALE,
        );
        if (horizontalDot < 0) {
          x -= scaleQ15(horizontalNormalX, horizontalDot);
          z -= scaleQ15(horizontalNormalZ, horizontalDot);
        }
      }
      continue;
    }
    x -= scaleQ15(normal.x, dot);
    y = fullyProjectedY;
    z -= scaleQ15(normal.z, dot);
  }
  return {
    x: asMillimetersPerSecond(x),
    y: asMillimetersPerSecond(y),
    z: asMillimetersPerSecond(z),
  };
}

export function stepMovementSimulation(
  state: MovementSimulationState,
  commands: readonly PlayerIntentCommand[],
  profile: MovementProfileV1,
  queries: MovementQueryPort,
): MovementStepResult {
  assertMovementProfile(profile);
  assertMovementSimulationState(state, profile);
  if (queries === null || typeof queries !== 'object') {
    throw new TypeError('movement query port must be an object');
  }
  for (const method of [
    'moveCapsule',
    'overlapCapsule',
    'castCapsule',
    'volumesAtCapsule',
  ] as const) {
    if (typeof queries[method] !== 'function') {
      throw new TypeError(`movement query port ${method} must be a function`);
    }
  }
  if (queries.schemaVersion !== MOVEMENT_QUERY_SCHEMA_VERSION) {
    throw new RangeError(`unsupported movement query schema: ${String(queries.schemaVersion)}`);
  }
  const nextTick = asSimulationTick(state.tick + 1);
  const events: MovementSemanticEvent[] = [];
  const metrics = createMetrics();
  let player = applyCommands(state.player, commands, profile, nextTick, events);
  player = {
    ...player,
    slideCooldownTicksRemaining: decrement(player.slideCooldownTicksRemaining),
    teleportCooldownTicksRemaining: decrement(player.teleportCooldownTicksRemaining),
  };
  player = tryUpdateStance(player, profile, queries, metrics, nextTick, events);

  const slidePressed = (player.intent.pressedButtons & INTENT_BUTTON.crouch) !== 0;
  const speedAtEntry = planarLength(player.velocity.x, player.velocity.z);
  if (
    slidePressed
    && player.locomotion !== 'sliding'
    && player.grounded
    && player.slideCooldownTicksRemaining === 0
    && speedAtEntry >= profile.slide.minimumEntrySpeedMmPerSecond
  ) {
    player = {
      ...player,
      stance: 'crouched',
      locomotion: 'sliding',
      velocity: boostedSlideVelocity(player.velocity, profile),
      slideTicksRemaining: profile.slide.durationTicks,
      standBlocked: false,
    };
    events.push({ kind: 'slide_started', tick: nextTick, entityId: player.id });
  }

  const teleport = attemptTeleport(player, profile, queries, metrics, nextTick, events);
  if (teleport.completed) {
    const nextState: MovementSimulationState = {
      ...state,
      tick: nextTick,
      player: teleport.player,
    };
    assertMovementSimulationState(nextState, profile);
    return { state: nextState, events, metrics };
  }
  player = teleport.player;

  let jumpBuffer = (player.intent.pressedButtons & INTENT_BUTTON.jump) !== 0
    ? profile.locomotion.jumpBufferTicks
    : player.jumpBufferTicksRemaining;
  let jumpedThisTick = false;
  if (
    jumpBuffer > 0
    && (player.grounded || player.coyoteTicksRemaining > 0)
    && player.locomotion !== 'sliding'
  ) {
    player = {
      ...player,
      velocity: { ...player.velocity, y: asMillimetersPerSecond(profile.locomotion.jumpImpulseMmPerSecond) },
      grounded: false,
      support: null,
      locomotion: 'airborne',
      coyoteTicksRemaining: 0,
    };
    jumpBuffer = 0;
    jumpedThisTick = true;
    events.push({ kind: 'jumped', tick: nextTick, entityId: player.id, buffered: false });
  }

  const planar = player.locomotion === 'sliding'
    ? updateSlideVelocity(player, profile)
    : updateNormalLocomotionVelocity(player, profile);
  let verticalVelocity: number = player.velocity.y;
  let gravityRemainder = player.integrationRemainders.gravity;
  if (!player.grounded) {
    const [gravityDelta, nextGravityRemainder] = accelerationPerTick(
      profile.locomotion.gravityMmPerSecondSquared,
      gravityRemainder,
      profile.simulationRateHz,
    );
    verticalVelocity = Math.max(
      -profile.locomotion.maximumFallSpeedMmPerSecond,
      verticalVelocity - gravityDelta,
    );
    gravityRemainder = nextGravityRemainder;
  } else if (verticalVelocity < 0) {
    verticalVelocity = 0;
    gravityRemainder = 0;
  }

  const supportVelocity = player.grounded && player.support
    ? player.support.velocity
    : { x: 0, y: 0, z: 0 };
  const [translationX, positionRemainderX] = integrateVelocity(
    planar.x + supportVelocity.x,
    player.integrationRemainders.positionX,
    profile.simulationRateHz,
  );
  const [translationY, positionRemainderY] = integrateVelocity(
    verticalVelocity + supportVelocity.y,
    player.integrationRemainders.positionY,
    profile.simulationRateHz,
  );
  const [translationZ, positionRemainderZ] = integrateVelocity(
    planar.z + supportVelocity.z,
    player.integrationRemainders.positionZ,
    profile.simulationRateHz,
  );
  const desiredTranslation: Vector3Millimeters = {
    x: asMillimeters(translationX),
    y: asMillimeters(translationY),
    z: asMillimeters(translationZ),
  };
  const shape = shapeForStance(profile, player.stance);
  const move = recordMove(queries.moveCapsule({
    feetPosition: player.feetPosition,
    shape,
    desiredTranslation,
    settings: profile.query,
    solidLayers: SOLID_MOVEMENT_LAYERS,
  }), metrics, profile.query.maximumContacts);

  const impactSpeed = Math.max(0, -verticalVelocity);
  const boundedUpwardStep = move.grounded
    && move.appliedTranslation.x === desiredTranslation.x
    && move.appliedTranslation.z === desiredTranslation.z
    && move.appliedTranslation.y > desiredTranslation.y
    && move.appliedTranslation.y - desiredTranslation.y
      <= profile.query.maxStepHeight + profile.query.contactSkin;
  let velocity = clipVelocity({
    x: asMillimetersPerSecond(planar.x),
    y: asMillimetersPerSecond(verticalVelocity),
    z: asMillimetersPerSecond(planar.z),
  }, move.contacts, profile.query.maximumSlopeClimb, boundedUpwardStep);
  if (move.hitCeiling && verticalVelocity > 0) {
    velocity = { ...velocity, y: asMillimetersPerSecond(0) };
    events.push({ kind: 'hit_ceiling', tick: nextTick, entityId: player.id });
  }
  if (move.grounded && velocity.y < 0) velocity = { ...velocity, y: asMillimetersPerSecond(0) };
  const landed = !player.grounded && move.grounded;
  if (landed) {
    events.push({ kind: 'landed', tick: nextTick, entityId: player.id, impactSpeedMmPerSecond: impactSpeed });
  }

  let slideTicksRemaining = player.slideTicksRemaining;
  let slideCooldownTicksRemaining = player.slideCooldownTicksRemaining;
  let locomotion = player.locomotion;
  if (locomotion === 'sliding') {
    slideTicksRemaining = decrement(slideTicksRemaining);
    const slideEndReason = !move.grounded
      ? 'airborne'
      : slideTicksRemaining === 0
        ? 'duration'
        : null;
    if (slideEndReason) {
      locomotion = move.grounded ? 'grounded' : 'airborne';
      slideTicksRemaining = 0;
      slideCooldownTicksRemaining = profile.slide.cooldownTicks;
      events.push({ kind: 'slide_ended', tick: nextTick, entityId: player.id, reason: slideEndReason });
    }
  } else {
    locomotion = move.grounded ? 'grounded' : 'airborne';
  }

  let grounded = move.grounded;
  let support = move.support;
  let coyoteTicksRemaining = grounded
    ? profile.locomotion.coyoteTicks
    : jumpedThisTick
      ? 0
      : player.grounded
        ? profile.locomotion.coyoteTicks
        : decrement(player.coyoteTicksRemaining);
  if (landed && jumpBuffer > 0 && locomotion !== 'sliding') {
    velocity = { ...velocity, y: asMillimetersPerSecond(profile.locomotion.jumpImpulseMmPerSecond) };
    grounded = false;
    support = null;
    locomotion = 'airborne';
    coyoteTicksRemaining = 0;
    jumpBuffer = 0;
    events.push({ kind: 'jumped', tick: nextTick, entityId: player.id, buffered: true });
  } else if (jumpBuffer > 0) {
    jumpBuffer = decrement(jumpBuffer);
  }

  const feetPosition = addPosition(player.feetPosition, move.appliedTranslation);
  const volumeResult = recordVolumes(queries.volumesAtCapsule({ feetPosition, shape }), metrics);
  events.push(...volumeEntryExitEvents(player.activeVolumes, volumeResult.volumes, nextTick, player.id));
  player = {
    ...player,
    feetPosition,
    velocity,
    integrationRemainders: {
      positionX: move.appliedTranslation.x === desiredTranslation.x ? positionRemainderX : 0,
      positionY: move.appliedTranslation.y === desiredTranslation.y ? positionRemainderY : 0,
      positionZ: move.appliedTranslation.z === desiredTranslation.z ? positionRemainderZ : 0,
      planarAcceleration: planar.remainder,
      gravity: gravityRemainder,
    },
    grounded,
    support,
    locomotion,
    coyoteTicksRemaining,
    jumpBufferTicksRemaining: jumpBuffer,
    slideTicksRemaining,
    slideCooldownTicksRemaining,
    activeVolumes: volumeResult.volumes,
  };

  const nextState: MovementSimulationState = { ...state, tick: nextTick, player };
  assertMovementSimulationState(nextState, profile);
  return { state: nextState, events, metrics };
}
