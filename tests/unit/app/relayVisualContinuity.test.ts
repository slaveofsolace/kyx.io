import { describe, expect, it } from 'vitest';

import {
  createRelayVisualContinuity,
  RELAY_AUTHORITY_COMPATIBILITY,
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
    expect(continuity.authorityFixtureUnchanged).toBe(true);
    expect(continuity.humanAccepted).toBe(false);
    expect(continuity.group.userData).toMatchObject({
      displayName: 'Relay',
      authorityFixtureId: fixture.id,
      authorityColliderCountAtBuild: fixture.solids.length,
      authorityFixtureUnchanged: true,
      authoritySourceMapId: 'relay',
      authorityCompatibility: RELAY_AUTHORITY_COMPATIBILITY,
      humanAccepted: false,
      releaseEligible: false,
    });
    expect(names.join('\n')).not.toMatch(/(?:INKFALL|FOUNDRY|PRESS|ARCHIVE)/u);
    expect(continuity.group.getObjectByName('RELAY_OPEN_SKY')).toBeDefined();
    expect(continuity.group.getObjectByName('RELAY_ARRAY_OUTER_RING')).toBeDefined();
    expect(continuity.group.getObjectByName('RELAY_ARCHITECTURAL_SKIN_V3'))
      .toBeDefined();
    expect(continuity.group.getObjectByName('RELAY_ARRAY_CROSSBEAM'))
      .toBeDefined();
    expect(continuity.group.getObjectByName('RELAY_ARRAY_CROWN_MAST'))
      .toBeUndefined();
    expect(continuity.group.getObjectByName('RELAY_ARRAY_SIGNAL_HUB'))
      .toBeDefined();
    expect(continuity.group.getObjectByName('RELAY_ARRAY_SIGNAL_LENS_WEST'))
      .toBeDefined();
    expect(continuity.group.getObjectByName('RELAY_ARRAY_SIGNAL_LENS_EAST'))
      .toBeDefined();
    expect(continuity.group.getObjectByName('RELAY_ARRAY_DISH'))
      .toBeUndefined();
    expect(continuity.group.getObjectByName('RELAY_AUTHORITY_WAYPOINT_INLAYS'))
      .toBeUndefined();
  });
});
