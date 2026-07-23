import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import savedSpawnFixtures from '../../../assets/source/maps/inkfall-foundry/runtime/spawn-fixtures.p6-4.v1.json';

import {
  createInkfallSpawnAuthority,
  INKFALL_SPAWN_AUTHORITY_CONTRACT,
  SpawnAuthorityInputError,
  type AuthoritySpawnPlayerInput,
  type AuthoritySpawnSelectionInputV1,
  type InkfallSpawnAuthority,
} from '../../../src/authority/spawn';
import {
  requireBundledMapPackageManifest,
  type MapVector3Millimeters,
} from '../../../src/content/maps';
import {
  loadRuntimeMapPackage,
  type LoadedRuntimeMapPackage,
} from '../../../src/physics';

const mapRoot = new URL('../../../assets/source/maps/inkfall-foundry/', import.meta.url);
const TICK = 1_000;

let loaded: LoadedRuntimeMapPackage;
let selector: InkfallSpawnAuthority;

function aimAt(
  from: MapVector3Millimeters,
  to: MapVector3Millimeters,
): MapVector3Millimeters {
  const delta = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  const magnitude = Math.hypot(delta.x, delta.y, delta.z);
  if (magnitude === 0) return Object.freeze({ x: 32_767, y: 0, z: 0 });
  return Object.freeze({
    x: Math.round((delta.x / magnitude) * 32_767),
    y: Math.round((delta.y / magnitude) * 32_767),
    z: Math.round((delta.z / magnitude) * 32_767),
  });
}

function player(
  id: string,
  teamId: string | null,
  feetPositionMm: MapVector3Millimeters,
  aimTarget: MapVector3Millimeters = Object.freeze({ x: 0, y: feetPositionMm.y, z: 0 }),
  authorityArrivalEstimates: AuthoritySpawnPlayerInput['authorityArrivalEstimates'] = Object.freeze([]),
): AuthoritySpawnPlayerInput {
  return Object.freeze({
    id,
    teamId,
    feetPositionMm,
    aimDirectionQ15: aimAt(feetPositionMm, aimTarget),
    aimSampleTick: TICK,
    authorityArrivalEstimates,
  });
}

function input(overrides: Partial<AuthoritySpawnSelectionInputV1> = {}): AuthoritySpawnSelectionInputV1 {
  const mode = overrides.mode ?? 'deathmatch';
  return {
    schemaVersion: 1,
    mapId: 'inkfall_foundry',
    mapRevision: 1,
    fixtureHash: '2a0a446a0b152395',
    mode,
    tick: TICK,
    requester: mode === 'deathmatch'
      ? { id: 'requester', teamId: null, territory: null }
      : { id: 'requester', teamId: 'red', territory: 'west' },
    players: [],
    recentDeaths: [],
    recentSpawnUses: [],
    objectives: [],
    ...overrides,
  };
}

function spawnPosition(id: string): MapVector3Millimeters {
  const spawn = loaded.manifest.spawns.find((candidate) => candidate.id === id);
  if (!spawn) throw new Error(`Missing test spawn ${id}`);
  return spawn.feetPositionMm;
}

beforeAll(async () => {
  const [render, collision, manifest] = await Promise.all([
    readFile(new URL('export/render.graybox.glb', mapRoot)),
    readFile(new URL('export/collision.authority.glb', mapRoot)),
    requireBundledMapPackageManifest(),
  ]);
  loaded = await loadRuntimeMapPackage(manifest, { render, collision });
  selector = createInkfallSpawnAuthority(loaded);
});

describe('Inkfall Foundry P6.4 authority spawn selection', () => {
  it('executes the saved deterministic FFA/TDM and 2/4/8-player fixtures', () => {
    const results = savedSpawnFixtures.scenarios.map((scenario) => ({
      id: scenario.id,
      expected: scenario.expected,
      result: selector.select(scenario.input),
    }));
    expect(savedSpawnFixtures).toMatchObject({
      schemaVersion: 1,
      mapId: 'inkfall_foundry',
      mapRevision: 1,
      packageDigest: loaded.identity.packageDigest,
      fixtureHash: loaded.authority.fixtureHash,
      authorityBoundary: 'server_state_and_authority_collision_only',
    });
    expect(results).toHaveLength(6);
    for (const { expected, result } of results) {
      expect({
        status: result.status,
        selectedSpawnId: result.selected?.spawnId ?? null,
        decisionHash: result.decisionHash,
      }).toEqual(expected);
    }
    expect(savedSpawnFixtures.scenarios.slice(0, 3).map(({ input: fixtureInput }) => (
      fixtureInput.players.length + 1
    ))).toEqual([2, 4, 8]);
  });

  it('pins the accepted package, collision fixture, and authority-only contract', () => {
    expect(INKFALL_SPAWN_AUTHORITY_CONTRACT).toMatchObject({
      mapId: 'inkfall_foundry',
      mapRevision: 1,
      packageDigest: 'a593ad82b2e9f713a4a8d775002c1583c0fb3dfd3acdf004ba7bd6b144173267',
      fixtureHash: '2a0a446a0b152395',
      lineOfSightPolicy: 'standing_or_crouched_direct_los_rejects_candidate',
      tieBreak: 'score_desc_then_spawn_id_code_unit_asc',
    });
    expect(loaded.authority.fixture.solids).toHaveLength(346);
  });

  it('uses named authority colliders for standing/crouched LOS and rejects any direct exposure', () => {
    const fromWestPress = selector.select(input({
      players: [player('enemy', null, spawnPosition('spawn_w_press_a'))],
    }));
    const exposed = fromWestPress.evaluations.find(({ spawnId }) => spawnId === 'spawn_dm_archive_w')!;
    const occluded = fromWestPress.evaluations.find(({ spawnId }) => spawnId === 'spawn_dm_archive_e')!;
    expect(exposed).toMatchObject({
      eligible: false,
      rejectionReasons: ['direct_enemy_line_of_sight'],
      enemies: [{
        standingLineOfSight: true,
        standingBlockerId: null,
        crouchedLineOfSight: true,
        crouchedBlockerId: null,
      }],
    });
    expect(occluded).toMatchObject({
      eligible: true,
      enemies: [{
        standingLineOfSight: false,
        standingBlockerId: 'map_collision_guard_rail_press_core_archive_mid_e_s01_right',
        crouchedLineOfSight: false,
      }],
    });

    const heightSweep = selector.select(input({
      players: [player('enemy', null, spawnPosition('spawn_w_ink'))],
    }));
    expect(heightSweep.evaluations.find(({ spawnId }) => spawnId === 'spawn_dm_archive_w'))
      .toMatchObject({
        eligible: false,
        enemies: [{
          standingLineOfSight: true,
          crouchedLineOfSight: false,
          crouchedBlockerId: expect.any(String),
        }],
      });
  });

  it('uses strict mode/team territory filters for FFA and TDM', () => {
    const ffa = selector.select(input());
    expect(ffa.status).toBe('selected');
    expect(ffa.selected?.spawnId).toBe('spawn_dm_archive_e');
    expect(ffa.evaluations.filter((candidate) => candidate.eligible).map((candidate) => candidate.set))
      .toEqual(Array(4).fill('deathmatch_candidate'));

    const tdm = selector.select(input({ mode: 'team_deathmatch' }));
    expect(tdm.status).toBe('selected');
    expect(tdm.evaluations.filter((candidate) => candidate.eligible).map((candidate) => candidate.set))
      .toEqual(Array(4).fill('west_team'));
    expect(tdm.evaluations.filter((candidate) => candidate.set === 'east_team'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          eligible: false,
          rejectionReasons: ['mode_team_territory_invalid'],
        }),
      ]));
  });

  it('aggregates every enemy rather than only the nearest and is order deterministic', () => {
    const players = [
      player('enemy_west_archive', null, spawnPosition('spawn_w_archive')),
      player('enemy_east_archive', null, spawnPosition('spawn_e_archive')),
      player('enemy_west_press', null, spawnPosition('spawn_w_press_a')),
    ];
    const first = selector.select(input({ players }));
    const reversed = selector.select(input({ players: [...players].reverse() }));
    expect(first.status).toBe('selected');
    expect(reversed).toEqual(first);
    for (const candidate of first.evaluations) {
      expect(candidate.enemies.map(({ enemyId }) => enemyId)).toEqual([
        'enemy_east_archive',
        'enemy_west_archive',
        'enemy_west_press',
      ]);
      expect(candidate.components.enemyDistanceSafety).toBe(
        candidate.enemies.reduce((sum, enemy) => sum + enemy.components.distanceSafety, 0),
      );
      expect(candidate.components.lineOfSightExposure).toBe(
        candidate.enemies.reduce((sum, enemy) => sum + enemy.components.lineOfSightExposure, 0),
      );
      expect(candidate.components.enemyTravelArrivalPressure).toBe(
        candidate.enemies.reduce((sum, enemy) => sum + enemy.components.travelArrivalPressure, 0),
      );
    }
  });

  it('includes recent aim and authority route-arrival pressure with stale-aim cutoff', () => {
    const target = spawnPosition('spawn_dm_archive_e');
    const origin = spawnPosition('spawn_w_archive');
    const aligned = selector.select(input({
      players: [player('enemy', null, origin, target, [{
        spawnId: 'spawn_dm_archive_e',
        milliseconds: 100,
      }])],
    }));
    const alignedEnemy = aligned.evaluations
      .find(({ spawnId }) => spawnId === 'spawn_dm_archive_e')!.enemies[0];
    expect(alignedEnemy).toMatchObject({
      standingLineOfSight: false,
      aimAlignmentPermille: 1_000,
      arrivalTimeMs: 100,
      arrivalSource: 'authority_route_probe',
      components: {
        recentAimAlignment: -600,
        travelArrivalPressure: -780,
      },
    });

    const stalePlayer = {
      ...player('enemy', null, origin, target),
      aimSampleTick: TICK - INKFALL_SPAWN_AUTHORITY_CONTRACT.recentAimWindowTicks - 1,
    };
    const stale = selector.select(input({ players: [stalePlayer] }));
    expect(stale.evaluations.find(({ spawnId }) => spawnId === 'spawn_dm_archive_e')!.enemies[0])
      .toMatchObject({
        aimAlignmentPermille: 0,
        components: { recentAimAlignment: 0 },
      });
  });

  it('applies recent death/use penalties and keeps no-objective scoring explicitly neutral', () => {
    const baseline = selector.select(input());
    expect(baseline.selected?.spawnId).toBe('spawn_dm_archive_e');
    const penalized = selector.select(input({
      recentDeaths: [{
        playerId: 'requester',
        feetPositionMm: spawnPosition('spawn_dm_archive_e'),
        tick: TICK - 1,
      }],
      recentSpawnUses: [{ spawnId: 'spawn_dm_archive_e', tick: TICK - 1 }],
    }));
    const punished = penalized.evaluations
      .find(({ spawnId }) => spawnId === 'spawn_dm_archive_e')!;
    expect(punished.objectivePolicy).toBe('neutral_no_objectives');
    expect(punished.components.objectiveProximityPressure).toBe(0);
    expect(punished.components.recentDeathLocation).toBeLessThan(-1_100);
    expect(punished.components.recentSpawnUse).toBeLessThan(-900);
    expect(penalized.selected?.spawnId).not.toBe('spawn_dm_archive_e');
  });

  it('applies explicit objective pressure and team clustering without accepting client placement', () => {
    const objective = selector.select(input({
      objectives: [{
        id: 'reactor_objective',
        feetPositionMm: spawnPosition('spawn_dm_archive_e'),
        controllingTeamId: null,
        pressurePermille: 1_000,
      }],
    }));
    const pressured = objective.evaluations
      .find(({ spawnId }) => spawnId === 'spawn_dm_archive_e')!;
    expect(pressured.objectivePolicy).toBe('authority_objectives_applied');
    expect(pressured.components.objectiveProximityPressure).toBe(-500);
    expect(objective.selected?.spawnId).not.toBe('spawn_dm_archive_e');

    const clusterPosition = spawnPosition('spawn_w_press_a');
    const team = selector.select(input({
      mode: 'team_deathmatch',
      players: [
        player('teammate_a', 'red', clusterPosition),
        player('teammate_b', 'red', { ...clusterPosition, z: clusterPosition.z + 500 }),
        player('teammate_c', 'red', { ...clusterPosition, z: clusterPosition.z - 500 }),
      ],
    }));
    const clustered = team.evaluations.find(({ spawnId }) => spawnId === 'spawn_w_press_a')!;
    expect(clustered).toMatchObject({
      eligible: false,
      rejectionReasons: ['authority_occupancy_overlap'],
      components: {
        teamClustering: -1_550,
        occupancy: -30_000,
      },
    });
    expect(team.status).toBe('selected');
    expect(team.selected?.spawnId).not.toBe('spawn_w_press_a');
  });

  it('selects valid candidates in deterministic 2, 4, and 8-player FFA arrangements', () => {
    const safePocketPositions = [
      spawnPosition('spawn_w_archive'),
      spawnPosition('spawn_e_archive'),
      { ...spawnPosition('spawn_w_archive'), x: -31_500 },
      { ...spawnPosition('spawn_e_archive'), x: 31_500 },
      { ...spawnPosition('spawn_w_archive'), z: 8_000 },
      { ...spawnPosition('spawn_e_archive'), z: 8_000 },
      { ...spawnPosition('spawn_w_archive'), x: -31_500, z: 8_000 },
    ];
    for (const totalPlayers of [2, 4, 8]) {
      const players = safePocketPositions.slice(0, totalPlayers - 1)
        .map((position, index) => player(`enemy_${totalPlayers}_${index}`, null, position));
      const result = selector.select(input({ players }));
      expect(result.status, `${totalPlayers}-player arrangement`).toBe('selected');
      expect(result.selected, `${totalPlayers}-player arrangement`).not.toBeNull();
      expect(result.evaluations.find(({ spawnId }) => spawnId === result.selected?.spawnId))
        .toMatchObject({ eligible: true, rejectionReasons: [] });
    }
  });

  it('returns no safe spawn when every FFA candidate is authority-occupied and exposed', () => {
    const occupied = [
      'spawn_dm_archive_e',
      'spawn_dm_archive_w',
      'spawn_dm_ink_e',
      'spawn_dm_ink_w',
    ].map((spawnId, index) => player(`enemy_${index}`, null, spawnPosition(spawnId)));
    const result = selector.select(input({ players: occupied }));
    expect(result).toMatchObject({ status: 'no_safe_spawn', selected: null });
    for (const candidate of result.evaluations.filter(({ set }) => set === 'deathmatch_candidate')) {
      expect(candidate.eligible).toBe(false);
      expect(candidate.rejectionReasons).toContain('authority_occupancy_overlap');
      expect(candidate.rejectionReasons).toContain('direct_enemy_line_of_sight');
    }
  });

  it('uses a stable code-unit tie-break and immutable read-only result', () => {
    const result = selector.select(input());
    expect(result.selected).toMatchObject({ spawnId: 'spawn_dm_archive_e', score: 400 });
    expect(result.clientPositionOrScoreAccepted).toBe(false);
    expect(result.authorityBoundary).toBe('server_state_and_authority_collision_only');
    expect(result.nonClaims).toEqual(['P6.5_NOT_CLAIMED', 'P6.6_NOT_CLAIMED', 'G5_NOT_PASSED']);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.evaluations)).toBe(true);
    expect(result.decisionHash).toMatch(/^[0-9a-f]{16}$/u);
    expect(selector.select(input()).decisionHash).toBe(result.decisionHash);
  });

  it('rejects untrusted client score/position fields and malformed authority state fail-closed', () => {
    expect(() => selector.select({ ...input(), clientSelectedSpawnId: 'spawn_dm_ink_w' }))
      .toThrow(SpawnAuthorityInputError);
    const accessor = input() as AuthoritySpawnSelectionInputV1 & { clientScore?: number };
    Object.defineProperty(accessor, 'clientScore', { enumerable: true, get: () => 999_999 });
    expect(() => selector.select(accessor)).toThrow(SpawnAuthorityInputError);
    expect(() => selector.select(input({
      players: [{
        ...player('enemy', null, { x: 0, y: 0, z: 0 }),
        aimDirectionQ15: { x: 1, y: 1, z: 1 },
      }],
    }))).toThrow(SpawnAuthorityInputError);
  });
});
