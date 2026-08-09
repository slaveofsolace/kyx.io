import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  canPresentOnlineBlinkPreview,
  createOnlineBlinkPreviewPresentation,
} from '../../../src/app/onlineBlinkPreviewPresentation';
import type { OnlineBlinkPreview } from '../../../src/app/onlineBlinkPreview';
import { asMillimeters } from '../../../src/sim';

function validPreview(): OnlineBlinkPreview {
  return {
    schemaVersion: 1,
    active: true,
    valid: true,
    authorityBound: true,
    reason: 'ready',
    outcome: 'partial',
    maximumRangeMillimeters: 9_000,
    distanceMillimeters: 3_600,
    intentYawMilliDegrees: 0,
    intentPitchMilliDegrees: 0,
    originFeetMillimeters: {
      x: asMillimeters(0),
      y: asMillimeters(0),
      z: asMillimeters(0),
    },
    destinationFeetMillimeters: {
      x: asMillimeters(0),
      y: asMillimeters(0),
      z: asMillimeters(3_600),
    },
  };
}

describe('online Blink preview presentation', () => {
  it('fails closed on an out-of-range or invalid-space marker', () => {
    const preview = validPreview();
    expect(canPresentOnlineBlinkPreview(preview)).toBe(true);
    expect(canPresentOnlineBlinkPreview({
      ...preview,
      distanceMillimeters: 9_001,
    })).toBe(false);
    expect(canPresentOnlineBlinkPreview({
      ...preview,
      valid: false,
      reason: 'blocked',
      outcome: null,
    })).toBe(false);
  });

  it('keeps destination, tether and range materials depth-occluded', () => {
    const scene = new THREE.Scene();
    const presentation = createOnlineBlinkPreviewPresentation(scene);
    presentation.update(validPreview(), 1_000, false);

    const materials: THREE.Material[] = [];
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Line)) return;
      const values = Array.isArray(object.material) ? object.material : [object.material];
      materials.push(...values);
    });
    expect(materials.length).toBeGreaterThan(0);
    expect(materials.every((material) => material.depthTest)).toBe(true);
    expect(presentation.diagnostics()).toMatchObject({
      active: true,
      valid: true,
      authorityBound: true,
      maximumRangeMillimeters: 9_000,
    });
    presentation.dispose();
  });
});
