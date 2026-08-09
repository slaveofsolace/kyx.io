import { describe, expect, it } from 'vitest';

import {
  createRelayArchitectureSkin,
  RELAY_ARCHITECTURE_V5_LIGHTING_LIMITS,
  RELAY_ARCHITECTURE_V5_RENDER_BUDGET,
  RELAY_V5_PORTAL_DESTINATION_LANGUAGE,
} from '../../../src/app/relayArchitectureSkin';
import { RELAY_PORTAL_ENDPOINTS } from '../../../src/authority/portal/relayPortalAuthority';

describe('Relay architectural skin', () => {
  it('builds the connected v5 campus skin from instanced render-only members', () => {
    const version = 'relay_architecture_test_v1';
    const skin = createRelayArchitectureSkin(version);
    let meshCount = 0;
    let lightCount = 0;
    const instanceNames: string[] = [];
    const pointLights: Array<Readonly<{
      name: string;
      intensity: number;
      distance: number;
    }>> = [];

    skin.group.traverse((object) => {
      expect(object.userData.renderMeshesMayBeAuthority).toBe(false);
      expect(object.userData.noHit).toBe(true);
      expect(object.userData.visualContinuityVersion).toBe(version);
      if ('isMesh' in object && object.isMesh === true) meshCount += 1;
      if ('isLight' in object && object.isLight === true) lightCount += 1;
      if ('isPointLight' in object && object.isPointLight === true) {
        const pointLight = object as typeof object & Readonly<{
          intensity: number;
          distance: number;
        }>;
        pointLights.push({
          name: object.name,
          intensity: pointLight.intensity,
          distance: pointLight.distance,
        });
      }
      if (Array.isArray(object.userData.instanceNames)) {
        instanceNames.push(...object.userData.instanceNames as string[]);
      }
    });

    expect(skin.meshCount).toBe(meshCount);
    expect(skin.lightCount).toBe(lightCount);
    expect(skin.meshCount).toBe(27);
    expect(skin.meshCount)
      .toBeLessThanOrEqual(RELAY_ARCHITECTURE_V5_RENDER_BUDGET.maximumMeshObjects);
    expect(skin.estimatedDrawCalls).toBe(skin.meshCount);
    expect(skin.estimatedDrawCalls).toBeLessThanOrEqual(
      RELAY_ARCHITECTURE_V5_RENDER_BUDGET.maximumEstimatedDrawCalls,
    );
    expect(skin.logicalInstanceCount).toBe(149);
    expect(skin.logicalInstanceCount).toBeLessThanOrEqual(
      RELAY_ARCHITECTURE_V5_RENDER_BUDGET.maximumLogicalInstances,
    );
    expect(skin.lightCount).toBe(2);
    expect(skin.group.name).toBe('RELAY_ARCHITECTURAL_SKIN_V5');
    expect(skin.group.userData).toMatchObject({
      authorityGeometryAdded: false,
      fakeTraversableSurfaceCount: 0,
      spawnExitAuthorityAnchorCount: 4,
      maximumSurfaceInlayProtrusionMeters: 0.012,
      collisionTruthReview: 'source_static_only_runtime_unknown',
      withinRenderBudget: true,
      humanAccepted: false,
    });
    expect(pointLights).toHaveLength(2);
    expect(pointLights.every(({ intensity }) => (
      intensity
        <= RELAY_ARCHITECTURE_V5_LIGHTING_LIMITS
          .maximumSpawnPointLightIntensity
    ))).toBe(true);
    expect(pointLights.every(({ distance }) => (
      distance
        <= RELAY_ARCHITECTURE_V5_LIGHTING_LIMITS
          .maximumSpawnPointLightRangeMeters
    ))).toBe(true);
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
    expect(skin.group.getObjectByName('RELAY_V5_SPAWN_EXIT_SHOULDERS'))
      .toBeDefined();
    expect(skin.group.getObjectByName('RELAY_V5_WEST_SPAWN_EXIT_CODES'))
      .toBeDefined();
    expect(skin.group.getObjectByName('RELAY_V5_EAST_SPAWN_EXIT_CODES'))
      .toBeDefined();
    const serviceDestinationKey = skin.group.getObjectByName(
      RELAY_V5_PORTAL_DESTINATION_LANGUAGE.serviceGate.previewObjectName,
    );
    const overlookDestinationKey = skin.group.getObjectByName(
      RELAY_V5_PORTAL_DESTINATION_LANGUAGE.overlookGate.previewObjectName,
    );
    expect(serviceDestinationKey?.userData).toMatchObject({
      portalEndpointId: 'relay_service_gate',
      destinationEndpointId: 'relay_overlook_gate',
      destinationZoneId: 'relay_upper_overlook',
    });
    expect(overlookDestinationKey?.userData).toMatchObject({
      portalEndpointId: 'relay_overlook_gate',
      destinationEndpointId: 'relay_service_gate',
      destinationZoneId: 'relay_lower_service',
    });
    expect(new Set(RELAY_PORTAL_ENDPOINTS.map(({ id }) => id))).toEqual(
      new Set([
        RELAY_V5_PORTAL_DESTINATION_LANGUAGE.serviceGate.endpointId,
        RELAY_V5_PORTAL_DESTINATION_LANGUAGE.overlookGate.endpointId,
      ]),
    );
    expect(instanceNames).toContain('RELAY_SERVICE_PORTAL_WALL_TIE');
    expect(instanceNames).toContain('RELAY_OVERLOOK_PORTAL_ARRAY_TIE');
    expect(instanceNames).toContain('RELAY_WEST_OPERATIONS_CROWN');
    expect(instanceNames).toContain('RELAY_EAST_OPERATIONS_CROWN');
    expect(instanceNames).toContain('RELAY_BRIDGE_SUPPORT_WEST_CAPITAL');
    expect(instanceNames).toContain('RELAY_BRIDGE_CENTER_JOINT_WEST');
    expect(instanceNames).toContain('RELAY_LOWER_SERVICE_GRATE_7');
    expect(instanceNames).toContain('RELAY_LOWER_WEST_COVER_SADDLE_CAP');
    expect(instanceNames).toContain('RELAY_WEST_NORTH_EXIT_BAR');
    expect(instanceNames).toContain('RELAY_EAST_SOUTH_EXIT_CHEVRON_B');
    expect(skin.group.getObjectByName('RELAY_NORTH_EQUIPMENT_HOUSING_4'))
      .toBeUndefined();
  });
});
