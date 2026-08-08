import * as THREE from 'three';

import { describe, expect, it, vi } from 'vitest';

import {
  createInkfallRev5PortalPresentation,
} from '../../../src/app/inkfallRev5PortalPresentation';
import type {
  CombatPresentationWorldPortalTraversedEventV1,
} from '../../../src/net';

const traversalEvent = Object.freeze({
  schemaVersion: 1,
  kind: 'world_portal_traversed',
  eventId: 'portal-test-event',
  authorityTick: 24,
  playerId: 'player-local',
  capabilityId: 'inkfall-red-fold',
  endpointId: 'red_fold_upper',
  partnerEndpointId: 'red_fold_lower',
  from: Object.freeze({ x: 1_000, y: 1_431, z: -5_000 }),
  to: Object.freeze({ x: -5_000, y: -3_000, z: -15_500 }),
  departureAudioHook: 'inkfall.portal.red_fold_upper.departure',
  arrivalAudioHook: 'inkfall.portal.red_fold_lower.arrival',
  departureVfxHook: 'inkfall.portal.red_fold_upper.energy_departure',
  arrivalVfxHook: 'inkfall.portal.red_fold_lower.energy_arrival',
} satisfies CombatPresentationWorldPortalTraversedEventV1);

describe('Inkfall Rev5 portal presentation', () => {
  it('mounts filled no-hit apertures and keeps traversal effects presentation-only', () => {
    const scene = new THREE.Scene();
    const playAudio = vi.fn();
    const presentation = createInkfallRev5PortalPresentation(scene, playAudio);

    expect(presentation.diagnostics()).toMatchObject({
      cueCount: 0,
      activeTransientCount: 0,
      staticPortalCount: 2,
      staticPresentationMeshCount: 10,
      staticLightCount: 2,
      persistentPresentation: 'filled_hex_energy_aperture_v1',
      audioDelegation: 'shared_callback',
    });

    for (const endpoint of ['RED_FOLD_LOWER', 'RED_FOLD_UPPER']) {
      const root = scene.getObjectByName(
        `INKFALL_PORTAL_${endpoint}_PRESENTATION`,
      );
      expect(root).toBeDefined();
      expect(
        root?.getObjectByName(`INKFALL_PORTAL_${endpoint}_DEEP_APERTURE`),
      ).toBeDefined();
      expect(
        root?.getObjectByName(`INKFALL_PORTAL_${endpoint}_ENERGY_FIELD`),
      ).toBeDefined();
      expect(
        root?.getObjectByName(`INKFALL_PORTAL_${endpoint}_SOLID_GASKET`),
      ).toBeDefined();
      root?.traverse((object) => {
        expect(object.userData.renderMeshesMayBeAuthority).toBe(false);
        expect(object.userData.noHit).toBe(true);
        expect(object.userData.portalAuthorityUnchanged).toBe(true);
      });
    }

    presentation.present(traversalEvent, 1_000, true);
    expect(playAudio).toHaveBeenCalledOnce();
    expect(presentation.diagnostics()).toMatchObject({
      cueCount: 1,
      activeTransientCount: 2,
    });

    const departureWave = scene.children.find((child) => (
      child.userData.hook === traversalEvent.departureVfxHook
    ));
    const arrivalWave = scene.children.find((child) => (
      child.userData.hook === traversalEvent.arrivalVfxHook
    ));
    const departureLight = departureWave?.children.find(
      (child): child is THREE.PointLight => (child as THREE.PointLight).isPointLight,
    );
    const arrivalLight = arrivalWave?.children.find(
      (child): child is THREE.PointLight => (child as THREE.PointLight).isPointLight,
    );
    expect(departureLight?.color.getHex()).toBe(0xffa53b);
    expect(arrivalLight?.color.getHex()).toBe(0x6ff3ff);

    let wireframeMaterialCount = 0;
    scene.traverse((object) => {
      if (!(object as THREE.Mesh).isMesh) return;
      const mesh = object as THREE.Mesh;
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const material of materials) {
        if ('wireframe' in material && material.wireframe === true) {
          wireframeMaterialCount += 1;
        }
      }
    });
    expect(wireframeMaterialCount).toBe(0);

    presentation.update(1_820);
    expect(presentation.diagnostics().activeTransientCount).toBe(0);

    presentation.dispose();
    expect(
      scene.getObjectByName('INKFALL_PORTAL_RED_FOLD_LOWER_PRESENTATION'),
    ).toBeUndefined();
    expect(
      scene.getObjectByName('INKFALL_PORTAL_RED_FOLD_UPPER_PRESENTATION'),
    ).toBeUndefined();
    expect(
      scene.getObjectByName(
        'INKFALL_PORTAL_RED_FOLD_LOWER_PRESENTATION_LIGHT',
      ),
    ).toBeUndefined();
    expect(
      scene.getObjectByName(
        'INKFALL_PORTAL_RED_FOLD_UPPER_PRESENTATION_LIGHT',
      ),
    ).toBeUndefined();
  });
});
