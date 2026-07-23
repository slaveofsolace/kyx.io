import { describe, expect, it } from 'vitest';

import {
  CONTACT_NORMAL_Q15_SCALE,
  INTENT_BUTTON,
  PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
  stepMovementSimulation,
  type CapsuleMoveRequest,
  type CapsuleMoveResult,
  type MovementQueryPort,
} from '../../../../src/sim';
import {
  FakeMovementQueryPort,
  createTestMovementState,
  millimeterVector,
  testIntent,
} from './fakeQueryPort';

const PROFILE = PHASE3_HYPOTHESIS_MOVEMENT_PROFILE;

function validMove(request: CapsuleMoveRequest): CapsuleMoveResult {
  return {
    appliedTranslation: { ...request.desiredTranslation },
    grounded: true,
    hitCeiling: false,
    support: null,
    contacts: [],
    shapeCasts: 1,
    overlapTests: 0,
  };
}

describe('movement query runtime trust boundary', () => {
  it.each([
    ['a vector missing z', (request: CapsuleMoveRequest) => ({
      ...validMove(request),
      appliedTranslation: { x: 0, y: 0 } as never,
    })],
    ['a non-boolean grounded flag', (request: CapsuleMoveRequest) => ({
      ...validMove(request),
      grounded: 1 as never,
    })],
    ['an unsupported collision layer', (request: CapsuleMoveRequest) => ({
      ...validMove(request),
      contacts: [{
        colliderId: 'wall',
        layer: 'secret_layer' as never,
        normalQ15: { x: CONTACT_NORMAL_Q15_SCALE, y: 0, z: 0 },
        timeOfImpactPermille: 500,
      }],
    })],
    ['an unsafe collider ID', (request: CapsuleMoveRequest) => ({
      ...validMove(request),
      contacts: [{
        colliderId: '__proto__',
        layer: 'world_static' as const,
        normalQ15: { x: CONTACT_NORMAL_Q15_SCALE, y: 0, z: 0 },
        timeOfImpactPermille: 500,
      }],
    })],
    ['a contact normal missing y', (request: CapsuleMoveRequest) => ({
      ...validMove(request),
      contacts: [{
        colliderId: 'wall',
        layer: 'world_static' as const,
        normalQ15: { x: CONTACT_NORMAL_Q15_SCALE, z: 0 } as never,
        timeOfImpactPermille: 500,
      }],
    })],
    ['an unsupported support layer', (request: CapsuleMoveRequest) => ({
      ...validMove(request),
      support: {
        colliderId: 'floor',
        layer: 'unknown' as never,
        normalQ15: { x: 0, y: CONTACT_NORMAL_Q15_SCALE, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
      } as never,
    })],
  ])('rejects %s returned by moveCapsule', (_label, move) => {
    const queries = new FakeMovementQueryPort({ move });
    expect(() => stepMovementSimulation(
      createTestMovementState(),
      [],
      PROFILE,
      queries,
    )).toThrow();
  });

  it('rejects an omitted cast hit field instead of treating it as no hit', () => {
    const queries = new FakeMovementQueryPort({
      cast: (request) => ({
        allowedTranslation: { ...request.translation },
        shapeCasts: 1,
      } as never),
    });
    expect(() => stepMovementSimulation(
      createTestMovementState(),
      [testIntent(0, 0, { pressedButtons: INTENT_BUTTON.utility })],
      PROFILE,
      queries,
    )).toThrow(/object or null/);
  });

  it('rejects unsafe overlap collider IDs during stance expansion', () => {
    const queries = new FakeMovementQueryPort({ overlap: () => ['constructor'] });
    expect(() => stepMovementSimulation(
      createTestMovementState({ stance: 'crouched' }),
      [],
      PROFILE,
      queries,
    )).toThrow(/safe/);
  });

  it('rejects unsupported volume kinds', () => {
    const queries = new FakeMovementQueryPort({
      volumes: () => [{ colliderId: 'bad_volume', kind: 'lava' as never }],
    });
    expect(() => stepMovementSimulation(
      createTestMovementState(),
      [],
      PROFILE,
      queries,
    )).toThrow(/unsupported kind/);
  });

  it('rejects a query port whose required operations are not callable', () => {
    const malformed = {
      ...new FakeMovementQueryPort(),
      schemaVersion: 1,
    } as unknown as MovementQueryPort;
    expect(() => stepMovementSimulation(
      createTestMovementState(),
      [],
      PROFILE,
      malformed,
    )).toThrow(/must be a function/);
  });

  it('sorts contacts by code unit before order-sensitive clipping', () => {
    const queries = new FakeMovementQueryPort({
      move: (request) => ({
        ...validMove(request),
        appliedTranslation: millimeterVector(
          request.desiredTranslation.x,
          request.desiredTranslation.y,
          request.desiredTranslation.z,
        ),
        contacts: [
          {
            colliderId: 'lower',
            layer: 'world_static',
            normalQ15: { x: CONTACT_NORMAL_Q15_SCALE, y: 0, z: 0 },
            timeOfImpactPermille: 500,
          },
          {
            colliderId: 'Zed',
            layer: 'world_static',
            normalQ15: { x: 23_170, y: 0, z: 23_170 },
            timeOfImpactPermille: 500,
          },
        ],
      }),
    });
    const result = stepMovementSimulation(
      createTestMovementState({ velocity: { x: -5_000, z: -5_000 } }),
      [],
      PROFILE,
      queries,
    );

    expect(Math.abs(result.state.player.velocity.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.state.player.velocity.z)).toBeLessThanOrEqual(1);
  });

  it('sorts returned volumes by code unit before storing canonical state', () => {
    const aliasedVolume = { colliderId: 'lower', kind: 'recovery' as const };
    const queries = new FakeMovementQueryPort({
      volumes: () => [
        aliasedVolume,
        { colliderId: 'Zed', kind: 'kill' },
        { colliderId: 'Alpha', kind: 'forbidden' },
      ],
    });
    const result = stepMovementSimulation(createTestMovementState(), [], PROFILE, queries);

    expect(result.state.player.activeVolumes.map(({ colliderId }) => colliderId))
      .toEqual(['Alpha', 'Zed', 'lower']);
    (aliasedVolume as { kind: string }).kind = 'kill';
    expect(result.state.player.activeVolumes.at(-1)?.kind).toBe('recovery');
  });

  it('projects velocity up an exact 45-degree walkable slope', () => {
    const queries = new FakeMovementQueryPort({
      move: (request) => ({
        ...validMove(request),
        contacts: [{
          colliderId: 'walkable_45',
          layer: 'world_static',
          normalQ15: { x: -23_170, y: 23_170, z: 0 },
          timeOfImpactPermille: 500,
        }],
      }),
    });
    const result = stepMovementSimulation(
      createTestMovementState({ velocity: { x: 5_000 } }),
      [],
      PROFILE,
      queries,
    );

    expect(result.state.player.velocity.x).toBeGreaterThan(0);
    expect(result.state.player.velocity.x).toBeLessThan(3_000);
    expect(result.state.player.velocity.y).toBeGreaterThan(0);
  });

  it('treats a 50-degree upward face as a wall without generating vertical velocity', () => {
    const queries = new FakeMovementQueryPort({
      move: (request) => ({
        ...validMove(request),
        contacts: [{
          colliderId: 'blocked_50',
          layer: 'world_static',
          normalQ15: { x: -25_283, y: 20_844, z: 0 },
          timeOfImpactPermille: 500,
        }],
      }),
    });
    const result = stepMovementSimulation(
      createTestMovementState({ velocity: { x: 5_000 } }),
      [],
      PROFILE,
      queries,
    );

    expect(Math.abs(result.state.player.velocity.x)).toBeLessThanOrEqual(1);
    expect(result.state.player.velocity.y).toBe(0);
  });

  it('preserves falling/downhill projection on a non-walkable slope', () => {
    const queries = new FakeMovementQueryPort({
      move: (request) => ({
        ...validMove(request),
        grounded: false,
        contacts: [{
          colliderId: 'steep_downhill',
          layer: 'world_static',
          normalQ15: { x: -25_283, y: 20_844, z: 0 },
          timeOfImpactPermille: 500,
        }],
      }),
    });
    const result = stepMovementSimulation(
      createTestMovementState({ grounded: false, feetPosition: { y: 10_000 }, velocity: { y: -1_000 } }),
      [],
      PROFILE,
      queries,
    );

    expect(result.state.player.velocity.x).toBeLessThan(0);
    expect(result.state.player.velocity.y).toBeLessThan(0);
  });
});
