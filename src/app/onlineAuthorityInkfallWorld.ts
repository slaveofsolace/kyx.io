import inkfallCombatFixtureSnapshot from '../../assets/source/maps/inkfall-foundry/runtime/combat-authority-fixture.p5-10.v1.json';
import {
  createRapierMovementWorld,
  type PhysicsFixtureV1,
  type RapierMovementWorld,
} from '../physics';
import type { OnlineInkfallRevision2MapBinding } from './onlineAuthorityProfiles';

interface InkfallCombatFixtureSnapshotV1 {
  readonly schemaVersion: 1;
  readonly kind: 'inkfall_revision_2_combat_authority_fixture';
  readonly mapId: string;
  readonly mapRevision: number;
  readonly packageDigest: string;
  readonly fixtureHash: string;
  readonly collisionMeshNodeCount: number;
  readonly fixture: PhysicsFixtureV1;
}

function lockedSnapshot(): InkfallCombatFixtureSnapshotV1 {
  return inkfallCombatFixtureSnapshot as unknown as InkfallCombatFixtureSnapshotV1;
}

function assertLockedFixture(
  snapshot: InkfallCombatFixtureSnapshotV1,
  binding: OnlineInkfallRevision2MapBinding,
): void {
  if (
    snapshot.schemaVersion !== 1
    || snapshot.kind !== 'inkfall_revision_2_combat_authority_fixture'
    || snapshot.mapId !== binding.mapId
    || snapshot.mapRevision !== binding.mapRevision
    || snapshot.packageDigest !== binding.packageDigest
    || snapshot.fixtureHash !== binding.fixtureHash
    || snapshot.collisionMeshNodeCount !== binding.colliderCardinality
    || snapshot.fixture.id !== binding.fixtureId
    || snapshot.fixture.revision !== binding.mapRevision
    || snapshot.fixture.solids.length !== binding.colliderCardinality
  ) throw new Error('ONLINE_INKFALL_REVISION_2_CLIENT_FIXTURE_MISMATCH');
}

/** Reconstruct the same hash-locked P5.10 Rapier fixture used by the Worker. */
export async function createOnlineInkfallRevision2World(
  binding: OnlineInkfallRevision2MapBinding,
): Promise<RapierMovementWorld> {
  const snapshot = lockedSnapshot();
  assertLockedFixture(snapshot, binding);
  const world = await createRapierMovementWorld(snapshot.fixture);
  if (
    world.fixture.id !== binding.fixtureId
    || world.fixture.revision !== binding.mapRevision
    || world.fixtureHash !== binding.fixtureHash
    || world.fixture.solids.length !== binding.colliderCardinality
  ) {
    world.dispose();
    throw new Error('ONLINE_INKFALL_REVISION_2_CLIENT_WORLD_MISMATCH');
  }
  return world;
}
