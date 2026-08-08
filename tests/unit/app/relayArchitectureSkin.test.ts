import { describe, expect, it } from 'vitest';

import { createRelayArchitectureSkin } from '../../../src/app/relayArchitectureSkin';

describe('Relay architectural skin', () => {
  it('adds only marked render-only surfacing and readability light', () => {
    const version = 'relay_architecture_test_v1';
    const skin = createRelayArchitectureSkin(version);
    let meshCount = 0;
    let lightCount = 0;

    skin.group.traverse((object) => {
      expect(object.userData.renderMeshesMayBeAuthority).toBe(false);
      expect(object.userData.noHit).toBe(true);
      expect(object.userData.visualContinuityVersion).toBe(version);
      if ('isMesh' in object && object.isMesh === true) meshCount += 1;
      if ('isLight' in object && object.isLight === true) lightCount += 1;
    });

    expect(skin.meshCount).toBe(meshCount);
    expect(skin.lightCount).toBe(lightCount);
    expect(skin.meshCount).toBeGreaterThanOrEqual(25);
    expect(skin.lightCount).toBe(2);
    expect(skin.group.userData).toMatchObject({
      authorityGeometryAdded: false,
      humanAccepted: false,
    });
    expect(skin.group.getObjectByName('RELAY_WEST_SPAWN_SIGNAL_PANEL'))
      .toBeDefined();
    expect(skin.group.getObjectByName('RELAY_EAST_SPAWN_SIGNAL_PANEL'))
      .toBeDefined();
    expect(skin.group.getObjectByName('RELAY_LOWER_COURT_DATUM'))
      .toBeDefined();
    expect(skin.group.getObjectByName('RELAY_SERVICE_PORTAL_HEADER'))
      .toBeDefined();
    expect(skin.group.getObjectByName('RELAY_OVERLOOK_PORTAL_HEADER'))
      .toBeDefined();
    expect(skin.group.getObjectByName('RELAY_CENTER_DECK_PANEL_BREAK_4'))
      .toBeDefined();
  });
});
