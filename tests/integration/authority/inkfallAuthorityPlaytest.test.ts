import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import topologySeed from '../../../assets/source/maps/inkfall-foundry/inkfall-foundry.layout-seed.v1.json';
import playtestTapes from '../../../assets/source/maps/inkfall-foundry/runtime/playtest-tapes.p6-6.v1.json';
import savedSpawnFixtures from '../../../assets/source/maps/inkfall-foundry/runtime/spawn-fixtures.p6-4.v1.json';

import {
  INKFALL_PLAYTEST_FIXTURE_HASH,
  INKFALL_PLAYTEST_PACKAGE_DIGEST,
  INKFALL_PLAYTEST_TOPOLOGY_SEED_SHA256,
  runInkfallAuthorityPlaytest,
  type InkfallAuthorityPlaytestSuiteDefinitionV1,
  type InkfallAuthorityPlaytestSuiteResultV1,
} from '../../../src/authority/playtest';
import { chunkOrderedTelemetryEventsForAppend } from '../../../src/authority/playtest/inkfallAuthorityPlaytest';
import { requireBundledMapPackageManifest } from '../../../src/content/maps';
import {
  loadRuntimeMapPackage,
  type LoadedRuntimeMapPackage,
} from '../../../src/physics';

const mapRoot = new URL('../../../assets/source/maps/inkfall-foundry/', import.meta.url);
const suiteDefinition = playtestTapes as unknown as InkfallAuthorityPlaytestSuiteDefinitionV1;

let loaded: LoadedRuntimeMapPackage;
let first: InkfallAuthorityPlaytestSuiteResultV1;
let second: InkfallAuthorityPlaytestSuiteResultV1;

function scenario(playerCount: 2 | 4 | 8) {
  const found = first.scenarios.find((candidate) => candidate.playerCount === playerCount);
  if (!found) throw new Error(`Missing ${playerCount}-player P6.6 scenario.`);
  return found;
}

function metricMilliseconds(playerCount: 2 | 4 | 8): Record<string, number | null> {
  return Object.fromEntries(scenario(playerCount).agents.flatMap((agent) => (
    agent.routeMetrics.map((metric) => [
      `${agent.slot}:${metric.metricId}`,
      metric.measuredMilliseconds,
    ])
  )));
}

beforeAll(async () => {
  const [render, collision, manifest] = await Promise.all([
    readFile(new URL('export/render.graybox.glb', mapRoot)),
    readFile(new URL('export/collision.authority.glb', mapRoot)),
    requireBundledMapPackageManifest(),
  ]);
  loaded = await loadRuntimeMapPackage(manifest, { render, collision });
  first = await runInkfallAuthorityPlaytest(
    loaded,
    suiteDefinition,
    topologySeed,
    savedSpawnFixtures,
  );
  second = await runInkfallAuthorityPlaytest(
    loaded,
    suiteDefinition,
    topologySeed,
    savedSpawnFixtures,
  );
}, 180_000);

describe('Inkfall Foundry P6.6 automated authority playtest foundation', () => {
  it('preserves telemetry order across the 64-event append ceiling', () => {
    const events = Object.freeze(Array.from({ length: 130 }, (_, index) => index + 1));
    const batches = chunkOrderedTelemetryEventsForAppend(events);

    expect(batches.map(({ length }) => length)).toEqual([64, 64, 2]);
    expect(batches.flat()).toEqual(events);
    expect(batches.every((batch) => Object.isFrozen(batch))).toBe(true);
    expect(Object.isFrozen(batches)).toBe(true);
  });

  it('pins the accepted map package, collision fixture, topology seed, and 20 Hz suite', () => {
    expect(playtestTapes).toMatchObject({
      schemaVersion: 1,
      mapId: 'inkfall_foundry',
      mapRevision: 1,
      packageDigest: loaded.identity.packageDigest,
      fixtureHash: loaded.authority.fixtureHash,
      topologySeedSha256: INKFALL_PLAYTEST_TOPOLOGY_SEED_SHA256,
      authorityRateHz: 20,
      agents: 'synthetic_non_human_deterministic',
    });
    expect(loaded.identity.packageDigest).toBe(INKFALL_PLAYTEST_PACKAGE_DIGEST);
    expect(loaded.authority.fixtureHash).toBe(INKFALL_PLAYTEST_FIXTURE_HASH);
    expect(loaded.authority.fixture.solids).toHaveLength(346);
    expect(first.binding).toMatchObject({
      movementProfileId: 'phase3_hypothesis_v1',
      movementProfileRevision: 1,
      physicsAdapterVersion: '0.19.3',
    });
    expect(first.units).toEqual({
      authorityRateHz: 20,
      tickMilliseconds: 50,
      distance: 'integer_millimeters',
      time: 'authority_ticks_and_integer_milliseconds',
    });
  });

  it('replays the complete 2/4/8-player suite exactly deterministically', () => {
    expect(second).toEqual(first);
    expect(first.suiteHash).toBe('f42128f8aef72820');
    expect(first.scenarios.map(({ replayHash }) => replayHash)).toEqual([
      '0f7f6c2965a594c6',
      '88ce02f1c029c9d9',
      '741c7642229e2f3c',
    ]);
    expect(first.scenarios.map(({ status }) => status)).toEqual(['PASS', 'PASS', 'FAIL']);
    expect(first.issueCount).toBe(16);
  });

  it('passes every governing 2-player and 4-player timing metric without embeds or snags', () => {
    expect(metricMilliseconds(2)).toEqual({
      '0:spawn_to_choice_west': 1_600,
      '0:spawn_to_press_contact_west': 5_450,
      '0:press_fast_central_crossing': 5_300,
      '1:spawn_to_choice_east': 1_600,
      '1:spawn_to_press_contact_east': 5_200,
    });
    expect(metricMilliseconds(4)).toEqual({
      '0:spawn_to_press_contact_west': 4_800,
      '1:spawn_to_press_contact_east': 5_300,
      '2:spawn_to_ink_contact_west': 8_450,
      '3:spawn_to_ink_contact_east': 8_750,
    });
    for (const result of [scenario(2), scenario(4)]) {
      expect(result.agents.every(({ completed }) => completed)).toBe(true);
      expect(result.agents.flatMap(({ routeMetrics }) => routeMetrics)
        .every(({ insideTargetBand }) => insideTargetBand)).toBe(true);
      expect(result.collision).toMatchObject({ embedSamples: 0, snagEvents: 0 });
      expect(result.occupancy.bodyOverlapSamples).toBe(0);
      expect(result.volumes).toMatchObject({
        recoveryEntries: 0,
        killEntries: 0,
        recoveryProbePassed: true,
        killPriorityProbePassed: true,
        postRecoveryEscapePassed: true,
      });
    }
  });

  it('preserves exact 8-player Archive collision findings rather than authorizing a map edit', () => {
    const eight = scenario(8);
    expect(eight.issues.find(({ code, agentSlot }) => (
      code === 'ROUTE_SNAG_WINDOW_EXCEEDED' && agentSlot === 4
    ))).toMatchObject({
      tick: 137,
      detail: expect.stringContaining(
        'position=(-25574,3384,9834); target=(-26000,4000,12000);',
      ),
      topologyMutationAuthorized: false,
    });
    expect(eight.issues.find(({ code, agentSlot }) => (
      code === 'ROUTE_SNAG_WINDOW_EXCEEDED' && agentSlot === 5
    ))).toMatchObject({
      tick: 161,
      detail: expect.stringContaining(
        'position=(21992,5350,14430); target=(22000,6000,17000);',
      ),
      topologyMutationAuthorized: false,
    });
    expect(eight.issues.find(({ code, agentSlot }) => (
      code === 'ROUTE_SNAG_WINDOW_EXCEEDED' && agentSlot === 6
    ))).toMatchObject({
      tick: 166,
      detail: expect.stringContaining('map_collision_stair_west_choice_archive_s01_t05'),
      topologyMutationAuthorized: false,
    });
    expect(eight.issues.find(({ code }) => code === 'SYNTHETIC_BODY_OVERLAP'))
      .toMatchObject({ tick: 130, topologyMutationAuthorized: false });
  });

  it('aims the teleport at the authored endpoint and records the real authority blocker', () => {
    const authoredTeleport = topologySeed.links.find(({ id }) => id === 'teleport_shortcut');
    expect(authoredTeleport?.waypointsMm.at(-1)).toEqual([1_000, 1_000, -5_000]);
    expect(playtestTapes.scenarios.find(({ playerCount }) => playerCount === 8)?.agents
      .find(({ slot }) => slot === 7)?.steps)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          linkId: 'teleport_shortcut',
          direction: 'forward',
          movementMode: 'teleport',
        }),
      ]));
    const teleporter = scenario(8).agents.find(({ slot }) => slot === 7);
    expect(teleporter?.movementToolEvents).toEqual([{
      kind: 'teleport_succeeded',
      tick: 145,
      outcome: 'partial',
      reason: null,
      fromFeetPositionMm: { x: -4_006, y: -2_940, z: -10_024 },
      toFeetPositionMm: { x: -1_694, y: -1_120, z: -7_703 },
      blockerColliderIds: ['map_collision_module_press_reactor_south'],
    }]);
    expect(scenario(8).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'AUTHORED_ROUTE_ENTERED_UNSAFE_VOLUME',
        agentSlot: 7,
        tick: 155,
        detail: expect.stringContaining('(569,-3870,-5360)'),
      }),
      expect.objectContaining({
        code: 'AUTHORED_ROUTE_ENTERED_UNSAFE_VOLUME',
        agentSlot: 7,
        tick: 157,
        detail: expect.stringContaining('(1178,-5020,-4846)'),
      }),
    ]));
  });

  it('runs accepted recovery, kill-priority, and escape probes in every arrangement', () => {
    for (const result of first.scenarios) {
      expect(result.volumes).toMatchObject({
        recoveryProbePassed: true,
        killPriorityProbePassed: true,
        postRecoveryEscapePassed: true,
      });
      expect(result.collision.embedSamples).toBe(0);
      expect(result.spawnProbe.passed).toBe(true);
    }
  });

  it('retains aggregate privacy-safe telemetry only', () => {
    expect(first.scenarios.map(({ telemetry }) => telemetry.snapshotHash)).toEqual([
      'a0cccb1a45f10158',
      '6c504d46a8056b9a',
      '027edfe7c299ebef',
    ]);
    for (const { telemetry } of first.scenarios) {
      expect(telemetry.privacy).toEqual({
        actorIdentity: 'ephemeral_match_slot_0_through_63',
        exactPositionsRetained: false,
        accountIdentifiersRetained: false,
        networkIdentifiersRetained: false,
        clientOutcomeAuthorityAccepted: false,
      });
      expect(telemetry.routeEvents).toBeGreaterThan(0);
      expect(telemetry.eventCount).toBeLessThanOrEqual(4_096);
    }
  });

  it('stays within bounded authority queries and does not claim G5, P6.7, human, or final-art acceptance', () => {
    expect(Math.max(...first.scenarios.map(({ queryMetrics }) => (
      queryMetrics.maximumCallsPerAgentTick
    )))).toBe(6);
    expect(first.resourceBounds.maximumAuthorityQueryCallsPerAgentTick).toBe(128);
    expect(first.allAutomatedThresholdsPassed).toBe(false);
    expect(first.topologyRecommendation).toBe('REPORT_REQUIRED_BEFORE_PACKAGE_CHANGE');
    expect(first.nonClaims).toEqual([
      'SYNTHETIC_AGENTS_NOT_HUMAN_PLAYTESTERS',
      'HUMAN_FUN_AND_READABILITY_NOT_CLAIMED',
      'P6_7_TOPOLOGY_LOCK_NOT_CLAIMED',
      'FINAL_ART_NOT_CLAIMED',
      'G5_NOT_PASSED',
    ]);
    expect(first.scenarios.flatMap(({ issues }) => issues)
      .every(({ topologyMutationAuthorized }) => topologyMutationAuthorized === false)).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
  });
});
