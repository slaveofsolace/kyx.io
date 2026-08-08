import {
  EMPTY_MOVEMENT_QUERY_METRICS,
  asMilliDegrees,
  asMillimeters,
  asMillimetersPerSecond,
  asSimulationTick,
  normalizeYawMilliDegrees,
  type CapsuleShapeMillimeters,
  type MovementCollisionLayer,
  type MovementPlayerState,
  type MovementQueryMetrics,
  type MovementQueryPort,
  type MovementSemanticEvent,
  type MovementSimulationState,
  type MovementVolumeHit,
  type Vector3Millimeters,
} from '../../sim';
import {
  AUTHORITY_WORLD_PORTAL_SCHEMA_VERSION,
  type AuthorityWorldPortalAdvanceInputV1,
  type AuthorityWorldPortalAdvanceResultV1,
  type AuthorityWorldPortalPort,
} from '../worldPortal';

export interface LinkedWorldPortalPointMm {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface LinkedWorldPortalEndpoint<EndpointId extends string> {
  readonly id: EndpointId;
  readonly partnerId: EndpointId;
  readonly triggerCenterMm: LinkedWorldPortalPointMm;
  readonly triggerHalfExtentsMm: LinkedWorldPortalPointMm;
  readonly exitFeetMm: LinkedWorldPortalPointMm;
  readonly exitYawMilliDegrees: number;
  readonly presentation: Readonly<{
    readonly departureAudioHook: string;
    readonly arrivalAudioHook: string;
    readonly departureVfxHook: string;
    readonly arrivalVfxHook: string;
  }>;
}

export interface LinkedWorldPortalAuthorityConfig<EndpointId extends string> {
  readonly capabilityId: string;
  readonly fixtureHash: string;
  readonly inputMismatchError: string;
  readonly queryMismatchError: string;
  readonly endpoints: readonly LinkedWorldPortalEndpoint<EndpointId>[];
}

const SOLID_LAYERS = Object.freeze([
  'world_static',
  'dynamic_platform',
  'player_body',
  'door',
  'spawn_barrier',
] as const satisfies readonly MovementCollisionLayer[]);

type MutableMovementQueryMetrics = {
  -readonly [Key in keyof MovementQueryMetrics]: MovementQueryMetrics[Key];
};

function zeroMetrics(): MutableMovementQueryMetrics {
  return { ...EMPTY_MOVEMENT_QUERY_METRICS };
}

function pointInside(
  value: Readonly<{ x: number; y: number; z: number }>,
  center: LinkedWorldPortalPointMm,
  halfExtents: LinkedWorldPortalPointMm,
): boolean {
  return Math.abs(value.x - center.x) <= halfExtents.x
    && Math.abs(value.y - center.y) <= halfExtents.y
    && Math.abs(value.z - center.z) <= halfExtents.z;
}

function endpointEntered<EndpointId extends string>(
  previous: MovementPlayerState,
  next: MovementPlayerState,
  endpoints: readonly LinkedWorldPortalEndpoint<EndpointId>[],
): LinkedWorldPortalEndpoint<EndpointId> | null {
  return endpoints.find((endpoint) => (
    !pointInside(previous.feetPosition, endpoint.triggerCenterMm, endpoint.triggerHalfExtentsMm)
    && pointInside(next.feetPosition, endpoint.triggerCenterMm, endpoint.triggerHalfExtentsMm)
  )) ?? null;
}

function vectorMm(value: LinkedWorldPortalPointMm): Vector3Millimeters {
  return Object.freeze({
    x: asMillimeters(value.x),
    y: asMillimeters(value.y),
    z: asMillimeters(value.z),
  });
}

function volumeTransitionEvents(
  previous: readonly MovementVolumeHit[],
  next: readonly MovementVolumeHit[],
  tick: ReturnType<typeof asSimulationTick>,
  entityId: MovementPlayerState['id'],
): readonly MovementSemanticEvent[] {
  const events: MovementSemanticEvent[] = [];
  const previousById = new Map(previous.map((volume) => [volume.colliderId, volume]));
  const nextById = new Map(next.map((volume) => [volume.colliderId, volume]));
  for (const volume of next) {
    if (previousById.has(volume.colliderId)) continue;
    events.push({
      kind: 'movement_volume_entered',
      tick,
      entityId,
      colliderId: volume.colliderId,
      volumeKind: volume.kind,
    });
  }
  for (const volume of previous) {
    if (nextById.has(volume.colliderId)) continue;
    events.push({
      kind: 'movement_volume_exited',
      tick,
      entityId,
      colliderId: volume.colliderId,
      volumeKind: volume.kind,
    });
  }
  return Object.freeze(events);
}

function rejected(
  state: MovementSimulationState,
  input: AuthorityWorldPortalAdvanceInputV1,
  reason: Extract<MovementSemanticEvent, { kind: 'teleport_rejected' }>['reason'],
  metrics: MovementQueryMetrics,
): AuthorityWorldPortalAdvanceResultV1 {
  const event = Object.freeze({
    kind: 'teleport_rejected' as const,
    tick: asSimulationTick(state.tick),
    entityId: state.player.id,
    reason,
  });
  return Object.freeze({
    schemaVersion: AUTHORITY_WORLD_PORTAL_SCHEMA_VERSION,
    state: input.profile.teleport.cooldownOnFailure && reason !== 'cooldown'
      ? {
          ...state,
          player: {
            ...state.player,
            teleportCooldownTicksRemaining: input.profile.teleport.cooldownTicks,
          },
        }
      : state,
    events: Object.freeze([event]),
    metrics: Object.freeze(metrics),
  });
}

export function advanceLinkedWorldPortalAuthority<EndpointId extends string>(
  input: AuthorityWorldPortalAdvanceInputV1,
  queries: MovementQueryPort,
  config: LinkedWorldPortalAuthorityConfig<EndpointId>,
): AuthorityWorldPortalAdvanceResultV1 {
  if (
    input.schemaVersion !== AUTHORITY_WORLD_PORTAL_SCHEMA_VERSION
    || input.authorityTick !== input.nextState.tick
    || input.previousState.player.id !== input.nextState.player.id
    || input.previousState.identity.fixtureHash !== config.fixtureHash
    || input.nextState.identity.fixtureHash !== config.fixtureHash
  ) {
    throw new Error(config.inputMismatchError);
  }

  const endpoint = endpointEntered(
    input.previousState.player,
    input.nextState.player,
    config.endpoints,
  );
  if (endpoint === null) {
    return Object.freeze({
      schemaVersion: AUTHORITY_WORLD_PORTAL_SCHEMA_VERSION,
      state: input.nextState,
      events: Object.freeze([]),
      metrics: Object.freeze(zeroMetrics()),
    });
  }
  if (input.nextState.player.teleportCooldownTicksRemaining > 0) {
    return rejected(input.nextState, input, 'cooldown', zeroMetrics());
  }

  const metrics = zeroMetrics();
  const shape: CapsuleShapeMillimeters = input.nextState.player.stance === 'standing'
    ? input.profile.standingShape
    : input.profile.crouchedShape;
  let destination = vectorMm(endpoint.exitFeetMm);
  const overlap = queries.overlapCapsule({
    feetPosition: destination,
    shape,
    solidLayers: SOLID_LAYERS,
  });
  metrics.overlapCapsuleCalls += 1;
  metrics.overlapTests += overlap.overlapTests;
  metrics.contacts += overlap.blockingColliderIds.length;
  if (overlap.blockingColliderIds.length > 0) {
    return rejected(input.nextState, input, 'blocked', metrics);
  }

  const groundProbe = queries.moveCapsule({
    feetPosition: destination,
    shape,
    desiredTranslation: vectorMm({ x: 0, y: 0, z: 0 }),
    settings: input.profile.query,
    solidLayers: SOLID_LAYERS,
  });
  metrics.moveCapsuleCalls += 1;
  metrics.shapeCasts += groundProbe.shapeCasts;
  metrics.overlapTests += groundProbe.overlapTests;
  metrics.contacts += groundProbe.contacts.length;
  destination = Object.freeze({
    x: asMillimeters(destination.x + groundProbe.appliedTranslation.x),
    y: asMillimeters(destination.y + groundProbe.appliedTranslation.y),
    z: asMillimeters(destination.z + groundProbe.appliedTranslation.z),
  });
  if (input.profile.teleport.requireGroundedDestination && !groundProbe.grounded) {
    return rejected(input.nextState, input, 'no_ground', metrics);
  }

  const volumeResult = queries.volumesAtCapsule({ feetPosition: destination, shape });
  metrics.volumeCalls += 1;
  metrics.overlapTests += volumeResult.overlapTests;
  const unsafe = volumeResult.volumes.find(({ kind }) => (
    kind === 'kill' || kind === 'forbidden'
  ));
  if (unsafe !== undefined) {
    return rejected(
      input.nextState,
      input,
      unsafe.kind === 'kill' ? 'kill_volume' : 'forbidden_volume',
      metrics,
    );
  }

  const tick = asSimulationTick(input.nextState.tick);
  const portalEvent: MovementSemanticEvent = Object.freeze({
    kind: 'teleport_succeeded',
    tick,
    entityId: input.nextState.player.id,
    outcome: 'full',
    from: Object.freeze({ ...input.nextState.player.feetPosition }),
    to: Object.freeze({ ...destination }),
    worldPortal: Object.freeze({
      schemaVersion: AUTHORITY_WORLD_PORTAL_SCHEMA_VERSION,
      capabilityId: config.capabilityId,
      endpointId: endpoint.id,
      partnerEndpointId: endpoint.partnerId,
      departureAudioHook: endpoint.presentation.departureAudioHook,
      arrivalAudioHook: endpoint.presentation.arrivalAudioHook,
      departureVfxHook: endpoint.presentation.departureVfxHook,
      arrivalVfxHook: endpoint.presentation.arrivalVfxHook,
    }),
  });
  const volumeEvents = volumeTransitionEvents(
    input.nextState.player.activeVolumes,
    volumeResult.volumes,
    tick,
    input.nextState.player.id,
  );
  const state: MovementSimulationState = {
    ...input.nextState,
    player: {
      ...input.nextState.player,
      feetPosition: destination,
      velocity: Object.freeze({
        x: asMillimetersPerSecond(0),
        y: asMillimetersPerSecond(0),
        z: asMillimetersPerSecond(0),
      }),
      integrationRemainders: Object.freeze({
        positionX: 0,
        positionY: 0,
        positionZ: 0,
        planarAcceleration: 0,
        gravity: 0,
      }),
      yawMilliDegrees: normalizeYawMilliDegrees(
        asMilliDegrees(endpoint.exitYawMilliDegrees),
      ),
      grounded: groundProbe.grounded,
      support: groundProbe.support,
      locomotion: groundProbe.grounded ? 'grounded' : 'airborne',
      coyoteTicksRemaining: groundProbe.grounded
        ? input.profile.locomotion.coyoteTicks
        : 0,
      jumpBufferTicksRemaining: 0,
      slideTicksRemaining: 0,
      teleportCooldownTicksRemaining: input.profile.teleport.cooldownTicks,
      activeVolumes: Object.freeze([...volumeResult.volumes]),
    },
  };
  return Object.freeze({
    schemaVersion: AUTHORITY_WORLD_PORTAL_SCHEMA_VERSION,
    state,
    events: Object.freeze([portalEvent, ...volumeEvents]),
    metrics: Object.freeze(metrics),
  });
}

export function createLinkedWorldPortalAuthorityPort<EndpointId extends string>(
  queries: MovementQueryPort,
  config: LinkedWorldPortalAuthorityConfig<EndpointId>,
): AuthorityWorldPortalPort {
  if (queries.schemaVersion !== 1) throw new Error(config.queryMismatchError);
  return Object.freeze({
    schemaVersion: AUTHORITY_WORLD_PORTAL_SCHEMA_VERSION,
    capabilityId: config.capabilityId,
    advance(input: AuthorityWorldPortalAdvanceInputV1) {
      return advanceLinkedWorldPortalAuthority(input, queries, config);
    },
  });
}
