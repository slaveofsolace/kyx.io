import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  getBundledMapPackageSource,
} from '../../../src/content/maps';
import {
  loadRuntimeMapPackage,
  type LoadedRuntimeMapPackage,
} from '../../../src/physics';
import {
  runInkfallRev3ReviewAudit,
} from '../../../src/app/inkfallRev3ReviewAudit';

const renderUrl = new URL(
  '../../../assets/source/maps/inkfall-foundry/revisions/revision-3/export/render.graybox.glb',
  import.meta.url,
);
const collisionUrl = new URL(
  '../../../assets/source/maps/inkfall-foundry/revisions/revision-3/export/collision.authority.glb',
  import.meta.url,
);

let loaded: LoadedRuntimeMapPackage;
let audit: Awaited<ReturnType<typeof runInkfallRev3ReviewAudit>>;

beforeAll(async () => {
  const source = getBundledMapPackageSource('inkfall_foundry', 3);
  if (!source) throw new Error('INKFALL_REV3_TEST_PACKAGE_NOT_BUNDLED');
  loaded = await loadRuntimeMapPackage(source, {
    render: await readFile(renderUrl),
    collision: await readFile(collisionUrl),
  });
  audit = await runInkfallRev3ReviewAudit(loaded);
}, 120_000);

describe('Inkfall Revision 3 open-mid product review audit', () => {
  it('pins the paired render/collision identity without changing the default', () => {
    expect(audit.identity).toEqual({
      mapId: 'inkfall_foundry',
      mapRevision: 3,
      packageDigest: '4027934730af7c855b0abcee1b36cc256294e3e5c22a6ffb8aa02a77f71d196a',
      fixtureHash: '97eb7772ac59dc95',
      collisionSha256: '1cce637ab4f83766627527b3885c3e9da819d8bcabdfa2144f8dc6b46bc5bba8',
      renderSha256: '19bbf6f627f46146a7266d39e00e0635d7b4b09e556bfa0dee988bb2375c5ed6',
      colliderCount: 339,
    });
  });

  it('opens both 28-metre sniper lanes and retains three counterplay blockers', () => {
    expect(audit.sightlines.map((sightline) => ({
      id: sightline.id,
      distanceMm: sightline.distanceMm,
      blockers: sightline.blockingColliderIds,
      passed: sightline.passed,
    }))).toEqual([
      {
        id: 'sniper_lane_west_to_east',
        distanceMm: 28_018,
        blockers: [],
        passed: true,
      },
      {
        id: 'sniper_lane_east_to_west',
        distanceMm: 28_018,
        blockers: [],
        passed: true,
      },
      {
        id: 'west_baffle_counter_cover',
        distanceMm: 6_000,
        blockers: ['map_collision_module_press_baffle_w_inner'],
        passed: true,
      },
      {
        id: 'east_baffle_counter_cover',
        distanceMm: 6_000,
        blockers: ['map_collision_module_press_baffle_e_inner'],
        passed: true,
      },
      {
        id: 'north_reactor_counter',
        distanceMm: 18_000,
        blockers: ['map_collision_module_press_reactor_north'],
        passed: true,
      },
    ]);
  });

  it('traverses both shotgun breaches and Press Core without snag, embed, or recovery', () => {
    expect(audit.routes).toHaveLength(3);
    expect(audit.routes.every((route) => (
      route.passed
      && route.snagCount === 0
      && route.overlapSampleCount === 0
      && route.error === null
      && route.remainingDistanceMm <= 150
    ))).toBe(true);
    expect(audit.canonicalRegression).toMatchObject({
      pressJunction: {
        castClear: true,
        finalBlockingColliderIds: [],
        passed: true,
      },
      westArchive: {
        finalFeetMm: { x: -23_958, y: 37, z: 402 },
        finalBlockingColliderIds: [],
        passed: true,
      },
    });
  });

  it('keeps all spawns clear and verifies recovery/kill volume contracts', () => {
    expect(audit.spawnAndVolumes.spawns).toHaveLength(12);
    expect(audit.spawnAndVolumes.allSpawnsClear).toBe(true);
    expect(audit.spawnAndVolumes.spawns.every(({ blockingColliderIds }) => (
      blockingColliderIds.length === 0
    ))).toBe(true);
    expect(audit.spawnAndVolumes.volumes).toMatchObject({
      passed: true,
      recoveryProbe: {
        volumes: expect.arrayContaining([
          expect.objectContaining({ kind: 'recovery' }),
        ]),
      },
      killProbe: {
        volumes: expect.arrayContaining([
          expect.objectContaining({ kind: 'kill' }),
        ]),
      },
    });
  });

  it('retains truthful objective, navigation, verticality, and human-review boundaries', () => {
    expect(audit.zonesAndObjectives).toMatchObject({
      zoneCount: 9,
      supportedModes: ['deathmatch', 'team_deathmatch'],
      objectiveContract: 'FRAG_MODES_NO_STATIC_OBJECTIVE_REQUIRED',
      pickupCount: 0,
      passed: true,
    });
    expect(audit.navigationAndVerticality).toMatchObject({
      spawnHeightLevelsMm: [-3_000, 0, 6_000],
      verticalRangeMm: 9_000,
      routeCount: 3,
      routePassCount: 3,
      canonicalRegressionPassCount: 2,
      passed: true,
    });
    expect(audit.status).toBe('REV3_PRODUCT_BROWSER_AUTOMATED_AUDIT_PASS_G5_OPEN');
    expect(audit.allChecksPassed).toBe(true);
    expect(audit.nonClaims).toContain('AUTOMATED_PRODUCT_BROWSER_AUDIT_NOT_HUMAN_PLAYTEST');
    expect(audit.nonClaims).toContain('REVISION_3_NOT_DEFAULT');
    expect(audit.nonClaims).toContain('G5_NOT_PASSED');
  });
});
