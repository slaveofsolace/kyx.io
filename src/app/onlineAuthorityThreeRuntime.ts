import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { getBundledMapPackageSource } from '../content/maps';
import type { AuthorityEvidencePresentation } from '../dev/authorityEvidenceClient';
import type {
  CombatPlayerSnapshotV1,
  CombatSnapshotV1,
  ReliableEvent,
} from '../net';
import {
  buildHumanSoldier,
  isHumanSoldierReady,
  preloadHumanSoldier,
} from '../player/HumanSoldier.js';
import { buildWeaponModel } from '../weapons/WeaponModels.js';
import { getWeapon } from '../weapons/weaponDefs.js';
import {
  INKFALL_REV4_CANDIDATE_ART,
  inspectInkfallRev4CandidateScene,
  loadInkfallRev4CandidateAuthorityBinding,
} from './inkfallRev4CandidateBinding';
import {
  ONLINE_INKFALL_REV4_MAP_BINDING,
} from './onlineAuthorityProfiles';

const rev4PresentationArtifactUrl = new URL(
  '../../assets/source/maps/inkfall-foundry/art-kit/press-archive-rev4/rev4/export/inkfall_foundry_press_archive_rev4.spatial-material-joined.glb',
  import.meta.url,
).href;
const revision3RenderArtifactUrl = new URL(
  '../../assets/source/maps/inkfall-foundry/revisions/revision-3/export/render.graybox.glb',
  import.meta.url,
).href;
const revision3CollisionArtifactUrl = new URL(
  '../../assets/source/maps/inkfall-foundry/revisions/revision-3/export/collision.authority.glb',
  import.meta.url,
).href;

const AUTHORITY_WEAPON_TO_PROCEDURAL_DEFINITION = Object.freeze({
  vertical_rifle_v1: 'm4',
  kyx_sidearm_v1: 'magnum',
  kyx_scattergun_v1: 'energyshotgun',
  kyx_longshot_v1: 'boltsniper',
  kyx_breach_rocket_v1: 'rpg',
  kyx_edge_v1: 'sword',
} as const);

type AuthorityWeaponId = keyof typeof AUTHORITY_WEAPON_TO_PROCEDURAL_DEFINITION;

const WEAPON_ACCENT = Object.freeze({
  rifle: 0x64e8ff,
  pistol: 0xffd166,
  shotgun: 0xff9b66,
  sniper: 0xe2f2ff,
  rocket: 0xff6d42,
  melee: 0x58f4ff,
} as const);

interface OnlineCombatView {
  readonly snapshot: CombatSnapshotV1 | null;
  readonly recentEvents: readonly ReliableEvent[];
  readonly localPlayerId: string | null;
}

export interface OnlineAuthorityThreeFrame {
  readonly nowMilliseconds: number;
  readonly presentation: AuthorityEvidencePresentation;
  readonly combat: OnlineCombatView;
  readonly localYawMilliDegrees: number | null;
  readonly localPitchMilliDegrees: number | null;
  readonly localSpeedMillimetersPerSecond: number;
}

export interface OnlineAuthorityThreeDiagnostics {
  readonly status: 'ready' | 'disposed';
  readonly renderer: 'three_webgl';
  readonly mapReference: typeof ONLINE_INKFALL_REV4_MAP_BINDING.mapReference;
  readonly presentationReference:
    typeof ONLINE_INKFALL_REV4_MAP_BINDING.presentationReference;
  readonly presentationSha256: typeof INKFALL_REV4_CANDIDATE_ART.sha256;
  readonly authorityFixtureHash: typeof ONLINE_INKFALL_REV4_MAP_BINDING.fixtureHash;
  readonly renderMeshesMayBeAuthority: false;
  readonly renderMeshCount: number;
  readonly authorityColliderCount: 339;
  readonly spawnCount: 12;
  readonly zoneCount: 9;
  readonly remoteAvatarCount: number;
  readonly grenadeProjectileCount: number;
  readonly weaponProjectileCount: number;
  readonly renderedReliableEventCount: number;
  readonly selectedWeaponId: string | null;
  readonly selectedProceduralDefinitionId: string | null;
  readonly pointerLocked: boolean;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
}

export interface OnlineAuthorityThreeRuntime {
  readonly render: (frame: OnlineAuthorityThreeFrame) => void;
  readonly diagnostics: () => OnlineAuthorityThreeDiagnostics;
  readonly dispose: () => void;
}

interface WeaponModel {
  readonly authorityWeaponId: AuthorityWeaponId;
  readonly definitionId: string;
  readonly group: THREE.Group;
  readonly muzzle: THREE.Object3D;
}

interface PlayerAvatar {
  readonly root: THREE.Group;
  weapon: WeaponModel | null;
  weaponId: string | null;
  recoil: number;
}

interface TransientEffect {
  readonly root: THREE.Object3D;
  readonly startedAtMilliseconds: number;
  readonly expiresAtMilliseconds: number;
  readonly material: THREE.Material | readonly THREE.Material[];
  readonly kind: 'flash' | 'tracer' | 'impact' | 'blast' | 'melee';
}

interface LoadedRev4Visual {
  readonly art: THREE.Group;
  readonly meshCount: number;
}

function mapMillimetersToScene(
  value: Readonly<{ x: number; y: number; z: number }>,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  return target.set(value.x / 1_000, value.y / 1_000, -value.z / 1_000);
}

function mapVelocityToScene(
  value: Readonly<{ x: number; y: number; z: number }>,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  return target.set(value.x, value.y, -value.z);
}

function normalizedYawRadians(yawMilliDegrees: number): number {
  return -yawMilliDegrees * Math.PI / 180_000;
}

function directionFromLook(
  yawMilliDegrees: number,
  pitchMilliDegrees: number,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  const yaw = yawMilliDegrees * Math.PI / 180_000;
  const pitch = pitchMilliDegrees * Math.PI / 180_000;
  const horizontal = Math.cos(pitch);
  return target.set(
    Math.sin(yaw) * horizontal,
    Math.sin(pitch),
    -Math.cos(yaw) * horizontal,
  ).normalize();
}

async function fetchArtifact(url: string, role: string): Promise<Uint8Array> {
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(
      `ONLINE_REV4_ARTIFACT_FETCH_FAILED role=${role} status=${response.status}`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

function parseGltf(bytes: Uint8Array): Promise<THREE.Group> {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(
      buffer,
      '',
      ({ scene }) => resolve(scene),
      (cause) => reject(
        cause instanceof Error
          ? cause
          : new Error('ONLINE_REV4_PRESENTATION_GLTF_PARSE_FAILED'),
      ),
    );
  });
}

async function loadRev4Visual(): Promise<LoadedRev4Visual> {
  const source = getBundledMapPackageSource('inkfall_foundry', 3);
  if (source === undefined || source === null) {
    throw new Error('ONLINE_REV4_AUTHORITY_PACKAGE_NOT_BUNDLED');
  }
  const [
    presentationArt,
    packageRender,
    authorityCollision,
  ] = await Promise.all([
    fetchArtifact(rev4PresentationArtifactUrl, 'rev4_presentation'),
    fetchArtifact(revision3RenderArtifactUrl, 'revision3_render_verification'),
    fetchArtifact(revision3CollisionArtifactUrl, 'revision3_authority_collision'),
  ]);
  const binding = await loadInkfallRev4CandidateAuthorityBinding(source, {
    presentationArt,
    packageRender,
    authorityCollision,
  });
  const loaded = binding.loaded;
  if (
    loaded.identity.id !== ONLINE_INKFALL_REV4_MAP_BINDING.mapId
    || loaded.identity.revision !== ONLINE_INKFALL_REV4_MAP_BINDING.mapRevision
    || loaded.identity.packageDigest
      !== ONLINE_INKFALL_REV4_MAP_BINDING.packageDigest
    || loaded.authority.fixture.id !== ONLINE_INKFALL_REV4_MAP_BINDING.fixtureId
    || loaded.authority.fixtureHash
      !== ONLINE_INKFALL_REV4_MAP_BINDING.fixtureHash
    || loaded.authority.fixture.solids.length
      !== ONLINE_INKFALL_REV4_MAP_BINDING.colliderCardinality
    || loaded.manifest.spawns.length !== 12
    || loaded.manifest.zones.length !== 9
    || loaded.manifest.pickups.length !== 0
    || loaded.manifest.authority.renderMeshesMayBeAuthority !== false
  ) {
    throw new Error('ONLINE_REV4_AUTHORITY_BINDING_MISMATCH');
  }
  const art = await parseGltf(binding.presentationArt);
  const sceneFacts = inspectInkfallRev4CandidateScene(art);
  art.name = 'INKFALL_REV4_PRESENTATION_ONLY_NOT_AUTHORITY';
  art.userData.presentationRole = 'render_only';
  art.userData.renderMeshesMayBeAuthority = false;
  art.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh) return;
    const mesh = object as THREE.Mesh;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.userData.presentationRole = 'render_only';
    mesh.userData.renderMeshesMayBeAuthority = false;
  });
  return Object.freeze({
    art,
    meshCount: sceneFacts.riseMeshCount
      + sceneFacts.landingMeshCount
      + (
        INKFALL_REV4_CANDIDATE_ART.meshCount
        - sceneFacts.riseMeshCount
        - sceneFacts.landingMeshCount
      ),
  });
}

function authorityWeaponId(value: string | null | undefined): AuthorityWeaponId {
  return value !== undefined
    && value !== null
    && Object.prototype.hasOwnProperty.call(
      AUTHORITY_WEAPON_TO_PROCEDURAL_DEFINITION,
      value,
    )
    ? value as AuthorityWeaponId
    : 'vertical_rifle_v1';
}

function createWeaponModel(
  requestedWeaponId: string | null | undefined,
  presentation: 'first_person' | 'world',
): WeaponModel {
  const weaponId = authorityWeaponId(requestedWeaponId);
  const definitionId = AUTHORITY_WEAPON_TO_PROCEDURAL_DEFINITION[weaponId];
  const definition = getWeapon(definitionId);
  if (definition === undefined) {
    throw new Error(`ONLINE_PROCEDURAL_WEAPON_DEFINITION_MISSING:${definitionId}`);
  }
  const built = buildWeaponModel(definition, { procedural: true }) as {
    readonly group: THREE.Group;
    readonly muzzle: THREE.Object3D;
  };
  built.group.name = `ONLINE_${presentation.toUpperCase()}_${weaponId}`;
  built.group.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh) return;
    const mesh = object as THREE.Mesh;
    mesh.castShadow = presentation === 'world';
    mesh.receiveShadow = presentation === 'world';
    mesh.frustumCulled = false;
    if (presentation === 'first_person') {
      mesh.renderOrder = 40;
    }
  });
  if (presentation === 'first_person') {
    const scale = weaponId === 'kyx_breach_rocket_v1'
      ? 0.55
      : weaponId === 'kyx_edge_v1'
        ? 0.84
        : weaponId === 'kyx_longshot_v1'
          ? 0.64
          : 0.78;
    built.group.scale.setScalar(scale);
    built.group.position.set(
      weaponId === 'kyx_edge_v1' ? 0.31 : 0.28,
      weaponId === 'kyx_edge_v1' ? -0.34 : -0.27,
      weaponId === 'kyx_breach_rocket_v1' ? -0.5 : -0.42,
    );
    built.group.rotation.set(
      weaponId === 'kyx_edge_v1' ? -0.12 : -0.045,
      weaponId === 'kyx_edge_v1' ? -0.1 : 0.035,
      weaponId === 'kyx_edge_v1' ? -0.09 : 0,
    );
  } else {
    const scale = weaponId === 'kyx_breach_rocket_v1'
      ? 0.55
      : weaponId === 'kyx_edge_v1'
        ? 0.8
        : 0.68;
    built.group.scale.setScalar(scale);
    built.group.position.set(0, 0, 0);
    built.group.rotation.set(0, 0, 0);
  }
  return {
    authorityWeaponId: weaponId,
    definitionId,
    group: built.group,
    muzzle: built.muzzle,
  };
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh) return;
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) material.dispose();
  });
}

function disposeObjectMaterials(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh) return;
    const mesh = object as THREE.Mesh;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) material.dispose();
  });
}

async function ensureHumanSoldierReady(): Promise<void> {
  if (isHumanSoldierReady()) return;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('ONLINE_HUMAN_SOLDIER_MODEL_LOAD_TIMEOUT'));
    }, 30_000);
    preloadHumanSoldier(() => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve();
    });
  });
}

function createPlayerAvatar(teamId: string | null): PlayerAvatar {
  const root = buildHumanSoldier(
    null,
    teamId === 'team_red' ? 'heavy' : 'recon',
    {
      runtimeRole: 'online_remote',
      presentationOnly: true,
    },
  ) as THREE.Group | null;
  if (root === null) {
    throw new Error('ONLINE_HUMAN_SOLDIER_MODEL_NOT_READY');
  }
  root.name = 'ONLINE_AUTHORITY_HUMAN_SOLDIER';
  root.traverse((object) => {
    object.userData.onlinePresentationOnly = true;
    if (!(object as THREE.Mesh).isMesh) return;
    const mesh = object as THREE.Mesh;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.noHit = true;
  });
  return {
    root,
    weapon: null,
    weaponId: null,
    recoil: 0,
  };
}

function selectedPlayerWeapon(
  combat: CombatSnapshotV1 | null,
  playerId: string,
): CombatPlayerSnapshotV1 | null {
  return combat?.players.find((player) => player.playerId === playerId) ?? null;
}

function setAvatarWeapon(
  avatar: PlayerAvatar,
  selectedWeaponId: string | null | undefined,
): void {
  const normalized = authorityWeaponId(selectedWeaponId);
  if (avatar.weaponId === normalized) return;
  if (avatar.weapon !== null) {
    avatar.root.userData.attachWeapon?.(null);
    avatar.weapon.group.parent?.remove(avatar.weapon.group);
    disposeObject(avatar.weapon.group);
  }
  avatar.weapon = createWeaponModel(normalized, 'world');
  avatar.weaponId = normalized;
  if (typeof avatar.root.userData.attachWeapon === 'function') {
    avatar.root.userData.attachWeapon(
      avatar.weapon.group,
      normalized === 'kyx_edge_v1',
    );
  } else {
    avatar.weapon.group.position.set(-0.4, 1.05, -0.1);
    avatar.weapon.group.rotation.set(-0.35, Math.PI, 0.14);
    avatar.root.add(avatar.weapon.group);
  }
}

export async function createOnlineAuthorityThreeRuntime(
  canvas: HTMLCanvasElement,
): Promise<OnlineAuthorityThreeRuntime> {
  const [loadedVisual] = await Promise.all([
    loadRev4Visual(),
    ensureHumanSoldierReady(),
  ]);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x091013);
  scene.fog = new THREE.Fog(0x091013, 42, 86);
  scene.add(loadedVisual.art);
  scene.add(new THREE.HemisphereLight(0xbfdcff, 0x21150e, 1.72));
  const key = new THREE.DirectionalLight(0xffd7af, 2.45);
  key.position.set(-14, 22, 12);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x70dbe8, 1.15);
  fill.position.set(18, 12, -16);
  scene.add(fill);
  const archiveGlow = new THREE.PointLight(0xffad55, 4.4, 24, 1.8);
  archiveGlow.position.set(-20, 6, -14);
  scene.add(archiveGlow);

  const camera = new THREE.PerspectiveCamera(76, 16 / 9, 0.025, 150);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  const firstPersonWeaponMount = new THREE.Group();
  firstPersonWeaponMount.name = 'ONLINE_FIRST_PERSON_WEAPON_ONLY';
  camera.add(firstPersonWeaponMount);
  let firstPersonWeapon: WeaponModel | null = null;
  let selectedWeaponId: string | null = null;
  let firstPersonRecoil = 0;
  let firstPersonMelee = 0;

  const avatars = new Map<string, PlayerAvatar>();
  const grenadeProjectiles = new Map<string, THREE.Mesh>();
  const weaponProjectiles = new Map<string, THREE.Group>();
  const processedReliableEvents = new Set<string>();
  const transientEffects: TransientEffect[] = [];
  let renderedReliableEventCount = 0;
  let disposed = false;
  let pointerLocked = document.pointerLockElement === canvas;
  let canvasWidth = 0;
  let canvasHeight = 0;

  const resize = (): void => {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (width === canvasWidth && height === canvasHeight) return;
    canvasWidth = width;
    canvasHeight = height;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();

  const pointerLockHandler = (): void => {
    pointerLocked = document.pointerLockElement === canvas;
  };
  document.addEventListener('pointerlockchange', pointerLockHandler);

  const transient = (
    root: THREE.Object3D,
    material: THREE.Material | readonly THREE.Material[],
    kind: TransientEffect['kind'],
    nowMilliseconds: number,
    lifetimeMilliseconds: number,
  ): void => {
    scene.add(root);
    transientEffects.push({
      root,
      material,
      kind,
      startedAtMilliseconds: nowMilliseconds,
      expiresAtMilliseconds: nowMilliseconds + lifetimeMilliseconds,
    });
  };

  const flashAt = (
    position: THREE.Vector3,
    color: number,
    nowMilliseconds: number,
  ): void => {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 6),
      material,
    );
    mesh.position.copy(position);
    transient(mesh, material, 'flash', nowMilliseconds, 110);
  };

  const impactAt = (
    position: THREE.Vector3,
    color: number,
    nowMilliseconds: number,
  ): void => {
    const material = new THREE.MeshBasicMaterial({
      color,
      wireframe: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.16, 1),
      material,
    );
    mesh.position.copy(position);
    transient(mesh, material, 'impact', nowMilliseconds, 340);
  };

  const tracerBetween = (
    origin: THREE.Vector3,
    end: THREE.Vector3,
    color: number,
    nowMilliseconds: number,
  ): void => {
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([origin, end]),
      material,
    );
    line.renderOrder = 30;
    transient(line, material, 'tracer', nowMilliseconds, 145);
  };

  const blastAt = (
    position: THREE.Vector3,
    color: number,
    nowMilliseconds: number,
  ): void => {
    const material = new THREE.MeshBasicMaterial({
      color,
      wireframe: true,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 16, 10),
      material,
    );
    mesh.position.copy(position);
    transient(mesh, material, 'blast', nowMilliseconds, 620);
  };

  const meleeAt = (
    position: THREE.Vector3,
    yawMilliDegrees: number,
    color: number,
    nowMilliseconds: number,
  ): void => {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.86,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const slash = new THREE.Mesh(
      new THREE.TorusGeometry(0.72, 0.028, 4, 24, Math.PI * 1.25),
      material,
    );
    slash.position.copy(position).add(new THREE.Vector3(0, 1.25, 0));
    slash.rotation.set(Math.PI / 2, normalizedYawRadians(yawMilliDegrees), 0.3);
    transient(slash, material, 'melee', nowMilliseconds, 260);
  };

  const entityScenePosition = (
    playerId: string,
    frame: OnlineAuthorityThreeFrame,
  ): THREE.Vector3 | null => {
    if (
      playerId === frame.combat.localPlayerId
      && frame.presentation.localPredicted !== null
    ) {
      return mapMillimetersToScene(frame.presentation.localPredicted);
    }
    const remote = frame.presentation.remotes.find(
      ({ entityId }) => entityId === playerId,
    );
    return remote === undefined
      ? null
      : mapMillimetersToScene(remote.state.feetPosition);
  };

  const entityLook = (
    playerId: string,
    frame: OnlineAuthorityThreeFrame,
  ): Readonly<{ yaw: number; pitch: number }> => {
    if (playerId === frame.combat.localPlayerId) {
      return {
        yaw: frame.localYawMilliDegrees ?? 0,
        pitch: frame.localPitchMilliDegrees ?? 0,
      };
    }
    const remote = frame.presentation.remotes.find(
      ({ entityId }) => entityId === playerId,
    );
    return {
      yaw: remote?.state.yawMilliDegrees ?? 0,
      pitch: remote?.state.pitchMilliDegrees ?? 0,
    };
  };

  const entityMuzzle = (
    playerId: string,
    frame: OnlineAuthorityThreeFrame,
  ): THREE.Vector3 | null => {
    if (
      playerId === frame.combat.localPlayerId
      && firstPersonWeapon !== null
    ) {
      return firstPersonWeapon.muzzle.getWorldPosition(new THREE.Vector3());
    }
    const avatar = avatars.get(playerId);
    if (avatar?.weapon !== null && avatar?.weapon !== undefined) {
      return avatar.weapon.muzzle.getWorldPosition(new THREE.Vector3());
    }
    const position = entityScenePosition(playerId, frame);
    return position?.add(new THREE.Vector3(0, 1.45, 0)) ?? null;
  };

  const processReliableEvents = (frame: OnlineAuthorityThreeFrame): void => {
    for (const event of frame.combat.recentEvents) {
      if (processedReliableEvents.has(event.id)) continue;
      processedReliableEvents.add(event.id);
      if (frame.presentation.estimatedServerTick - event.serverTick > 12) continue;
      const semantic = event.presentation;
      if (semantic === undefined) continue;
      renderedReliableEventCount += 1;
      const actorId = event.actorId ?? (
        'playerId' in semantic && typeof semantic.playerId === 'string'
          ? semantic.playerId
          : 'ownerPlayerId' in semantic
            ? semantic.ownerPlayerId
            : null
      );
      if (semantic.kind === 'weapon_attack_accepted') {
        const actor = entityScenePosition(semantic.playerId, frame);
        const muzzle = entityMuzzle(semantic.playerId, frame);
        if (actor === null || muzzle === null) continue;
        const color = WEAPON_ACCENT[semantic.family];
        flashAt(muzzle, color, frame.nowMilliseconds);
        const look = entityLook(semantic.playerId, frame);
        if (
          semantic.attackModel === 'hitscan'
          || semantic.attackModel === 'pellet_hitscan'
        ) {
          const direction = directionFromLook(look.yaw, look.pitch);
          const distance = semantic.family === 'shotgun' ? 22 : 72;
          tracerBetween(
            muzzle,
            muzzle.clone().addScaledVector(direction, distance),
            color,
            frame.nowMilliseconds,
          );
        } else if (semantic.attackModel === 'melee_contact') {
          meleeAt(actor, look.yaw, color, frame.nowMilliseconds);
          if (semantic.playerId === frame.combat.localPlayerId) {
            firstPersonMelee = 1;
          }
        }
        if (semantic.playerId === frame.combat.localPlayerId) {
          firstPersonRecoil = 1;
        } else {
          const avatar = avatars.get(semantic.playerId);
          if (avatar !== undefined) {
            avatar.recoil = 1;
            avatar.root.userData.triggerFire?.(1);
          }
        }
      } else if (semantic.kind === 'damage_applied') {
        const impact = entityScenePosition(semantic.targetPlayerId, frame);
        if (impact !== null) {
          impact.y += 1.15;
          impactAt(impact, 0xffe8a6, frame.nowMilliseconds);
        }
        if (
          semantic.sourcePlayerId !== null
          && semantic.sourcePlayerId !== semantic.targetPlayerId
        ) {
          const origin = entityMuzzle(semantic.sourcePlayerId, frame);
          if (origin !== null && impact !== null) {
            tracerBetween(origin, impact, 0xffefb4, frame.nowMilliseconds);
          }
        }
      } else if (semantic.kind === 'weapon_projectile_detonated') {
        blastAt(
          mapMillimetersToScene(semantic.positionMillimeters),
          0xff744d,
          frame.nowMilliseconds,
        );
      } else if (semantic.kind === 'weapon_melee_contact') {
        const actor = entityScenePosition(semantic.playerId, frame);
        const look = entityLook(semantic.playerId, frame);
        if (actor !== null) {
          meleeAt(actor, look.yaw, 0x58f4ff, frame.nowMilliseconds);
        }
        if (semantic.contactPointMillimeters !== null) {
          impactAt(
            mapMillimetersToScene(semantic.contactPointMillimeters),
            0xa8fbff,
            frame.nowMilliseconds,
          );
        }
      } else if (semantic.kind === 'impulse_grenade_detonated') {
        blastAt(
          mapMillimetersToScene(semantic.positionMillimeters),
          0xc889ff,
          frame.nowMilliseconds,
        );
      } else if (
        semantic.kind === 'teleport_resource_confirmed'
        && actorId !== null
      ) {
        blastAt(
          mapMillimetersToScene(semantic.to),
          0x77e8ff,
          frame.nowMilliseconds,
        );
      }
    }
  };

  const syncFirstPersonWeapon = (
    frame: OnlineAuthorityThreeFrame,
  ): void => {
    const localId = frame.combat.localPlayerId;
    const local = localId === null
      ? null
      : selectedPlayerWeapon(frame.combat.snapshot, localId);
    const nextId = authorityWeaponId(local?.selectedWeaponId);
    if (selectedWeaponId === nextId && firstPersonWeapon !== null) return;
    if (firstPersonWeapon !== null) {
      firstPersonWeaponMount.remove(firstPersonWeapon.group);
      disposeObject(firstPersonWeapon.group);
    }
    firstPersonWeapon = createWeaponModel(nextId, 'first_person');
    selectedWeaponId = nextId;
    firstPersonWeaponMount.add(firstPersonWeapon.group);
  };

  const syncAvatars = (frame: OnlineAuthorityThreeFrame): void => {
    const activeIds = new Set<string>();
    for (const remote of frame.presentation.remotes) {
      activeIds.add(remote.entityId);
      const combatPlayer = selectedPlayerWeapon(
        frame.combat.snapshot,
        remote.entityId,
      );
      let avatar = avatars.get(remote.entityId);
      if (avatar === undefined) {
        avatar = createPlayerAvatar(combatPlayer?.teamId ?? null);
        avatars.set(remote.entityId, avatar);
        scene.add(avatar.root);
      }
      avatar.root.visible = combatPlayer?.lifePhase !== 'dead';
      avatar.root.position.copy(
        mapMillimetersToScene(remote.state.feetPosition),
      );
      avatar.root.rotation.y = normalizedYawRadians(
        remote.state.yawMilliDegrees,
      );
      avatar.root.scale.y = remote.state.stance === 'crouched' ? 0.78 : 1;
      setAvatarWeapon(avatar, combatPlayer?.selectedWeaponId);
      const speed = Math.hypot(
        remote.state.velocity.x,
        remote.state.velocity.z,
      ) / 1_000;
      avatar.root.userData.setLocomotion?.(
        speed,
        remote.state.grounded,
        speed > 5.4,
        0,
      );
      avatar.root.userData.setAim?.(
        remote.state.pitchMilliDegrees * Math.PI / 180_000,
        0,
      );
      avatar.recoil *= 0.72;
      avatar.root.userData.mixer?.update(1 / 60);
      avatar.root.userData.armorTick?.(1 / 60);
    }
    for (const [playerId, avatar] of avatars) {
      if (activeIds.has(playerId)) continue;
      if (avatar.weapon !== null) {
        avatar.root.userData.attachWeapon?.(null);
        disposeObject(avatar.weapon.group);
      }
      scene.remove(avatar.root);
      disposeObjectMaterials(avatar.root);
      avatars.delete(playerId);
    }
  };

  const syncGrenades = (combat: CombatSnapshotV1 | null): void => {
    const active = new Set<string>();
    for (const projectile of combat?.projectiles ?? []) {
      if (projectile.phase !== 'active') continue;
      active.add(projectile.projectileId);
      let mesh = grenadeProjectiles.get(projectile.projectileId);
      if (mesh === undefined) {
        mesh = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.16, 1),
          new THREE.MeshStandardMaterial({
            color: 0x8a43d8,
            emissive: 0x8a43d8,
            emissiveIntensity: 2.4,
            metalness: 0.32,
            roughness: 0.22,
          }),
        );
        mesh.name = `ONLINE_AUTHORITY_GRENADE_${projectile.projectileId}`;
        grenadeProjectiles.set(projectile.projectileId, mesh);
        scene.add(mesh);
      }
      mesh.position.set(
        projectile.xMillimeters / 1_000,
        projectile.yMillimeters / 1_000,
        -projectile.zMillimeters / 1_000,
      );
      mesh.rotation.x += 0.08;
      mesh.rotation.y += 0.12;
    }
    for (const [projectileId, mesh] of grenadeProjectiles) {
      if (active.has(projectileId)) continue;
      scene.remove(mesh);
      disposeObject(mesh);
      grenadeProjectiles.delete(projectileId);
    }
  };

  const syncWeaponProjectiles = (combat: CombatSnapshotV1 | null): void => {
    const active = new Set<string>();
    for (const projectile of combat?.weaponProjectiles ?? []) {
      if (projectile.phase !== 'active') continue;
      active.add(projectile.projectileId);
      let group = weaponProjectiles.get(projectile.projectileId);
      if (group === undefined) {
        group = new THREE.Group();
        const bodyMaterial = new THREE.MeshStandardMaterial({
          color: 0x313840,
          metalness: 0.82,
          roughness: 0.24,
        });
        const plumeMaterial = new THREE.MeshBasicMaterial({
          color: 0xff784d,
          transparent: true,
          opacity: 0.86,
          depthWrite: false,
        });
        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.11, 0.52, 10),
          bodyMaterial,
        );
        body.rotation.x = Math.PI / 2;
        const plume = new THREE.Mesh(
          new THREE.ConeGeometry(0.1, 0.36, 10),
          plumeMaterial,
        );
        plume.rotation.x = -Math.PI / 2;
        plume.position.z = 0.4;
        group.add(body, plume);
        group.name = `ONLINE_AUTHORITY_ROCKET_${projectile.projectileId}`;
        weaponProjectiles.set(projectile.projectileId, group);
        scene.add(group);
      }
      group.position.set(
        projectile.xMillimeters / 1_000,
        projectile.yMillimeters / 1_000,
        -projectile.zMillimeters / 1_000,
      );
      const velocity = mapVelocityToScene({
        x: projectile.velocityXMillimetersPerSecond,
        y: projectile.velocityYMillimetersPerSecond,
        z: projectile.velocityZMillimetersPerSecond,
      });
      if (velocity.lengthSq() > 0) {
        group.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 0, -1),
          velocity.normalize(),
        );
      }
    }
    for (const [projectileId, group] of weaponProjectiles) {
      if (active.has(projectileId)) continue;
      scene.remove(group);
      disposeObject(group);
      weaponProjectiles.delete(projectileId);
    }
  };

  const updateTransientEffects = (nowMilliseconds: number): void => {
    for (let index = transientEffects.length - 1; index >= 0; index -= 1) {
      const effect = transientEffects[index];
      const span = effect.expiresAtMilliseconds - effect.startedAtMilliseconds;
      const elapsed = nowMilliseconds - effect.startedAtMilliseconds;
      const progress = Math.max(0, Math.min(1, elapsed / span));
      const materials = Array.isArray(effect.material)
        ? effect.material
        : [effect.material];
      for (const material of materials) {
        if ('opacity' in material) material.opacity = 1 - progress;
      }
      if (effect.kind === 'blast') {
        effect.root.scale.setScalar(1 + progress * 6);
      } else if (effect.kind === 'impact') {
        effect.root.scale.setScalar(1 + progress * 2.4);
        effect.root.rotation.y += 0.12;
      } else if (effect.kind === 'melee') {
        effect.root.rotation.z += 0.07;
      }
      if (nowMilliseconds < effect.expiresAtMilliseconds) continue;
      scene.remove(effect.root);
      disposeObject(effect.root);
      transientEffects.splice(index, 1);
    }
  };

  const render = (frame: OnlineAuthorityThreeFrame): void => {
    if (disposed) return;
    resize();
    syncFirstPersonWeapon(frame);
    syncAvatars(frame);
    syncGrenades(frame.combat.snapshot);
    syncWeaponProjectiles(frame.combat.snapshot);
    processReliableEvents(frame);
    updateTransientEffects(frame.nowMilliseconds);

    if (frame.presentation.localPredicted !== null) {
      const target = mapMillimetersToScene(
        frame.presentation.localPredicted,
      ).add(new THREE.Vector3(0, 1.58, 0));
      camera.position.lerp(target, 0.42);
      camera.rotation.y = normalizedYawRadians(
        frame.localYawMilliDegrees ?? 0,
      );
      camera.rotation.x = (
        frame.localPitchMilliDegrees ?? 0
      ) * Math.PI / 180_000;
      camera.rotation.z = 0;
    } else {
      camera.position.lerp(new THREE.Vector3(-25, 8.5, 20), 0.08);
      camera.lookAt(-14, 2.2, -5);
    }

    firstPersonRecoil *= 0.72;
    firstPersonMelee *= 0.82;
    if (firstPersonWeapon !== null) {
      const movementBob = Math.min(
        1,
        frame.localSpeedMillimetersPerSecond / 5_500,
      );
      const bobPhase = frame.nowMilliseconds * 0.012;
      firstPersonWeaponMount.position.set(
        Math.sin(bobPhase) * 0.008 * movementBob,
        Math.abs(Math.cos(bobPhase)) * -0.008 * movementBob,
        firstPersonRecoil * 0.055,
      );
      firstPersonWeaponMount.rotation.set(
        firstPersonRecoil * -0.08,
        firstPersonMelee * -0.52,
        firstPersonMelee * -0.26,
      );
    }
    renderer.render(scene, camera);
  };

  const diagnostics = (): OnlineAuthorityThreeDiagnostics => Object.freeze({
    status: disposed ? 'disposed' : 'ready',
    renderer: 'three_webgl',
    mapReference: ONLINE_INKFALL_REV4_MAP_BINDING.mapReference,
    presentationReference:
      ONLINE_INKFALL_REV4_MAP_BINDING.presentationReference,
    presentationSha256: INKFALL_REV4_CANDIDATE_ART.sha256,
    authorityFixtureHash: ONLINE_INKFALL_REV4_MAP_BINDING.fixtureHash,
    renderMeshesMayBeAuthority: false,
    renderMeshCount: loadedVisual.meshCount,
    authorityColliderCount: 339,
    spawnCount: 12,
    zoneCount: 9,
    remoteAvatarCount: avatars.size,
    grenadeProjectileCount: grenadeProjectiles.size,
    weaponProjectileCount: weaponProjectiles.size,
    renderedReliableEventCount,
    selectedWeaponId,
    selectedProceduralDefinitionId: firstPersonWeapon?.definitionId ?? null,
    pointerLocked,
    canvasWidth,
    canvasHeight,
  });

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    resizeObserver.disconnect();
    document.removeEventListener('pointerlockchange', pointerLockHandler);
    if (document.pointerLockElement === canvas) void document.exitPointerLock();
    renderer.dispose();
    disposeObject(scene);
    scene.clear();
  };

  return Object.freeze({ render, diagnostics, dispose });
}
