import { readFile } from 'node:fs/promises';

import {
  runInkfallAuthorityPlaytest,
  type InkfallAuthorityPlaytestSuiteDefinitionV1,
} from '../../../../../../src/authority/playtest';
import { requireBundledMapPackageManifest } from '../../../../../../src/content/maps';
import {
  loadRuntimeMapPackage,
  type LoadedRuntimeMapPackage,
} from '../../../../../../src/physics';
import type { PhysicsFixtureV1 } from '../../../../../../src/physics/fixtureSchema';

import manifest from './map.package.v2.json';
import topology from '../../../../../../assets/source/maps/inkfall-foundry/inkfall-foundry.layout-seed.v1.json';
import playtestTapes from '../../../../../../assets/source/maps/inkfall-foundry/runtime/playtest-tapes.p6-6.v1.json';
import spawnFixtures from '../../../../../../assets/source/maps/inkfall-foundry/runtime/spawn-fixtures.p6-4.v1.json';

const REVISION_1_DIGEST = 'a593ad82b2e9f713a4a8d775002c1583c0fb3dfd3acdf004ba7bd6b144173267';
const REVISION_1_FIXTURE_HASH = '2a0a446a0b152395';

export async function runCandidate() {
  const [render, collision, revision1Manifest] = await Promise.all([
    readFile(new URL('../export/render.graybox.glb', import.meta.url)),
    readFile(new URL('../export/collision.authority.glb', import.meta.url)),
    requireBundledMapPackageManifest('inkfall_foundry', 1),
  ]);
  const loaded = await loadRuntimeMapPackage(manifest, { render, collision });
  const padding = Object.freeze(Array.from({ length: 9 }, (_, index) => Object.freeze({
    id: `p6_6a_candidate_padding_${String(index).padStart(2, '0')}`,
    layer: 'world_static' as const,
    body: 'fixed' as const,
    centerMm: Object.freeze({
      x: -35_000 + (index % 4) * 200,
      y: 9_500,
      z: -27_000 + Math.floor(index / 4) * 200,
    }),
    rotationMilliDegrees: Object.freeze({ x: 0, y: 0, z: 0 }),
    velocityMmPerSecond: Object.freeze({ x: 0, y: 0, z: 0 }),
    shape: Object.freeze({
      type: 'box' as const,
      halfExtentsMm: Object.freeze({ x: 50, y: 50, z: 50 }),
    }),
  })));
  const fixture: PhysicsFixtureV1 = Object.freeze({
    ...loaded.authority.fixture,
    revision: 1,
    solids: Object.freeze([...loaded.authority.fixture.solids, ...padding]),
  });
  // The P6.6 runner was revision-1-pinned when this failed candidate was
  // measured. This evidence-only adapter changes identity fields solely to
  // execute the exact immutable tape logic against the candidate geometry.
  const compatible: LoadedRuntimeMapPackage = Object.freeze({
    ...loaded,
    manifest: revision1Manifest,
    identity: Object.freeze({
      ...loaded.identity,
      revision: 1,
      packageDigest: REVISION_1_DIGEST,
    }),
    authority: Object.freeze({
      ...loaded.authority,
      fixture,
      fixtureHash: REVISION_1_FIXTURE_HASH,
    }),
  });
  const result = await runInkfallAuthorityPlaytest(
    compatible,
    playtestTapes as unknown as InkfallAuthorityPlaytestSuiteDefinitionV1,
    topology,
    spawnFixtures,
  );
  return Object.freeze({
    candidateIdentity: loaded.identity,
    candidateFixtureHash: loaded.authority.fixtureHash,
    candidateColliderCount: loaded.authority.collisionMeshNodeCount,
    result,
  });
}

