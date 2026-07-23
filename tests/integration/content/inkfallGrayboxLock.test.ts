import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import artKit from '../../../assets/source/maps/inkfall-foundry/art-kit/graybox-dimensions.p6-7.v1.json';
import seed from '../../../assets/source/maps/inkfall-foundry/inkfall-foundry.layout-seed.v1.json';
import lockManifest from '../../../assets/source/maps/inkfall-foundry/runtime/graybox-lock.p6-7.v1.json';
import mapPackageV2 from '../../../assets/source/maps/inkfall-foundry/runtime/map.package.v2.json';
import playtestTapeV2 from '../../../assets/source/maps/inkfall-foundry/runtime/playtest-tapes.p6-6.v2.json';
import {
  DEFAULT_MAP_ID,
  DEFAULT_MAP_REVISION,
  LOCKED_GRAYBOX_MAP_REVISION,
  getBundledGrayboxLockRevision,
  getBundledLockedGrayboxPackageSource,
  getBundledMapPackageSource,
} from '../../../src/content/maps';

const repositoryRoot = new URL('../../../', import.meta.url);

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== 'object') return value;
  const record = value as Readonly<Record<string, unknown>>;
  return Object.fromEntries(
    Object.keys(record).sort().map((key) => [key, canonicalize(record[key])]),
  );
}

function canonicalSha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

async function fileSha256(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(new URL(path, repositoryRoot))).digest('hex');
}

describe('Inkfall Foundry P6.7 non-default graybox lock', () => {
  it('promotes revision 2 to the explicit graybox lock without changing the product default', () => {
    expect(DEFAULT_MAP_ID).toBe('inkfall_foundry');
    expect(DEFAULT_MAP_REVISION).toBe(1);
    expect(LOCKED_GRAYBOX_MAP_REVISION).toBe(2);
    expect(getBundledGrayboxLockRevision(DEFAULT_MAP_ID)).toBe(2);
    expect(getBundledGrayboxLockRevision('missing')).toBeUndefined();

    const defaultPackage = getBundledMapPackageSource(DEFAULT_MAP_ID) as { revision: number };
    const lockedPackage = getBundledLockedGrayboxPackageSource(DEFAULT_MAP_ID) as {
      revision: number;
      identity: { digest: string };
    };
    expect(defaultPackage.revision).toBe(1);
    expect(lockedPackage).toMatchObject({
      revision: 2,
      identity: { digest: lockManifest.binding.packageDigest },
    });
    expect(getBundledLockedGrayboxPackageSource('missing')).toBeUndefined();

    expect(lockManifest).toMatchObject({
      schemaVersion: 1,
      kind: 'inkfall_foundry_graybox_lock',
      lockRevision: 1,
      status: 'graybox_locked_non_default',
      binding: {
        mapId: DEFAULT_MAP_ID,
        mapRevision: LOCKED_GRAYBOX_MAP_REVISION,
      },
      promotion: {
        from: 'staged_native_revision_2',
        to: 'locked_graybox_revision_2',
        catalogDefaultRevision: DEFAULT_MAP_REVISION,
        catalogLockedGrayboxRevision: LOCKED_GRAYBOX_MAP_REVISION,
        explicitRevisionSelectionRequired: true,
        productSelectable: false,
        shippingDefault: false,
        deploymentAuthorized: false,
      },
    });
  });

  it('recomputes every frozen source hash exactly', async () => {
    expect(lockManifest.frozenSourceSet).toHaveLength(12);
    const results = await Promise.all(lockManifest.frozenSourceSet.map(async (source) => ({
      role: source.role,
      expected: source.sha256,
      actual: await fileSha256(source.path),
    })));
    expect(results.filter((result) => result.actual !== result.expected)).toEqual([]);
    expect(new Set(results.map((result) => result.role)).size).toBe(results.length);
  });

  it('recomputes the frozen topology, spawn, route, and movement fingerprints', () => {
    const projections = {
      topology: {
        boundsMm: seed.boundsMm,
        verticalTiers: seed.verticalTiers,
        zones: seed.zones,
        nodes: seed.nodes,
        links: seed.links,
        strongPositions: seed.strongPositions,
        movementFeatures: seed.movementFeatures,
      },
      zones: seed.zones,
      nodes: seed.nodes,
      links: seed.links,
      strongPositions: seed.strongPositions,
      runtimeSpawns: mapPackageV2.spawns,
      seedSpawns: seed.spawnCandidates,
      routeMetrics: seed.routeMetrics,
      authorityTapeScenarios: playtestTapeV2.scenarios,
      movementSizing: seed.movementSizing,
      coordinateAndGrid: {
        units: seed.units,
        coordinateSystem: seed.coordinateSystem,
        grid: seed.grid,
      },
      seedArtModules: seed.coverAndClearance.modules,
      runtimeFunctionalPackage: {
        boundsMm: mapPackageV2.boundsMm,
        zones: mapPackageV2.zones,
        spawns: mapPackageV2.spawns,
        pickups: mapPackageV2.pickups,
        triggers: mapPackageV2.triggers,
        authorityVolumes: mapPackageV2.authorityVolumes,
        authority: mapPackageV2.authority,
      },
    } as const;

    expect(lockManifest.canonicalFingerprintAlgorithm).toBe(
      'sha256-canonical-json-sorted-keys-array-order-v1',
    );
    expect(Object.keys(lockManifest.frozenContractFingerprints).sort()).toEqual(
      Object.keys(projections).sort(),
    );
    for (const [name, projection] of Object.entries(projections)) {
      const locked = lockManifest.frozenContractFingerprints[
        name as keyof typeof lockManifest.frozenContractFingerprints
      ];
      expect(canonicalSha256(projection), name).toBe(locked.sha256);
    }

    expect(lockManifest.frozenCounts).toEqual({
      zones: seed.zones.length,
      nodes: seed.nodes.length,
      links: seed.links.length,
      routeMetrics: seed.routeMetrics.length,
      spawns: mapPackageV2.spawns.length,
      strongPositions: seed.strongPositions.length,
      movementFeatures: seed.movementFeatures.length,
      authorityPlaytestScenarios: playtestTapeV2.scenarios.length,
      renderMeshNodes: mapPackageV2.artifacts.render.expectedMeshNodeCount,
      authorityCollisionSolids: mapPackageV2.artifacts.collision.expectedMeshNodeCount,
      authorityVolumes: mapPackageV2.authorityVolumes.length,
    });
  });

  it('locks the exact corrected automated result without widening any metric', () => {
    expect(lockManifest.acceptedAutomatedResult).toEqual({
      claim: 'P6_6_CORRECTED_AUTOMATED_TAPES_PASS',
      scenarioStatuses: ['PASS', 'PASS', 'PASS'],
      issueCount: 0,
      suiteHash: '143d09532b9c2b24',
      scenarioReplayHashes: [
        '92aa8378d2e0d27e',
        '2010f3a3d1897f31',
        '909814a9d725d187',
      ],
      inkTeleportFlankMilliseconds: 3_950,
      inkTeleportFlankBandMilliseconds: [1_800, 4_000],
      archiveDropFlankMilliseconds: 3_300,
      archiveDropFlankBandMilliseconds: [2_500, 5_000],
      zeroDefects: {
        capsuleEmbeds: 0,
        depenetrationFailures: 0,
        routeSnags: 0,
        routeIncompletes: 0,
        recoveryEntries: 0,
        killEntries: 0,
        analyticalPlayerOverlaps: 0,
      },
    });
    expect(lockManifest.binding).toMatchObject({
      mapRevision: playtestTapeV2.mapRevision,
      packageDigest: playtestTapeV2.packageDigest,
      fixtureHash: playtestTapeV2.fixtureHash,
      authorityRateHz: playtestTapeV2.authorityRateHz,
    });
  });

  it('defines every required modular family with unique IDs, dimensions, pivots, and material slots', () => {
    const requiredFamilies = [
      'structural_bays',
      'walls',
      'corners',
      'columns',
      'floors',
      'ramps',
      'stairs',
      'platforms',
      'rails',
      'door_frames',
      'cover',
      'vents_and_crouch_tunnels',
      'ink_conduits',
      'garden_fragments',
      'trims_and_decals',
      'landmark_hero_pieces',
    ];
    const familyIds = artKit.moduleFamilies.map((family) => family.id);
    const materialIds = new Set(artKit.materialSlots.map((slot) => slot.id));
    const modules = artKit.moduleFamilies.flatMap((family) => family.modules.map((module) => ({
      family,
      module,
    })));

    expect(familyIds).toEqual(requiredFamilies);
    expect(new Set(familyIds).size).toBe(familyIds.length);
    expect(modules).toHaveLength(37);
    expect(new Set(modules.map(({ module }) => module.id)).size).toBe(modules.length);
    for (const { family, module } of modules) {
      expect(family.authorityPolicy.length, family.id).toBeGreaterThan(0);
      expect(module.pivot.length, module.id).toBeGreaterThan(0);
      expect(Object.values(module.dimensionsMm).every((value) => (
        Number.isInteger(value) && value > 0
      )), module.id).toBe(true);
      expect(module.materialSlots.every((slot) => materialIds.has(slot)), module.id).toBe(true);

      const gridSize = family.id === 'trims_and_decals'
        ? artKit.grid.decorativeDetailMm
        : artKit.grid.fineAdjustmentMm;
      if ('gridException' in module) {
        expect(module.gridException, module.id).toBe('frozen_seed_clearance_interface');
      } else {
        expect(Object.values(module.dimensionsMm).every((value) => value % gridSize === 0), module.id)
          .toBe(true);
      }
    }
  });

  it('preserves the seed clearances and bounded ramp, stair, door, and slide interfaces', () => {
    const modules = new Map(artKit.moduleFamilies.flatMap((family) => (
      family.modules.map((module) => [module.id, module] as const)
    )));
    const ramps = artKit.moduleFamilies.find((family) => family.id === 'ramps')?.modules ?? [];
    const stairs = artKit.moduleFamilies.find((family) => family.id === 'stairs')?.modules ?? [];

    expect(ramps.every((module) => (
      'slopeAngleMilliDegrees' in module && module.slopeAngleMilliDegrees <= 20_000
    ))).toBe(true);
    expect(stairs.every((module) => (
      'stepRiseMm' in module
      && 'stepRunMm' in module
      && module.stepRiseMm <= 250
      && module.stepRunMm >= 500
    ))).toBe(true);
    expect(modules.get('door_main')).toMatchObject({
      clearOpeningMm: { x: 2_400, y: 3_000 },
    });
    expect(modules.get('door_flank')).toMatchObject({
      clearOpeningMm: { x: 1_400, y: 2_400 },
    });
    expect(modules.get('slide_gate_shell')).toMatchObject({
      clearOpeningMm: { x: 1_400, y: 1_350, z: 4_800 },
    });

    const seedDimensions = new Map(seed.coverAndClearance.modules.map((module) => (
      [module.id, module.dimensionsMm] as const
    )));
    expect(artKit.frozenSeedModuleParity).toHaveLength(seedDimensions.size);
    for (const parity of artKit.frozenSeedModuleParity) {
      expect(parity.dimensionsMm, parity.seedId).toEqual(seedDimensions.get(parity.seedId));
      expect(modules.has(parity.contractModuleId), parity.contractModuleId).toBe(true);
    }
  });

  it('keeps human, visual, final-art, performance, product, shipping, and deployment claims open', () => {
    expect(lockManifest.nonClaims).toEqual([
      'G5_NOT_PASSED',
      'HUMAN_FUN_OR_READABILITY_NOT_ACCEPTED',
      'VISUAL_ACCEPTANCE_NOT_PASSED',
      'FINAL_ART_NOT_COMPLETE',
      'PERFORMANCE_NOT_ACCEPTED',
      'PRODUCT_INTEGRATION_NOT_COMPLETE',
      'REVISION_2_NOT_DEFAULT_OR_SHIPPING',
      'DEPLOYMENT_NOT_AUTHORIZED',
    ]);
    expect(artKit.status).toBe('dimension_contract_only');
    expect(artKit.nonClaims).toContain('MODULE_MESHES_NOT_AUTHORED');
    expect(artKit.nonClaims).toContain('G5_NOT_PASSED');
    expect(lockManifest.mutationRules).toHaveLength(5);
  });
});
