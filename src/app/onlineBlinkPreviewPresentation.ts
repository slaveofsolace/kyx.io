import * as THREE from 'three';

import type {
  OnlineBlinkPreview,
  OnlineBlinkPreviewReason,
} from './onlineBlinkPreview';
import { isOnlineBlinkPreviewCommitEligible } from './onlineBlinkPreview';

const VALID_COLOR = 0x55f4e4;
const BLOCKED_COLOR = 0xff765f;

function finitePosition(
  value: Readonly<{ x: number; y: number; z: number }>,
): boolean {
  return Number.isFinite(value.x)
    && Number.isFinite(value.y)
    && Number.isFinite(value.z);
}

/**
 * Presentation accepts only a complete authority-bound result. Invalid
 * results must remain at the origin, while valid results must be a ready,
 * bounded full/partial destination. Malformed client state fails closed.
 */
export function canPresentOnlineBlinkPreview(
  preview: OnlineBlinkPreview | null,
): preview is OnlineBlinkPreview {
  if (preview === null || preview.active !== true || preview.authorityBound !== true) {
    return false;
  }
  if (
    !Number.isFinite(preview.maximumRangeMillimeters)
    || preview.maximumRangeMillimeters <= 0
    || !Number.isFinite(preview.distanceMillimeters)
    || preview.distanceMillimeters < 0
    || preview.distanceMillimeters > preview.maximumRangeMillimeters
    || !finitePosition(preview.originFeetMillimeters)
    || !finitePosition(preview.destinationFeetMillimeters)
  ) return false;
  if (preview.valid) {
    return isOnlineBlinkPreviewCommitEligible(preview);
  }
  return preview.outcome === null
    && preview.distanceMillimeters === 0
    && preview.destinationFeetMillimeters.x === preview.originFeetMillimeters.x
    && preview.destinationFeetMillimeters.y === preview.originFeetMillimeters.y
    && preview.destinationFeetMillimeters.z === preview.originFeetMillimeters.z;
}

export interface OnlineBlinkPreviewPresentationDiagnostics {
  readonly active: boolean;
  readonly valid: boolean;
  readonly authorityBound: boolean;
  readonly reason: OnlineBlinkPreviewReason | 'inactive';
  readonly outcome: OnlineBlinkPreview['outcome'];
  readonly distanceMillimeters: number;
  readonly maximumRangeMillimeters: number;
}

export interface OnlineBlinkPreviewPresentation {
  readonly update: (
    preview: OnlineBlinkPreview | null,
    nowMilliseconds: number,
    reducedMotion: boolean,
  ) => void;
  readonly diagnostics: () => OnlineBlinkPreviewPresentationDiagnostics;
  readonly dispose: () => void;
}

function mapMillimetersToScene(
  value: Readonly<{ x: number; y: number; z: number }>,
  target: THREE.Vector3,
): THREE.Vector3 {
  return target.set(value.x / 1_000, value.y / 1_000, -value.z / 1_000);
}

function presentationMaterial(
  color: number,
  opacity: number,
): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    // The destination comes from the authority collision fixture. It still
    // obeys render depth so a marker never advertises reachability through a
    // visible wall or invalid surface.
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

export function createOnlineBlinkPreviewPresentation(
  scene: THREE.Scene,
): OnlineBlinkPreviewPresentation {
  const destination = new THREE.Group();
  destination.name = 'ONLINE_AUTHORITY_BLINK_DESTINATION';
  destination.visible = false;
  destination.userData.presentationOnly = true;
  destination.userData.noHit = true;
  destination.userData.authorityBound = true;

  const markerMaterial = presentationMaterial(VALID_COLOR, 0.84);
  const coreMaterial = presentationMaterial(VALID_COLOR, 0.16);
  const rangeMaterial = presentationMaterial(VALID_COLOR, 0.2);
  const beaconMaterial = presentationMaterial(VALID_COLOR, 0.24);
  const lineMaterial = new THREE.LineDashedMaterial({
    color: VALID_COLOR,
    transparent: true,
    opacity: 0.55,
    dashSize: 0.35,
    gapSize: 0.22,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
  });

  const destinationRing = new THREE.Mesh(
    new THREE.RingGeometry(0.58, 0.78, 64),
    markerMaterial,
  );
  destinationRing.name = 'ONLINE_BLINK_DESTINATION_RING';
  destinationRing.rotation.x = -Math.PI / 2;
  destinationRing.renderOrder = 60;
  destination.add(destinationRing);

  const destinationCore = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 64),
    coreMaterial,
  );
  destinationCore.name = 'ONLINE_BLINK_DESTINATION_CORE';
  destinationCore.rotation.x = -Math.PI / 2;
  destinationCore.position.y = 0.006;
  destinationCore.renderOrder = 59;
  destination.add(destinationCore);

  const destinationTicks = new THREE.Group();
  destinationTicks.name = 'ONLINE_BLINK_DESTINATION_BEARING_TICKS';
  for (let index = 0; index < 4; index += 1) {
    const tick = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.012, 0.25),
      markerMaterial,
    );
    tick.position.z = -0.93;
    tick.rotation.y = index * Math.PI / 2;
    tick.renderOrder = 61;
    destinationTicks.add(tick);
  }
  destination.add(destinationTicks);

  const destinationBeacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.12, 1.4, 16, 1, true),
    beaconMaterial,
  );
  destinationBeacon.name = 'ONLINE_BLINK_DESTINATION_BEACON';
  destinationBeacon.position.y = 0.7;
  destinationBeacon.renderOrder = 58;
  destination.add(destinationBeacon);

  const blockedGlyph = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.42, 0.03, -0.42),
      new THREE.Vector3(0.42, 0.03, 0.42),
      new THREE.Vector3(-0.42, 0.03, 0.42),
      new THREE.Vector3(0.42, 0.03, -0.42),
    ]),
    lineMaterial,
  );
  blockedGlyph.name = 'ONLINE_BLINK_BLOCKED_GLYPH';
  blockedGlyph.visible = false;
  blockedGlyph.renderOrder = 62;
  destination.add(blockedGlyph);

  const rangeGroup = new THREE.Group();
  rangeGroup.name = 'ONLINE_AUTHORITY_BLINK_MAXIMUM_RANGE';
  rangeGroup.visible = false;
  rangeGroup.userData.presentationOnly = true;
  rangeGroup.userData.noHit = true;
  rangeGroup.userData.authorityBound = true;
  let rangeRing = new THREE.Mesh(
    new THREE.RingGeometry(8.94, 9, 112),
    rangeMaterial,
  );
  rangeRing.rotation.x = -Math.PI / 2;
  rangeRing.renderOrder = 55;
  rangeGroup.add(rangeRing);
  let currentRangeMeters = 9;

  const tetherGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(),
    new THREE.Vector3(),
  ]);
  const tether = new THREE.Line(tetherGeometry, lineMaterial);
  tether.name = 'ONLINE_AUTHORITY_BLINK_TETHER';
  tether.visible = false;
  tether.frustumCulled = false;
  tether.renderOrder = 56;
  tether.computeLineDistances();

  scene.add(destination, rangeGroup, tether);
  const originScene = new THREE.Vector3();
  const destinationScene = new THREE.Vector3();
  let state: OnlineBlinkPreviewPresentationDiagnostics = Object.freeze({
    active: false,
    valid: false,
    authorityBound: false,
    reason: 'inactive',
    outcome: null,
    distanceMillimeters: 0,
    maximumRangeMillimeters: 0,
  });

  const setColor = (value: number): void => {
    markerMaterial.color.setHex(value);
    coreMaterial.color.setHex(value);
    rangeMaterial.color.setHex(value);
    beaconMaterial.color.setHex(value);
    lineMaterial.color.setHex(value);
  };

  const update = (
    preview: OnlineBlinkPreview | null,
    nowMilliseconds: number,
    reducedMotion: boolean,
  ): void => {
    const active = canPresentOnlineBlinkPreview(preview);
    destination.visible = active;
    rangeGroup.visible = active;
    tether.visible = active;
    if (!active || preview === null) {
      state = Object.freeze({
        active: false,
        valid: false,
        authorityBound: false,
        reason: 'inactive',
        outcome: null,
        distanceMillimeters: 0,
        maximumRangeMillimeters: 0,
      });
      return;
    }

    const rangeMeters = preview.maximumRangeMillimeters / 1_000;
    if (Math.abs(rangeMeters - currentRangeMeters) > 0.001) {
      rangeRing.geometry.dispose();
      rangeGroup.remove(rangeRing);
      rangeRing = new THREE.Mesh(
        new THREE.RingGeometry(
          Math.max(0.05, rangeMeters - 0.06),
          rangeMeters,
          112,
        ),
        rangeMaterial,
      );
      rangeRing.rotation.x = -Math.PI / 2;
      rangeRing.renderOrder = 55;
      rangeGroup.add(rangeRing);
      currentRangeMeters = rangeMeters;
    }

    mapMillimetersToScene(preview.originFeetMillimeters, originScene);
    mapMillimetersToScene(
      preview.destinationFeetMillimeters,
      destinationScene,
    );
    destination.position.copy(destinationScene);
    destination.position.y += 0.035;
    rangeGroup.position.copy(originScene);
    rangeGroup.position.y += 0.025;

    const positions = tetherGeometry.attributes.position;
    positions.setXYZ(0, originScene.x, originScene.y + 0.05, originScene.z);
    positions.setXYZ(
      1,
      destinationScene.x,
      destinationScene.y + 0.05,
      destinationScene.z,
    );
    positions.needsUpdate = true;
    tether.computeLineDistances();

    const color = preview.valid ? VALID_COLOR : BLOCKED_COLOR;
    setColor(color);
    blockedGlyph.visible = !preview.valid;
    destinationTicks.visible = preview.valid;
    destinationBeacon.visible = preview.valid;
    markerMaterial.opacity = preview.valid ? 0.84 : 0.92;
    coreMaterial.opacity = preview.valid ? 0.16 : 0.25;
    rangeMaterial.opacity = preview.valid ? 0.2 : 0.08;
    lineMaterial.opacity = preview.valid ? 0.55 : 0.28;

    const pulse = reducedMotion
      ? 1
      : 1 + Math.sin(nowMilliseconds * 0.009) * 0.045;
    destinationRing.scale.setScalar(pulse);
    destinationCore.scale.setScalar(pulse);
    destination.rotation.y = reducedMotion ? 0 : nowMilliseconds * 0.00022;

    state = Object.freeze({
      active: true,
      valid: preview.valid,
      authorityBound: preview.authorityBound,
      reason: preview.reason,
      outcome: preview.outcome,
      distanceMillimeters: preview.distanceMillimeters,
      maximumRangeMillimeters: preview.maximumRangeMillimeters,
    });
  };

  return {
    update,
    diagnostics: () => state,
    dispose: () => {
      scene.remove(destination, rangeGroup, tether);
      destinationRing.geometry.dispose();
      destinationCore.geometry.dispose();
      blockedGlyph.geometry.dispose();
      rangeRing.geometry.dispose();
      tetherGeometry.dispose();
      destinationTicks.traverse((object) => {
        if ((object as THREE.Mesh).isMesh) {
          (object as THREE.Mesh).geometry.dispose();
        }
      });
      destinationBeacon.geometry.dispose();
      markerMaterial.dispose();
      coreMaterial.dispose();
      rangeMaterial.dispose();
      beaconMaterial.dispose();
      lineMaterial.dispose();
    },
  };
}
