import { describe, expect, it } from 'vitest';

import {
  INKFALL_REVISION_2_AUTHORITY_MAP_BINDING,
  INKFALL_REVISION_2_AUTHORITY_PROFILE_ID,
  INKFALL_REVISION_3_AUTHORITY_MAP_BINDING,
  INKFALL_REVISION_3_AUTHORITY_PROFILE_ID,
  INKFALL_REVISION_4_AUTHORITY_MAP_BINDING,
  INKFALL_REVISION_4_AUTHORITY_PROFILE_ID,
  INKFALL_REVISION_5_AUTHORITY_PROFILE_ID,
  inkfallAuthorityCombatSpawn,
  inkfallAuthorityFixture,
  inkfallAuthorityMapBinding,
  isInkfallAuthorityProfile,
} from '../../../src/authority/inkfallRoomFactory';
import {
  ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID,
  ONLINE_INKFALL_REV2_MAP_BINDING,
  ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID,
  ONLINE_INKFALL_REV4_MAP_BINDING,
  ONLINE_INKFALL_REV5_COMBAT_PROFILE_ID,
  ONLINE_INKFALL_REV5_MAP_BINDING,
  onlineInkfallMapBinding,
} from '../../../src/app/onlineAuthorityProfiles';
import {
  G5_INKFALL_REV4_COMBAT_PROFILE,
  G5_INKFALL_REV5_COMBAT_PROFILE,
  INKFALL_REVISION_2_WORKER_MAP_BINDING,
  INKFALL_REVISION_3_WORKER_MAP_BINDING,
  INKFALL_REVISION_4_WORKER_MAP_BINDING,
  P511_INKFALL_REV2_COMBAT_PROFILE,
  inkfallWorkerCombatSpawn,
  inkfallWorkerFixture,
  inkfallWorkerMapBinding,
} from '../../../worker/combatRuntime';

describe('shared Inkfall authority room factory', () => {
  it('pins browser and Worker selectors to one profile identity', () => {
    expect(ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID)
      .toBe(INKFALL_REVISION_2_AUTHORITY_PROFILE_ID);
    expect(P511_INKFALL_REV2_COMBAT_PROFILE)
      .toBe(INKFALL_REVISION_2_AUTHORITY_PROFILE_ID);
    expect(ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID)
      .toBe(INKFALL_REVISION_3_AUTHORITY_PROFILE_ID);
    expect(G5_INKFALL_REV4_COMBAT_PROFILE)
      .toBe(INKFALL_REVISION_3_AUTHORITY_PROFILE_ID);
    expect(ONLINE_INKFALL_REV5_COMBAT_PROFILE_ID)
      .toBe(INKFALL_REVISION_4_AUTHORITY_PROFILE_ID);
    expect(G5_INKFALL_REV5_COMBAT_PROFILE)
      .toBe(INKFALL_REVISION_4_AUTHORITY_PROFILE_ID);
    expect(INKFALL_REVISION_5_AUTHORITY_PROFILE_ID)
      .toBe(INKFALL_REVISION_4_AUTHORITY_PROFILE_ID);
    expect(isInkfallAuthorityProfile(INKFALL_REVISION_2_AUTHORITY_PROFILE_ID)).toBe(true);
    expect(isInkfallAuthorityProfile(INKFALL_REVISION_3_AUTHORITY_PROFILE_ID)).toBe(true);
    expect(isInkfallAuthorityProfile(INKFALL_REVISION_4_AUTHORITY_PROFILE_ID)).toBe(true);
    expect(isInkfallAuthorityProfile('phase4-flat-run-default-v1')).toBe(false);
  });

  it('shares the exact map binding object across browser and Worker adapters', () => {
    expect(ONLINE_INKFALL_REV2_MAP_BINDING)
      .toBe(INKFALL_REVISION_2_AUTHORITY_MAP_BINDING);
    expect(INKFALL_REVISION_2_WORKER_MAP_BINDING)
      .toBe(INKFALL_REVISION_2_AUTHORITY_MAP_BINDING);
    expect(ONLINE_INKFALL_REV4_MAP_BINDING)
      .toBe(INKFALL_REVISION_3_AUTHORITY_MAP_BINDING);
    expect(ONLINE_INKFALL_REV5_MAP_BINDING)
      .toBe(INKFALL_REVISION_4_AUTHORITY_MAP_BINDING);
    expect(INKFALL_REVISION_3_WORKER_MAP_BINDING)
      .toBe(INKFALL_REVISION_3_AUTHORITY_MAP_BINDING);
    expect(INKFALL_REVISION_4_WORKER_MAP_BINDING)
      .toBe(INKFALL_REVISION_4_AUTHORITY_MAP_BINDING);
    expect(onlineInkfallMapBinding(INKFALL_REVISION_3_AUTHORITY_PROFILE_ID))
      .toBe(inkfallAuthorityMapBinding(INKFALL_REVISION_3_AUTHORITY_PROFILE_ID));
    expect(inkfallWorkerMapBinding(INKFALL_REVISION_3_AUTHORITY_PROFILE_ID))
      .toBe(INKFALL_REVISION_3_AUTHORITY_MAP_BINDING);
    expect(onlineInkfallMapBinding(INKFALL_REVISION_4_AUTHORITY_PROFILE_ID))
      .toBe(inkfallAuthorityMapBinding(INKFALL_REVISION_4_AUTHORITY_PROFILE_ID));
    expect(inkfallWorkerMapBinding(INKFALL_REVISION_4_AUTHORITY_PROFILE_ID))
      .toBe(INKFALL_REVISION_4_AUTHORITY_MAP_BINDING);
  });

  it('fails closed through hash-locked fixtures with exact collider cardinality', () => {
    const revision2 = inkfallAuthorityFixture(INKFALL_REVISION_2_AUTHORITY_PROFILE_ID);
    const revision3 = inkfallAuthorityFixture(INKFALL_REVISION_3_AUTHORITY_PROFILE_ID);
    const revision4 = inkfallAuthorityFixture(INKFALL_REVISION_4_AUTHORITY_PROFILE_ID);

    expect(revision2.id).toBe(INKFALL_REVISION_2_AUTHORITY_MAP_BINDING.fixtureId);
    expect(revision2.revision).toBe(2);
    expect(revision2.solids).toHaveLength(
      INKFALL_REVISION_2_AUTHORITY_MAP_BINDING.colliderCardinality,
    );
    expect(revision3.id).toBe(INKFALL_REVISION_3_AUTHORITY_MAP_BINDING.fixtureId);
    expect(revision3.revision).toBe(3);
    expect(revision3.solids).toHaveLength(
      INKFALL_REVISION_3_AUTHORITY_MAP_BINDING.colliderCardinality,
    );
    expect(revision4.id).toBe(INKFALL_REVISION_4_AUTHORITY_MAP_BINDING.fixtureId);
    expect(revision4.revision).toBe(4);
    expect(revision4.solids).toHaveLength(
      INKFALL_REVISION_4_AUTHORITY_MAP_BINDING.colliderCardinality,
    );
    expect(inkfallWorkerFixture(G5_INKFALL_REV4_COMBAT_PROFILE)).toBe(revision3);
    expect(inkfallWorkerFixture(G5_INKFALL_REV5_COMBAT_PROFILE)).toBe(revision4);
  });

  it('keeps the eight playable spawn ordinals identical across adapters', () => {
    const authoritySpawns = Array.from({ length: 8 }, (_, ordinal) => (
      inkfallAuthorityCombatSpawn(ordinal, INKFALL_REVISION_3_AUTHORITY_PROFILE_ID)
    ));
    const workerSpawns = Array.from({ length: 8 }, (_, ordinal) => (
      inkfallWorkerCombatSpawn(ordinal, G5_INKFALL_REV4_COMBAT_PROFILE)
    ));
    const revision4AuthoritySpawns = Array.from({ length: 8 }, (_, ordinal) => (
      inkfallAuthorityCombatSpawn(ordinal, INKFALL_REVISION_4_AUTHORITY_PROFILE_ID)
    ));
    const revision4WorkerSpawns = Array.from({ length: 8 }, (_, ordinal) => (
      inkfallWorkerCombatSpawn(ordinal, G5_INKFALL_REV5_COMBAT_PROFILE)
    ));

    expect(workerSpawns).toEqual(authoritySpawns);
    expect(revision4WorkerSpawns).toEqual(revision4AuthoritySpawns);
    expect(new Set(authoritySpawns.map((spawn) => spawn.spawnId)).size).toBe(8);
    expect(inkfallAuthorityCombatSpawn(8, INKFALL_REVISION_3_AUTHORITY_PROFILE_ID))
      .toEqual(authoritySpawns[0]);
    expect(() => inkfallAuthorityCombatSpawn(-1)).toThrow(RangeError);
  });
});
