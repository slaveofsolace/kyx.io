import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  createRapierMovementWorld,
  type PhysicsFixtureV1,
} from '../../../src/physics';
import {
  PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
  asMillimeters,
} from '../../../src/sim';

interface InkfallCombatFixtureSnapshot {
  readonly mapRevision: number;
  readonly packageDigest: string;
  readonly collisionSha256: string;
  readonly fixtureHash: string;
  readonly collisionMeshNodeCount: number;
  readonly fixture: PhysicsFixtureV1;
}

const revision3FixtureUrl = new URL(
  '../../../assets/source/maps/inkfall-foundry/runtime/combat-authority-fixture.g5-revision3.v1.json',
  import.meta.url,
);
const revision4FixtureUrl = new URL(
  '../../../assets/source/maps/inkfall-foundry/runtime/combat-authority-fixture.g5-revision4.v1.json',
  import.meta.url,
);
const OFFENDING_RAIL_ID = 'map_collision_guard_rail_ink_east_choice_s02_right';
const FAILURE_FEET_POSITION = Object.freeze({
  x: asMillimeters(22_549),
  y: asMillimeters(-307),
  z: asMillimeters(-3_386),
});
const FAILURE_TICK_TRANSLATION = Object.freeze({
  x: asMillimeters(-41),
  y: asMillimeters(0),
  z: asMillimeters(0),
});
const SOLID_LAYERS = Object.freeze([
  'world_static',
  'dynamic_platform',
  'player_body',
  'door',
  'spawn_barrier',
] as const);

async function readSnapshot(url: URL): Promise<InkfallCombatFixtureSnapshot> {
  return JSON.parse(await readFile(url, 'utf8')) as InkfallCombatFixtureSnapshot;
}

describe('Inkfall Revision 4 east-choice guard-rail correction', () => {
  it('changes only the intrusive rail while preserving fixture cardinality', async () => {
    const [revision3, revision4] = await Promise.all([
      readSnapshot(revision3FixtureUrl),
      readSnapshot(revision4FixtureUrl),
    ]);
    const withoutTarget = (fixture: PhysicsFixtureV1) => fixture.solids.filter(
      ({ id }) => id !== OFFENDING_RAIL_ID,
    );

    expect(revision4).toMatchObject({
      mapRevision: 4,
      packageDigest: '65c6c315d9bc0ba27e7ddec1fd2712752b0fa91c4f865f4b2a055e778158c9cf',
      collisionSha256: '59d791898a3f7815bb2306c678b2b37fcaaf201b33a94a1e260752edb7a5477c',
      fixtureHash: 'b24d002179389621',
      collisionMeshNodeCount: 339,
    });
    expect(revision4.fixture.solids).toHaveLength(revision3.fixture.solids.length);
    expect(revision4.fixture.volumes).toEqual(revision3.fixture.volumes);
    expect(withoutTarget(revision4.fixture)).toEqual(withoutTarget(revision3.fixture));
    expect(revision3.fixture.solids.find(({ id }) => id === OFFENDING_RAIL_ID)).toMatchObject({
      centerMm: { x: 22_347, y: -54, z: -4_058 },
      shape: { halfExtentsMm: { x: 841, y: 450, z: 80 } },
    });
    expect(revision4.fixture.solids.find(({ id }) => id === OFFENDING_RAIL_ID)).toMatchObject({
      centerMm: { x: 22_374, y: -63, z: -4_122 },
      shape: { halfExtentsMm: { x: 770, y: 450, z: 80 } },
    });
  });

  it('clears the exact former bot-03 failure pose without widening global KCC recovery', async () => {
    const revision4 = await readSnapshot(revision4FixtureUrl);
    const revision4World = await createRapierMovementWorld(revision4.fixture);
    const request = {
      feetPosition: FAILURE_FEET_POSITION,
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      desiredTranslation: FAILURE_TICK_TRANSLATION,
      settings: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.query,
      solidLayers: SOLID_LAYERS,
    };

    try {
      expect(revision4World.overlapCapsule({
        feetPosition: FAILURE_FEET_POSITION,
        shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
        solidLayers: SOLID_LAYERS,
      }).blockingColliderIds).toEqual([]);
      const corrected = revision4World.moveCapsule(request);
      const finalFeet = {
        x: asMillimeters(FAILURE_FEET_POSITION.x + corrected.appliedTranslation.x),
        y: asMillimeters(FAILURE_FEET_POSITION.y + corrected.appliedTranslation.y),
        z: asMillimeters(FAILURE_FEET_POSITION.z + corrected.appliedTranslation.z),
      };
      expect(revision4World.overlapCapsule({
        feetPosition: finalFeet,
        shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
        solidLayers: SOLID_LAYERS,
      }).blockingColliderIds).toEqual([]);
      expect(corrected.appliedTranslation.x).toBeLessThan(0);
    } finally {
      revision4World.dispose();
    }
  });
});
