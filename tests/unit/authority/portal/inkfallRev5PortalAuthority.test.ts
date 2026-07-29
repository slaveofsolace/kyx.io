import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  INKFALL_AUTHORITY_MAP_IDENTITY_V3,
} from '../../../../src/authority/inkfallMapIdentity';
import {
  INKFALL_REV5_PORTAL_CAPABILITY_ID,
  INKFALL_REV5_PORTAL_ENDPOINTS,
  createInkfallRev5PortalAuthorityPort,
  inspectInkfallRev5PortalCompatibility,
} from '../../../../src/authority/portal/inkfallRev5PortalAuthority';
import {
  AUTHORITY_WORLD_PORTAL_SCHEMA_VERSION,
  type AuthorityWorldPortalAdvanceInputV1,
} from '../../../../src/authority/worldPortal';
import {
  requireBundledMapPackageManifest,
} from '../../../../src/content/maps';
import {
  createRapierMovementWorld,
  loadRuntimeMapPackage,
} from '../../../../src/physics';
import {
  PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
  asSimulationTick,
  type MovementSimulationState,
} from '../../../../src/sim';
import {
  FakeMovementQueryPort,
  createTestMovementState,
  millimeterVector,
} from '../../sim/movement/fakeQueryPort';

const PROFILE = PHASE3_HYPOTHESIS_MOVEMENT_PROFILE;
const mapRoot = new URL(
  '../../../../assets/source/maps/inkfall-foundry/',
  import.meta.url,
);

function stateAt(
  position: Readonly<{ x: number; y: number; z: number }>,
  tick: number,
  teleportCooldownTicksRemaining = 0,
): MovementSimulationState {
  const state = createTestMovementState({
    fixtureId: 'inkfall_foundry_map_collision',
    fixtureHash: INKFALL_AUTHORITY_MAP_IDENTITY_V3.fixtureHash,
    feetPosition: position,
  });
  return {
    ...state,
    tick: asSimulationTick(tick),
    player: {
      ...state.player,
      feetPosition: millimeterVector(position.x, position.y, position.z),
      teleportCooldownTicksRemaining,
    },
  };
}

function advanceInput(
  previousState: MovementSimulationState,
  nextState: MovementSimulationState,
): AuthorityWorldPortalAdvanceInputV1 {
  return {
    schemaVersion: AUTHORITY_WORLD_PORTAL_SCHEMA_VERSION,
    authorityTick: nextState.tick,
    previousState,
    nextState,
    profile: PROFILE,
  };
}

function groundedQueries(options: {
  readonly blocked?: boolean;
} = {}): FakeMovementQueryPort {
  return new FakeMovementQueryPort({
    overlap: () => options.blocked ? ['destination_blocker'] : [],
    move: () => ({
      appliedTranslation: millimeterVector(0, 0, 0),
      grounded: true,
      hitCeiling: false,
      support: null,
      contacts: [],
      shapeCasts: 1,
      overlapTests: 0,
    }),
  });
}

describe('Inkfall Rev5 world portal authority', () => {
  it('exposes the versioned optional world-portal port contract', () => {
    const port = createInkfallRev5PortalAuthorityPort(groundedQueries());

    expect(AUTHORITY_WORLD_PORTAL_SCHEMA_VERSION).toBe(1);
    expect(port).toMatchObject({
      schemaVersion: AUTHORITY_WORLD_PORTAL_SCHEMA_VERSION,
      capabilityId: INKFALL_REV5_PORTAL_CAPABILITY_ID,
    });
    expect(Object.isFrozen(port)).toBe(true);
  });

  it.each(INKFALL_REV5_PORTAL_ENDPOINTS)(
    'teleports an edge entry through $id to its linked endpoint',
    (endpoint) => {
      const queries = groundedQueries();
      const port = createInkfallRev5PortalAuthorityPort(queries);
      const previous = stateAt({
        x: endpoint.triggerCenterMm.x + endpoint.triggerHalfExtentsMm.x + 1,
        y: endpoint.triggerCenterMm.y,
        z: endpoint.triggerCenterMm.z,
      }, 0);
      const next = stateAt(endpoint.triggerCenterMm, 1);

      const result = port.advance(advanceInput(previous, next));

      expect(result.state.player.feetPosition).toEqual(endpoint.exitFeetMm);
      expect(result.state.player.yawMilliDegrees).toBe(endpoint.exitYawMilliDegrees);
      expect(result.state.player.teleportCooldownTicksRemaining)
        .toBe(PROFILE.teleport.cooldownTicks);
      expect(result.events).toContainEqual(expect.objectContaining({
        kind: 'teleport_succeeded',
        outcome: 'full',
        from: endpoint.triggerCenterMm,
        to: endpoint.exitFeetMm,
      }));
      expect(result.metrics).toMatchObject({
        overlapCapsuleCalls: 1,
        moveCapsuleCalls: 1,
        volumeCalls: 1,
      });
    },
  );

  it('does not ping-pong at the exit and rejects a forced partner entry during cooldown', () => {
    const lower = INKFALL_REV5_PORTAL_ENDPOINTS[0];
    const upper = INKFALL_REV5_PORTAL_ENDPOINTS[1];
    const queries = groundedQueries();
    const port = createInkfallRev5PortalAuthorityPort(queries);
    const first = port.advance(advanceInput(
      stateAt({
        x: lower.triggerCenterMm.x + lower.triggerHalfExtentsMm.x + 1,
        y: lower.triggerCenterMm.y,
        z: lower.triggerCenterMm.z,
      }, 0),
      stateAt(lower.triggerCenterMm, 1),
    ));

    const stationaryExit = {
      ...first.state,
      tick: asSimulationTick(2),
    };
    const noPingPong = port.advance(advanceInput(first.state, stationaryExit));

    expect(noPingPong.state).toBe(stationaryExit);
    expect(noPingPong.events).toEqual([]);
    expect(queries.overlapRequests).toHaveLength(1);

    const forcedPartnerEntry = port.advance(advanceInput(
      {
        ...stationaryExit,
        player: {
          ...stationaryExit.player,
          feetPosition: millimeterVector(
            upper.triggerCenterMm.x + upper.triggerHalfExtentsMm.x + 1,
            upper.triggerCenterMm.y,
            upper.triggerCenterMm.z,
          ),
        },
      },
      {
        ...stationaryExit,
        tick: asSimulationTick(3),
        player: {
          ...stationaryExit.player,
          feetPosition: millimeterVector(
            upper.triggerCenterMm.x,
            upper.triggerCenterMm.y,
            upper.triggerCenterMm.z,
          ),
        },
      },
    ));

    expect(forcedPartnerEntry.events).toEqual([
      expect.objectContaining({
        kind: 'teleport_rejected',
        reason: 'cooldown',
      }),
    ]);
    expect(forcedPartnerEntry.state.player.feetPosition)
      .toEqual(upper.triggerCenterMm);
    expect(queries.overlapRequests).toHaveLength(1);
  });

  it('fails closed without moving when the destination capsule is blocked', () => {
    const endpoint = INKFALL_REV5_PORTAL_ENDPOINTS[0];
    const queries = groundedQueries({ blocked: true });
    const port = createInkfallRev5PortalAuthorityPort(queries);
    const next = stateAt(endpoint.triggerCenterMm, 1);
    const result = port.advance(advanceInput(
      stateAt({
        x: endpoint.triggerCenterMm.x + endpoint.triggerHalfExtentsMm.x + 1,
        y: endpoint.triggerCenterMm.y,
        z: endpoint.triggerCenterMm.z,
      }, 0),
      next,
    ));

    expect(result.state.player.feetPosition).toEqual(next.player.feetPosition);
    expect(result.events).toEqual([
      expect.objectContaining({
        kind: 'teleport_rejected',
        reason: 'blocked',
      }),
    ]);
    expect(result.metrics).toMatchObject({
      overlapCapsuleCalls: 1,
      moveCapsuleCalls: 0,
      volumeCalls: 0,
      contacts: 1,
    });
    expect(queries.moveRequests).toEqual([]);
    expect(queries.volumeRequests).toEqual([]);
  });

  it('keeps the standing upper return exit clear in the frozen authority collision', async () => {
    const manifest = await requireBundledMapPackageManifest('inkfall_foundry', 3);
    const [render, collision] = await Promise.all([
      readFile(new URL(manifest.artifacts.render.path, mapRoot)),
      readFile(new URL(manifest.artifacts.collision.path, mapRoot)),
    ]);
    const loaded = await loadRuntimeMapPackage(manifest, { render, collision });
    const world = await createRapierMovementWorld(loaded.authority.fixture);
    const upper = INKFALL_REV5_PORTAL_ENDPOINTS[1];
    try {
      const port = createInkfallRev5PortalAuthorityPort(world);
      const result = port.advance(advanceInput(
        stateAt({
          x: upper.triggerCenterMm.x + upper.triggerHalfExtentsMm.x + 1,
          y: upper.triggerCenterMm.y,
          z: upper.triggerCenterMm.z,
        }, 0),
        stateAt(upper.triggerCenterMm, 1),
      ));

      expect(result.events).toContainEqual(expect.objectContaining({
        kind: 'teleport_succeeded',
        outcome: 'full',
        to: upper.exitFeetMm,
      }));
      expect(result.state.player.feetPosition).toEqual(upper.exitFeetMm);
      expect(result.events.some(({ kind }) => kind === 'teleport_rejected')).toBe(false);
    } finally {
      world.dispose();
    }
  });

  it('passes compatibility without changing the frozen trigger, spawn, or zone contract', async () => {
    const manifest = await requireBundledMapPackageManifest('inkfall_foundry', 3);
    const [render, collision] = await Promise.all([
      readFile(new URL(manifest.artifacts.render.path, mapRoot)),
      readFile(new URL(manifest.artifacts.collision.path, mapRoot)),
    ]);
    const loaded = await loadRuntimeMapPackage(manifest, { render, collision });
    const frozenCollections = {
      triggers: loaded.manifest.triggers,
      spawns: loaded.manifest.spawns,
      zones: loaded.manifest.zones,
    };

    const compatibility = inspectInkfallRev5PortalCompatibility(loaded);

    expect(compatibility).toMatchObject({
      capabilityId: INKFALL_REV5_PORTAL_CAPABILITY_ID,
      allChecksPassed: true,
      frozenManifestTriggerStatus: 'contract_only',
      checks: {
        authorityIdentityPinned: true,
        frozenLowerTriggerAnchored: true,
        additiveOverlayDoesNotMutateManifest: true,
        endpointsZoneBound: true,
        exitsZoneBound: true,
        exitOffsetsPreventImmediatePartnerReentry: true,
        portalPairClearOfSpawns: true,
      },
    });
    expect(compatibility.upperToLowerExitZones).toEqual(['ink_channel_west']);
    expect(loaded.manifest.triggers).toBe(frozenCollections.triggers);
    expect(loaded.manifest.spawns).toBe(frozenCollections.spawns);
    expect(loaded.manifest.zones).toBe(frozenCollections.zones);
    expect([
      loaded.manifest.triggers.length,
      loaded.manifest.spawns.length,
      loaded.manifest.zones.length,
    ]).toEqual([1, 12, 9]);
    expect([
      Object.isFrozen(loaded.manifest.triggers),
      Object.isFrozen(loaded.manifest.spawns),
      Object.isFrozen(loaded.manifest.zones),
    ]).toEqual([true, true, true]);
  });
});
