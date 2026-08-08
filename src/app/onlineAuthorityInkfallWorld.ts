import {
  INKFALL_REVISION_2_AUTHORITY_PROFILE_ID,
  INKFALL_REVISION_3_AUTHORITY_PROFILE_ID,
  INKFALL_REVISION_4_AUTHORITY_PROFILE_ID,
  inkfallAuthorityFixture,
} from '../authority/inkfallRoomFactory';
import {
  RELAY_AUTHORITY_FIXTURE,
} from '../authority/relayAuthority';
import {
  createRapierMovementWorld,
  type RapierMovementWorld,
} from '../physics';
import type {
  OnlineAuthorityMapBinding,
  OnlineInkfallMapBinding,
  OnlineInkfallRevision2MapBinding,
  OnlineInkfallRevision4MapBinding,
  OnlineInkfallRevision5MapBinding,
  OnlineRelayMapBinding,
} from './onlineAuthorityProfiles';

/** Reconstruct the exact hash-locked fixture selected by the Worker. */
export async function createOnlineAuthorityWorld(
  binding: OnlineAuthorityMapBinding,
): Promise<RapierMovementWorld> {
  const fixture = binding.mapId === 'relay'
    ? RELAY_AUTHORITY_FIXTURE
    : inkfallAuthorityFixture(
        binding.mapRevision === 4
          ? INKFALL_REVISION_4_AUTHORITY_PROFILE_ID
          : binding.mapRevision === 3
            ? INKFALL_REVISION_3_AUTHORITY_PROFILE_ID
            : INKFALL_REVISION_2_AUTHORITY_PROFILE_ID,
      );
  const world = await createRapierMovementWorld(fixture);
  if (
    world.fixture.id !== binding.fixtureId
    || world.fixture.revision !== binding.mapRevision
    || world.fixtureHash !== binding.fixtureHash
    || world.fixture.solids.length !== binding.colliderCardinality
  ) {
    world.dispose();
    const mapToken = binding.mapId === 'inkfall_foundry' ? 'INKFALL' : 'RELAY';
    throw new Error(
      `ONLINE_${mapToken}_REVISION_${binding.mapRevision}_CLIENT_WORLD_MISMATCH`,
    );
  }
  return world;
}

/** Reconstruct the same hash-locked Rapier fixture used by the Worker. */
export async function createOnlineInkfallWorld(
  binding: OnlineInkfallMapBinding,
): Promise<RapierMovementWorld> {
  return createOnlineAuthorityWorld(binding);
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

export async function createOnlineInkfallRevision5World(
  binding: OnlineInkfallRevision5MapBinding,
): Promise<RapierMovementWorld> {
  return createOnlineInkfallWorld(binding);
}

export async function createOnlineRelayWorld(
  binding: OnlineRelayMapBinding,
): Promise<RapierMovementWorld> {
  return createOnlineAuthorityWorld(binding);
}
