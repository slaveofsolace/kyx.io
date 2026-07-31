import {
  INKFALL_REVISION_2_AUTHORITY_PROFILE_ID,
  INKFALL_REVISION_3_AUTHORITY_PROFILE_ID,
  inkfallAuthorityFixture,
} from '../authority/inkfallRoomFactory';
import {
  createRapierMovementWorld,
  type RapierMovementWorld,
} from '../physics';
import type {
  OnlineInkfallMapBinding,
  OnlineInkfallRevision2MapBinding,
  OnlineInkfallRevision4MapBinding,
} from './onlineAuthorityProfiles';

/** Reconstruct the same hash-locked Rapier fixture used by the Worker. */
export async function createOnlineInkfallWorld(
  binding: OnlineInkfallMapBinding,
): Promise<RapierMovementWorld> {
  const profile = binding.mapRevision === 3
    ? INKFALL_REVISION_3_AUTHORITY_PROFILE_ID
    : INKFALL_REVISION_2_AUTHORITY_PROFILE_ID;
  const fixture = inkfallAuthorityFixture(profile);
  const world = await createRapierMovementWorld(fixture);
  if (
    world.fixture.id !== binding.fixtureId
    || world.fixture.revision !== binding.mapRevision
    || world.fixtureHash !== binding.fixtureHash
    || world.fixture.solids.length !== binding.colliderCardinality
  ) {
    world.dispose();
    throw new Error(`ONLINE_INKFALL_REVISION_${binding.mapRevision}_CLIENT_WORLD_MISMATCH`);
  }
  return world;
}

export async function createOnlineInkfallRevision2World(
  binding: OnlineInkfallRevision2MapBinding,
): Promise<RapierMovementWorld> {
  return createOnlineInkfallWorld(binding);
}

export async function createOnlineInkfallRevision4World(
  binding: OnlineInkfallRevision4MapBinding,
): Promise<RapierMovementWorld> {
  return createOnlineInkfallWorld(binding);
}
