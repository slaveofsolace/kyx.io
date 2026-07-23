import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import savedTelemetryFixtures from '../../../assets/source/maps/inkfall-foundry/runtime/telemetry-fixtures.p6-5.v1.json';

import {
  createInkfallAuthorityTelemetry,
  INKFALL_AUTHORITY_TELEMETRY_CONTRACT,
  InkfallAuthorityTelemetry,
  InkfallTelemetryValidationError,
} from '../../../src/authority/telemetry';
import { requireBundledMapPackageManifest } from '../../../src/content/maps';
import {
  loadRuntimeMapPackage,
  type LoadedRuntimeMapPackage,
} from '../../../src/physics';

const mapRoot = new URL('../../../assets/source/maps/inkfall-foundry/', import.meta.url);

let loaded: LoadedRuntimeMapPackage;

function envelope(
  eventSequence: number,
  authorityTick: number,
  kind: string,
  payload: unknown,
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    mapId: 'inkfall_foundry',
    mapRevision: 1,
    packageDigest: 'a593ad82b2e9f713a4a8d775002c1583c0fb3dfd3acdf004ba7bd6b144173267',
    fixtureHash: '2a0a446a0b152395',
    authorityRateHz: 20,
    producer: 'authority_runtime',
    eventSequence,
    authorityTick,
    kind,
    payload,
  };
}

function fixtureEnvelope(event: (typeof savedTelemetryFixtures.events)[number]): Record<string, unknown> {
  return envelope(event.eventSequence, event.authorityTick, event.kind, event.payload);
}

function routeEvent(
  eventSequence: number,
  authorityTick: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return envelope(eventSequence, authorityTick, 'route_traversal', {
    actorSlot: 0,
    routeId: 'west_choice_press',
    direction: 'forward',
    enteredAtTick: authorityTick - 2,
    exitedAtTick: authorityTick,
    outcome: 'completed',
    movementMode: 'run',
    ...overrides,
  });
}

function noSafeSpawnEvent(eventSequence: number, authorityTick: number): Record<string, unknown> {
  return envelope(eventSequence, authorityTick, 'no_safe_spawn', {
    actorSlot: eventSequence % 64,
    evaluatedCandidateCount: 12,
    directLosRejectedCount: 8,
    occupancyRejectedCount: 2,
    territoryRejectedCount: 2,
    retryAfterTicks: 10,
  });
}

function expectValidation(action: () => unknown, messageFragment: string): void {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(InkfallTelemetryValidationError);
  expect((caught as Error).message).toContain(messageFragment);
}

beforeAll(async () => {
  const [render, collision, manifest] = await Promise.all([
    readFile(new URL('export/render.graybox.glb', mapRoot)),
    readFile(new URL('export/collision.authority.glb', mapRoot)),
    requireBundledMapPackageManifest(),
  ]);
  loaded = await loadRuntimeMapPackage(manifest, { render, collision });
});

describe('Inkfall Foundry P6.5 authority telemetry', () => {
  it('executes the saved all-family fixture and pins its authority package', () => {
    const telemetry = createInkfallAuthorityTelemetry(loaded);
    const accepted = telemetry.appendBatch(savedTelemetryFixtures.events.map(fixtureEnvelope));
    const snapshot = telemetry.snapshot();

    expect(savedTelemetryFixtures).toMatchObject({
      schemaVersion: 1,
      mapId: loaded.identity.id,
      mapRevision: loaded.identity.revision,
      packageDigest: loaded.identity.packageDigest,
      fixtureHash: loaded.authority.fixtureHash,
      authorityRateHz: 20,
      producer: 'authority_runtime',
    });
    expect(INKFALL_AUTHORITY_TELEMETRY_CONTRACT).toMatchObject({
      schemaVersion: 1,
      mapId: 'inkfall_foundry',
      mapRevision: 1,
      packageDigest: loaded.identity.packageDigest,
      fixtureHash: loaded.authority.fixtureHash,
      authorityRateHz: 20,
      tickMilliseconds: 50,
      heatCellMillimeters: { x: 4_000, y: 3_000, z: 4_000 },
      routeCardinality: 27,
      zoneCardinality: 9,
      spawnCardinality: 12,
      colliderCardinality: 346,
      volumeCardinality: 2,
      actorIdentity: 'ephemeral_match_slot_0_through_63',
      exactPositionsRetained: false,
      clientOutcomeAuthorityAccepted: false,
    });
    expect(accepted).toHaveLength(savedTelemetryFixtures.expected.eventCount);
    expect(accepted.map(({ eventSequence }) => eventSequence)).toEqual(
      Array.from({ length: savedTelemetryFixtures.expected.eventCount }, (_, index) => index + 1),
    );
    expect(snapshot).toMatchObject({
      status: 'P6.5_AUTHORITY_TELEMETRY_FIXTURE_G5_NOT_PASSED',
      totalsByKind: savedTelemetryFixtures.expected.totalsByKind,
      arrangementSamples: savedTelemetryFixtures.expected.arrangementSamples,
      buffer: {
        acceptedEvents: savedTelemetryFixtures.expected.eventCount,
        retainedEvents: savedTelemetryFixtures.expected.eventCount,
        evictedEvents: 0,
        lastEventSequence: 18,
        lastAuthorityTick: 152,
      },
      noSafeSpawnEvents: 1,
      nonClaims: ['P6.6_NOT_CLAIMED', 'G5_NOT_PASSED', 'HUMAN_ACCEPTANCE_NOT_RUN'],
    });
    expect(snapshot.snapshotHash).toBe(savedTelemetryFixtures.expected.snapshotHash);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.events)).toBe(true);
  });

  it('recomputes open and blocked sightlines from the named authority fixture', () => {
    const telemetry = createInkfallAuthorityTelemetry(loaded);
    telemetry.appendBatch(savedTelemetryFixtures.events.map(fixtureEnvelope));
    const exposures = telemetry.snapshot().events.filter((event) => event.kind === 'sightline_exposure');

    expect(exposures).toHaveLength(2);
    expect(exposures[0]?.payload).toMatchObject({
      directLineOfSight: true,
      blockerId: null,
      exposureTicks: 7,
    });
    expect(exposures[1]?.payload).toMatchObject({
      directLineOfSight: false,
      exposureTicks: 5,
    });
    if (exposures[1]?.kind !== 'sightline_exposure') throw new Error('Missing blocked exposure fixture.');
    expect(exposures[1].payload.blockerId).toMatch(/^[a-z][a-z0-9_]+$/u);
    expect(loaded.authority.fixture.solids.some(({ id }) => id === exposures[1].payload.blockerId)).toBe(true);
  });

  it('is permutation-stable and emits stable, time-derived event IDs', () => {
    const forward = createInkfallAuthorityTelemetry(loaded);
    const reverse = createInkfallAuthorityTelemetry(loaded);
    forward.appendBatch(savedTelemetryFixtures.events.map(fixtureEnvelope));
    reverse.appendBatch([...savedTelemetryFixtures.events].reverse().map(fixtureEnvelope));

    expect(reverse.snapshot()).toEqual(forward.snapshot());
    expect(forward.snapshot().events[0]?.eventId)
      .toBe('inkfall_foundry.r1.t0000000000000110.s0000000000000001');
    expect(forward.snapshot().events.at(-1)?.eventId)
      .toBe('inkfall_foundry.r1.t0000000000000152.s0000000000000018');
  });

  it('retains only quantized cells and no exact, account, network, or client authority fields', () => {
    const telemetry = createInkfallAuthorityTelemetry(loaded);
    telemetry.appendBatch(savedTelemetryFixtures.events.map(fixtureEnvelope));
    const snapshot = telemetry.snapshot();
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.privacy).toEqual({
      actorIdentity: 'ephemeral_match_slot_0_through_63',
      exactPositionsRetained: false,
      accountIdentifiersRetained: false,
      networkIdentifiersRetained: false,
      clientOutcomeAuthorityAccepted: false,
    });
    for (const forbidden of [
      '"positionMm":', '"feetPositionMm":', '"observerFeetPositionMm":',
      '"subjectFeetPositionMm":', '"playerId":', '"accountId":', '"displayName":',
      '"ipAddress":', '"clientOutcome":',
    ]) expect(serialized).not.toContain(forbidden);
    expect(snapshot.events.find((event) => event.kind === 'damage_location')?.payload)
      .toHaveProperty('location.cellX');
  });

  it('rejects unknown fields, accessors, cycles, aliases, and malformed bindings', () => {
    const telemetry = createInkfallAuthorityTelemetry(loaded);
    const unknown = routeEvent(1, 10);
    unknown.clientOutcome = 'completed';
    expectValidation(() => telemetry.append(unknown), 'Unknown telemetry field');

    const accessorPayload = {
      actorSlot: 0,
      routeId: 'west_choice_press',
      direction: 'forward',
      enteredAtTick: 8,
      exitedAtTick: 10,
      outcome: 'completed',
      movementMode: 'run',
    } as Record<string, unknown>;
    Object.defineProperty(accessorPayload, 'clientOutcome', {
      enumerable: true,
      get: () => 'completed',
    });
    expectValidation(
      () => telemetry.append(envelope(1, 10, 'route_traversal', accessorPayload)),
      'accessors are not allowed',
    );

    const cyclic = routeEvent(1, 10) as Record<string, unknown>;
    (cyclic.payload as Record<string, unknown>).cycle = cyclic.payload;
    expectValidation(() => telemetry.append(cyclic), 'Cycles and aliased object references');

    const sharedPosition = { x: 0, y: 0, z: 0 };
    const aliased = envelope(1, 10, 'occupancy_sample', {
      occupants: [
        { actorSlot: 0, zoneId: 'press_hall', feetPositionMm: sharedPosition },
        { actorSlot: 1, zoneId: 'press_hall', feetPositionMm: sharedPosition },
      ],
    });
    expectValidation(() => telemetry.append(aliased), 'Cycles and aliased object references');

    const wrongBinding = routeEvent(1, 10);
    wrongBinding.fixtureHash = '0000000000000000';
    expectValidation(() => telemetry.append(wrongBinding), 'Expected 2a0a446a0b152395');
    expect(telemetry.snapshot().buffer.acceptedEvents).toBe(0);
  });

  it('rejects duplicate, replayed, regressing, and sequence/tick-inconsistent batches atomically', () => {
    const telemetry = createInkfallAuthorityTelemetry(loaded);
    telemetry.append(routeEvent(1, 10));
    const acceptedHash = telemetry.snapshot().snapshotHash;

    expectValidation(() => telemetry.append(routeEvent(1, 10)), 'Replay or non-increasing');
    expect(telemetry.snapshot().snapshotHash).toBe(acceptedHash);

    expectValidation(() => telemetry.appendBatch([
      routeEvent(2, 11),
      routeEvent(2, 11, { actorSlot: 1 }),
    ]), 'Duplicate event sequence');
    expect(telemetry.snapshot().snapshotHash).toBe(acceptedHash);

    expectValidation(() => telemetry.append(routeEvent(2, 9)), 'Authority event tick regressed');
    expect(telemetry.snapshot().snapshotHash).toBe(acceptedHash);

    expectValidation(() => telemetry.appendBatch([
      routeEvent(3, 12),
      routeEvent(4, 11),
    ]), 'Replay or non-increasing');
    expect(telemetry.snapshot().snapshotHash).toBe(acceptedHash);
    expect(telemetry.snapshot().buffer).toMatchObject({ acceptedEvents: 1, evictedEvents: 0 });
  });

  it('uses a bounded ring while preserving lifetime aggregates', () => {
    const telemetry = createInkfallAuthorityTelemetry(loaded, { retainedEventCapacity: 4 });
    telemetry.appendBatch(Array.from({ length: 6 }, (_, index) => noSafeSpawnEvent(index + 1, index + 1)));
    const snapshot = telemetry.snapshot();

    expect(snapshot.buffer).toEqual({
      capacity: 4,
      retainedEvents: 4,
      acceptedEvents: 6,
      evictedEvents: 2,
      lastEventSequence: 6,
      lastAuthorityTick: 6,
    });
    expect(snapshot.events.map(({ eventSequence }) => eventSequence)).toEqual([3, 4, 5, 6]);
    expect(snapshot.totalsByKind.no_safe_spawn).toBe(6);
    expect(snapshot.noSafeSpawnEvents).toBe(6);
  });

  it('strictly bounds routes, movement, actors, zones, occupancy, and volume outcomes', () => {
    const cases: readonly [Record<string, unknown>, string][] = [
      [routeEvent(1, 10, {
        routeId: 'teleport_shortcut', direction: 'reverse', movementMode: 'teleport',
      }), 'one-way'],
      [routeEvent(1, 10, {
        routeId: 'teleport_shortcut', direction: 'forward', movementMode: 'run',
      }), 'requires teleport'],
      [routeEvent(1, 10, { movementMode: 'teleport' }), 'not authored for this route'],
      [routeEvent(1, 10, { enteredAtTick: 10 }), 'at least one authority tick'],
      [routeEvent(1, 10, { actorSlot: 64 }), '0 through 63'],
      [envelope(1, 10, 'damage_location', {
        sourceActorSlot: 0,
        targetActorSlot: 1,
        zoneId: 'press_hall',
        positionMm: { x: 30_000, y: 0, z: 0 },
        damagePoints: 1,
        causeClass: 'weapon_direct',
      }), 'outside declared zone'],
      [envelope(1, 10, 'occupancy_sample', {
        occupants: [
          { actorSlot: 0, zoneId: 'press_hall', feetPositionMm: { x: 0, y: 0, z: 0 } },
          { actorSlot: 0, zoneId: 'press_hall', feetPositionMm: { x: 1, y: 0, z: 0 } },
        ],
      }), 'must be unique'],
      [envelope(1, 10, 'authority_volume', {
        actorSlot: 0,
        volumeId: 'lower_void_recovery',
        positionMm: { x: 0, y: -3_750, z: 0 },
        outcome: 'killed',
      }), 'does not match recovery'],
      [envelope(1, 10, 'objective_pressure', {
        objectiveSlot: 0,
        zoneId: 'press_hall',
        positionMm: { x: 0, y: 0, z: 0 },
        pressurePermille: 500,
        nearbyFriendlyCount: 33,
        nearbyEnemyCount: 32,
        controllingTeamSlot: null,
      }), 'exceeds the bounded match actor slots'],
    ];

    for (const [input, fragment] of cases) {
      const telemetry = createInkfallAuthorityTelemetry(loaded);
      expectValidation(() => telemetry.append(input), fragment);
      expect(telemetry.snapshot().buffer.acceptedEvents).toBe(0);
    }

    const oversizedBatch = Array.from(
      { length: INKFALL_AUTHORITY_TELEMETRY_CONTRACT.maximumBatchEvents + 1 },
      (_, index) => noSafeSpawnEvent(index + 1, index + 1),
    );
    expectValidation(
      () => createInkfallAuthorityTelemetry(loaded).appendBatch(oversizedBatch),
      '1 through 64 entries',
    );
  });

  it('rejects malformed options and a map package outside the accepted identity', () => {
    expectValidation(() => new InkfallAuthorityTelemetry(loaded, null), 'Expected an object');
    expectValidation(
      () => new InkfallAuthorityTelemetry(loaded, { retainedEventCapacity: 3 }),
      '4 through 4096',
    );
    expectValidation(
      () => new InkfallAuthorityTelemetry(loaded, { unexpected: true }),
      'Unknown telemetry field',
    );

    const wrongPackage = {
      ...loaded,
      identity: { ...loaded.identity, packageDigest: '0'.repeat(64) },
    } as unknown as LoadedRuntimeMapPackage;
    expect(() => new InkfallAuthorityTelemetry(wrongPackage)).toThrowError(
      'TELEMETRY_MAP_IDENTITY_MISMATCH',
    );
  });
});
