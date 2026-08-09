import { describe, expect, it } from 'vitest';

import {
  createRelayArchitectureSkin,
  RELAY_ARCHITECTURE_V5_RENDER_BUDGET,
} from '../../../src/app/relayArchitectureSkin';

describe('Relay architectural skin', () => {
  it('builds the connected v5 campus skin from instanced render-only members', () => {
    const version = 'relay_architecture_test_v1';
    const skin = createRelayArchitectureSkin(version);
    let meshCount = 0;
    let lightCount = 0;
    const instanceNames: string[] = [];

    skin.group.traverse((object) => {
      expect(object.userData.renderMeshesMayBeAuthority).toBe(false);
      expect(object.userData.noHit).toBe(true);
      expect(object.userData.visualContinuityVersion).toBe(version);
      if ('isMesh' in object && object.isMesh === true) meshCount += 1;
      if ('isLight' in object && object.isLight === true) lightCount += 1;
      if (Array.isArray(object.userData.instanceNames)) {
        instanceNames.push(...object.userData.instanceNames as string[]);
      }
    });

    expect(skin.meshCount).toBe(meshCount);
    expect(skin.lightCount).toBe(lightCount);
    expect(skin.meshCount).toBeGreaterThanOrEqual(18);
    expect(skin.meshCount)
      .toBeLessThanOrEqual(RELAY_ARCHITECTURE_V5_RENDER_BUDGET.maximumMeshObjects);
    expect(skin.estimatedDrawCalls).toBe(skin.meshCount);
    expect(skin.estimatedDrawCalls).toBeLessThanOrEqual(
      RELAY_ARCHITECTURE_V5_RENDER_BUDGET.maximumEstimatedDrawCalls,
    );
    expect(skin.logicalInstanceCount).toBeGreaterThan(100);
    expect(skin.logicalInstanceCount).toBeLessThanOrEqual(
      RELAY_ARCHITECTURE_V5_RENDER_BUDGET.maximumLogicalInstances,
    );
    expect(skin.lightCount).toBe(2);
    expect(skin.group.name).toBe('RELAY_ARCHITECTURAL_SKIN_V5');
    expect(skin.group.userData).toMatchObject({
      authorityGeometryAdded: false,
      fakeTraversableSurfaceCount: 0,
      withinRenderBudget: true,
      humanAccepted: false,
    });
    expect(skin.group.getObjectByName('RELAY_V5_SPAWN_OPERATIONS_STRUCTURE'))
      .toBeDefined();
    expect(skin.group.getObjectByName('RELAY_V5_BRIDGE_LOAD_PATH'))
      .toBeDefined();
    expect(skin.group.getObjectByName('RELAY_V5_LOWER_SERVICE_PIPE_BANK'))
      .toBeDefined();
    expect(skin.group.getObjectByName('RELAY_V5_PORTAL_STRUCTURAL_MEMBERS'))
      .toBeDefined();
    expect(skin.group.getObjectByName('RELAY_V5_COVER_SADDLE_CAPS'))
      .toBeDefined();
    expect(instanceNames).toContain('RELAY_SERVICE_PORTAL_WALL_TIE');
    expect(instanceNames).toContain('RELAY_OVERLOOK_PORTAL_ARRAY_TIE');
    expect(instanceNames).toContain('RELAY_WEST_OPERATIONS_CROWN');
    expect(instanceNames).toContain('RELAY_EAST_OPERATIONS_CROWN');
    expect(instanceNames).toContain('RELAY_BRIDGE_SUPPORT_WEST_CAPITAL');
    expect(instanceNames).toContain('RELAY_LOWER_SERVICE_GRATE_7');
    expect(instanceNames).toContain('RELAY_LOWER_WEST_COVER_SADDLE_CAP');
    expect(skin.group.getObjectByName('RELAY_NORTH_EQUIPMENT_HOUSING_4'))
      .toBeUndefined();
  });
});
