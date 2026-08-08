import { describe, expect, it } from 'vitest';

import {
  RELAY_PORTAL_CAPABILITY_ID,
  RELAY_PORTAL_ENDPOINTS,
  RELAY_PORTAL_PRESENTATION_DEFINITIONS,
  createRelayPortalAuthorityPort,
} from '../../../../src/authority/portal/relayPortalAuthority';
import {
  RELAY_AUTHORITY_FIXTURE,
  RELAY_AUTHORITY_IDENTITY,
} from '../../../../src/authority/relayAuthority';
import {
  AUTHORITY_WORLD_PORTAL_SCHEMA_VERSION,
  type AuthorityWorldPortalAdvanceInputV1,
} from '../../../../src/authority/worldPortal';
import {
  PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
  asSimulationTick,
  type MovementSimulationState,
} from '../../../../src/sim';
import { createRapierMovementWorld } from '../../../../src/physics';
import {
  FakeMovementQueryPort,
  createTestMovementState,
  millimeterVector,
} from '../../sim/movement/fakeQueryPort';

const PROFILE = PHASE3_HYPOTHESIS_MOVEMENT_PROFILE;

function stateAt(
  position: Readonly<{ x: number; y: number; z: number }>,
  tick: number,
  teleportCooldownTicksRemaining = 0,
  fixtureHash = RELAY_AUTHORITY_IDENTITY.fixtureHash,
): MovementSimulationState {
  const state = createTestMovementState({
    fixtureId: RELAY_AUTHORITY_IDENTITY.fixtureId,
    fixtureHash,
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

function groundedQueries(): FakeMovementQueryPort {
  return new FakeMovementQueryPort({
    overlap: () => [],
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

describe('Relay linked world portal authority', () => {
  it('binds a versioned authority port and two matching presentation apertures', () => {
    const port = createRelayPortalAuthorityPort(groundedQueries());

    expect(port).toMatchObject({
      schemaVersion: AUTHORITY_WORLD_PORTAL_SCHEMA_VERSION,
      capabilityId: RELAY_PORTAL_CAPABILITY_ID,
    });
    expect(RELAY_PORTAL_ENDPOINTS).toHaveLength(2);
    expect(RELAY_PORTAL_PRESENTATION_DEFINITIONS.map(({ id }) => id))
      .toEqual(RELAY_PORTAL_ENDPOINTS.map(({ id }) => id));
    expect(Object.isFrozen(port)).toBe(true);
  });

  it.each(RELAY_PORTAL_ENDPOINTS)(
    'teleports an edge entry through $id to its proven route exit',
    (endpoint) => {
      const queries = groundedQueries();
      const port = createRelayPortalAuthorityPort(queries);
      const outside = stateAt({
        x: endpoint.triggerCenterMm.x + endpoint.triggerHalfExtentsMm.x + 1,
        y: endpoint.triggerCenterMm.y,
        z: endpoint.triggerCenterMm.z,
      }, 0);
      const result = port.advance(advanceInput(
        outside,
        stateAt(endpoint.triggerCenterMm, 1),
      ));

      expect(result.state.player.feetPosition).toEqual(endpoint.exitFeetMm);
      expect(result.state.player.yawMilliDegrees).toBe(endpoint.exitYawMilliDegrees);
      expect(result.state.player.teleportCooldownTicksRemaining)
        .toBe(PROFILE.teleport.cooldownTicks);
      expect(result.events).toContainEqual(expect.objectContaining({
        kind: 'teleport_succeeded',
        outcome: 'full',
        from: endpoint.triggerCenterMm,
        to: endpoint.exitFeetMm,
        worldPortal: expect.objectContaining({
          capabilityId: RELAY_PORTAL_CAPABILITY_ID,
          endpointId: endpoint.id,
          partnerEndpointId: endpoint.partnerId,
        }),
      }));
      expect(result.metrics).toMatchObject({
        overlapCapsuleCalls: 1,
        moveCapsuleCalls: 1,
        volumeCalls: 1,
      });
    },
  );

  it('does not trigger while remaining inside and fails closed on cross-fixture input', () => {
    const endpoint = RELAY_PORTAL_ENDPOINTS[0];
    const port = createRelayPortalAuthorityPort(groundedQueries());
    const inside = stateAt(endpoint.triggerCenterMm, 1);
    const stationary = {
      ...inside,
      tick: asSimulationTick(2),
    };

    expect(port.advance(advanceInput(inside, stationary)).events).toEqual([]);
    expect(() => port.advance(advanceInput(
      stateAt(endpoint.triggerCenterMm, 0, 0, '0000000000000000'),
      stateAt(endpoint.triggerCenterMm, 1, 0, '0000000000000000'),
    ))).toThrow('RELAY_PORTAL_AUTHORITY_INPUT_MISMATCH');
  });

  it('keeps both standing exits clear in the exact Relay authority collision', async () => {
    const world = await createRapierMovementWorld(RELAY_AUTHORITY_FIXTURE);
    try {
      const port = createRelayPortalAuthorityPort(world);
      for (const endpoint of RELAY_PORTAL_ENDPOINTS) {
        const result = port.advance(advanceInput(
          stateAt({
            x: endpoint.triggerCenterMm.x + endpoint.triggerHalfExtentsMm.x + 1,
            y: endpoint.triggerCenterMm.y,
            z: endpoint.triggerCenterMm.z,
          }, 0),
          stateAt(endpoint.triggerCenterMm, 1),
        ));
        expect(result.events).toContainEqual(expect.objectContaining({
          kind: 'teleport_succeeded',
          to: endpoint.exitFeetMm,
        }));
        expect(result.events.some(({ kind }) => kind === 'teleport_rejected'))
          .toBe(false);
      }
    } finally {
      world.dispose();
    }
  });
});
