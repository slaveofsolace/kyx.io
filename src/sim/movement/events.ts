import type { EntityId } from '../commands';
import type { SimulationTick } from '../units';
import type { MovementStance } from './state';
import type { MovementVolumeKind, Vector3Millimeters } from './queryPort';

interface MovementEventBase {
  readonly tick: SimulationTick;
  readonly entityId: EntityId;
}

export interface WorldPortalTraversalPresentationV1 {
  readonly schemaVersion: 1;
  readonly capabilityId: string;
  readonly endpointId: string;
  readonly partnerEndpointId: string;
  readonly departureAudioHook: string;
  readonly arrivalAudioHook: string;
  readonly departureVfxHook: string;
  readonly arrivalVfxHook: string;
}

export type MovementSemanticEvent =
  | (MovementEventBase & {
      readonly kind: 'movement_intent_applied';
      readonly sequence: number;
    })
  | (MovementEventBase & {
      readonly kind: 'movement_intent_rejected';
      readonly sequence: number;
      readonly reason: 'stale_sequence';
    })
  | (MovementEventBase & {
      readonly kind: 'jumped';
      readonly buffered: boolean;
    })
  | (MovementEventBase & {
      readonly kind: 'landed';
      readonly impactSpeedMmPerSecond: number;
    })
  | (MovementEventBase & {
      readonly kind: 'hit_ceiling';
    })
  | (MovementEventBase & {
      readonly kind: 'stance_changed';
      readonly stance: MovementStance;
    })
  | (MovementEventBase & {
      readonly kind: 'stand_blocked';
    })
  | (MovementEventBase & {
      readonly kind: 'slide_started';
    })
  | (MovementEventBase & {
      readonly kind: 'slide_ended';
      readonly reason: 'duration' | 'airborne';
    })
  | (MovementEventBase & {
      readonly kind: 'teleport_succeeded';
      readonly outcome: 'full' | 'partial';
      readonly from: Vector3Millimeters;
      readonly to: Vector3Millimeters;
      readonly worldPortal?: WorldPortalTraversalPresentationV1;
    })
  | (MovementEventBase & {
      readonly kind: 'teleport_rejected';
      readonly reason: 'cooldown' | 'blocked' | 'forbidden_volume' | 'kill_volume' | 'no_ground';
    })
  | (MovementEventBase & {
      readonly kind: 'movement_volume_entered';
      readonly colliderId: string;
      readonly volumeKind: MovementVolumeKind;
    })
  | (MovementEventBase & {
      readonly kind: 'movement_volume_exited';
      readonly colliderId: string;
      readonly volumeKind: MovementVolumeKind;
    });

export interface MovementQueryMetrics {
  readonly moveCapsuleCalls: number;
  readonly overlapCapsuleCalls: number;
  readonly castCapsuleCalls: number;
  readonly volumeCalls: number;
  readonly shapeCasts: number;
  readonly overlapTests: number;
  readonly contacts: number;
}

export const EMPTY_MOVEMENT_QUERY_METRICS: MovementQueryMetrics = Object.freeze({
  moveCapsuleCalls: 0,
  overlapCapsuleCalls: 0,
  castCapsuleCalls: 0,
  volumeCalls: 0,
  shapeCasts: 0,
  overlapTests: 0,
  contacts: 0,
});

