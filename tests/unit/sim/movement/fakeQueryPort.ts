import {
  CONTACT_NORMAL_Q15_SCALE,
  INTENT_BUTTON,
  MOVEMENT_QUERY_SCHEMA_VERSION,
  PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
  asMillimeters,
  asMillimetersPerSecond,
  asQuantizedAxis,
  asSimulationTick,
  createMovementSimulationState,
  type CapsuleCastRequest,
  type CapsuleCastResult,
  type CapsuleMoveRequest,
  type CapsuleMoveResult,
  type CapsuleOverlapRequest,
  type CapsuleOverlapResult,
  type CapsuleVolumeRequest,
  type CapsuleVolumeResult,
  type CreateMovementSimulationStateOptions,
  type MovementContact,
  type MovementProfileV1,
  type MovementQueryPort,
  type MovementSimulationState,
  type MovementSupport,
  type PlayerIntentCommand,
  type Vector3Millimeters,
} from '../../../../src/sim';

export const TEST_FIXTURE_HASH = '1111111111111111';
export const TEST_RULESET_HASH = '2222222222222222';

export function millimeterVector(x: number, y: number, z: number): Vector3Millimeters {
  return { x: asMillimeters(x), y: asMillimeters(y), z: asMillimeters(z) };
}

export function testIntent(
  sequence: number,
  clientTick: number,
  overrides: Partial<Omit<PlayerIntentCommand, 'kind' | 'sequence' | 'clientTick'>> = {},
): PlayerIntentCommand {
  return {
    kind: 'player_intent',
    sequence,
    clientTick: asSimulationTick(clientTick),
    moveX: asQuantizedAxis(0),
    moveZ: asQuantizedAxis(0),
    lookYawDeltaMilliDegrees: 0,
    lookPitchDeltaMilliDegrees: 0,
    heldButtons: 0,
    pressedButtons: 0,
    releasedButtons: 0,
    ...overrides,
  };
}

export function crouchIntent(sequence: number, tick: number): PlayerIntentCommand {
  return testIntent(sequence, tick, {
    heldButtons: INTENT_BUTTON.crouch,
    pressedButtons: INTENT_BUTTON.crouch,
  });
}

export function createTestMovementState(
  overrides: Partial<CreateMovementSimulationStateOptions> = {},
  profile: MovementProfileV1 = PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
): MovementSimulationState {
  return createMovementSimulationState(profile, {
    rulesetId: 'test_rules',
    rulesetRevision: 1,
    rulesetHash: TEST_RULESET_HASH,
    fixtureId: 'test_fixture',
    fixtureHash: TEST_FIXTURE_HASH,
    physicsAdapterId: 'fake_query_port',
    physicsAdapterVersion: '1.0.0',
    ...overrides,
  });
}

export interface FakeMovementQueryOptions {
  readonly floorY?: number;
  readonly ceilingY?: number | null;
  readonly maximumX?: number | null;
  readonly minimumX?: number | null;
  readonly maximumZ?: number | null;
  readonly minimumZ?: number | null;
  readonly standingBlocked?: boolean;
  readonly supportVelocity?: Readonly<{ x: number; y: number; z: number }>;
  readonly move?: (request: CapsuleMoveRequest) => CapsuleMoveResult;
  readonly overlap?: (request: CapsuleOverlapRequest) => readonly string[];
  readonly cast?: (request: CapsuleCastRequest) => CapsuleCastResult;
  readonly volumes?: (request: CapsuleVolumeRequest) => CapsuleVolumeResult['volumes'];
}

function contact(
  colliderId: string,
  x: number,
  y: number,
  z: number,
): MovementContact {
  return {
    colliderId,
    layer: 'world_static',
    normalQ15: { x, y, z },
    timeOfImpactPermille: 500,
  };
}

export class FakeMovementQueryPort implements MovementQueryPort {
  readonly schemaVersion = MOVEMENT_QUERY_SCHEMA_VERSION;
  readonly moveRequests: CapsuleMoveRequest[] = [];
  readonly overlapRequests: CapsuleOverlapRequest[] = [];
  readonly castRequests: CapsuleCastRequest[] = [];
  readonly volumeRequests: CapsuleVolumeRequest[] = [];

  constructor(private readonly options: FakeMovementQueryOptions = {}) {}

  moveCapsule(request: CapsuleMoveRequest): CapsuleMoveResult {
    this.moveRequests.push(request);
    if (this.options.move) return this.options.move(request);

    const floorY = this.options.floorY ?? 0;
    let x: number = request.desiredTranslation.x;
    let y: number = request.desiredTranslation.y;
    let z: number = request.desiredTranslation.z;
    let grounded = false;
    let hitCeiling = false;
    const contacts: MovementContact[] = [];

    const targetY = request.feetPosition.y + y;
    if (
      request.desiredTranslation.y <= 0
      && targetY <= floorY + request.settings.snapToGroundDistance
    ) {
      y = floorY - request.feetPosition.y;
      grounded = true;
    }

    const ceilingY = this.options.ceilingY ?? null;
    if (
      ceilingY !== null
      && request.feetPosition.y + y + request.shape.height > ceilingY
    ) {
      y = ceilingY - request.shape.height - request.feetPosition.y;
      hitCeiling = true;
      grounded = false;
      contacts.push(contact('ceiling', 0, -CONTACT_NORMAL_Q15_SCALE, 0));
    }

    const maximumX = this.options.maximumX ?? null;
    if (maximumX !== null && request.feetPosition.x + x > maximumX) {
      x = maximumX - request.feetPosition.x;
      contacts.push(contact('wall_x_max', -CONTACT_NORMAL_Q15_SCALE, 0, 0));
    }
    const minimumX = this.options.minimumX ?? null;
    if (minimumX !== null && request.feetPosition.x + x < minimumX) {
      x = minimumX - request.feetPosition.x;
      contacts.push(contact('wall_x_min', CONTACT_NORMAL_Q15_SCALE, 0, 0));
    }
    const maximumZ = this.options.maximumZ ?? null;
    if (maximumZ !== null && request.feetPosition.z + z > maximumZ) {
      z = maximumZ - request.feetPosition.z;
      contacts.push(contact('wall_z_max', 0, 0, -CONTACT_NORMAL_Q15_SCALE));
    }
    const minimumZ = this.options.minimumZ ?? null;
    if (minimumZ !== null && request.feetPosition.z + z < minimumZ) {
      z = minimumZ - request.feetPosition.z;
      contacts.push(contact('wall_z_min', 0, 0, CONTACT_NORMAL_Q15_SCALE));
    }

    const support: MovementSupport | null = grounded
      ? {
          colliderId: 'floor',
          layer: 'world_static',
          normalQ15: { x: 0, y: CONTACT_NORMAL_Q15_SCALE, z: 0 },
          velocity: {
            x: asMillimetersPerSecond(this.options.supportVelocity?.x ?? 0),
            y: asMillimetersPerSecond(this.options.supportVelocity?.y ?? 0),
            z: asMillimetersPerSecond(this.options.supportVelocity?.z ?? 0),
          },
        }
      : null;
    return {
      appliedTranslation: millimeterVector(x, y, z),
      grounded,
      hitCeiling,
      support,
      contacts,
      shapeCasts: 1,
      overlapTests: 0,
    };
  }

  overlapCapsule(request: CapsuleOverlapRequest): CapsuleOverlapResult {
    this.overlapRequests.push(request);
    const blockingColliderIds = this.options.overlap
      ? this.options.overlap(request)
      : this.options.standingBlocked
        && request.shape.height === PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape.height
        ? ['low_ceiling']
        : [];
    return { blockingColliderIds, overlapTests: 1 };
  }

  castCapsule(request: CapsuleCastRequest): CapsuleCastResult {
    this.castRequests.push(request);
    if (this.options.cast) return this.options.cast(request);
    return {
      allowedTranslation: { ...request.translation },
      hit: null,
      shapeCasts: 1,
    };
  }

  volumesAtCapsule(request: CapsuleVolumeRequest): CapsuleVolumeResult {
    this.volumeRequests.push(request);
    return {
      volumes: this.options.volumes?.(request) ?? [],
      overlapTests: 1,
    };
  }
}
