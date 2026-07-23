import { describe, expect, it } from 'vitest';

import {
  advanceAutoRifle,
  assertAutoRifleRules,
  assertAutoRifleState,
  AUTO_RIFLE_RECOIL_PATTERN_ID,
  AUTO_RIFLE_WEAPON_ID,
  createAutoRifleState,
  G4_AUTO_RIFLE_RULES,
  type AdvanceAutoRifleResult,
  type AutoRifleAuthorityTickInput,
  type AutoRifleBallisticsSample,
  type AutoRifleState,
} from '../../../../src/authority';

function input(
  authorityTick: number,
  overrides: Partial<AutoRifleAuthorityTickInput> = {},
): AutoRifleAuthorityTickInput {
  return {
    authorityTick,
    authorityInputSequence: authorityTick,
    lifePhase: 'alive',
    weaponSelected: true,
    sprintHeld: false,
    fireHeld: false,
    reloadPressed: false,
    ...overrides,
  };
}

function accepted(result: AdvanceAutoRifleResult): Extract<AdvanceAutoRifleResult, { accepted: true }> {
  if (!result.accepted) throw new Error(`expected accepted authority tick, got ${result.reason}`);
  return result;
}

function step(
  state: AutoRifleState,
  authorityTick: number,
  overrides: Partial<AutoRifleAuthorityTickInput> = {},
): Extract<AdvanceAutoRifleResult, { accepted: true }> {
  return accepted(advanceAutoRifle(state, input(authorityTick, overrides)));
}

function equipThroughTick(
  finalTick: number,
  roomSeed = 'room_test_seed',
): AutoRifleState {
  let state = createAutoRifleState({
    playerId: 'player_alpha',
    roomSeed,
    authorityTick: 0,
  });
  for (let authorityTick = 0; authorityTick <= finalTick; authorityTick += 1) {
    state = step(state, authorityTick).state;
  }
  return state;
}

function heldFireTape(roomSeed: string, renderFramesPerAuthorityTick: readonly number[]): {
  readonly state: AutoRifleState;
  readonly shots: readonly AutoRifleBallisticsSample[];
} {
  let state = createAutoRifleState({
    playerId: 'player_alpha',
    roomSeed,
    authorityTick: 0,
  });
  const shots: AutoRifleBallisticsSample[] = [];
  for (let authorityTick = 0; authorityTick <= 50; authorityTick += 1) {
    // Presentation/render work deliberately has no input into the authority
    // state machine. Varying this loop cannot change a tick result.
    for (
      let renderFrame = 0;
      renderFrame < renderFramesPerAuthorityTick[authorityTick % renderFramesPerAuthorityTick.length];
      renderFrame += 1
    ) {
      expect(renderFrame).toBeGreaterThanOrEqual(0);
    }
    const result = step(state, authorityTick, { fireHeld: authorityTick >= 4 });
    state = result.state;
    if (result.shot !== null) shots.push(result.shot.ballistics);
  }
  return Object.freeze({ state, shots: Object.freeze(shots) });
}

describe('P5.2 authoritative Auto Rifle state machine', () => {
  it('pins the explicit 20 Hz fixture and atomically accepts the cadence boundary shot', () => {
    expect(G4_AUTO_RIFLE_RULES).toEqual({
      schemaVersion: 1,
      weaponId: AUTO_RIFLE_WEAPON_ID,
      authorityHz: 20,
      referenceDamagePoints: 10,
      pelletsPerShot: 1,
      headMultiplierPermille: 1_000,
      limbMultiplierPermille: 1_000,
      rangeMillimeters: 120_000,
      magazineCapacity: 50,
      reserveCapacity: 150,
      shotCooldownTicks: 2,
      reloadDurationTicks: 60,
      readyDurationTicks: 4,
      autoReloadEnabled: true,
      firingBlockedWhileSprinting: true,
      reloadTransferPolicy: 'completion_tick_once',
      reloadInterruptionPolicy: 'fire_or_sprint_before_transfer_death_always',
      sprintReleasePolicy: 'ready_delay',
      recoilPatternId: AUTO_RIFLE_RECOIL_PATTERN_ID,
      recoilPatternLength: 12,
      baseSpreadMilliDegrees: 0,
      maximumSpreadMilliDegrees: 1_146,
    });

    const initial = createAutoRifleState({
      playerId: 'player_alpha',
      roomSeed: 'room_one',
      authorityTick: 0,
    });
    expect(initial).toMatchObject({
      phase: 'holstered',
      magazineRounds: 50,
      reserveRounds: 150,
      acceptedShotCount: 0,
    });
    expect(initial.eventNamespace).toMatch(/^[a-f0-9]{16}$/u);
    expect(Object.isFrozen(initial)).toBe(true);

    let result = step(initial, 0, { fireHeld: true });
    expect(result).toMatchObject({
      state: { phase: 'equipping', readyAtTick: 4, magazineRounds: 50 },
      shot: null,
      fireRejection: 'not_ready',
    });
    let state = result.state;
    for (let authorityTick = 1; authorityTick < 4; authorityTick += 1) {
      result = step(state, authorityTick, { fireHeld: true });
      expect(result.fireRejection).toBe('not_ready');
      state = result.state;
    }

    result = step(state, 4, { fireHeld: true });
    expect(result).toMatchObject({
      state: {
        phase: 'firing',
        magazineRounds: 49,
        reserveRounds: 150,
        acceptedShotCount: 1,
        nextShotAtTick: 6,
      },
      shot: {
        kind: 'auto_rifle_shot_accepted',
        authorityTick: 4,
        shotOrdinal: 1,
        referenceDamagePoints: 10,
        magazineRoundsAfter: 49,
        nextShotAtTick: 6,
      },
      fireRejection: null,
    });
    expect(result.events).toEqual([result.shot]);
    expect(result.shot?.eventId.length).toBeLessThanOrEqual(96);
    expect(initial).toMatchObject({ magazineRounds: 50, nextShotAtTick: 0 });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.state)).toBe(true);
    expect(Object.isFrozen(result.shot?.ballistics)).toBe(true);
  });

  it('fires held input only on the two-tick cadence boundary', () => {
    let state = equipThroughTick(3);
    const acceptedTicks: number[] = [];
    const rejectedTicks: number[] = [];
    for (let authorityTick = 4; authorityTick <= 12; authorityTick += 1) {
      const result = step(state, authorityTick, { fireHeld: true });
      state = result.state;
      if (result.shot === null) {
        rejectedTicks.push(authorityTick);
        expect(result.fireRejection).toBe('cadence');
      } else {
        acceptedTicks.push(result.shot.authorityTick);
      }
    }
    expect(acceptedTicks).toEqual([4, 6, 8, 10, 12]);
    expect(rejectedTicks).toEqual([5, 7, 9, 11]);
    expect(state).toMatchObject({
      phase: 'firing',
      magazineRounds: 45,
      acceptedShotCount: 5,
      nextShotAtTick: 14,
    });
  });

  it('auto-reloads an empty magazine and applies its completion transfer exactly once', () => {
    let state = equipThroughTick(3);
    const reloadCompletions: string[] = [];
    let emptyShotTick = -1;
    let reloadStartTick = -1;
    let emptyState: AutoRifleState | null = null;
    let completionResult: ReturnType<typeof step> | null = null;

    for (let authorityTick = 4; authorityTick <= 164; authorityTick += 1) {
      const result = step(state, authorityTick, { fireHeld: true });
      state = result.state;
      for (const event of result.events) {
        if (event.kind === 'auto_rifle_reload_started') reloadStartTick = authorityTick;
        if (event.kind === 'auto_rifle_reload_completed') reloadCompletions.push(event.eventId);
      }
      if (result.shot?.magazineRoundsAfter === 0) {
        emptyShotTick = authorityTick;
        emptyState = result.state;
      }
      if (result.events.some((event) => event.kind === 'auto_rifle_reload_completed')) {
        completionResult = result;
      }
    }

    expect(emptyShotTick).toBe(102);
    expect(emptyState).toMatchObject({ phase: 'empty', magazineRounds: 0, reserveRounds: 150 });
    expect(reloadStartTick).toBe(103);
    expect(completionResult).not.toBeNull();
    expect(completionResult?.events).toMatchObject([
      {
        kind: 'auto_rifle_reload_completed',
        authorityTick: 163,
        reloadOrdinal: 1,
        roundsTransferred: 50,
        magazineRoundsAfter: 50,
        reserveRoundsAfter: 100,
      },
      {
        kind: 'auto_rifle_shot_accepted',
        authorityTick: 163,
        shotOrdinal: 51,
        magazineRoundsAfter: 49,
        reserveRoundsAfter: 100,
      },
    ]);
    expect(reloadCompletions).toHaveLength(1);
    expect(reloadCompletions[0]).toMatch(
      /^combat\.auto_rifle\.reload_completed\.[a-f0-9]{16}\.1$/u,
    );
    expect(state).toMatchObject({
      completedReloadOrdinal: 1,
      reloadOrdinal: 1,
      activeReload: null,
      magazineRounds: 49,
      reserveRounds: 100,
      acceptedShotCount: 51,
    });
  });

  it('transfers a manual partial reload at tick 60 and never repeats it', () => {
    let state = equipThroughTick(3);
    state = step(state, 4, { fireHeld: true }).state;
    const started = step(state, 5, { reloadPressed: true });
    state = started.state;
    expect(started.events).toMatchObject([{
      kind: 'auto_rifle_reload_started',
      source: 'manual',
      reloadOrdinal: 1,
      completesAtTick: 65,
    }]);

    for (let authorityTick = 6; authorityTick < 65; authorityTick += 1) {
      const result = step(state, authorityTick);
      expect(result.events).toEqual([]);
      state = result.state;
    }
    const completed = step(state, 65);
    expect(completed.events).toMatchObject([{
      kind: 'auto_rifle_reload_completed',
      roundsTransferred: 1,
      magazineRoundsAfter: 50,
      reserveRoundsAfter: 149,
    }]);
    const after = step(completed.state, 66);
    expect(after.events).toEqual([]);
    expect(after.state).toMatchObject({
      magazineRounds: 50,
      reserveRounds: 149,
      activeReload: null,
      reloadOrdinal: 1,
      completedReloadOrdinal: 1,
    });
  });

  it('cancels an in-progress reload on fire and accepts the shot in the same atomic step', () => {
    let state = equipThroughTick(3);
    state = step(state, 4, { fireHeld: true }).state;
    state = step(state, 5, { reloadPressed: true }).state;
    const interrupted = step(state, 10, { fireHeld: true });
    expect(interrupted.events).toMatchObject([
      {
        kind: 'auto_rifle_reload_cancelled',
        authorityTick: 10,
        reloadOrdinal: 1,
        reason: 'fire',
      },
      {
        kind: 'auto_rifle_shot_accepted',
        authorityTick: 10,
        shotOrdinal: 2,
        magazineRoundsAfter: 48,
      },
    ]);
    expect(interrupted.state).toMatchObject({
      phase: 'firing',
      magazineRounds: 48,
      reserveRounds: 150,
      activeReload: null,
      reloadOrdinal: 1,
      completedReloadOrdinal: 0,
    });
  });

  it('blocks sprint fire, cancels an early reload, and enforces four ready ticks after release', () => {
    let state = equipThroughTick(3);
    state = step(state, 4, { fireHeld: true }).state;
    state = step(state, 5, { reloadPressed: true }).state;
    const sprinting = step(state, 6, { sprintHeld: true, fireHeld: true });
    expect(sprinting.events).toMatchObject([{
      kind: 'auto_rifle_reload_cancelled',
      reason: 'sprint',
    }]);
    expect(sprinting).toMatchObject({
      state: { phase: 'sprinting', magazineRounds: 49, reserveRounds: 150 },
      shot: null,
      fireRejection: 'sprinting',
    });

    let result = step(sprinting.state, 7, { fireHeld: true });
    expect(result).toMatchObject({
      state: { phase: 'recovering', readyAtTick: 11 },
      fireRejection: 'not_ready',
    });
    for (let authorityTick = 8; authorityTick < 11; authorityTick += 1) {
      result = step(result.state, authorityTick, { fireHeld: true });
      expect(result.fireRejection).toBe('not_ready');
    }
    result = step(result.state, 11, { fireHeld: true });
    expect(result).toMatchObject({
      state: { phase: 'firing', readyAtTick: null, magazineRounds: 48 },
      shot: { authorityTick: 11, shotOrdinal: 2 },
      fireRejection: null,
    });
  });

  it('completes before sprint on the marker tick, while death always cancels the transfer', () => {
    let sprintState = equipThroughTick(3, 'room_sprint_boundary');
    sprintState = step(sprintState, 4, { fireHeld: true }).state;
    sprintState = step(sprintState, 5, { reloadPressed: true }).state;
    const completionThenSprint = step(sprintState, 65, { sprintHeld: true });
    expect(completionThenSprint.events).toMatchObject([{
      kind: 'auto_rifle_reload_completed',
      roundsTransferred: 1,
      magazineRoundsAfter: 50,
      reserveRoundsAfter: 149,
    }]);
    expect(completionThenSprint.state).toMatchObject({
      phase: 'sprinting',
      magazineRounds: 50,
      reserveRounds: 149,
      completedReloadOrdinal: 1,
    });

    let deathState = equipThroughTick(3, 'room_death_boundary');
    deathState = step(deathState, 4, { fireHeld: true }).state;
    deathState = step(deathState, 5, { reloadPressed: true }).state;
    const death = step(deathState, 65, { lifePhase: 'dead', fireHeld: true });
    expect(death.events).toMatchObject([{
      kind: 'auto_rifle_reload_cancelled',
      reason: 'death',
    }]);
    expect(death).toMatchObject({
      state: {
        phase: 'dead',
        magazineRounds: 49,
        reserveRounds: 150,
        activeReload: null,
        completedReloadOrdinal: 0,
      },
      shot: null,
      fireRejection: 'dead',
    });
  });

  it('requires a fresh four-tick equip after death and holstering', () => {
    let state = equipThroughTick(3);
    state = step(state, 4, { fireHeld: true }).state;
    const dead = step(state, 5, { lifePhase: 'dead', fireHeld: true });
    expect(dead).toMatchObject({ state: { phase: 'dead' }, fireRejection: 'dead' });

    let result = step(dead.state, 6, { fireHeld: true });
    expect(result).toMatchObject({
      state: { phase: 'equipping', readyAtTick: 10 },
      fireRejection: 'not_ready',
    });
    result = step(result.state, 7, { weaponSelected: false, fireHeld: true });
    expect(result).toMatchObject({
      state: { phase: 'holstered', readyAtTick: null },
      fireRejection: 'holstered',
    });
    result = step(result.state, 8, { fireHeld: true });
    expect(result).toMatchObject({
      state: { phase: 'equipping', readyAtTick: 12 },
      fireRejection: 'not_ready',
    });
    for (let authorityTick = 9; authorityTick < 12; authorityTick += 1) {
      result = step(result.state, authorityTick, { fireHeld: true });
      expect(result.shot).toBeNull();
    }
    result = step(result.state, 12, { fireHeld: true });
    expect(result.shot).toMatchObject({ authorityTick: 12, shotOrdinal: 2 });
  });

  it('is deterministic across render rates and cycles one room-seeded 12-shot pattern', () => {
    const lowRenderRate = heldFireTape('room_repeatable', [1]);
    const unevenHighRenderRate = heldFireTape('room_repeatable', [7, 2, 5, 3]);
    const otherRoom = heldFireTape('room_different', [4]);

    expect(lowRenderRate.state).toEqual(unevenHighRenderRate.state);
    expect(lowRenderRate.shots).toEqual(unevenHighRenderRate.shots);
    expect(lowRenderRate.shots).toHaveLength(24);
    expect(lowRenderRate.shots.slice(0, 12)).toEqual(lowRenderRate.shots.slice(12, 24));
    expect(lowRenderRate.shots).not.toEqual(otherRoom.shots);
    expect(lowRenderRate.shots.map(({ patternIndex }) => patternIndex)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
    for (const sample of lowRenderRate.shots) {
      expect(sample.recoilPitchMilliDegrees).toBeGreaterThanOrEqual(0);
      expect(sample.recoilPitchMilliDegrees).toBeLessThanOrEqual(1_146);
      expect(Math.abs(sample.recoilYawMilliDegrees)).toBeLessThanOrEqual(1_146);
      expect(sample.spreadRadiusMilliDegrees).toBeGreaterThanOrEqual(0);
      expect(sample.spreadRadiusMilliDegrees).toBeLessThanOrEqual(1_146);
      expect(Math.abs(sample.spreadPitchMilliDegrees)).toBeLessThanOrEqual(1_146);
      expect(Math.abs(sample.spreadYawMilliDegrees)).toBeLessThanOrEqual(1_146);
    }
  });

  it('rejects replayed and stale ticks or authority input sequences without mutation', () => {
    const initial = createAutoRifleState({
      playerId: 'player_alpha',
      roomSeed: 'room_sequence',
      authorityTick: 0,
    });
    const first = step(initial, 0, { authorityInputSequence: 10 });
    const replayedTick = advanceAutoRifle(first.state, input(0, {
      authorityInputSequence: 11,
    }));
    expect(replayedTick).toEqual({
      accepted: false,
      state: first.state,
      reason: 'replayed_authority_tick',
    });

    const advanced = step(first.state, 2, { authorityInputSequence: 12 });
    expect(advanceAutoRifle(advanced.state, input(1, {
      authorityInputSequence: 13,
    }))).toEqual({
      accepted: false,
      state: advanced.state,
      reason: 'stale_authority_tick',
    });
    expect(advanceAutoRifle(advanced.state, input(3, {
      authorityInputSequence: 12,
    }))).toEqual({
      accepted: false,
      state: advanced.state,
      reason: 'replayed_authority_input_sequence',
    });
    expect(advanceAutoRifle(advanced.state, input(3, {
      authorityInputSequence: 11,
    }))).toEqual({
      accepted: false,
      state: advanced.state,
      reason: 'stale_authority_input_sequence',
    });
    expect(advanced.state).toMatchObject({
      lastProcessedAuthorityTick: 2,
      lastProcessedAuthorityInputSequence: 12,
      magazineRounds: 50,
    });
    expect(Object.isFrozen(replayedTick)).toBe(true);
  });

  it('fails closed on unknown, forged, non-tick, or malformed fields', () => {
    const state = createAutoRifleState({
      playerId: 'player_alpha',
      roomSeed: 'room_validation',
      authorityTick: 0,
    });
    expect(() => advanceAutoRifle(state, {
      ...input(0),
      claimedDamagePoints: 9_999,
    } as never)).toThrow(/unsupported or missing fields/u);
    expect(() => advanceAutoRifle(state, {
      ...input(0),
      shotOrigin: { x: 0, y: 0, z: 0 },
    } as never)).toThrow(/unsupported or missing fields/u);
    expect(() => advanceAutoRifle(state, {
      ...input(0),
      deltaMilliseconds: 16.67,
    } as never)).toThrow(/unsupported or missing fields/u);
    expect(() => advanceAutoRifle(state, {
      ...input(0),
      fireHeld: 1,
    } as never)).toThrow(/fire intent must be a boolean/u);
    expect(() => advanceAutoRifle(state, input(0.5))).toThrow(/authority tick must be an integer/u);
    expect(() => createAutoRifleState({
      playerId: 'player_alpha',
      roomSeed: 'room_validation',
      authorityTick: 0,
      initialMagazineRounds: 50,
    } as never)).toThrow(/unsupported or missing fields/u);
    expect(() => assertAutoRifleState({
      ...state,
      magazineRounds: 51,
    })).toThrow(/magazine rounds must be an integer/u);
    expect(() => assertAutoRifleState({
      ...state,
      clientChosenSeed: 123,
    } as never)).toThrow(/unsupported or missing fields/u);
    expect(() => assertAutoRifleRules({
      ...G4_AUTO_RIFLE_RULES,
      referenceDamagePoints: 11,
    } as never)).toThrow(/reference damage must equal 10/u);
    expect(state).toMatchObject({
      phase: 'holstered',
      magazineRounds: 50,
      acceptedShotCount: 0,
    });
  });
});
