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
  readonly materials: readonly THREE.Material[];
  readonly startedAtMilliseconds: number;
  readonly lifetimeMilliseconds: number;
}

interface StaticPortalPresentation {
  readonly root: THREE.Group;
  readonly energyMaterial: THREE.ShaderMaterial;
  readonly haloMaterial: THREE.MeshBasicMaterial;
  readonly phase: number;
  readonly meshCount: number;
}

export interface WorldPortalPresentationDefinition {
  readonly id: string;
  readonly position: readonly [number, number, number];
  readonly color: number;
  readonly accent: number;
  readonly phase: number;
}

export const INKFALL_REV5_STATIC_PORTALS = Object.freeze([
  Object.freeze({
    id: 'red_fold_lower',
    position: Object.freeze([-4, -1.25, 10] as const),
    color: 0x6ff3ff,
    accent: 0xefffff,
    phase: 0,
  }),
  Object.freeze({
    id: 'red_fold_upper',
    position: Object.freeze([1, 3.181, 5] as const),
    color: 0xffa53b,
    accent: 0xffe2a6,
    phase: Math.PI,
  }),
]);

const PORTAL_ENERGY_VERTEX_SHADER = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PORTAL_ENERGY_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform vec3 uAccent;
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float radius = length(p);
    float angle = atan(p.y, p.x);
    float foldedCurrent = 0.5 + 0.5 * sin(
      angle * 6.0 + radius * 11.0 - uTime * 0.72
    );
    float inwardCurrent = 0.5 + 0.5 * sin(
      radius * 24.0 - uTime * 1.08 + angle * 1.5
    );
    float center = 1.0 - smoothstep(0.02, 0.96, radius);
    float softEdge = 1.0 - smoothstep(0.78, 1.02, radius);
    float filaments = pow(foldedCurrent, 5.0) * 0.16
      + pow(inwardCurrent, 7.0) * 0.11;
    vec3 energy = mix(
      uColor * 0.2,
      uColor,
      0.48 + center * 0.34 + filaments
    );
    energy = mix(energy, uAccent, center * 0.2 + filaments * 0.55);
    float alpha = (0.5 + center * 0.18 + filaments) * softEdge;
    gl_FragColor = vec4(energy, alpha);
  }
`;

function markPortalPresentationObject(
  object: THREE.Object3D,
  role: string,
): void {
  object.userData.presentationRole = role;
  object.userData.renderMeshesMayBeAuthority = false;
  object.userData.noHit = true;
  object.userData.portalAuthorityUnchanged = true;
}

function disposePresentationRoot(root: THREE.Object3D): void {
  const disposedMaterials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh) return;
    const mesh = object as THREE.Mesh;
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const material of materials) {
      if (disposedMaterials.has(material)) continue;
      material.dispose();
      disposedMaterials.add(material);
    }
  });
}

function createStaticPortalPresentation(
  definition: WorldPortalPresentationDefinition,
): StaticPortalPresentation {
  const root = new THREE.Group();
  root.name = `INKFALL_PORTAL_${definition.id.toUpperCase()}_PRESENTATION`;
  root.position.set(
    definition.position[0],
    definition.position[1],
    definition.position[2],
  );
  markPortalPresentationObject(root, 'world_portal_filled_aperture_only');

  const haloMaterial = new THREE.MeshBasicMaterial({
    color: definition.color,
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  haloMaterial.name =
    `INKFALL_PORTAL_${definition.id.toUpperCase()}_SOFT_HALO`;
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(1.52, 6),
    haloMaterial,
  );
  halo.name = `INKFALL_PORTAL_${definition.id.toUpperCase()}_HALO`;
  halo.position.z = -0.07;
  halo.renderOrder = 3;
  markPortalPresentationObject(halo, 'world_portal_soft_halo_only');

  const backplateMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(definition.color).multiplyScalar(0.085),
    emissive: new THREE.Color(definition.color).multiplyScalar(0.18),
    emissiveIntensity: 0.72,
    metalness: 0.34,
    roughness: 0.42,
    transparent: true,
    opacity: 0.94,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  backplateMaterial.name =
    `INKFALL_PORTAL_${definition.id.toUpperCase()}_DEEP_APERTURE`;
  const backplate = new THREE.Mesh(
    new THREE.CircleGeometry(1.27, 6),
    backplateMaterial,
  );
  backplate.name =
    `INKFALL_PORTAL_${definition.id.toUpperCase()}_DEEP_APERTURE`;
  backplate.renderOrder = 4;
  markPortalPresentationObject(backplate, 'world_portal_deep_aperture_only');

  const energyMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(definition.color) },
      uAccent: { value: new THREE.Color(definition.accent) },
      uTime: { value: definition.phase },
    },
    vertexShader: PORTAL_ENERGY_VERTEX_SHADER,
    fragmentShader: PORTAL_ENERGY_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  energyMaterial.name =
    `INKFALL_PORTAL_${definition.id.toUpperCase()}_ENERGY_FIELD`;
  const energy = new THREE.Mesh(
    new THREE.CircleGeometry(1.17, 6),
    energyMaterial,
  );
  energy.name =
    `INKFALL_PORTAL_${definition.id.toUpperCase()}_ENERGY_FIELD`;
  energy.position.z = 0.016;
  energy.renderOrder = 5;
  markPortalPresentationObject(energy, 'world_portal_energy_field_only');

  const gasketMaterial = new THREE.MeshStandardMaterial({
    color: 0x263a40,
    emissive: definition.color,
    emissiveIntensity: 0.2,
    metalness: 0.78,
    roughness: 0.34,
    side: THREE.DoubleSide,
  });
  gasketMaterial.name =
    `INKFALL_PORTAL_${definition.id.toUpperCase()}_SOLID_GASKET`;
  const gasket = new THREE.Mesh(
    new THREE.RingGeometry(1.19, 1.38, 6, 1),
    gasketMaterial,
  );
  gasket.name =
    `INKFALL_PORTAL_${definition.id.toUpperCase()}_SOLID_GASKET`;
  gasket.position.z = 0.035;
  gasket.renderOrder = 6;
  markPortalPresentationObject(gasket, 'world_portal_solid_gasket_only');

  const innerLinerMaterial = new THREE.MeshBasicMaterial({
    color: definition.accent,
    transparent: true,
    opacity: 0.56,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  innerLinerMaterial.name =
    `INKFALL_PORTAL_${definition.id.toUpperCase()}_INNER_LINER`;
  const innerLiner = new THREE.Mesh(
    new THREE.RingGeometry(1.1, 1.16, 6, 1),
    innerLinerMaterial,
  );
  innerLiner.name =
    `INKFALL_PORTAL_${definition.id.toUpperCase()}_INNER_LINER`;
  innerLiner.position.z = 0.045;
  innerLiner.renderOrder = 7;
  markPortalPresentationObject(innerLiner, 'world_portal_inner_liner_only');

  root.add(halo, backplate, energy, gasket, innerLiner);
  return Object.freeze({
    root,
    energyMaterial,
    haloMaterial,
    phase: definition.phase,
    meshCount: 5,
  });
}

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
    opacity: 0.74,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const shellMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.11,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
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
  // A portal event should read as a tight spatial pulse, not a full-screen
  // exposure flash. The restrained light also keeps team and route colors
  // visible during the first post-traversal frame.
  root.add(ring, shell, new THREE.PointLight(color, 2.15, 5.5, 2));
  return Object.freeze({
    root,
    materials: Object.freeze([ringMaterial, shellMaterial]),
  });
}

export function createInkfallRev5PortalPresentation(
  scene: THREE.Scene,
  playAudio: InkfallRev5PortalAudioCallback = () => {},
  showStaticPortals = true,
  staticPortalDefinitions: readonly WorldPortalPresentationDefinition[] =
    INKFALL_REV5_STATIC_PORTALS,
) {
  const transients: PortalTransient[] = [];
  const reducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const staticPortals = (showStaticPortals ? staticPortalDefinitions : []).map((definition) => {
    const portal = createStaticPortalPresentation(definition);
    scene.add(portal.root);
    return portal;
  });
  const staticLights = (showStaticPortals ? staticPortalDefinitions : []).map((definition) => {
    const light = new THREE.PointLight(definition.color, 1.65, 8, 2);
    light.name =
      `INKFALL_PORTAL_${definition.id.toUpperCase()}_PRESENTATION_LIGHT`;
    light.position.set(
      definition.position[0],
      definition.position[1],
      definition.position[2],
    );
    markPortalPresentationObject(light, 'world_portal_static_light_only');
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
      const color = staticPortalDefinitions.find(({ id }) => id === event.endpointId)?.color
        ?? (event.endpointId.endsWith('upper') ? 0xffa53b : 0x6ff3ff);
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
      const presentationTime = reducedMotion ? 0 : nowMilliseconds / 1_000;
      for (const portal of staticPortals) {
        portal.energyMaterial.uniforms.uTime.value =
          presentationTime + portal.phase;
        portal.haloMaterial.opacity = reducedMotion
          ? 0.13
          : 0.13 + Math.sin(presentationTime * 1.35 + portal.phase) * 0.025;
      }
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
        disposePresentationRoot(transient.root);
        transients.splice(index, 1);
      }
    },
    diagnostics() {
      return Object.freeze({
        cueCount,
        activeTransientCount: transients.length,
        staticPortalCount: staticPortals.length,
        staticPresentationMeshCount: staticPortals.reduce(
          (total, portal) => total + portal.meshCount,
          0,
        ),
        staticLightCount: staticLights.length,
        persistentPresentation: 'filled_hex_energy_aperture_v1' as const,
        reducedMotion,
        audioDelegation: 'shared_callback' as const,
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const transient of transients.splice(0)) {
        scene.remove(transient.root);
        disposePresentationRoot(transient.root);
      }
      for (const portal of staticPortals) {
        scene.remove(portal.root);
        disposePresentationRoot(portal.root);
      }
      for (const light of staticLights) scene.remove(light);
    },
  });
}
