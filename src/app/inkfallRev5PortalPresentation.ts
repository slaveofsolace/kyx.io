import * as THREE from 'three';

import type {
  CombatPresentationWorldPortalTraversedEventV1,
} from '../net';

export interface InkfallRev5PortalAudioCue {
  readonly event: CombatPresentationWorldPortalTraversedEventV1;
  readonly local: boolean;
}

export type InkfallRev5PortalAudioCallback = (
  cue: InkfallRev5PortalAudioCue,
) => void;

interface PortalTransient {
  readonly root: THREE.Group;
  readonly materials: readonly THREE.MeshBasicMaterial[];
  readonly startedAtMilliseconds: number;
  readonly lifetimeMilliseconds: number;
}

const STATIC_PORTAL_LIGHTS = Object.freeze([
  Object.freeze({
    id: 'red_fold_lower',
    position: Object.freeze([-4, -1.1, 10] as const),
    color: 0x6ff3ff,
  }),
  Object.freeze({
    id: 'red_fold_upper',
    position: Object.freeze([1, 3.35, 5] as const),
    color: 0xffa53b,
  }),
]);

function mapMillimetersToScene(
  value: Readonly<{ x: number; y: number; z: number }>,
): THREE.Vector3 {
  return new THREE.Vector3(
    value.x / 1_000,
    value.y / 1_000,
    -value.z / 1_000,
  );
}

function portalWave(
  position: THREE.Vector3,
  color: number,
  hook: string,
): Readonly<{
  root: THREE.Group;
  materials: readonly THREE.MeshBasicMaterial[];
}> {
  const root = new THREE.Group();
  root.position.copy(position);
  root.userData.presentationRole = 'world_portal_vfx_only';
  root.userData.renderMeshesMayBeAuthority = false;
  root.userData.noHit = true;
  root.userData.hook = hook;
  const ringMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const shellMaterial = new THREE.MeshBasicMaterial({
    color,
    wireframe: true,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.8, 0.055, 8, 32),
    ringMaterial,
  );
  ring.rotation.x = Math.PI / 2;
  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.58, 1),
    shellMaterial,
  );
  root.add(ring, shell, new THREE.PointLight(color, 5.8, 9, 2));
  return Object.freeze({
    root,
    materials: Object.freeze([ringMaterial, shellMaterial]),
  });
}

export function createInkfallRev5PortalPresentation(
  scene: THREE.Scene,
  playAudio: InkfallRev5PortalAudioCallback = () => {},
) {
  const transients: PortalTransient[] = [];
  const staticLights = STATIC_PORTAL_LIGHTS.map((definition) => {
    const light = new THREE.PointLight(definition.color, 2.4, 10, 2);
    light.name =
      `INKFALL_PORTAL_${definition.id.toUpperCase()}_PRESENTATION_LIGHT`;
    light.position.set(
      definition.position[0],
      definition.position[1],
      definition.position[2],
    );
    light.userData.presentationRole = 'world_portal_static_light_only';
    light.userData.renderMeshesMayBeAuthority = false;
    light.userData.noHit = true;
    scene.add(light);
    return light;
  });
  let cueCount = 0;
  let disposed = false;

  const addWave = (
    position: THREE.Vector3,
    color: number,
    hook: string,
    nowMilliseconds: number,
  ): void => {
    const wave = portalWave(position, color, hook);
    scene.add(wave.root);
    transients.push({
      ...wave,
      startedAtMilliseconds: nowMilliseconds,
      lifetimeMilliseconds: 820,
    });
  };

  return Object.freeze({
    present(
      event: CombatPresentationWorldPortalTraversedEventV1,
      nowMilliseconds: number,
      local: boolean,
    ): void {
      if (disposed) return;
      const color = event.endpointId.endsWith('upper')
        ? 0xffa53b
        : 0x6ff3ff;
      addWave(
        mapMillimetersToScene(event.from).add(new THREE.Vector3(0, 1, 0)),
        color,
        event.departureVfxHook,
        nowMilliseconds,
      );
      addWave(
        mapMillimetersToScene(event.to).add(new THREE.Vector3(0, 1, 0)),
        color,
        event.arrivalVfxHook,
        nowMilliseconds,
      );
      try {
        playAudio(Object.freeze({ event, local }));
      } catch {
        // Audio and accessibility are presentation-only and must never tear
        // down the Three renderer or affect the authoritative traversal.
      }
      cueCount += 1;
    },
    update(nowMilliseconds: number): void {
      for (let index = transients.length - 1; index >= 0; index -= 1) {
        const transient = transients[index];
        const progress = Math.min(
          1,
          (nowMilliseconds - transient.startedAtMilliseconds)
            / transient.lifetimeMilliseconds,
        );
        transient.root.scale.setScalar(0.5 + progress * 2.2);
        for (const material of transient.materials) {
          material.opacity = (1 - progress) * 0.9;
        }
        if (progress < 1) continue;
        scene.remove(transient.root);
        transient.root.traverse((object) => {
          if (!(object as THREE.Mesh).isMesh) return;
          const mesh = object as THREE.Mesh;
          mesh.geometry.dispose();
          const materials = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];
          for (const material of materials) material.dispose();
        });
        transients.splice(index, 1);
      }
    },
    diagnostics() {
      return Object.freeze({
        cueCount,
        activeTransientCount: transients.length,
        staticLightCount: staticLights.length,
        audioDelegation: 'shared_callback' as const,
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const transient of transients.splice(0)) {
        scene.remove(transient.root);
      }
      for (const light of staticLights) scene.remove(light);
    },
  });
}
