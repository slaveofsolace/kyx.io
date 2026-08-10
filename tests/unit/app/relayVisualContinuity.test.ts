import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import {
  createRelayVisualContinuity,
  RELAY_AUTHORITY_COMPATIBILITY,
  RELAY_OPEN_SKY_V5_LIGHTING_LIMITS,
  RELAY_OPEN_SKY_V5_PLAYER_EYE_HIERARCHY,
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
    const localPointLightIntensities: number[] = [];

    continuity.group.traverse((object) => {
      names.push(object.name);
      expect(object.userData.renderMeshesMayBeAuthority).toBe(false);
      expect(object.userData.noHit).toBe(true);
      expect(object.userData.visualContinuityVersion)
        .toBe(RELAY_VISUAL_CONTINUITY_VERSION);
      if ('isMesh' in object && object.isMesh === true) actualMeshCount += 1;
      if ('isLight' in object && object.isLight === true) actualLightCount += 1;
      if ('isPointLight' in object && object.isPointLight === true) {
        const pointLight = object as typeof object & Readonly<{
          intensity: number;
        }>;
        localPointLightIntensities.push(pointLight.intensity);
      }
    });

    expect(continuity.colliderInstanceCount).toBe(fixture.solids.length);
    expect(continuity.waypointInlayCount).toBe(waypointCount);
    expect(continuity.meshCount).toBe(actualMeshCount);
    expect(continuity.meshCount).toBe(61);
    expect(continuity.lightCount).toBe(actualLightCount);
    expect(continuity.lightCount).toBe(6);
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
      playerEyeLandmarkHierarchy:
        RELAY_OPEN_SKY_V5_PLAYER_EYE_HIERARCHY,
      lightingLimits: RELAY_OPEN_SKY_V5_LIGHTING_LIMITS,
    });
    expect(localPointLightIntensities.every((intensity) => (
      intensity
        <= RELAY_OPEN_SKY_V5_LIGHTING_LIMITS.maximumLocalPointLightIntensity
    ))).toBe(true);
    expect(names.join('\n')).not.toMatch(/(?:INKFALL|FOUNDRY|PRESS|ARCHIVE)/u);
    const sky = continuity.group.getObjectByName('RELAY_OPEN_SKY');
    expect(sky).toBeDefined();
    expect(sky?.userData).toMatchObject({
      skyModel: 'layered_high_altitude_sun_haze_v5',
      depthHierarchy: [
        'warm_horizon',
        'cool_upper_air',
        'deep_blue_zenith',
      ],
      humanReviewRequired: true,
    });
    if (sky instanceof THREE.Mesh && sky.material instanceof THREE.ShaderMaterial) {
      expect(sky.material.fragmentShader).not.toContain('cloudDomain');
      expect(sky.material.fragmentShader).not.toContain('cloudBand');
      expect(sky.material.fragmentShader).toContain('horizonHaze');
    }
    expect(continuity.group.getObjectByName('RELAY_CAMPUS_CROWN_STRUCTURAL_YOKE'))
      .toBeDefined();
    expect(continuity.group.getObjectByName('RELAY_ARCHITECTURAL_SKIN_V5'))
      .toBeDefined();
    const midDeck = continuity.group.getObjectByName(
      'RELAY_AUTHORITY_CLADDING_DECK_MID',
    );
    const upperDeck = continuity.group.getObjectByName(
      'RELAY_AUTHORITY_CLADDING_DECK_UPPER',
    );
    const lowerDeck = continuity.group.getObjectByName(
      'RELAY_AUTHORITY_CLADDING_DECK_LOWER',
    );
    const structure = continuity.group.getObjectByName(
      'RELAY_AUTHORITY_CLADDING_STRUCTURE',
    );
    expect(midDeck).toBeDefined();
    expect(upperDeck).toBeDefined();
    expect(lowerDeck).toBeDefined();
    expect(structure).toBeDefined();
    const gapHazards = continuity.group.getObjectByName(
      'RELAY_WEST_CONNECTOR_COURT_GAP_HAZARD_INLAYS',
    );
    expect(gapHazards).toBeInstanceOf(THREE.InstancedMesh);
    expect(gapHazards?.userData).toMatchObject({
      presentationRole: 'authority_gap_hazard_inlay',
      noHit: true,
      renderMeshesMayBeAuthority: false,
      visualOnlySurfaceInlay: true,
      fakeTraversableSurfaceCount: 0,
      hazardMeaning: 'drop_boundary_not_walkable',
      instanceNames: [
        'RELAY_WEST_CONNECTOR_SOUTH_HAZARD_LIP',
        'RELAY_CENTRAL_COURT_WEST_SOUTH_HAZARD_LIP',
      ],
      authorityAlignmentColliderIds: [
        'relay_floor_west_connector',
        'relay_floor_central_court',
      ],
    });
    if (gapHazards instanceof THREE.InstancedMesh) {
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const rotation = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      gapHazards.getMatrixAt(0, matrix);
      matrix.decompose(position, rotation, scale);
      expect(position.x).toBeCloseTo(-18, 5);
      expect(position.y).toBeCloseTo(0.006, 5);
      expect(position.z).toBeCloseTo(3.9725, 5);
      expect(scale.x).toBeCloseTo(10, 5);
      expect(scale.y).toBeCloseTo(0.008, 5);
      expect(scale.z).toBeCloseTo(0.055, 5);
      gapHazards.getMatrixAt(1, matrix);
      matrix.decompose(position, rotation, scale);
      expect(position.x).toBeCloseTo(-12.9725, 5);
      expect(position.y).toBeCloseTo(0.006, 5);
      expect(position.z).toBeCloseTo(6.25, 5);
      expect(scale.x).toBeCloseTo(0.055, 5);
      expect(scale.y).toBeCloseTo(0.008, 5);
      expect(scale.z).toBeCloseTo(4.5, 5);
    }
    expect(midDeck?.userData.authorityAlignmentColliderIds).toEqual(
      expect.arrayContaining([
        'relay_floor_central_court',
        'relay_step_lower_one',
      ]),
    );
    expect(upperDeck?.userData.authorityAlignmentColliderIds).toEqual(
      expect.arrayContaining([
        'relay_floor_upper_west',
        'relay_bridge_upper_center',
      ]),
    );
    expect(lowerDeck?.userData.authorityAlignmentColliderIds).toEqual(
      expect.arrayContaining([
        'relay_floor_lower_center',
        'relay_floor_west_lower_link',
      ]),
    );
    expect(structure?.userData.authorityAlignmentColliderIds).toEqual(
      expect.arrayContaining([
        'relay_bridge_support_west',
        'relay_bridge_support_east',
      ]),
    );
    expect(upperDeck?.userData.authorityAlignmentColliderIds)
      .not.toContain('relay_bridge_support_west');
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
