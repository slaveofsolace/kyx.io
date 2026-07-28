import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createOnlineInkfallRevision2World,
  createOnlineInkfallRevision4World,
} from '../../../src/app/onlineAuthorityInkfallWorld';
import {
  ONLINE_INKFALL_REV2_MAP_BINDING,
  ONLINE_INKFALL_REV4_MAP_BINDING,
  type OnlineInkfallRevision2MapBinding,
} from '../../../src/app/onlineAuthorityProfiles';
import type { RapierMovementWorld } from '../../../src/physics';

let world: RapierMovementWorld;
let rev4World: RapierMovementWorld;

beforeAll(async () => {
  world = await createOnlineInkfallRevision2World(ONLINE_INKFALL_REV2_MAP_BINDING);
  rev4World = await createOnlineInkfallRevision4World(ONLINE_INKFALL_REV4_MAP_BINDING);
});

afterAll(() => {
  world?.dispose();
  rev4World?.dispose();
});

describe('online Inkfall revision-2 client world', () => {
  it('reconstructs the exact locked movement fixture used by the Worker profile', () => {
    expect(world.fixture).toMatchObject({
      id: ONLINE_INKFALL_REV2_MAP_BINDING.fixtureId,
      revision: ONLINE_INKFALL_REV2_MAP_BINDING.mapRevision,
    });
    expect(world.fixtureHash).toBe(ONLINE_INKFALL_REV2_MAP_BINDING.fixtureHash);
    expect(world.fixture.solids).toHaveLength(
      ONLINE_INKFALL_REV2_MAP_BINDING.colliderCardinality,
    );
  });

  it('reconstructs the frozen Revision 3 authority world for the Rev4 presentation', () => {
    expect(rev4World.fixture).toMatchObject({
      id: ONLINE_INKFALL_REV4_MAP_BINDING.fixtureId,
      revision: 3,
    });
    expect(rev4World.fixtureHash).toBe(ONLINE_INKFALL_REV4_MAP_BINDING.fixtureHash);
    expect(rev4World.fixture.solids).toHaveLength(339);
    expect(ONLINE_INKFALL_REV4_MAP_BINDING.render.renderMeshesMayBeAuthority).toBe(false);
  });

  it('fails before creating a world when the selected binding drifts', async () => {
    const forged = {
      ...ONLINE_INKFALL_REV2_MAP_BINDING,
      fixtureHash: '0000000000000000',
    } as unknown as OnlineInkfallRevision2MapBinding;
    await expect(createOnlineInkfallRevision2World(forged)).rejects.toThrow(
      'ONLINE_INKFALL_REVISION_2_CLIENT_FIXTURE_MISMATCH',
    );
  });
});
