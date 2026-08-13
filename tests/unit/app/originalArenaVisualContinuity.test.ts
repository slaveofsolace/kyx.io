import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import {
  CROWNPOINT_AUTHORITY_FIXTURE,
  CROWNPOINT_AUTHORITY_MAP_BINDING,
  SWITCHYARD_AUTHORITY_FIXTURE,
  SWITCHYARD_AUTHORITY_MAP_BINDING,
} from '../../../src/authority/originalArenaAuthority';
import {
  createOriginalArenaVisualContinuity,
  ORIGINAL_ARENA_VISUAL_VERSION,
} from '../../../src/app/originalArenaVisualContinuity';

describe('original arena visual continuity', () => {
  it.each([
    {
      binding: SWITCHYARD_AUTHORITY_MAP_BINDING,
      fixture: SWITCHYARD_AUTHORITY_FIXTURE,
      landmark: 'SWITCHYARD_CRANE_SIGNAL_BEACON',
      routeMeaning: 'flank_lanes_and_container_crossings',
    },
    {
      binding: CROWNPOINT_AUTHORITY_MAP_BINDING,
      fixture: CROWNPOINT_AUTHORITY_FIXTURE,
      landmark: 'CROWNPOINT_SOLAR_CROWN_BEACON',
      routeMeaning: 'four_routes_to_solar_crown',
    },
  ] as const)(
    'binds $binding.displayName visuals to every authority collider',
    ({ binding, fixture, landmark, routeMeaning }) => {
      const visual = createOriginalArenaVisualContinuity(binding, fixture);
      let meshCount = 0;
      let lightCount = 0;
      visual.group.traverse((object) => {
        expect(object.userData.renderMeshesMayBeAuthority).toBe(false);
        expect(object.userData.noHit).toBe(true);
        expect(object.userData.visualContinuityVersion)
          .toBe(ORIGINAL_ARENA_VISUAL_VERSION);
        if (object instanceof THREE.Mesh) meshCount += 1;
        if (object instanceof THREE.Light) lightCount += 1;
      });
      expect(visual.displayName).toBe(binding.displayName);
      expect(visual.colliderInstanceCount).toBe(fixture.solids.length);
      expect(visual.meshCount).toBe(meshCount);
      expect(visual.lightCount).toBe(lightCount);
      expect(visual.meshCount).toBeLessThanOrEqual(18);
      expect(visual.lightCount).toBe(3);
      expect(visual.structuralLineSegmentCount).toBeGreaterThan(0);
      expect(visual.architecturalAccentCount).toBe(8);
      expect(visual.authorityFixtureUnchanged).toBe(true);
      expect(visual.humanAccepted).toBe(false);
      expect(visual.group.getObjectByName(landmark)).toBeDefined();
      expect(
        visual.group.getObjectByName(`${binding.mapId.toUpperCase()}_NAVIGATION_FRAMES`),
      ).toBeDefined();
      expect(
        visual.group.getObjectByName(`${binding.mapId.toUpperCase()}_NAVIGATION_SIGNALS`),
      ).toBeDefined();
      expect(
        visual.group.getObjectByName(`${binding.mapId.toUpperCase()}_CENTER_ORBITAL_RING`),
      ).toBeDefined();
      expect(
        visual.group.getObjectByName(`${binding.mapId.toUpperCase()}_ATMOSPHERE_DOME`),
      ).toBeDefined();
      expect(
        visual.group.getObjectByName(`${binding.mapId.toUpperCase()}_STRUCTURAL_EDGE_DEFINITION`),
      ).toBeInstanceOf(THREE.LineSegments);
      expect(
        visual.group.getObjectByName(`${binding.mapId.toUpperCase()}_ARCHITECTURAL_ACCENTS`),
      ).toBeDefined();
      expect(
        visual.group.getObjectByName(`${binding.mapId.toUpperCase()}_LANDMARK_FINS`),
      ).toBeDefined();
      expect(
        visual.group.getObjectByName(`${binding.mapId.toUpperCase()}_ROUTE_SIGNAL_INLAYS`)
          ?.userData.routeMeaning,
      ).toBe(routeMeaning);
      expect(visual.group.userData).toMatchObject({
        displayName: binding.displayName,
        mapId: binding.mapId,
        presentationTheme: binding.presentationTheme,
        authorityFixtureId: fixture.id,
        authorityFixtureHash: binding.fixtureHash,
        authorityFixtureUnchanged: true,
        humanAccepted: false,
        releaseEligible: false,
      });
    },
  );

  it('fails closed when a presentation fixture is not the bound authority fixture', () => {
    expect(() => createOriginalArenaVisualContinuity(
      SWITCHYARD_AUTHORITY_MAP_BINDING,
      CROWNPOINT_AUTHORITY_FIXTURE,
    )).toThrow('ORIGINAL_ARENA_VISUAL_AUTHORITY_BINDING_MISMATCH');
  });
});
