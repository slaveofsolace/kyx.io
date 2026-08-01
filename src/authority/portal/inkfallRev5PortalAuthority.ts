import type { LoadedRuntimeMapPackage } from '../../physics';
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
  type MovementProfileV1,
  type MovementQueryMetrics,
  type MovementQueryPort,
  type MovementSemanticEvent,
  type MovementSimulationState,
  type MovementVolumeHit,
  type Vector3Millimeters,
} from '../../sim';
import {
  INKFALL_AUTHORITY_MAP_IDENTITY_V3,
  INKFALL_AUTHORITY_MAP_IDENTITY_V4,
  type InkfallAuthorityMapIdentity,
} from '../inkfallMapIdentity';
import {
  AUTHORITY_WORLD_PORTAL_SCHEMA_VERSION,
  type AuthorityWorldPortalAdvanceInputV1,
  type AuthorityWorldPortalAdvanceResultV1,
  type AuthorityWorldPortalPort,
} from '../worldPortal';

export const INKFALL_REV5_PORTAL_CAPABILITY_ID =
  'inkfall_rev5_linked_world_portal_v1' as const;

const INKFALL_REV5_PORTAL_AUTHORITY_IDENTITIES = Object.freeze([
  INKFALL_AUTHORITY_MAP_IDENTITY_V3,
  INKFALL_AUTHORITY_MAP_IDENTITY_V4,
] as const);

function isPortalAuthorityIdentity(
  identity: InkfallAuthorityMapIdentity,
): boolean {
  return INKFALL_REV5_PORTAL_AUTHORITY_IDENTITIES.some((candidate) => (
    candidate.mapId === identity.mapId
    && candidate.mapRevision === identity.mapRevision
    && candidate.packageDigest === identity.packageDigest
    && candidate.fixtureHash === identity.fixtureHash
    && candidate.colliderCardinality === identity.colliderCardinality
  ));
}

export type InkfallRev5PortalEndpointId =
  | 'red_fold_lower'
  | 'red_fold_upper';

interface PortalPointMm {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface InkfallRev5PortalEndpoint {
  readonly id: InkfallRev5PortalEndpointId;
  readonly partnerId: InkfallRev5PortalEndpointId;
  readonly triggerCenterMm: PortalPointMm;
  readonly triggerHalfExtentsMm: PortalPointMm;
  readonly exitFeetMm: PortalPointMm;
  readonly exitYawMilliDegrees: number;
  readonly presentation: Readonly<{
    readonly visualCenterMm: PortalPointMm;
    readonly visualYawMilliDegrees: number;
    readonly colorRole: 'cyan_departure' | 'amber_return';
    readonly departureAudioHook: string;
    readonly arrivalAudioHook: string;
    readonly departureVfxHook: string;
    readonly arrivalVfxHook: string;
  }>;
}

const point = (x: number, y: number, z: number): PortalPointMm =>
  Object.freeze({ x, y, z });

/**
 * The lower endpoint is anchored to the frozen Rev3 trigger contract. The
 * upper endpoint is an additive Rev5 authority overlay at the matching Red
 * Fold exit frame. Exit feet are deliberately outside the partner trigger.
 * The upper-to-lower return lands on the authored corridor waypoint outside
 * the 1.35 m crouch gate so a standing capsule cannot be rejected as blocked.
 */
export const INKFALL_REV5_PORTAL_ENDPOINTS = Object.freeze([
  Object.freeze({
    id: 'red_fold_lower',
    partnerId: 'red_fold_upper',
    triggerCenterMm: point(-4_000, -3_000, -10_000),
    triggerHalfExtentsMm: point(1_500, 1_000, 1_500),
    exitFeetMm: point(1_539, 1_431, -4_461),
    exitYawMilliDegrees: 45_000,
    presentation: Object.freeze({
      visualCenterMm: point(-4_000, -1_250, -10_000),
      visualYawMilliDegrees: 0,
      colorRole: 'cyan_departure',
      departureAudioHook: 'inkfall.portal.red_fold_lower.departure',
      arrivalAudioHook: 'inkfall.portal.red_fold_lower.arrival',
      departureVfxHook: 'inkfall.portal.red_fold_lower.energy_departure',
      arrivalVfxHook: 'inkfall.portal.red_fold_lower.energy_arrival',
    }),
  } satisfies InkfallRev5PortalEndpoint),
  Object.freeze({
    id: 'red_fold_upper',
    partnerId: 'red_fold_lower',
    triggerCenterMm: point(1_000, 1_431, -5_000),
    triggerHalfExtentsMm: point(1_500, 1_400, 300),
    exitFeetMm: point(-5_000, -3_000, -15_500),
    exitYawMilliDegrees: 90_000,
    presentation: Object.freeze({
      visualCenterMm: point(1_000, 3_181, -5_000),
      visualYawMilliDegrees: 0,
      colorRole: 'amber_return',
      departureAudioHook: 'inkfall.portal.red_fold_upper.departure',
      arrivalAudioHook: 'inkfall.portal.red_fold_upper.arrival',
      departureVfxHook: 'inkfall.portal.red_fold_upper.energy_departure',
      arrivalVfxHook: 'inkfall.portal.red_fold_upper.energy_arrival',
    }),
  } satisfies InkfallRev5PortalEndpoint),
] as const);

export const INKFALL_REV5_PORTAL_PRESENTATION_HOOKS = Object.freeze(
  INKFALL_REV5_PORTAL_ENDPOINTS.map(({ id, presentation }) => Object.freeze({
    endpointId: id,
    ...presentation,
  })),
);

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
  center: PortalPointMm,
  halfExtents: PortalPointMm,
): boolean {
  return Math.abs(value.x - center.x) <= halfExtents.x
    && Math.abs(value.y - center.y) <= halfExtents.y
    && Math.abs(value.z - center.z) <= halfExtents.z;
}

function endpointEntered(
  previous: MovementPlayerState,
  next: MovementPlayerState,
): InkfallRev5PortalEndpoint | null {
  return INKFALL_REV5_PORTAL_ENDPOINTS.find((endpoint) => (
    !pointInside(
      previous.feetPosition,
      endpoint.triggerCenterMm,
      endpoint.triggerHalfExtentsMm,
    )
    && pointInside(
      next.feetPosition,
      endpoint.triggerCenterMm,
      endpoint.triggerHalfExtentsMm,
    )
  )) ?? null;
}

function shapeFor(
  player: MovementPlayerState,
  profile: MovementProfileV1,
): CapsuleShapeMillimeters {
  return player.stance === 'standing'
    ? profile.standingShape
    : profile.crouchedShape;
}

function vectorMm(value: PortalPointMm): Vector3Millimeters {
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
  return Object.freeze(events);
}

function rejected(
  state: MovementSimulationState,
  profile: MovementProfileV1,
  reason: Extract<MovementSemanticEvent, { kind: 'teleport_rejected' }>['reason'],
  metrics: MovementQueryMetrics,
): AuthorityWorldPortalAdvanceResultV1 {
  const tick = asSimulationTick(state.tick);
  const event = Object.freeze({
    kind: 'teleport_rejected' as const,
    tick,
    entityId: state.player.id,
    reason,
  });
  return Object.freeze({
    schemaVersion: 1,
    state: profile.teleport.cooldownOnFailure && reason !== 'cooldown'
      ? {
          ...state,
          player: {
            ...state.player,
            teleportCooldownTicksRemaining: profile.teleport.cooldownTicks,
          },
        }
      : state,
    events: Object.freeze([event]),
    metrics: Object.freeze(metrics),
  });
}

export function advanceInkfallRev5PortalAuthority(
  input: AuthorityWorldPortalAdvanceInputV1,
  queries: MovementQueryPort,
  authorityIdentity: InkfallAuthorityMapIdentity = INKFALL_AUTHORITY_MAP_IDENTITY_V3,
): AuthorityWorldPortalAdvanceResultV1 {
  if (
    !isPortalAuthorityIdentity(authorityIdentity)
    ||
    input.schemaVersion !== 1
    || input.authorityTick !== input.nextState.tick
    || input.previousState.player.id !== input.nextState.player.id
    || input.previousState.identity.fixtureHash
      !== authorityIdentity.fixtureHash
    || input.nextState.identity.fixtureHash
      !== authorityIdentity.fixtureHash
  ) {
    throw new Error('INKFALL_REV5_PORTAL_AUTHORITY_INPUT_MISMATCH');
  }

  const endpoint = endpointEntered(
    input.previousState.player,
    input.nextState.player,
  );
  if (endpoint === null) {
    return Object.freeze({
      schemaVersion: 1,
      state: input.nextState,
      events: Object.freeze([]),
      metrics: Object.freeze(zeroMetrics()),
    });
  }
  if (input.nextState.player.teleportCooldownTicksRemaining > 0) {
    return rejected(input.nextState, input.profile, 'cooldown', zeroMetrics());
  }

  const metrics = zeroMetrics();
  const shape = shapeFor(input.nextState.player, input.profile);
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
    return rejected(input.nextState, input.profile, 'blocked', metrics);
  }

  const groundProbe = queries.moveCapsule({
    feetPosition: destination,
    shape,
    desiredTranslation: vectorMm(point(0, 0, 0)),
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
    return rejected(input.nextState, input.profile, 'no_ground', metrics);
  }

  const volumeResult = queries.volumesAtCapsule({
    feetPosition: destination,
    shape,
  });
  metrics.volumeCalls += 1;
  metrics.overlapTests += volumeResult.overlapTests;
  const unsafe = volumeResult.volumes.find((volume) => (
    volume.kind === 'kill' || volume.kind === 'forbidden'
  ));
  if (unsafe !== undefined) {
    return rejected(
      input.nextState,
      input.profile,
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
      schemaVersion: 1,
      capabilityId: INKFALL_REV5_PORTAL_CAPABILITY_ID,
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
    schemaVersion: 1,
    state,
    events: Object.freeze([portalEvent, ...volumeEvents]),
    metrics: Object.freeze(metrics),
  });
}

export function createInkfallRev5PortalAuthorityPort(
  queries: MovementQueryPort,
  authorityIdentity: InkfallAuthorityMapIdentity = INKFALL_AUTHORITY_MAP_IDENTITY_V3,
): AuthorityWorldPortalPort {
  if (queries.schemaVersion !== 1 || !isPortalAuthorityIdentity(authorityIdentity)) {
    throw new Error('INKFALL_REV5_PORTAL_QUERY_SCHEMA_MISMATCH');
  }
  return Object.freeze({
    schemaVersion: AUTHORITY_WORLD_PORTAL_SCHEMA_VERSION,
    capabilityId: INKFALL_REV5_PORTAL_CAPABILITY_ID,
    advance(input: AuthorityWorldPortalAdvanceInputV1) {
      return advanceInkfallRev5PortalAuthority(input, queries, authorityIdentity);
    },
  });
}

function zoneIdsAt(
  loaded: LoadedRuntimeMapPackage,
  value: PortalPointMm,
): readonly string[] {
  return Object.freeze(loaded.manifest.zones.filter((zone) => (
    Math.abs(value.x - zone.centerMm.x) <= zone.halfExtentsMm.x
    && Math.abs(value.y - zone.centerMm.y) <= zone.halfExtentsMm.y
    && Math.abs(value.z - zone.centerMm.z) <= zone.halfExtentsMm.z
  )).map(({ id }) => id).sort());
}

function planarDistance(left: PortalPointMm, right: PortalPointMm): number {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

export function inspectInkfallRev5PortalCompatibility(
  loaded: LoadedRuntimeMapPackage,
) {
  const lower = INKFALL_REV5_PORTAL_ENDPOINTS[0];
  const upper = INKFALL_REV5_PORTAL_ENDPOINTS[1];
  const frozenTrigger = loaded.manifest.triggers.find(
    ({ id }) => id === 'red_fold_teleport_entry',
  );
  const lowerZones = zoneIdsAt(loaded, lower.triggerCenterMm);
  const upperZones = zoneIdsAt(loaded, upper.triggerCenterMm);
  const lowerToUpperExitZones = zoneIdsAt(loaded, lower.exitFeetMm);
  const upperToLowerExitZones = zoneIdsAt(loaded, upper.exitFeetMm);
  const minimumSpawnDistanceMm = Math.round(Math.min(
    ...loaded.manifest.spawns.flatMap(({ feetPositionMm }) => (
      INKFALL_REV5_PORTAL_ENDPOINTS.map(({ triggerCenterMm }) => (
        planarDistance(feetPositionMm, triggerCenterMm)
      ))
    )),
  ));
  const authorityIdentity = INKFALL_REV5_PORTAL_AUTHORITY_IDENTITIES.find(
    (identity) => identity.mapRevision === loaded.identity.revision,
  );
  const checks = Object.freeze({
    authorityIdentityPinned: authorityIdentity !== undefined
      && loaded.identity.id === authorityIdentity.mapId
      && loaded.identity.revision === authorityIdentity.mapRevision
      && loaded.identity.packageDigest
        === authorityIdentity.packageDigest
      && loaded.authority.fixtureHash
        === authorityIdentity.fixtureHash,
    frozenLowerTriggerAnchored: frozenTrigger !== undefined
      && frozenTrigger.kind === 'teleport'
      && frozenTrigger.implementationStatus === 'contract_only'
      && JSON.stringify(frozenTrigger.centerMm)
        === JSON.stringify(lower.triggerCenterMm)
      && JSON.stringify(frozenTrigger.halfExtentsMm)
        === JSON.stringify(lower.triggerHalfExtentsMm),
    additiveOverlayDoesNotMutateManifest:
      loaded.manifest.triggers.length === 1
      && loaded.manifest.spawns.length === 12
      && loaded.manifest.zones.length === 9
      && loaded.manifest.authority.renderMeshesMayBeAuthority === false,
    endpointsZoneBound: lowerZones.includes('teleport_fold')
      && upperZones.includes('teleport_fold'),
    exitsZoneBound: lowerToUpperExitZones.includes('teleport_fold')
      && upperToLowerExitZones.includes('ink_channel_west'),
    exitOffsetsPreventImmediatePartnerReentry:
      !pointInside(
        lower.exitFeetMm,
        upper.triggerCenterMm,
        upper.triggerHalfExtentsMm,
      )
      && !pointInside(
        upper.exitFeetMm,
        lower.triggerCenterMm,
        lower.triggerHalfExtentsMm,
      ),
    portalPairClearOfSpawns: minimumSpawnDistanceMm >= 20_000,
  });
  if (Object.values(checks).some((value) => !value)) {
    throw new Error(
      `INKFALL_REV5_PORTAL_COMPATIBILITY_FAILED ${JSON.stringify(checks)}`,
    );
  }
  return Object.freeze({
    capabilityId: INKFALL_REV5_PORTAL_CAPABILITY_ID,
    lowerZones,
    upperZones,
    lowerToUpperExitZones,
    upperToLowerExitZones,
    minimumSpawnDistanceMm,
    frozenManifestTriggerStatus: frozenTrigger?.implementationStatus ?? null,
    runtimeBindingStatus: 'authoritative_additive_overlay',
    collisionRole: `revision_${loaded.identity.revision}_authoritative_collision_only`,
    renderRole: 'rev5_render_only_no_hit',
    checks,
    allChecksPassed: true,
  });
}
