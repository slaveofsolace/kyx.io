import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  DEVELOPMENT_LOCAL_MOVEMENT_BRIDGE_BOUNDARY,
  createDevelopmentLocalMovementBridge,
  type CreateDevelopmentLocalMovementBridgeOptions,
  type DevelopmentMovementRenderSample,
} from '../../../../src/app/movement/developmentLocalMovementBridge';
import {
  INTENT_BUTTON,
  MOVEMENT_QUERY_SCHEMA_VERSION,
  PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
  asMillimeters,
  asSimulationTick,
  hashCanonicalMovementState,
  type MovementProfileV1,
  type MovementQueryPort,
} from '../../../../src/sim';
import {
  FakeMovementQueryPort,
  createTestMovementState,
} from '../../sim/movement/fakeQueryPort';

const PROFILE = PHASE3_HYPOTHESIS_MOVEMENT_PROFILE;
const AUTHORITY_TICK_SECONDS = 1 / 20;
const EXPECTED_FIRST_FORWARD_VELOCITY = Math.min(
  PROFILE.locomotion.walkSpeedMmPerSecond,
  PROFILE.locomotion.groundAccelerationMmPerSecondSquared * AUTHORITY_TICK_SECONDS,
);
const EXPECTED_FIRST_FORWARD_DISPLACEMENT =
  EXPECTED_FIRST_FORWARD_VELOCITY * AUTHORITY_TICK_SECONDS;

function createBridge(
  overrides: Partial<CreateDevelopmentLocalMovementBridgeOptions> = {},
) {
  return createDevelopmentLocalMovementBridge({
    boundary: DEVELOPMENT_LOCAL_MOVEMENT_BRIDGE_BOUNDARY,
    initialState: createTestMovementState(),
    profile: PROFILE,
    queries: new FakeMovementQueryPort(),
    ...overrides,
  });
}

describe('DevelopmentLocalMovementBridge', () => {
  it('accumulates render time and advances only on fixed 50 ms authority ticks', () => {
    const bridge = createBridge();
    let snapshot = bridge.advanceRenderSample({
      elapsedMilliseconds: 25,
      input: { held: ['moveForward'] },
    });
    expect(snapshot).toMatchObject({
      authorityRateHz: 20,
      authorityTickDurationMilliseconds: 50,
      authorityTick: 0,
      accumulatorMilliseconds: 25,
      interpolationAlphaPermille: 500,
      ticksStepped: 0,
    });

    snapshot = bridge.advanceRenderSample({ elapsedMilliseconds: 25 });
    expect(snapshot.authorityTick).toBe(1);
    expect(snapshot.ticksStepped).toBe(1);
    expect(snapshot.commands).toHaveLength(1);
    expect(snapshot.currentAuthorityState.player.feetPosition.z).toBe(
      EXPECTED_FIRST_FORWARD_DISPLACEMENT,
    );
    expect(snapshot.currentAuthorityState.player.velocity.z).toBe(
      EXPECTED_FIRST_FORWARD_VELOCITY,
    );
    expect(snapshot.previousAuthorityState.player.feetPosition.z).toBe(0);
    expect(snapshot.accumulatorMilliseconds).toBe(0);
  });

  it('reaches the same authority states under different render partitions', () => {
    const single = createBridge();
    const partitioned = createBridge();
    const singleSnapshot = single.advanceRenderSample({
      elapsedMilliseconds: 100,
      input: { held: ['moveForward'] },
    });
    partitioned.advanceRenderSample({
      elapsedMilliseconds: 25,
      input: { held: ['moveForward'] },
    });
    partitioned.advanceRenderSample({ elapsedMilliseconds: 25 });
    partitioned.advanceRenderSample({ elapsedMilliseconds: 25 });
    const partitionedSnapshot = partitioned.advanceRenderSample({ elapsedMilliseconds: 25 });

    expect(partitionedSnapshot.currentStateHash).toBe(singleSnapshot.currentStateHash);
    expect(partitionedSnapshot.currentAuthorityState).toEqual(singleSnapshot.currentAuthorityState);
    expect(partitionedSnapshot.previousAuthorityState).toEqual(singleSnapshot.previousAuthorityState);
    expect(partitionedSnapshot.lifetimeQueries).toEqual(singleSnapshot.lifetimeQueries);
  });

  it('consumes a render-frame edge once even when one sample advances multiple ticks', () => {
    const snapshot = createBridge().advanceRenderSample({
      elapsedMilliseconds: 100,
      input: { pressed: ['jump'] },
    });

    expect(snapshot.commands).toHaveLength(2);
    expect(snapshot.commands[0]?.pressedButtons).toBe(INTENT_BUTTON.jump);
    expect(snapshot.commands[1]?.pressedButtons).toBe(0);
    expect(snapshot.events.filter(({ kind }) => kind === 'jumped')).toHaveLength(1);
  });

  it('carries excess elapsed time and exposes backlog when the per-sample cap is reached', () => {
    const bridge = createBridge({ maximumTicksPerRenderSample: 2 });
    let snapshot = bridge.advanceRenderSample({
      elapsedMilliseconds: 200,
      input: { held: ['moveForward'] },
    });

    expect(snapshot).toMatchObject({
      ticksStepped: 2,
      totalTicksStepped: 2,
      accumulatorMilliseconds: 100,
      pendingWholeTicks: 2,
      interpolationAlphaPermille: 1_000,
      tickLimitReached: true,
    });

    snapshot = bridge.advanceRenderSample({ elapsedMilliseconds: 0 });
    expect(snapshot).toMatchObject({
      authorityTick: 4,
      ticksStepped: 2,
      totalTicksStepped: 4,
      accumulatorMilliseconds: 0,
      pendingWholeTicks: 0,
      tickLimitReached: false,
    });
    expect(snapshot.lifetimeQueries.moveCapsuleCalls).toBe(4);
  });

  it('publishes fully detached, recursively frozen snapshots', () => {
    const initial = createTestMovementState();
    const bridge = createBridge({ initialState: initial });
    (initial.player.feetPosition as unknown as { x: number }).x = 99_000;
    const snapshot = bridge.advanceRenderSample({ elapsedMilliseconds: 50 });

    expect(snapshot.currentAuthorityState.player.feetPosition.x).toBe(0);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.commands)).toBe(true);
    expect(Object.isFrozen(snapshot.events)).toBe(true);
    expect(Object.isFrozen(snapshot.queries)).toBe(true);
    expect(Object.isFrozen(snapshot.currentAuthorityState)).toBe(true);
    expect(Object.isFrozen(snapshot.currentAuthorityState.player)).toBe(true);
    expect(Object.isFrozen(snapshot.currentAuthorityState.player.feetPosition)).toBe(true);
    expect(() => {
      (snapshot.currentAuthorityState.player.feetPosition as unknown as { x: number }).x = 1;
    }).toThrow();
  });

  it('detaches the movement profile from caller mutation', () => {
    const profile: MovementProfileV1 = {
      ...PROFILE,
      locomotion: { ...PROFILE.locomotion },
    };
    const bridge = createBridge({
      profile,
      initialState: createTestMovementState({}, profile),
    });
    (profile.locomotion as { walkSpeedMmPerSecond: number }).walkSpeedMmPerSecond = 1;
    const snapshot = bridge.advanceRenderSample({
      elapsedMilliseconds: 50,
      input: { held: ['moveForward'] },
    });

    expect(snapshot.currentAuthorityState.player.velocity.z).toBe(
      EXPECTED_FIRST_FORWARD_VELOCITY,
    );
  });

  it('rejects accessor-backed profile data without invoking getters', () => {
    let getterCalls = 0;
    const profile: MovementProfileV1 = {
      ...PROFILE,
      locomotion: { ...PROFILE.locomotion },
    };
    Object.defineProperty(profile.locomotion, 'walkSpeedMmPerSecond', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 2_500;
      },
    });

    expect(() => createBridge({ profile })).toThrow(/data properties/);
    expect(getterCalls).toBe(0);
  });

  it('rejects accessor-backed state data without invoking getters', () => {
    let getterCalls = 0;
    const initialState = createTestMovementState();
    Object.defineProperty(initialState.player.feetPosition, 'x', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 0;
      },
    });

    expect(() => createBridge({ initialState })).toThrow(/data properties/);
    expect(getterCalls).toBe(0);
  });

  it('detaches proxy-backed profile data without invoking get traps', () => {
    let getCalls = 0;
    const profile: MovementProfileV1 = {
      ...PROFILE,
      locomotion: new Proxy(
        { ...PROFILE.locomotion },
        {
          get: () => {
            getCalls += 1;
            throw new Error('profile get trap must not run');
          },
        },
      ),
    };

    const bridge = createBridge({ profile });
    expect(getCalls).toBe(0);
    expect(
      bridge.advanceRenderSample({ elapsedMilliseconds: 50 }).authorityTick,
    ).toBe(1);
    expect(getCalls).toBe(0);
  });

  it('neutralizes exposed input through the owned latch', () => {
    const bridge = createBridge();
    bridge.advanceRenderSample({
      elapsedMilliseconds: 50,
      input: { held: ['moveForward', 'sprint'] },
    });
    bridge.neutralizeInput();
    const snapshot = bridge.advanceRenderSample({ elapsedMilliseconds: 50 });

    expect(snapshot.commands[0]).toMatchObject({
      moveZ: 0,
      heldButtons: 0,
      pressedButtons: 0,
      releasedButtons: INTENT_BUTTON.sprint,
    });
  });

  it('reinitializes state, accumulator, metrics, and validated stream counters', () => {
    const bridge = createBridge();
    bridge.advanceRenderSample({ elapsedMilliseconds: 125 });
    const respawn = createTestMovementState({ feetPosition: { x: 2_000 } });
    const reset = bridge.reinitialize({
      initialState: respawn,
      initialSequence: 10,
      initialClientTick: 0,
    });

    expect(reset).toMatchObject({
      authorityTick: 0,
      accumulatorMilliseconds: 0,
      totalTicksStepped: 0,
      ticksStepped: 0,
    });
    expect(reset.previousAuthorityState).toEqual(reset.currentAuthorityState);
    expect(reset.currentAuthorityState.player.feetPosition.x).toBe(2_000);
    expect(reset.lifetimeQueries.moveCapsuleCalls).toBe(0);

    const advanced = bridge.advanceRenderSample({ elapsedMilliseconds: 50 });
    expect(advanced.commands[0]).toMatchObject({ sequence: 10, clientTick: 0 });
    expect(() => bridge.reinitialize({
      initialState: respawn,
      initialClientTick: 1,
    })).toThrow(/must equal/);
  });

  it('rejects unsafe render samples without invoking accessors', () => {
    let getterCalls = 0;
    const sample = {} as DevelopmentMovementRenderSample;
    Object.defineProperty(sample, 'elapsedMilliseconds', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 50;
      },
    });
    const bridge = createBridge();

    expect(() => bridge.advanceRenderSample(sample)).toThrow(/unsafe/);
    expect(getterCalls).toBe(0);
    expect(() => bridge.advanceRenderSample({
      elapsedMilliseconds: -1,
    })).toThrow(/between/);
    expect(() => bridge.advanceRenderSample({
      elapsedMilliseconds: 0,
      extra: true,
    } as never)).toThrow(/unsupported field/);
  });

  it('reads proxy render samples without invoking property getters', () => {
    let getCalls = 0;
    const sample = new Proxy(
      { elapsedMilliseconds: 50 },
      {
        get: () => {
          getCalls += 1;
          throw new Error('render sample get trap must not run');
        },
      },
    );

    const snapshot = createBridge().advanceRenderSample(sample);
    expect(snapshot.authorityTick).toBe(1);
    expect(getCalls).toBe(0);
  });

  it('captures and binds query methods so caller swaps cannot change the bridge', () => {
    const backing = new FakeMovementQueryPort();
    const queries: MovementQueryPort = {
      schemaVersion: MOVEMENT_QUERY_SCHEMA_VERSION,
      moveCapsule: (request) => backing.moveCapsule(request),
      overlapCapsule: (request) => backing.overlapCapsule(request),
      castCapsule: (request) => backing.castCapsule(request),
      volumesAtCapsule: (request) => backing.volumesAtCapsule(request),
    };
    const bridge = createBridge({ queries });
    queries.moveCapsule = () => {
      throw new Error('swapped query method must not run');
    };

    const snapshot = bridge.advanceRenderSample({ elapsedMilliseconds: 50 });
    expect(snapshot.authorityTick).toBe(1);
    expect(backing.moveRequests).toHaveLength(1);
  });

  it('rejects accessor-backed query methods without invoking their getters', () => {
    let getterCalls = 0;
    const queries = {
      schemaVersion: MOVEMENT_QUERY_SCHEMA_VERSION,
      overlapCapsule: () => {
        throw new Error('unused');
      },
      castCapsule: () => {
        throw new Error('unused');
      },
      volumesAtCapsule: () => {
        throw new Error('unused');
      },
    };
    Object.defineProperty(queries, 'moveCapsule', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        throw new Error('query getter must not run');
      },
    });

    expect(() => createBridge({
      queries: queries as unknown as MovementQueryPort,
    })).toThrow(/moveCapsule must be a data property/);
    expect(getterCalls).toBe(0);
  });

  it('captures query methods through descriptors without invoking proxy get traps', () => {
    let getCalls = 0;
    const backing = new FakeMovementQueryPort();
    const queries = new Proxy<MovementQueryPort>(
      {
        schemaVersion: MOVEMENT_QUERY_SCHEMA_VERSION,
        moveCapsule: (request) => backing.moveCapsule(request),
        overlapCapsule: (request) => backing.overlapCapsule(request),
        castCapsule: (request) => backing.castCapsule(request),
        volumesAtCapsule: (request) => backing.volumesAtCapsule(request),
      },
      {
        get: () => {
          getCalls += 1;
          throw new Error('query get trap must not run');
        },
      },
    );

    const bridge = createBridge({ queries });
    expect(getCalls).toBe(0);
    expect(
      bridge.advanceRenderSample({ elapsedMilliseconds: 50 }).authorityTick,
    ).toBe(1);
    expect(getCalls).toBe(0);
  });

  it('faults before stepping when the lifetime tick counter would overflow', () => {
    const bridge = createBridge();
    (bridge as unknown as { totalTicksStepped: number }).totalTicksStepped =
      Number.MAX_SAFE_INTEGER;

    expect(() => bridge.advanceRenderSample({ elapsedMilliseconds: 50 })).toThrow(
      /total tick counter overflow/,
    );
    expect(bridge.getSnapshot().authorityTick).toBe(0);
    expect(() => bridge.advanceRenderSample({ elapsedMilliseconds: 0 })).toThrow(
      /faulted/,
    );
  });

  it('rejects accidental production-boundary construction and invalid caps', () => {
    expect(DEVELOPMENT_LOCAL_MOVEMENT_BRIDGE_BOUNDARY).toBe(
      'development_local_render_only',
    );
    expect(() => createDevelopmentLocalMovementBridge({
      boundary: 'production' as never,
      initialState: createTestMovementState(),
      profile: PROFILE,
      queries: new FakeMovementQueryPort(),
    })).toThrow(/development local render path/);
    expect(() => createBridge({ maximumTicksPerRenderSample: 0 })).toThrow(/from 1/);
  });

  it('keeps host, renderer, legacy game, and concrete physics imports out of the bridge', () => {
    const source = readFileSync(
      new URL(
        '../../../../src/app/movement/developmentLocalMovementBridge.ts',
        import.meta.url,
      ),
      'utf8',
    );

    expect(source).not.toMatch(/from\s+['"]three['"]/);
    expect(source).not.toMatch(/from\s+['"][^'"]*physics[^'"]*['"]/);
    expect(source).not.toMatch(/\b(?:window|document|requestAnimationFrame)\b/);
    expect(source).not.toMatch(/(?:Game\.js|core\/Game)/);
  });

  it('reports a canonical current hash and matching detached authority states', () => {
    const snapshot = createBridge().advanceRenderSample({ elapsedMilliseconds: 50 });

    expect(snapshot.currentStateHash).toBe(
      hashCanonicalMovementState(snapshot.currentAuthorityState),
    );
    expect(snapshot.previousAuthorityState.tick).toBe(asSimulationTick(0));
    expect(snapshot.currentAuthorityState.tick).toBe(asSimulationTick(1));
    expect(snapshot.currentAuthorityState.player.feetPosition.y).toBe(asMillimeters(0));
  });
});
