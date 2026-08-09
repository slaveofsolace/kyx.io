import { describe, expect, it } from 'vitest';

import {
  createRelayVisualContinuity,
  RELAY_AUTHORITY_COMPATIBILITY,
  RELAY_OPEN_SKY_V5_RENDER_BUDGET,
  RELAY_VISUAL_CONTINUITY_VERSION,
} from '../../../src/app/relayVisualContinuity';
import { RELAY_AUTHORITY_FIXTURE } from '../../../src/authority/relayAuthority';

describe('Relay original visual continuity candidate', () => {
  it('represents every Relay authority collider once without mounting Foundry presentation objects', () => {
    const fixture = RELAY_AUTHORITY_FIXTURE;
    const continuity = createRelayVisualContinuity(fixture);
    const waypointCount = fixture.solids.filter((solid) => (
      solid.id.includes('_waypoint_')
    )).length;
    const names: string[] = [];
    let actualMeshCount = 0;
    let actualLightCount = 0;

    continuity.group.traverse((object) => {
      names.push(object.name);
      expect(object.userData.renderMeshesMayBeAuthority).toBe(false);
      expect(object.userData.noHit).toBe(true);
      expect(object.userData.visualContinuityVersion)
        .toBe(RELAY_VISUAL_CONTINUITY_VERSION);
      if ('isMesh' in object && object.isMesh === true) actualMeshCount += 1;
      if ('isLight' in object && object.isLight === true) actualLightCount += 1;
    });

    expect(continuity.colliderInstanceCount).toBe(fixture.solids.length);
    expect(continuity.waypointInlayCount).toBe(waypointCount);
    expect(continuity.meshCount).toBe(actualMeshCount);
    expect(continuity.lightCount).toBe(actualLightCount);
    expect(continuity.estimatedDrawCalls).toBe(continuity.meshCount);
    expect(continuity.meshCount).toBeLessThanOrEqual(
      RELAY_OPEN_SKY_V5_RENDER_BUDGET.maximumMeshObjects,
    );
    expect(continuity.lightCount).toBeLessThanOrEqual(
      RELAY_OPEN_SKY_V5_RENDER_BUDGET.maximumRealtimeLights,
    );
    expect(continuity.withinRenderBudget).toBe(true);
    expect(continuity.authorityFixtureUnchanged).toBe(true);
    expect(continuity.humanAccepted).toBe(false);
    expect(continuity.group.userData).toMatchObject({
      displayName: 'Relay',
      authorityFixtureId: fixture.id,
      authorityColliderCountAtBuild: fixture.solids.length,
      authorityFixtureUnchanged: true,
      authoritySourceMapId: 'relay',
      authorityCompatibility: RELAY_AUTHORITY_COMPATIBILITY,
      withinRenderBudget: true,
      humanAccepted: false,
      releaseEligible: false,
    });
    expect(names.join('\n')).not.toMatch(/(?:INKFALL|FOUNDRY|PRESS|ARCHIVE)/u);
    expect(continuity.group.getObjectByName('RELAY_OPEN_SKY')).toBeDefined();
    expect(continuity.group.getObjectByName('RELAY_CAMPUS_CROWN_STRUCTURAL_YOKE'))
      .toBeDefined();
    expect(continuity.group.getObjectByName('RELAY_ARCHITECTURAL_SKIN_V5'))
      .toBeDefined();
    const midDeck = continuity.group.getObjectByName('RELAY_AUTHORITY_CLADDING_DECK_MID');
    expect(midDeck).toBeDefined();
    if (midDeck !== undefined && 'material' in midDeck) {
      const material = midDeck.material as { map?: unknown; roughnessMap?: unknown; bumpMap?: unknown };
      expect(material.map).toBeDefined();
      expect(material.roughnessMap).toBeDefined();
      expect(material.bumpMap).toBeDefined();
    }
    expect(continuity.group.getObjectByName('RELAY_CAMPUS_CROWN_WALL_TIE'))
      .toBeDefined();
    expect(continuity.group.getObjectByName('RELAY_ARRAY_OUTER_RING'))
      .toBeUndefined();
    expect(continuity.group.getObjectByName('RELAY_CAMPUS_CROWN_SIGNAL_HUB'))
      .toBeDefined();
    expect(continuity.group.getObjectByName('RELAY_CAMPUS_CROWN_SIGNAL_LENS'))
      .toBeDefined();
    expect(continuity.group.getObjectByName('RELAY_DISTANCE_RIDGE_BAND_NEAR'))
      .toBeDefined();
    expect(continuity.group.getObjectByName('RELAY_DISTANCE_RIDGE_BAND_FAR'))
      .toBeDefined();
    expect(continuity.group.getObjectByName('RELAY_WEST_BEACON_MAST'))
      .toBeUndefined();
    expect(continuity.group.getObjectByName('RELAY_EAST_BEACON_MAST'))
      .toBeUndefined();
    expect(continuity.group.getObjectByName('RELAY_AUTHORITY_WAYPOINT_INLAYS'))
      .toBeUndefined();
  });
});
