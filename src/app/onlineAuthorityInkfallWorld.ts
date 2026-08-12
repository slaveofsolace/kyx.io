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
  originalArenaAuthorityFixture,
  type OriginalArenaAuthorityProfile,
} from '../authority/originalArenaAuthority';
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
  OnlineOriginalArenaMapBinding,
  OnlineRelayMapBinding,
} from './onlineAuthorityProfiles';

/** Reconstruct the exact hash-locked fixture selected by the Worker. */
export async function createOnlineAuthorityWorld(
  binding: OnlineAuthorityMapBinding,
): Promise<RapierMovementWorld> {
  const fixture = binding.mapId === 'relay'
    ? RELAY_AUTHORITY_FIXTURE
    : binding.mapId === 'switchyard' || binding.mapId === 'crownpoint'
      ? originalArenaAuthorityFixture(
        `${binding.mapId}-revision-1-authority-v1` as OriginalArenaAuthorityProfile,
      )
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
    const mapToken = binding.mapId.toUpperCase();
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

export async function createOnlineOriginalArenaWorld(
  binding: OnlineOriginalArenaMapBinding,
): Promise<RapierMovementWorld> {
  return createOnlineAuthorityWorld(binding);
}
