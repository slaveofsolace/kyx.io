import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { createInkfallRev5VisualContinuity } from '../../../src/app/inkfallRev5VisualContinuity';
import type { PhysicsFixtureV1 } from '../../../src/physics/fixtureSchema';

interface InkfallRev5FixtureSnapshot {
  readonly fixture: PhysicsFixtureV1;
}

const fixtureUrl = new URL(
  '../../../assets/source/maps/inkfall-foundry/runtime/combat-authority-fixture.g5-revision3.v1.json',
  import.meta.url,
);

describe('Inkfall Rev5 release visual continuity', () => {
  it('removes duplicate spawn frames and visibly mounts the press roller', async () => {
    const snapshot = JSON.parse(
      await readFile(fixtureUrl, 'utf8'),
    ) as InkfallRev5FixtureSnapshot;
    const continuity = createInkfallRev5VisualContinuity(snapshot.fixture);

    expect(continuity.group.getObjectByName('INKFALL_WEST_SPAWN_EXIT_FRAME')).toBeUndefined();
    expect(continuity.group.getObjectByName('INKFALL_EAST_SPAWN_EXIT_FRAME')).toBeUndefined();
    expect(
      continuity.group.getObjectByName('INKFALL_PRESS_ROLLER_COLLAR_-5.9'),
    ).toBeUndefined();
    expect(
      continuity.group.getObjectByName('INKFALL_PRESS_ROLLER_COLLAR_5.9'),
    ).toBeUndefined();
    expect(
      continuity.group.getObjectByName('INKFALL_PRESS_MAIN_ROLLER'),
    ).toBeUndefined();
    expect(
      continuity.group.getObjectByName('INKFALL_REV5_PRESS_CROSSHEAD_CORE'),
    ).toBeDefined();
    expect(
      continuity.group.getObjectByName('INKFALL_INDEX_WHEEL'),
    ).toBeUndefined();
    for (let index = 0; index < 8; index += 1) {
      expect(
        continuity.group.getObjectByName(`INKFALL_INDEX_WHEEL_SPOKE_${index}`),
      ).toBeUndefined();
    }
    expect(
      continuity.group.getObjectByName(
        'RENDER_ONLY_CLADDING_map_collision_door_frame_west_spawn_main_left',
      ),
    ).toBeDefined();
    expect(
      continuity.group.getObjectByName(
        'RENDER_ONLY_CLADDING_map_collision_door_frame_east_spawn_main_right',
      ),
    ).toBeDefined();

    for (const side of ['WEST', 'EAST']) {
      expect(
        continuity.group.getObjectByName(
          `INKFALL_REV5_PRESS_ROLLER_BEARING_${side}`,
        ),
      ).toBeDefined();
      expect(
        continuity.group.getObjectByName(
          `INKFALL_REV5_PRESS_ROLLER_HANGER_${side}`,
        ),
      ).toBeDefined();
    }

    for (const route of ['PRESS_CROSSLINK', 'ARCHIVE_WALK', 'INK_CHANNEL']) {
      const light = continuity.group.getObjectByName(
        `INKFALL_REV5_ROUTE_DEPTH_${route}`,
      );
      expect(light).toBeDefined();
      expect(light?.userData).toMatchObject({
        presentationRole: 'route_depth_fill_only',
        renderMeshesMayBeAuthority: false,
        noHit: true,
        authorityFixtureUnchanged: true,
      });
    }

    let actualMeshCount = 0;
    let actualLightCount = 0;
    continuity.group.traverse((object) => {
      if ('isMesh' in object && object.isMesh === true) actualMeshCount += 1;
      if ('isLight' in object && object.isLight === true) actualLightCount += 1;
      expect(object.userData.renderMeshesMayBeAuthority).toBe(false);
    });
    expect(continuity.meshCount).toBe(actualMeshCount);
    expect(continuity.lightCount).toBe(actualLightCount);
    expect(continuity.group.userData.rev5GeometryCorrection).toMatchObject({
      redundantSpawnExitFramesRemoved: true,
      removedSpawnExitFrameObjectCount: 8,
      removedPressRollerObjectMeshCount: 3,
      removedIndexWheelMeshCount: 9,
      pressRollerMountMeshCount: 6,
      routeDepthLighting: 'three_bounded_landmark_fill_pools_v1',
      routeDepthLightCount: 3,
      authorityFixtureUnchanged: true,
    });
  });
});
