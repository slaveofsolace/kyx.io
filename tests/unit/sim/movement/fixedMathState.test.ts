import { describe, expect, it } from 'vitest';

import {
  CONTACT_NORMAL_Q15_SCALE,
  PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
  assertMovementSimulationState,
  hashCanonicalMovementState,
  hashMovementProfile,
  normalizedPlanarIntentQ15,
  serializeCanonicalMovementState,
  sinCosMilliDegreesQ15,
  yawRelativePlanarIntentQ15,
  type MovementSimulationState,
} from '../../../../src/sim';
import { createTestMovementState } from './fakeQueryPort';

describe('fixed movement math', () => {
  it('builds deterministic cardinal CORDIC bases without ambient trigonometry', () => {
    const zero = sinCosMilliDegreesQ15(0);
    const quarter = sinCosMilliDegreesQ15(90_000);
    const half = sinCosMilliDegreesQ15(180_000);

    expect(zero.cosQ15).toBeGreaterThanOrEqual(CONTACT_NORMAL_Q15_SCALE - 2);
    expect(Math.abs(zero.sinQ15)).toBeLessThanOrEqual(2);
    expect(quarter.sinQ15).toBeGreaterThanOrEqual(CONTACT_NORMAL_Q15_SCALE - 2);
    expect(Math.abs(quarter.cosQ15)).toBeLessThanOrEqual(2);
    expect(half.cosQ15).toBeLessThanOrEqual(-CONTACT_NORMAL_Q15_SCALE + 2);
    expect(Math.abs(half.sinQ15)).toBeLessThanOrEqual(2);
  });

  it('normalizes diagonal intent so it is not faster than cardinal input', () => {
    const cardinal = normalizedPlanarIntentQ15(0, 127);
    const diagonal = normalizedPlanarIntentQ15(127, 127);
    const diagonalSquared = diagonal.x * diagonal.x + diagonal.z * diagonal.z;

    expect(cardinal).toEqual({ x: 0, z: CONTACT_NORMAL_Q15_SCALE });
    expect(diagonal.x).toBe(diagonal.z);
    expect(diagonalSquared).toBeLessThanOrEqual(CONTACT_NORMAL_Q15_SCALE ** 2);
  });

  it('rotates forward intent relative to normalized yaw', () => {
    const forward = yawRelativePlanarIntentQ15(0, 127, 0);
    const right = yawRelativePlanarIntentQ15(0, 127, 90_000);

    expect(forward.z).toBeGreaterThanOrEqual(CONTACT_NORMAL_Q15_SCALE - 2);
    expect(Math.abs(forward.x)).toBeLessThanOrEqual(2);
    expect(right.x).toBeGreaterThanOrEqual(CONTACT_NORMAL_Q15_SCALE - 2);
    expect(Math.abs(right.z)).toBeLessThanOrEqual(2);
  });
});

describe('movement identity and canonical state', () => {
  it('hashes the complete profile and changes when a tuning value changes', () => {
    const changed = {
      ...PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
      locomotion: {
        ...PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.locomotion,
        walkSpeedMmPerSecond:
          PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.locomotion.walkSpeedMmPerSecond + 1,
      },
    };

    expect(hashMovementProfile(PHASE3_HYPOTHESIS_MOVEMENT_PROFILE)).toHaveLength(16);
    expect(hashMovementProfile(changed)).not.toBe(
      hashMovementProfile(PHASE3_HYPOTHESIS_MOVEMENT_PROFILE),
    );
  });

  it('keeps schema-v1 hashes stable across outer ruleset hashes while binding movement inputs', () => {
    const baseline = createTestMovementState();
    const otherRuleset = createTestMovementState({ rulesetHash: '3333333333333333' });
    const otherFixture = createTestMovementState({ fixtureHash: '2222222222222222' });
    const otherAdapter = createTestMovementState({ physicsAdapterVersion: '1.0.1' });

    expect(hashCanonicalMovementState(otherRuleset)).toBe(hashCanonicalMovementState(baseline));
    expect(hashCanonicalMovementState(otherFixture)).not.toBe(hashCanonicalMovementState(baseline));
    expect(hashCanonicalMovementState(otherAdapter)).not.toBe(hashCanonicalMovementState(baseline));
  });

  it('uses code-unit ordering for adversarial volume identifiers', () => {
    const baseline = createTestMovementState();
    const withVolumes: MovementSimulationState = {
      ...baseline,
      player: {
        ...baseline.player,
        activeVolumes: [
          { colliderId: 'lower', kind: 'recovery' },
          { colliderId: 'Zed', kind: 'kill' },
          { colliderId: 'Alpha', kind: 'forbidden' },
        ],
      },
    };
    const reversed: MovementSimulationState = {
      ...withVolumes,
      player: { ...withVolumes.player, activeVolumes: [...withVolumes.player.activeVolumes].reverse() },
    };

    const serialized = serializeCanonicalMovementState(withVolumes);
    expect(serialized.indexOf('Alpha')).toBeLessThan(serialized.indexOf('Zed'));
    expect(serialized.indexOf('Zed')).toBeLessThan(serialized.indexOf('lower'));
    expect(hashCanonicalMovementState(reversed)).toBe(hashCanonicalMovementState(withVolumes));
  });

  it.each([
    ['invalid ruleset hash', (state: MovementSimulationState) => ({
      ...state,
      identity: { ...state.identity, rulesetHash: 'NOT_A_HASH' },
    })],
    ['missing vector axis', (state: MovementSimulationState) => ({
      ...state,
      player: { ...state.player, feetPosition: { x: 0, y: 0 } as never },
    })],
    ['unsupported stance', (state: MovementSimulationState) => ({
      ...state,
      player: { ...state.player, stance: 'prone' as never },
    })],
    ['unsupported locomotion', (state: MovementSimulationState) => ({
      ...state,
      player: { ...state.player, locomotion: 'flying' as never },
    })],
    ['non-boolean grounded', (state: MovementSimulationState) => ({
      ...state,
      player: { ...state.player, grounded: 1 as never },
    })],
    ['non-numeric pitch', (state: MovementSimulationState) => ({
      ...state,
      player: { ...state.player, pitchMilliDegrees: '0' as never },
    })],
    ['unsupported support layer', (state: MovementSimulationState) => ({
      ...state,
      player: {
        ...state.player,
        support: {
          colliderId: 'floor',
          layer: 'secret' as never,
          normalQ15: { x: 0, y: CONTACT_NORMAL_Q15_SCALE, z: 0 },
          velocity: { x: 0, y: 0, z: 0 },
        },
      },
    })],
    ['unsupported intent bits', (state: MovementSimulationState) => ({
      ...state,
      player: {
        ...state.player,
        intent: { ...state.player.intent, heldButtons: 1 << 20 },
      },
    })],
  ])('rejects malformed runtime state: %s', (_label, mutate) => {
    expect(() => assertMovementSimulationState(
      mutate(createTestMovementState()) as never,
    )).toThrow();
  });
});
