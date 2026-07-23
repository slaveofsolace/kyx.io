import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { env } from 'node:process';

import { beforeAll, describe, expect, it } from 'vitest';

import topologySeed from '../../../assets/source/maps/inkfall-foundry/inkfall-foundry.layout-seed.v1.json';
import playtestTapesV1 from '../../../assets/source/maps/inkfall-foundry/runtime/playtest-tapes.p6-6.v1.json';
import playtestTapesV2 from '../../../assets/source/maps/inkfall-foundry/runtime/playtest-tapes.p6-6.v2.json';
import savedSpawnFixturesV2 from '../../../assets/source/maps/inkfall-foundry/runtime/spawn-fixtures.p6-4.v2.json';
import {
  runInkfallAuthorityPlaytest,
  type InkfallAuthorityPlaytestSuiteDefinitionV2,
  type InkfallAuthorityPlaytestSuiteResultV2,
} from '../../../src/authority/playtest';
import { requireBundledMapPackageManifest } from '../../../src/content/maps';
import {
  loadRuntimeMapPackage,
  type LoadedRuntimeMapPackage,
} from '../../../src/physics';

const mapRoot = new URL('../../../assets/source/maps/inkfall-foundry/', import.meta.url);
const suiteDefinition = playtestTapesV2 as unknown as InkfallAuthorityPlaytestSuiteDefinitionV2;

let loaded: LoadedRuntimeMapPackage;
let first: InkfallAuthorityPlaytestSuiteResultV2;
let second: InkfallAuthorityPlaytestSuiteResultV2;

function eightPlayerTape() {
  const scenario = playtestTapesV2.scenarios.find(({ playerCount }) => playerCount === 8);
  if (!scenario) throw new Error('Missing native revision-2 8-player tape.');
  return scenario;
}

beforeAll(async () => {
  const manifest = await requireBundledMapPackageManifest('inkfall_foundry', 2);
  const [render, collision] = await Promise.all([
    readFile(new URL(manifest.artifacts.render.path, mapRoot)),
    readFile(new URL(manifest.artifacts.collision.path, mapRoot)),
  ]);
  loaded = await loadRuntimeMapPackage(manifest, { render, collision });
  first = await runInkfallAuthorityPlaytest(
    loaded,
    suiteDefinition,
    topologySeed,
    savedSpawnFixturesV2,
  );
  second = await runInkfallAuthorityPlaytest(
    loaded,
    suiteDefinition,
    topologySeed,
    savedSpawnFixturesV2,
  );
  const output = env.INKFALL_P6_6B_PROBE_OUTPUT;
  if (output) {
    const absolute = resolve(output);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, `${JSON.stringify(first, null, 2)}\n`, { flag: 'wx' });
  }
}, 180_000);

describe('Inkfall Foundry P6.6B native revision-2 tapes', () => {
  it('binds natively to the frozen revision-2 package and spawn fixtures', () => {
    expect(playtestTapesV2).toMatchObject({
      schemaVersion: 2,
      mapId: 'inkfall_foundry',
      mapRevision: 2,
      packageDigest: '77a7b6c41416f9caaf615f3af5dacda1153cee65a239c04f2004e30fc1663520',
      fixtureHash: 'bf85e42731fd088e',
      topologySeedSha256: playtestTapesV1.topologySeedSha256,
      authorityRateHz: 20,
      agents: 'synthetic_non_human_deterministic',
    });
    expect(first.binding).toMatchObject({
      mapRevision: 2,
      packageDigest: playtestTapesV2.packageDigest,
      fixtureHash: playtestTapesV2.fixtureHash,
      movementProfileId: 'phase3_hypothesis_v1',
      movementProfileRevision: 1,
      physicsAdapterVersion: '0.19.3',
    });
    expect(loaded.authority.fixture.solids).toHaveLength(339);
  });

  it('adds exactly the three authorized post-completion idle-egress sequences', () => {
    const tape = eightPlayerTape();
    const steps = (slot: number) => tape.agents.find((agent) => agent.slot === slot)?.steps;
    expect(steps(0)?.slice(-2)).toEqual([
      { linkId: 'press_east_choice', direction: 'forward', movementMode: 'run' },
      { linkId: 'east_choice_spawn', direction: 'forward', movementMode: 'run' },
    ]);
    expect(steps(2)?.slice(-3)).toEqual([
      { linkId: 'ink_west_mid_w', direction: 'reverse', movementMode: 'run' },
      { linkId: 'west_choice_ink', direction: 'reverse', movementMode: 'run' },
      { linkId: 'west_spawn_choice', direction: 'reverse', movementMode: 'run' },
    ]);
    expect(steps(3)?.slice(-2)).toEqual([
      { linkId: 'ink_mid_w_mid_e', direction: 'reverse', movementMode: 'run' },
      { linkId: 'ink_mid_w_teleport_entry', direction: 'forward', movementMode: 'crouch' },
    ]);
    for (const slot of [1, 4, 5, 6]) {
      expect(steps(slot)).toEqual(
        playtestTapesV1.scenarios.find(({ playerCount }) => playerCount === 8)?.agents
          .find((agent) => agent.slot === slot)?.steps,
      );
    }
    const revision1Slot7 = playtestTapesV1.scenarios
      .find(({ playerCount }) => playerCount === 8)?.agents.find(({ slot }) => slot === 7);
    expect(steps(7)?.map(({ linkId, direction }) => ({ linkId, direction }))).toEqual(
      revision1Slot7?.steps.map(({ linkId, direction }) => ({ linkId, direction })),
    );
    const postureRoute = new Set([
      'ink_mid_w_teleport_entry',
      'teleport_shortcut',
      'teleport_exit_press_core',
    ]);
    expect(steps(7)?.filter(({ linkId }) => !postureRoute.has(linkId)))
      .toEqual(revision1Slot7?.steps.filter(({ linkId }) => !postureRoute.has(linkId)));
    expect(tape.agents.map(({ slot, spawnId, startDelayTicks }) => ({
      slot,
      spawnId,
      startDelayTicks,
    }))).toEqual(
      playtestTapesV1.scenarios.find(({ playerCount }) => playerCount === 8)?.agents
        .map(({ slot, spawnId, startDelayTicks }) => ({ slot, spawnId, startDelayTicks })),
    );
  });

  it('uses only the bounded revision-2 posture sequence on the original teleport route', () => {
    const slot7 = eightPlayerTape().agents.find(({ slot }) => slot === 7);
    expect(slot7?.steps.find(({ linkId }) => linkId === 'ink_mid_w_teleport_entry'))
      .toEqual({
        linkId: 'ink_mid_w_teleport_entry',
        direction: 'forward',
        movementMode: 'run',
        postureTransitions: [
          {
            atWaypointIndex: 1,
            afterTargetedTicks: 9,
            movementMode: 'slide',
          },
          {
            atWaypointIndex: 2,
            afterTargetedTicks: 0,
            movementMode: 'crouch',
          },
        ],
      });
    expect(slot7?.steps.find(({ linkId }) => linkId === 'teleport_shortcut'))
      .toEqual({
        linkId: 'teleport_shortcut',
        direction: 'forward',
        movementMode: 'teleport',
      });
    expect(slot7?.steps.find(({ linkId }) => linkId === 'teleport_exit_press_core'))
      .toEqual({
        linkId: 'teleport_exit_press_core',
        direction: 'forward',
        movementMode: 'jump',
      });
  });

  it('removes all retained-agent overlap findings across the complete native scenario', () => {
    const eight = first.scenarios.find(({ playerCount }) => playerCount === 8);
    expect(eight?.occupancy.bodyOverlapSamples).toBe(0);
    expect(eight?.issues.filter(({ code }) => code === 'SYNTHETIC_BODY_OVERLAP')).toEqual([]);
  });

  it('replays exactly deterministically and preserves the 2- and 4-player passes', () => {
    expect(second).toEqual(first);
    expect(first.scenarios.map(({ status }) => status)).toEqual(['PASS', 'PASS', 'PASS']);
    expect(first.scenarios.map(({ spawnProbe }) => spawnProbe.passed)).toEqual([true, true, true]);
    expect(first.scenarios.map(({ replayHash }) => replayHash)).toEqual([
      '92aa8378d2e0d27e',
      '2010f3a3d1897f31',
      '909814a9d725d187',
    ]);
    expect(first.suiteHash).toBe('143d09532b9c2b24');
    expect(first.issueCount).toBe(0);
    expect(first.allAutomatedThresholdsPassed).toBe(true);
  });

  it('measures the unchanged end-to-end teleport band and every constituent exactly', () => {
    const eight = first.scenarios.find(({ playerCount }) => playerCount === 8);
    const slot7 = eight?.agents.find(({ slot }) => slot === 7);
    expect(slot7?.routeTapes.slice(1, 4).map((tape) => ({
      linkId: tape.linkId,
      movementMode: tape.movementMode,
      traversalTicks: tape.traversalTicks,
    }))).toEqual([
      { linkId: 'ink_mid_w_teleport_entry', movementMode: 'run', traversalTicks: 40 },
      { linkId: 'teleport_shortcut', movementMode: 'teleport', traversalTicks: 6 },
      { linkId: 'teleport_exit_press_core', movementMode: 'jump', traversalTicks: 35 },
    ]);
    expect(slot7?.routeMetrics).toEqual([
      {
        metricId: 'ink_teleport_flank',
        targetBandMilliseconds: [1_800, 4_000],
        measuredTicks: 79,
        measuredMilliseconds: 3_950,
        insideTargetBand: true,
      },
      {
        metricId: 'archive_drop_flank',
        targetBandMilliseconds: [2_500, 5_000],
        measuredTicks: 66,
        measuredMilliseconds: 3_300,
        insideTargetBand: true,
      },
    ]);
  });

  it('finishes all routes with zero physical, volume, or analytical defects', () => {
    for (const scenario of first.scenarios) {
      expect(scenario.issues).toEqual([]);
      expect(scenario.agents.every(({ completed }) => completed)).toBe(true);
      expect(scenario.agents.flatMap(({ routeMetrics }) => routeMetrics)
        .every(({ insideTargetBand }) => insideTargetBand)).toBe(true);
      expect(scenario.collision).toMatchObject({ embedSamples: 0, snagEvents: 0 });
      expect(scenario.occupancy.bodyOverlapSamples).toBe(0);
      expect(scenario.volumes).toMatchObject({
        recoveryEntries: 0,
        killEntries: 0,
        recoveryProbePassed: true,
        killPriorityProbePassed: true,
        postRecoveryEscapePassed: true,
      });
    }
  });
});
