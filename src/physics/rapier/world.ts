import type {
  Collider,
  KinematicCharacterController,
  World,
} from '@dimforge/rapier3d-deterministic-compat';
import {
  CONTACT_NORMAL_Q15_SCALE,
  MOVEMENT_QUERY_SCHEMA_VERSION,
  type CapsuleCastRequest,
  type CapsuleCastResult,
  type CapsuleMoveRequest,
  type CapsuleMoveResult,
  type CapsuleOverlapRequest,
  type CapsuleOverlapResult,
  type CapsuleShapeMillimeters,
  type CapsuleVolumeRequest,
  type CapsuleVolumeResult,
  type ContactNormalQ15,
  type MovementCollisionLayer,
  type MovementContact,
  type MovementQueryPort,
  type MovementSupport,
  type MovementVolumeKind,
  type Vector3Millimeters,
  type Vector3MillimetersPerSecond,
} from '../../sim/movement/queryPort';
import {
  asMillimeters,
  asMillimetersPerSecond,
} from '../../sim/units';
import {
  ALL_COLLISION_LAYER_BITS,
  collisionGroupsForLayer,
  queryCollisionGroups,
} from '../collisionLayers';
import {
  MILLIMETERS_PER_RAPIER_UNIT,
  hashPhysicsFixture,
  loadPhysicsFixture,
  type FixtureRotationMilliDegrees,
  type FixtureSolidShapeV1,
  type FixtureVector3Millimeters,
  type PhysicsFixtureV1,
} from '../fixtureSchema';
import type { RapierRuntime } from './contracts';

const IDENTITY_ROTATION = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });
const MAX_QUERY_CONTACTS = 32;
const MAX_OVERLAP_RESULTS = 32;
const MAX_VOLUME_RESULTS = 16;
const MINIMUM_CONTROLLER_OFFSET_RAPIER_UNITS = 0.000_001;
const STRICT_OVERLAP_INSET_MM = 0.5;
const MATERIAL_VERTICAL_CLIP_MM = 2;
const FLAT_MICRO_CORRECTION_TOLERANCE_MM = 25;
// cos(5 degrees) in Q15: narrow enough to preserve authored 45/50-degree ramps.
const AXIS_NORMAL_SNAP_Q15 = 32_642;
const SLOPE_NORMAL_TOLERANCE_Q15 = 64;
const MAX_DEPENETRATION_ITERATIONS = 8;
const MAX_DEPENETRATION_DISTANCE_MM = 5_000;
const BOX_FACE_SNAP_MINIMUM_DOT = 0.875;
const SUPPORT_FACE_MINIMUM_DOT = 0.4;
const SOLID_LAYER_SET = new Set<MovementCollisionLayer>([
  'world_static',
  'dynamic_platform',
  'player_body',
  'door',
  'spawn_barrier',
]);
const VOLUME_LAYER_SET = new Set<MovementCollisionLayer>([
  'kill_volume',
  'forbidden_volume',
  'recovery_volume',
]);

interface ColliderMetadata {
  readonly id: string;
  readonly layer: MovementCollisionLayer;
  readonly sensor: boolean;
  readonly volumeKind: MovementVolumeKind | null;
  readonly velocityMmPerSecond: FixtureVector3Millimeters;
  readonly boxFaceNormals: readonly ContactNormalQ15[] | null;
  readonly supportNormalQ15: ContactNormalQ15 | null;
}

interface FixtureCollider {
  readonly collider: Collider;
  readonly metadata: ColliderMetadata;
}

interface DepenetrationResult {
  readonly center: { readonly x: number; readonly y: number; readonly z: number };
  readonly correction: Vector3Millimeters;
  readonly contacts: readonly MovementContact[];
  readonly overlapTests: number;
}

export interface RapierSolidRayCastRequest {
  readonly originMillimeters: Readonly<{ readonly x: number; readonly y: number; readonly z: number }>;
  readonly directionUnit: Readonly<{ readonly x: number; readonly y: number; readonly z: number }>;
  readonly maximumDistanceMillimeters: number;
  readonly solidLayers: readonly MovementCollisionLayer[];
  /** Treat a ray origin inside a collider as an immediate hit when true. */
  readonly solid: boolean;
}

export interface RapierSolidRayCastResult {
  readonly hit: Readonly<{
    readonly colliderId: string;
    readonly layer: MovementCollisionLayer;
    readonly distanceMillimeters: number;
  }> | null;
  readonly rayCasts: number;
}

function roundSymmetric(value: number): number {
  if (!Number.isFinite(value)) throw new Error('PHYSICS_NON_FINITE_RESULT');
  if (value === 0) return 0;
  const rounded = Math.sign(value) * Math.floor(Math.abs(value) + 0.5);
  if (!Number.isSafeInteger(rounded)) throw new Error('PHYSICS_RESULT_OUT_OF_RANGE');
  return Object.is(rounded, -0) ? 0 : rounded;
}

function mmToRapier(value: number): number {
  return value / MILLIMETERS_PER_RAPIER_UNIT;
}

function rapierToMillimeters(value: number): number {
  return roundSymmetric(value * MILLIMETERS_PER_RAPIER_UNIT);
}

function vectorMmToRapier(value: { readonly x: number; readonly y: number; readonly z: number }) {
  return { x: mmToRapier(value.x), y: mmToRapier(value.y), z: mmToRapier(value.z) };
}

function vectorRapierToMillimeters(value: { readonly x: number; readonly y: number; readonly z: number }): Vector3Millimeters {
  return Object.freeze({
    x: asMillimeters(rapierToMillimeters(value.x)),
    y: asMillimeters(rapierToMillimeters(value.y)),
    z: asMillimeters(rapierToMillimeters(value.z)),
  });
}

function vectorToVelocity(value: FixtureVector3Millimeters): Vector3MillimetersPerSecond {
  return Object.freeze({
    x: asMillimetersPerSecond(value.x),
    y: asMillimetersPerSecond(value.y),
    z: asMillimetersPerSecond(value.z),
  });
}

function quantizeNormal(value: { readonly x: number; readonly y: number; readonly z: number }): ContactNormalQ15 {
  const magnitude = Math.hypot(value.x, value.y, value.z);
  if (!Number.isFinite(magnitude) || magnitude <= 0) return Object.freeze({ x: 0, y: 0, z: 0 });
  const component = (scalar: number) => roundSymmetric(
    Math.max(-1, Math.min(1, scalar / magnitude)) * CONTACT_NORMAL_Q15_SCALE,
  );
  const quantized = { x: component(value.x), y: component(value.y), z: component(value.z) };
  for (const axis of ['x', 'y', 'z'] as const) {
    if (Math.abs(quantized[axis]) >= AXIS_NORMAL_SNAP_Q15) {
      return Object.freeze({
        x: axis === 'x' ? Math.sign(quantized.x) * CONTACT_NORMAL_Q15_SCALE : 0,
        y: axis === 'y' ? Math.sign(quantized.y) * CONTACT_NORMAL_Q15_SCALE : 0,
        z: axis === 'z' ? Math.sign(quantized.z) * CONTACT_NORMAL_Q15_SCALE : 0,
      });
    }
  }
  return Object.freeze(quantized);
}

function quantizePermille(value: number): number {
  return Math.max(0, Math.min(1_000, roundSymmetric(value * 1_000)));
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function horizontalBlockingNormal(normal: ContactNormalQ15): ContactNormalQ15 {
  const magnitude = Math.hypot(normal.x, normal.z);
  if (magnitude <= 0) return normal;
  return Object.freeze({
    x: roundSymmetric((normal.x / magnitude) * CONTACT_NORMAL_Q15_SCALE),
    y: 0,
    z: roundSymmetric((normal.z / magnitude) * CONTACT_NORMAL_Q15_SCALE),
  });
}

function scaleTranslationPermille(
  translation: Vector3Millimeters,
  permille: number,
): Vector3Millimeters {
  return Object.freeze({
    x: asMillimeters(roundSymmetric((translation.x * permille) / 1_000)),
    y: asMillimeters(roundSymmetric((translation.y * permille) / 1_000)),
    z: asMillimeters(roundSymmetric((translation.z * permille) / 1_000)),
  });
}

function rotationToQuaternion(rotation: FixtureRotationMilliDegrees) {
  const x = (rotation.x / 1_000) * (Math.PI / 180) * 0.5;
  const y = (rotation.y / 1_000) * (Math.PI / 180) * 0.5;
  const z = (rotation.z / 1_000) * (Math.PI / 180) * 0.5;
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cz = Math.cos(z);
  const sz = Math.sin(z);
  return {
    x: sx * cy * cz - cx * sy * sz,
    y: cx * sy * cz + sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz,
    w: cx * cy * cz + sx * sy * sz,
  };
}

function rotateVectorByQuaternion(
  vector: { readonly x: number; readonly y: number; readonly z: number },
  quaternion: { readonly x: number; readonly y: number; readonly z: number; readonly w: number },
) {
  const dot = quaternion.x * vector.x + quaternion.y * vector.y + quaternion.z * vector.z;
  const crossX = quaternion.y * vector.z - quaternion.z * vector.y;
  const crossY = quaternion.z * vector.x - quaternion.x * vector.z;
  const crossZ = quaternion.x * vector.y - quaternion.y * vector.x;
  return {
    x: 2 * dot * quaternion.x + (quaternion.w * quaternion.w
      - quaternion.x * quaternion.x - quaternion.y * quaternion.y - quaternion.z * quaternion.z)
      * vector.x + 2 * quaternion.w * crossX,
    y: 2 * dot * quaternion.y + (quaternion.w * quaternion.w
      - quaternion.x * quaternion.x - quaternion.y * quaternion.y - quaternion.z * quaternion.z)
      * vector.y + 2 * quaternion.w * crossY,
    z: 2 * dot * quaternion.z + (quaternion.w * quaternion.w
      - quaternion.x * quaternion.x - quaternion.y * quaternion.y - quaternion.z * quaternion.z)
      * vector.z + 2 * quaternion.w * crossZ,
  };
}

function boxFaceNormals(
  quaternion: { readonly x: number; readonly y: number; readonly z: number; readonly w: number },
): readonly ContactNormalQ15[] {
  return Object.freeze([
    { x: 1, y: 0, z: 0 },
    { x: -1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: -1, z: 0 },
    { x: 0, y: 0, z: 1 },
    { x: 0, y: 0, z: -1 },
  ].map((axis) => quantizeNormal(rotateVectorByQuaternion(axis, quaternion))));
}

function quantizeColliderNormal(
  value: { readonly x: number; readonly y: number; readonly z: number },
  metadata: ColliderMetadata,
): ContactNormalQ15 {
  const quantized = quantizeNormal(value);
  if (!metadata.boxFaceNormals) return quantized;
  const magnitude = Math.hypot(value.x, value.y, value.z);
  if (!Number.isFinite(magnitude) || magnitude <= 0) return quantized;
  let best: ContactNormalQ15 | null = null;
  let bestDot = -Infinity;
  for (const candidate of metadata.boxFaceNormals) {
    const dot = (
      value.x * candidate.x + value.y * candidate.y + value.z * candidate.z
    ) / (magnitude * CONTACT_NORMAL_Q15_SCALE);
    if (dot > bestDot) {
      best = candidate;
      bestDot = dot;
    }
  }
  // A 29-degree cone is wide enough for Rapier's observed flat-face GJK noise,
  // but preserves genuine edge/corner normals and distinct 45/50-degree ramps.
  return best && bestDot >= BOX_FACE_SNAP_MINIMUM_DOT ? best : quantized;
}

function supportNormalForCollider(
  value: { readonly x: number; readonly y: number; readonly z: number },
  metadata: ColliderMetadata,
): ContactNormalQ15 | null {
  if (!metadata.supportNormalQ15) return quantizeColliderNormal(value, metadata);
  const magnitude = Math.hypot(value.x, value.y, value.z);
  if (!Number.isFinite(magnitude) || magnitude <= 0) return null;
  const dot = (
    value.x * metadata.supportNormalQ15.x
    + value.y * metadata.supportNormalQ15.y
    + value.z * metadata.supportNormalQ15.z
  ) / (magnitude * CONTACT_NORMAL_Q15_SCALE);
  return dot >= SUPPORT_FACE_MINIMUM_DOT ? metadata.supportNormalQ15 : null;
}

function assertVector(value: Vector3Millimeters, label: string): void {
  for (const axis of ['x', 'y', 'z'] as const) {
    if (!Number.isSafeInteger(value[axis])) throw new RangeError(`${label}.${axis} must be a safe integer`);
  }
}

function assertFiniteVector(
  value: Readonly<{ readonly x: number; readonly y: number; readonly z: number }>,
  label: string,
): void {
  if (value === null || typeof value !== 'object') throw new TypeError(`${label} must be a vector`);
  for (const axis of ['x', 'y', 'z'] as const) {
    if (!Number.isFinite(value[axis])) throw new RangeError(`${label}.${axis} must be finite`);
  }
}

function assertDirectionUnit(
  value: Readonly<{ readonly x: number; readonly y: number; readonly z: number }>,
): void {
  assertFiniteVector(value, 'directionUnit');
  const magnitude = Math.hypot(value.x, value.y, value.z);
  if (Math.abs(magnitude - 1) > 0.000_001) {
    throw new RangeError('directionUnit must have unit length');
  }
}

function assertShape(shape: CapsuleShapeMillimeters): void {
  if (!Number.isSafeInteger(shape.height) || !Number.isSafeInteger(shape.radius)
    || shape.radius <= 0 || shape.height < shape.radius * 2) {
    throw new RangeError('capsule shape requires integer height >= diameter and positive radius');
  }
}

function assertIntegerRange(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
}

function assertMoveSettings(settings: CapsuleMoveRequest['settings']): void {
  assertIntegerRange(settings.contactSkin, 0, 1_000, 'contactSkin');
  assertIntegerRange(settings.maxStepHeight, 0, 5_000, 'maxStepHeight');
  assertIntegerRange(settings.minimumStepWidth, 0, 10_000, 'minimumStepWidth');
  assertIntegerRange(settings.snapToGroundDistance, 0, 5_000, 'snapToGroundDistance');
  assertIntegerRange(settings.maximumSlopeClimb, 0, 89_999, 'maximumSlopeClimb');
  assertIntegerRange(settings.minimumSlopeSlide, 0, 89_999, 'minimumSlopeSlide');
  assertIntegerRange(settings.maximumContacts, 1, MAX_QUERY_CONTACTS, 'maximumContacts');
  if (typeof settings.allowDynamicBodyAutostep !== 'boolean') {
    throw new TypeError('allowDynamicBodyAutostep must be a boolean');
  }
}

function assertLayers(layers: readonly MovementCollisionLayer[], allowVolumes: boolean): void {
  if (!Array.isArray(layers) || layers.length > 8 || new Set(layers).size !== layers.length) {
    throw new RangeError('collision layers must be a unique bounded array');
  }
  const supported = allowVolumes ? VOLUME_LAYER_SET : SOLID_LAYER_SET;
  if (layers.some((layer) => !supported.has(layer))) {
    throw new RangeError('collision layer is not valid for this query');
  }
}

function capsuleCenter(feet: Vector3Millimeters, shape: CapsuleShapeMillimeters) {
  return {
    x: mmToRapier(feet.x),
    y: mmToRapier(feet.y + shape.height / 2),
    z: mmToRapier(feet.z),
  };
}

function zeroTranslation(): Vector3Millimeters {
  return Object.freeze({
    x: asMillimeters(0),
    y: asMillimeters(0),
    z: asMillimeters(0),
  });
}

export class RapierMovementWorld implements MovementQueryPort {
  readonly schemaVersion = MOVEMENT_QUERY_SCHEMA_VERSION;
  readonly fixture: PhysicsFixtureV1;
  readonly fixtureHash: string;
  readonly runtime: RapierRuntime;

  private readonly world: World;
  private readonly controller: KinematicCharacterController;
  private readonly characterCollider: Collider;
  private readonly metadata = new Map<number, ColliderMetadata>();
  private isDisposed = false;

  private constructor(runtime: RapierRuntime, fixture: PhysicsFixtureV1) {
    this.runtime = runtime;
    this.fixture = fixture;
    this.fixtureHash = hashPhysicsFixture(fixture);
    const RAPIER = runtime.module;
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    this.world.timestep = 1 / 20;
    this.world.lengthUnit = 1;
    this.world.numSolverIterations = 4;
    this.world.numInternalPgsIterations = 1;
    this.world.maxCcdSubsteps = 1;

    for (const solid of fixture.solids) {
      const rotation = rotationToQuaternion(solid.rotationMilliDegrees);
      const descriptor = this.colliderDescriptor(solid.shape)
        .setRotation(rotation)
        .setFriction(0)
        .setRestitution(0)
        .setCollisionGroups(collisionGroupsForLayer(solid.layer));
      let collider: Collider;
      if (solid.body === 'kinematic') {
        const center = vectorMmToRapier(solid.centerMm);
        const body = this.world.createRigidBody(
          RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(center.x, center.y, center.z),
        );
        collider = this.world.createCollider(descriptor, body);
      } else {
        const center = vectorMmToRapier(solid.centerMm);
        collider = this.world.createCollider(descriptor.setTranslation(center.x, center.y, center.z));
      }
      this.metadata.set(collider.handle, Object.freeze({
        id: solid.id,
        layer: solid.layer,
        sensor: false,
        volumeKind: null,
        velocityMmPerSecond: solid.velocityMmPerSecond,
        boxFaceNormals: solid.shape.type === 'box' ? boxFaceNormals(rotation) : null,
        supportNormalQ15: solid.shape.type === 'box'
          ? quantizeNormal(rotateVectorByQuaternion({ x: 0, y: 1, z: 0 }, rotation))
          : null,
      }));
    }

    for (const volume of fixture.volumes) {
      const center = vectorMmToRapier(volume.centerMm);
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(
          mmToRapier(volume.shape.halfExtentsMm.x),
          mmToRapier(volume.shape.halfExtentsMm.y),
          mmToRapier(volume.shape.halfExtentsMm.z),
        )
          .setTranslation(center.x, center.y, center.z)
          .setRotation(rotationToQuaternion(volume.rotationMilliDegrees))
          .setSensor(true)
          .setCollisionGroups(collisionGroupsForLayer(volume.layer)),
      );
      this.metadata.set(collider.handle, Object.freeze({
        id: volume.id,
        layer: volume.layer,
        sensor: true,
        volumeKind: volume.kind,
        velocityMmPerSecond: Object.freeze({ x: 0, y: 0, z: 0 }),
        boxFaceNormals: null,
        supportNormalQ15: null,
      }));
    }

    this.characterCollider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(0.5, 0.35)
        .setTranslation(0, 1, 0)
        .setCollisionGroups(((ALL_COLLISION_LAYER_BITS & 0xffff) << 16) | ALL_COLLISION_LAYER_BITS),
    );
    this.controller = this.world.createCharacterController(0.02);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.setSlideEnabled(true);
    this.controller.setApplyImpulsesToDynamicBodies(false);
    this.world.step();
  }

  static createWithRuntime(input: unknown, runtime: RapierRuntime): RapierMovementWorld {
    const fixture = loadPhysicsFixture(input);
    if (runtime.version !== '0.19.3') throw new Error('PHYSICS_RAPIER_VERSION_MISMATCH');
    return new RapierMovementWorld(runtime, fixture);
  }

  get disposed(): boolean {
    return this.isDisposed;
  }

  private assertActive(): void {
    if (this.isDisposed) throw new Error('PHYSICS_WORLD_DISPOSED');
  }

  private colliderDescriptor(shape: FixtureSolidShapeV1) {
    const RAPIER = this.runtime.module;
    if (shape.type === 'box') {
      return RAPIER.ColliderDesc.cuboid(
        mmToRapier(shape.halfExtentsMm.x),
        mmToRapier(shape.halfExtentsMm.y),
        mmToRapier(shape.halfExtentsMm.z),
      );
    }
    return RAPIER.ColliderDesc.capsule(
      mmToRapier(shape.heightMm / 2 - shape.radiusMm),
      mmToRapier(shape.radiusMm),
    );
  }

  private capsuleShape(shape: CapsuleShapeMillimeters, radiusInsetMm = 0) {
    assertShape(shape);
    return new this.runtime.module.Capsule(
      mmToRapier(shape.height / 2 - shape.radius),
      mmToRapier(shape.radius - radiusInsetMm),
    );
  }

  private metadataFor(collider: Collider): ColliderMetadata | undefined {
    return this.metadata.get(collider.handle);
  }

  private solidPredicate(layers: readonly MovementCollisionLayer[]) {
    const allowed = new Set(layers);
    return (collider: Collider): boolean => {
      const metadata = this.metadataFor(collider);
      return metadata !== undefined && !metadata.sensor && allowed.has(metadata.layer);
    };
  }

  private orderedSolidColliders(layers: readonly MovementCollisionLayer[]): readonly FixtureCollider[] {
    const predicate = this.solidPredicate(layers);
    const colliders: FixtureCollider[] = [];
    this.world.forEachCollider((collider) => {
      if (!predicate(collider)) return;
      const metadata = this.metadataFor(collider);
      if (metadata) colliders.push({ collider, metadata });
    });
    colliders.sort((left, right) => compareCodeUnits(left.metadata.id, right.metadata.id));
    return colliders;
  }

  private depenetrateCapsule(
    feetPosition: Vector3Millimeters,
    shape: CapsuleShapeMillimeters,
    layers: readonly MovementCollisionLayer[],
  ): DepenetrationResult {
    const colliders = this.orderedSolidColliders(layers);
    const fullShape = this.capsuleShape(shape);
    const strictShape = this.capsuleShape(shape, STRICT_OVERLAP_INSET_MM);
    let center = capsuleCenter(feetPosition, shape);
    let correctionX = 0;
    let correctionY = 0;
    let correctionZ = 0;
    let overlapTests = 0;
    const recoveryContacts = new Map<string, MovementContact>();

    for (let iteration = 0; iteration <= MAX_DEPENETRATION_ITERATIONS; iteration += 1) {
      overlapTests += 1;
      const blocking = colliders.find(({ collider }) => (
        collider.intersectsShape(strictShape, center, IDENTITY_ROTATION)
      ));
      if (!blocking) {
        return Object.freeze({
          center: Object.freeze(center),
          correction: Object.freeze({
            x: asMillimeters(correctionX),
            y: asMillimeters(correctionY),
            z: asMillimeters(correctionZ),
          }),
          contacts: Object.freeze([...recoveryContacts.values()]),
          overlapTests,
        });
      }
      if (iteration === MAX_DEPENETRATION_ITERATIONS) {
        throw new Error('PHYSICS_DEPENETRATION_FAILED');
      }

      const contact = blocking.collider.contactShape(fullShape, center, IDENTITY_ROTATION, 0);
      if (!contact || !Number.isFinite(contact.distance) || contact.distance >= 0) {
        throw new Error('PHYSICS_DEPENETRATION_FAILED');
      }
      const normalQ15 = quantizeColliderNormal(contact.normal1, blocking.metadata);
      const correctionDistanceMm = Math.max(
        1,
        Math.ceil((-contact.distance * MILLIMETERS_PER_RAPIER_UNIT) + 1),
      );
      const stepX = roundSymmetric(
        (normalQ15.x * correctionDistanceMm) / CONTACT_NORMAL_Q15_SCALE,
      );
      const stepY = roundSymmetric(
        (normalQ15.y * correctionDistanceMm) / CONTACT_NORMAL_Q15_SCALE,
      );
      const stepZ = roundSymmetric(
        (normalQ15.z * correctionDistanceMm) / CONTACT_NORMAL_Q15_SCALE,
      );
      if (stepX === 0 && stepY === 0 && stepZ === 0) {
        throw new Error('PHYSICS_DEPENETRATION_FAILED');
      }
      correctionX += stepX;
      correctionY += stepY;
      correctionZ += stepZ;
      if (Math.hypot(correctionX, correctionY, correctionZ) > MAX_DEPENETRATION_DISTANCE_MM) {
        throw new Error('PHYSICS_DEPENETRATION_FAILED');
      }
      center = {
        x: center.x + mmToRapier(stepX),
        y: center.y + mmToRapier(stepY),
        z: center.z + mmToRapier(stepZ),
      };
      recoveryContacts.set(blocking.metadata.id, Object.freeze({
        colliderId: blocking.metadata.id,
        layer: blocking.metadata.layer,
        normalQ15,
        timeOfImpactPermille: 0,
      }));
    }
    throw new Error('PHYSICS_DEPENETRATION_FAILED');
  }

  private assertCapsuleClear(
    feetPosition: Vector3Millimeters,
    shape: CapsuleShapeMillimeters,
    layers: readonly MovementCollisionLayer[],
  ): void {
    const center = capsuleCenter(feetPosition, shape);
    const strictShape = this.capsuleShape(shape, STRICT_OVERLAP_INSET_MM);
    if (this.orderedSolidColliders(layers).some(({ collider }) => (
      collider.intersectsShape(strictShape, center, IDENTITY_ROTATION)
    ))) {
      throw new Error('PHYSICS_DEPENETRATION_FAILED');
    }
  }

  moveCapsule(request: CapsuleMoveRequest): CapsuleMoveResult {
    this.assertActive();
    assertVector(request.feetPosition, 'feetPosition');
    assertVector(request.desiredTranslation, 'desiredTranslation');
    assertShape(request.shape);
    assertLayers(request.solidLayers, false);
    const settings = request.settings;
    assertMoveSettings(settings);

    const RAPIER = this.runtime.module;
    const shape = this.capsuleShape(request.shape);
    const recovery = this.depenetrateCapsule(
      request.feetPosition,
      request.shape,
      request.solidLayers,
    );
    this.characterCollider.setShape(shape);
    this.characterCollider.setTranslation(recovery.center);
    // Rapier requires a positive KCC offset. Zero remains a valid public skin;
    // this epsilon is internal and far below the adapter's 1 mm quantization.
    this.controller.setOffset(Math.max(
      MINIMUM_CONTROLLER_OFFSET_RAPIER_UNITS,
      mmToRapier(settings.contactSkin),
    ));
    this.controller.setMaxSlopeClimbAngle((settings.maximumSlopeClimb / 1_000) * (Math.PI / 180));
    this.controller.setMinSlopeSlideAngle((settings.minimumSlopeSlide / 1_000) * (Math.PI / 180));
    if (settings.maxStepHeight > 0 && settings.minimumStepWidth > 0) {
      this.controller.enableAutostep(
        mmToRapier(settings.maxStepHeight),
        mmToRapier(settings.minimumStepWidth),
        settings.allowDynamicBodyAutostep,
      );
    } else this.controller.disableAutostep();
    if (settings.snapToGroundDistance > 0) {
      this.controller.enableSnapToGround(mmToRapier(settings.snapToGroundDistance));
    } else this.controller.disableSnapToGround();

    const maximumWalkableNormalY = roundSymmetric(
      Math.cos((settings.maximumSlopeClimb / 1_000) * (Math.PI / 180))
        * CONTACT_NORMAL_Q15_SCALE,
    );
    const walkableNormalThreshold = Math.max(
      0,
      maximumWalkableNormalY - SLOPE_NORMAL_TOLERANCE_Q15,
    );
    const startingSupportNormals = this.orderedSolidColliders(request.solidLayers)
      .filter((candidate) => {
        const authoredNormal = candidate.metadata.supportNormalQ15;
        return authoredNormal !== null
          && (authoredNormal.x !== 0 || authoredNormal.z !== 0);
      })
      .flatMap<ContactNormalQ15>((candidate) => {
        const contact = candidate.collider.contactShape(
          shape,
          recovery.center,
          IDENTITY_ROTATION,
          mmToRapier(Math.max(1, settings.contactSkin)),
        );
        if (!contact) return [];
        const normalQ15 = supportNormalForCollider(contact.normal1, candidate.metadata);
        return normalQ15 !== null && normalQ15.y >= walkableNormalThreshold
          ? [normalQ15]
          : [];
      });
    const startsOnWalkableSlopeSupport = startingSupportNormals.some((normal) => (
      normal.x !== 0 || normal.z !== 0
    ));
    const startsOnWalkableSupport = request.desiredTranslation.y === 0
      && settings.snapToGroundDistance > 0
      && startsOnWalkableSlopeSupport;
    // Rapier's KCC ground-snap flag does not materialize a descending Y move
    // when each fixed-tick request is submitted from a freshly positioned
    // character collider. Add the configured, bounded probe translation only
    // for a capsule already touching walkable support. Airborne zero-Y motion
    // remains untouched, while downhill routes follow the authored surface.
    const controllerTranslation: Vector3Millimeters = startsOnWalkableSupport
      ? Object.freeze({
        ...request.desiredTranslation,
        y: asMillimeters(-settings.snapToGroundDistance),
      })
      : request.desiredTranslation;
    const desired = vectorMmToRapier(controllerTranslation);
    const predicate = this.solidPredicate(request.solidLayers);
    this.controller.computeColliderMovement(
      this.characterCollider,
      desired,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      queryCollisionGroups(request.solidLayers),
      predicate,
    );
    const applied = this.controller.computedMovement();
    let kccTranslation = vectorRapierToMillimeters(applied);
    const desiredLength = Math.hypot(desired.x, desired.y, desired.z);
    let movementContacts: MovementContact[] = [];
    const collisionCount = this.controller.numComputedCollisions();
    let hitCeiling = false;
    for (let index = 0; index < collisionCount; index += 1) {
      const collision = this.controller.computedCollision(index);
      if (!collision?.collider) continue;
      const metadata = this.metadataFor(collision.collider);
      if (!metadata) continue;
      const normalQ15 = quantizeColliderNormal(collision.normal1, metadata);
      if (normalQ15.y < -(CONTACT_NORMAL_Q15_SCALE / 2)) hitCeiling = true;
      movementContacts.push(Object.freeze({
        colliderId: metadata.id,
        layer: metadata.layer,
        normalQ15,
        timeOfImpactPermille: desiredLength > 0
          ? quantizePermille(collision.toi / desiredLength)
          : 0,
      }));
    }
    const hasOnlyCanonicalFlatContacts = movementContacts.length > 0
      && movementContacts.every((contact) => (
        contact.normalQ15.x === 0
        && contact.normalQ15.y === CONTACT_NORMAL_Q15_SCALE
        && contact.normalQ15.z === 0
      ));
    if (request.desiredTranslation.y === 0
      && kccTranslation.y > 0
      && kccTranslation.y <= Math.max(
        1,
        settings.contactSkin + FLAT_MICRO_CORRECTION_TOLERANCE_MM,
      )
      && hasOnlyCanonicalFlatContacts) {
      // Rapier can return a few millimeters of upward KCC correction while
      // traversing a mathematically flat floor. Canonicalize the whole requested
      // planar move inside skin plus a 25 mm integer/GJK tolerance. Requiring only
      // exact up-face contacts prevents this from hiding steps or ramp elevation.
      kccTranslation = Object.freeze({ ...request.desiredTranslation });
    }

    const hasWalkableContact = movementContacts.some((contact) => (
      contact.normalQ15.y >= walkableNormalThreshold
    ));
    const unwalkableUphillContacts = movementContacts.filter((contact) => (
      contact.normalQ15.y > 0 && contact.normalQ15.y < walkableNormalThreshold
    ));
    const upwardDeflection = kccTranslation.y - request.desiredTranslation.y;
    const isBoundedStep = hasWalkableContact
      && upwardDeflection > 0
      && upwardDeflection <= settings.maxStepHeight + settings.contactSkin;
    if (upwardDeflection >= MATERIAL_VERTICAL_CLIP_MM
      && unwalkableUphillContacts.length > 0
      && !isBoundedStep) {
      const stopPermille = Math.min(
        ...unwalkableUphillContacts.map((contact) => contact.timeOfImpactPermille),
      );
      kccTranslation = scaleTranslationPermille(request.desiredTranslation, stopPermille);
      const unwalkableIds = new Set(
        unwalkableUphillContacts.map((contact) => contact.colliderId),
      );
      movementContacts = movementContacts.map((contact) => (
        unwalkableIds.has(contact.colliderId)
          ? Object.freeze({ ...contact, normalQ15: horizontalBlockingNormal(contact.normalQ15) })
          : contact
      ));
    }

    const appliedTranslation = Object.freeze({
      x: asMillimeters(recovery.correction.x + kccTranslation.x),
      y: asMillimeters(recovery.correction.y + kccTranslation.y),
      z: asMillimeters(recovery.correction.z + kccTranslation.z),
    });
    const contacts = [...recovery.contacts, ...movementContacts];
    contacts.sort((left, right) => (
      compareCodeUnits(left.colliderId, right.colliderId)
      || left.timeOfImpactPermille - right.timeOfImpactPermille
      || left.normalQ15.x - right.normalQ15.x
      || left.normalQ15.y - right.normalQ15.y
      || left.normalQ15.z - right.normalQ15.z
    ));
    if (!hitCeiling
      && request.desiredTranslation.y > 0
      && request.desiredTranslation.y - kccTranslation.y >= MATERIAL_VERTICAL_CLIP_MM
      && movementContacts.length > 0) {
      // At an exact endpoint Rapier may omit or perturb the ceiling normal even
      // though the KCC materially clips upward Y. Collision evidence keeps this
      // fallback from treating an unconstrained quantization delta as a hit.
      hitCeiling = true;
    }

    const finalFeet = Object.freeze({
      x: asMillimeters(request.feetPosition.x + appliedTranslation.x),
      y: asMillimeters(request.feetPosition.y + appliedTranslation.y),
      z: asMillimeters(request.feetPosition.z + appliedTranslation.z),
    });
    this.assertCapsuleClear(finalFeet, request.shape, request.solidLayers);
    const supportDistance = Math.max(
      1,
      settings.contactSkin + settings.snapToGroundDistance,
    );
    const supportColliders = this.orderedSolidColliders(request.solidLayers);
    let support: MovementSupport | null = null;
    let supportTime = Infinity;
    let supportContactTests = 0;
    const finalCenter = capsuleCenter(finalFeet, request.shape);
    for (const candidate of supportColliders) {
      const hit = candidate.collider.castShape(
        { x: 0, y: 0, z: 0 },
        shape,
        finalCenter,
        IDENTITY_ROTATION,
        { x: 0, y: -mmToRapier(supportDistance), z: 0 },
        mmToRapier(settings.contactSkin),
        1,
        false,
      );
      let candidateTime = hit?.time_of_impact ?? Infinity;
      let normalQ15 = hit
        ? supportNormalForCollider(hit.normal1, candidate.metadata)
        : null;
      if (!normalQ15 || normalQ15.y < walkableNormalThreshold) {
        supportContactTests += 1;
        const contact = candidate.collider.contactShape(
          shape,
          finalCenter,
          IDENTITY_ROTATION,
          mmToRapier(supportDistance + settings.contactSkin),
        );
        normalQ15 = contact
          ? supportNormalForCollider(contact.normal1, candidate.metadata)
          : null;
        candidateTime = contact
          ? Math.max(0, contact.distance) / mmToRapier(supportDistance)
          : Infinity;
      }
      if (!normalQ15 || normalQ15.y < walkableNormalThreshold || candidateTime > 1) continue;
      if (candidateTime > supportTime) continue;
      if (candidateTime === supportTime && support
        && compareCodeUnits(candidate.metadata.id, support.colliderId) >= 0) continue;
      supportTime = candidateTime;
      support = Object.freeze({
        colliderId: candidate.metadata.id,
        layer: candidate.metadata.layer,
        normalQ15,
        velocity: vectorToVelocity(candidate.metadata.velocityMmPerSecond),
      });
    }

    return Object.freeze({
      appliedTranslation,
      grounded: support !== null,
      hitCeiling,
      support,
      contacts: Object.freeze(contacts.slice(0, settings.maximumContacts)),
      // Counts one deterministic support cast per selected fixture collider.
      // Rapier does not expose the KCC's own internal cast count.
      shapeCasts: supportColliders.length,
      overlapTests: recovery.overlapTests + 1 + supportContactTests,
    });
  }

  overlapCapsule(request: CapsuleOverlapRequest): CapsuleOverlapResult {
    this.assertActive();
    assertVector(request.feetPosition, 'feetPosition');
    assertShape(request.shape);
    assertLayers(request.solidLayers, false);
    const identifiers = new Set<string>();
    const predicate = this.solidPredicate(request.solidLayers);
    const center = capsuleCenter(request.feetPosition, request.shape);
    // Querying every bounded fixture collider avoids Rapier broad-phase loss at
    // shallow penetration. The 0.5 mm inset makes integer-grid semantics strict:
    // tangency is clear, while a 1 mm overlap remains blocking.
    const strictShape = this.capsuleShape(request.shape, STRICT_OVERLAP_INSET_MM);
    this.world.forEachCollider((collider) => {
      if (predicate(collider) && collider.intersectsShape(strictShape, center, IDENTITY_ROTATION)) {
        const metadata = this.metadataFor(collider);
        if (metadata) identifiers.add(metadata.id);
      }
    });
    return Object.freeze({
      blockingColliderIds: Object.freeze(
        [...identifiers].sort(compareCodeUnits).slice(0, MAX_OVERLAP_RESULTS),
      ),
      overlapTests: 1,
    });
  }

  castCapsule(request: CapsuleCastRequest): CapsuleCastResult {
    this.assertActive();
    assertVector(request.feetPosition, 'feetPosition');
    assertVector(request.translation, 'translation');
    assertShape(request.shape);
    assertLayers(request.solidLayers, false);
    assertIntegerRange(request.contactSkin, 0, 1_000, 'contactSkin');
    if (request.translation.x === 0 && request.translation.y === 0 && request.translation.z === 0) {
      return Object.freeze({ allowedTranslation: zeroTranslation(), hit: null, shapeCasts: 0 });
    }
    const translation = vectorMmToRapier(request.translation);
    const center = capsuleCenter(request.feetPosition, request.shape);
    const shape = this.capsuleShape(request.shape);
    const colliders = this.orderedSolidColliders(request.solidLayers);
    let selected: {
      readonly metadata: ColliderMetadata;
      readonly normalQ15: ContactNormalQ15;
      readonly timeOfImpact: number;
    } | null = null;

    // Rapier's broad-phase world cast may return a TOI-zero floor contact for a
    // capsule moving exactly parallel to that floor. Cast each selected fixture
    // in stable ID order and retain only contacts the requested translation is
    // moving into. The dot product uses integer millimeters and Q15 normals, so
    // exact tangency and motion away from a face have an unambiguous cutoff.
    for (const candidate of colliders) {
      const hit = candidate.collider.castShape(
        { x: 0, y: 0, z: 0 },
        shape,
        center,
        IDENTITY_ROTATION,
        translation,
        mmToRapier(request.contactSkin),
        1,
        false,
      );
      if (!hit || !Number.isFinite(hit.time_of_impact)) continue;
      const normalQ15 = quantizeColliderNormal(hit.normal1, candidate.metadata);
      const approachDot = request.translation.x * normalQ15.x
        + request.translation.y * normalQ15.y
        + request.translation.z * normalQ15.z;
      if (approachDot >= 0) continue;
      const timeOfImpact = Math.max(0, Math.min(1, hit.time_of_impact));
      if (selected === null || timeOfImpact < selected.timeOfImpact) {
        selected = {
          metadata: candidate.metadata,
          normalQ15,
          timeOfImpact,
        };
      }
    }

    if (!selected) {
      return Object.freeze({
        allowedTranslation: Object.freeze({ ...request.translation }),
        hit: null,
        shapeCasts: colliders.length,
      });
    }
    const fraction = selected.timeOfImpact;
    const allowedTranslation = Object.freeze({
      x: asMillimeters(roundSymmetric(request.translation.x * fraction)),
      y: asMillimeters(roundSymmetric(request.translation.y * fraction)),
      z: asMillimeters(roundSymmetric(request.translation.z * fraction)),
    });
    return Object.freeze({
      allowedTranslation,
      hit: Object.freeze({
        colliderId: selected.metadata.id,
        layer: selected.metadata.layer,
        normalQ15: selected.normalQ15,
        timeOfImpactPermille: quantizePermille(fraction),
      }),
      shapeCasts: colliders.length,
    });
  }

  castSolidRay(request: RapierSolidRayCastRequest): RapierSolidRayCastResult {
    this.assertActive();
    assertFiniteVector(request.originMillimeters, 'originMillimeters');
    for (const axis of ['x', 'y', 'z'] as const) {
      if (!Number.isSafeInteger(request.originMillimeters[axis])) {
        throw new RangeError(`originMillimeters.${axis} must be a safe integer`);
      }
    }
    assertDirectionUnit(request.directionUnit);
    assertIntegerRange(
      request.maximumDistanceMillimeters,
      1,
      1_000_000,
      'maximumDistanceMillimeters',
    );
    assertLayers(request.solidLayers, false);
    if (typeof request.solid !== 'boolean') throw new TypeError('solid must be a boolean');

    const origin = vectorMmToRapier(request.originMillimeters);
    const ray = new this.runtime.module.Ray(origin, request.directionUnit);
    const maximumDistance = mmToRapier(request.maximumDistanceMillimeters);
    const colliders = this.orderedSolidColliders(request.solidLayers);
    let selected: {
      readonly metadata: ColliderMetadata;
      readonly distanceMillimeters: number;
    } | null = null;

    // Per-collider casts keep equal-distance resolution independent from
    // Rapier broad-phase traversal. orderedSolidColliders already sorts IDs.
    for (const candidate of colliders) {
      const timeOfImpact = candidate.collider.castRay(ray, maximumDistance, request.solid);
      if (!Number.isFinite(timeOfImpact) || timeOfImpact < 0 || timeOfImpact > maximumDistance) {
        continue;
      }
      const distanceMillimeters = Math.max(
        0,
        Math.min(
          request.maximumDistanceMillimeters,
          rapierToMillimeters(timeOfImpact),
        ),
      );
      if (selected === null || distanceMillimeters < selected.distanceMillimeters) {
        selected = { metadata: candidate.metadata, distanceMillimeters };
      }
    }

    return Object.freeze({
      hit: selected === null
        ? null
        : Object.freeze({
            colliderId: selected.metadata.id,
            layer: selected.metadata.layer,
            distanceMillimeters: selected.distanceMillimeters,
          }),
      rayCasts: colliders.length,
    });
  }

  volumesAtCapsule(request: CapsuleVolumeRequest): CapsuleVolumeResult {
    this.assertActive();
    assertVector(request.feetPosition, 'feetPosition');
    assertShape(request.shape);
    const volumes = new Map<string, MovementVolumeKind>();
    const center = capsuleCenter(request.feetPosition, request.shape);
    const strictShape = this.capsuleShape(request.shape, STRICT_OVERLAP_INSET_MM);
    this.world.forEachCollider((collider) => {
      const metadata = this.metadataFor(collider);
      if (metadata?.sensor === true
        && collider.intersectsShape(strictShape, center, IDENTITY_ROTATION)
        && metadata.volumeKind) {
        volumes.set(metadata.id, metadata.volumeKind);
      }
    });
    return Object.freeze({
      volumes: Object.freeze([...volumes]
        .sort(([left], [right]) => compareCodeUnits(left, right))
        .slice(0, MAX_VOLUME_RESULTS)
        .map(([colliderId, kind]) => Object.freeze({ colliderId, kind }))),
      overlapTests: 1,
    });
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.metadata.clear();
    this.world.free();
  }
}
