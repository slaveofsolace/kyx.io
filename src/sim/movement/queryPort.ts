import type {
  MilliDegrees,
  Millimeters,
  MillimetersPerSecond,
} from '../units';

export const MOVEMENT_QUERY_SCHEMA_VERSION = 1 as const;
export const CONTACT_NORMAL_Q15_SCALE = 32_767 as const;

export interface Vector3Millimeters {
  readonly x: Millimeters;
  readonly y: Millimeters;
  readonly z: Millimeters;
}

export interface Vector3MillimetersPerSecond {
  readonly x: MillimetersPerSecond;
  readonly y: MillimetersPerSecond;
  readonly z: MillimetersPerSecond;
}

export interface ContactNormalQ15 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface CapsuleShapeMillimeters {
  /** Full foot-to-head height, including both rounded caps. */
  readonly height: Millimeters;
  readonly radius: Millimeters;
}

export type MovementCollisionLayer =
  | 'world_static'
  | 'dynamic_platform'
  | 'player_body'
  | 'door'
  | 'spawn_barrier'
  | 'kill_volume'
  | 'forbidden_volume'
  | 'recovery_volume';

export type MovementVolumeKind = 'kill' | 'forbidden' | 'recovery';

export interface MovementQuerySettings {
  readonly contactSkin: Millimeters;
  readonly maxStepHeight: Millimeters;
  readonly minimumStepWidth: Millimeters;
  readonly snapToGroundDistance: Millimeters;
  readonly maximumSlopeClimb: MilliDegrees;
  readonly minimumSlopeSlide: MilliDegrees;
  readonly allowDynamicBodyAutostep: boolean;
  readonly maximumContacts: number;
}

export interface MovementContact {
  readonly colliderId: string;
  readonly layer: MovementCollisionLayer;
  readonly normalQ15: ContactNormalQ15;
  /** Requested-motion fraction, quantized to 0..1,000. */
  readonly timeOfImpactPermille: number;
}

export interface MovementSupport {
  readonly colliderId: string;
  readonly layer: MovementCollisionLayer;
  readonly normalQ15: ContactNormalQ15;
  readonly velocity: Vector3MillimetersPerSecond;
}

export interface CapsuleMoveRequest {
  /** Canonical body position is the capsule's lowest point (floor-contact foot level). */
  readonly feetPosition: Vector3Millimeters;
  readonly shape: CapsuleShapeMillimeters;
  readonly desiredTranslation: Vector3Millimeters;
  readonly settings: MovementQuerySettings;
  readonly solidLayers: readonly MovementCollisionLayer[];
}

export interface CapsuleMoveResult {
  readonly appliedTranslation: Vector3Millimeters;
  readonly grounded: boolean;
  readonly hitCeiling: boolean;
  readonly support: MovementSupport | null;
  readonly contacts: readonly MovementContact[];
  readonly shapeCasts: number;
  readonly overlapTests: number;
}

export interface CapsuleOverlapRequest {
  readonly feetPosition: Vector3Millimeters;
  readonly shape: CapsuleShapeMillimeters;
  readonly solidLayers: readonly MovementCollisionLayer[];
}

export interface CapsuleOverlapResult {
  readonly blockingColliderIds: readonly string[];
  readonly overlapTests: number;
}

export interface CapsuleCastRequest {
  readonly feetPosition: Vector3Millimeters;
  readonly shape: CapsuleShapeMillimeters;
  readonly translation: Vector3Millimeters;
  readonly contactSkin: Millimeters;
  readonly solidLayers: readonly MovementCollisionLayer[];
}

export interface CapsuleCastHit {
  readonly colliderId: string;
  readonly layer: MovementCollisionLayer;
  readonly normalQ15: ContactNormalQ15;
  readonly timeOfImpactPermille: number;
}

export interface CapsuleCastResult {
  readonly allowedTranslation: Vector3Millimeters;
  readonly hit: CapsuleCastHit | null;
  readonly shapeCasts: number;
}

export interface CapsuleVolumeRequest {
  readonly feetPosition: Vector3Millimeters;
  readonly shape: CapsuleShapeMillimeters;
}

export interface MovementVolumeHit {
  readonly colliderId: string;
  readonly kind: MovementVolumeKind;
}

export interface CapsuleVolumeResult {
  readonly volumes: readonly MovementVolumeHit[];
  readonly overlapTests: number;
}

/**
 * Engine-neutral synchronous query boundary used by deterministic movement.
 * Implementations initialize any WASM/physics runtime before a tick starts.
 */
export interface MovementQueryPort {
  readonly schemaVersion: typeof MOVEMENT_QUERY_SCHEMA_VERSION;
  moveCapsule(request: CapsuleMoveRequest): CapsuleMoveResult;
  overlapCapsule(request: CapsuleOverlapRequest): CapsuleOverlapResult;
  castCapsule(request: CapsuleCastRequest): CapsuleCastResult;
  volumesAtCapsule(request: CapsuleVolumeRequest): CapsuleVolumeResult;
}
