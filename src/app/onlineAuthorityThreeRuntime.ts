import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { getBundledMapPackageSource } from '../content/maps';
import type { AuthorityEvidencePresentation } from '../dev/authorityEvidenceClient';
import type {
  CombatPlayerSnapshotV1,
  CombatSnapshotV1,
  CombatWeaponSnapshotV1,
  ReliableEvent,
} from '../net';
import type { PhysicsFixtureV1 } from '../physics';
import {
  buildHumanSoldier,
  isHumanSoldierReady,
  preloadHumanSoldier,
} from '../player/HumanSoldier.js';
import {
  createKyxWeaponPresentationModel,
  normalizeKyxAuthorityWeaponId,
  updateKyxWeaponPresentation,
  type KyxWeaponPhase,
  type KyxWeaponPresentationModel,
} from '../weapons/KyxArmoryPresentation';
import {
  INKFALL_REV4_CANDIDATE_ART,
  inspectInkfallRev4CandidateScene,
  loadInkfallRev4CandidateAuthorityBinding,
} from './inkfallRev4CandidateBinding';
import {
  ONLINE_INKFALL_REV4_MAP_BINDING,
} from './onlineAuthorityProfiles';
import { createOnlineWeaponPresentationFx } from './onlineWeaponPresentationFx';

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
  readonly renderOnlyContainmentMeshCount: number;
  readonly spawnPocketContainmentCount: 2;
  readonly authorityColliderCount: 339;
  readonly spawnCount: 12;
  readonly zoneCount: 9;
  readonly remoteAvatarCount: number;
  readonly grenadeProjectileCount: number;
  readonly weaponProjectileCount: number;
  readonly activeWeaponEffectCount: number;
  readonly renderedReliableEventCount: number;
  readonly acceptedAttackPresentationCount: number;
  readonly confirmedDamagePresentationCount: number;
  readonly reloadPresentationCount: number;
  readonly authoredWeaponAudio: 'locked' | 'ready' | 'unavailable' | 'disposed';
  readonly selectedWeaponId: string | null;
  readonly selectedProceduralDefinitionId: string | null;
  readonly selectedWeaponLabel: string | null;
  readonly pointerLocked: boolean;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
}

export interface OnlineAuthorityThreeRuntime {
  readonly render: (frame: OnlineAuthorityThreeFrame) => void;
  readonly diagnostics: () => OnlineAuthorityThreeDiagnostics;
  readonly dispose: () => void;
}

interface PlayerAvatar {
  readonly root: THREE.Group;
  weapon: KyxWeaponPresentationModel | null;
  weaponId: string | null;
  recoil: number;
}

interface LoadedRev4Visual {
  readonly art: THREE.Group;
  readonly containment: THREE.Group;
  readonly meshCount: number;
  readonly containmentMeshCount: number;
}

const SPAWN_CONTAINMENT_COLLIDER_ID = /^(?:map_collision_(?:spawn_pad_spawn_[a-z0-9_]+|node_(?:west|east)_spawn|spawn_pocket_(?:floor|wall)_[a-z0-9_]+|kill_boundary_guard_(?:west|east)_back|spawn_sight_blocker_[a-z0-9_]+|door_frame_(?:west|east)_spawn_main_(?:left|right|lintel)|route_(?:west_spawn_choice_s00|east_choice_spawn_s01)))$/u;

function mapMillimetersToScene(
  value: Readonly<{ x: number; y: number; z: number }>,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  return target.set(value.x / 1_000, value.y / 1_000, -value.z / 1_000);
}

function markRenderOnly(
  object: THREE.Object3D,
  source: 'authority_aligned_cladding' | 'spawn_pocket_dressing',
): void {
  object.userData.presentationRole = 'render_only';
  object.userData.renderMeshesMayBeAuthority = false;
  object.userData.onlineAuthoritySource = source;
  object.userData.noHit = true;
}

function createAuthorityAlignedSpawnContainment(
  fixture: PhysicsFixtureV1,
): Readonly<{ group: THREE.Group; meshCount: number }> {
  const group = new THREE.Group();
  group.name = 'INKFALL_REV4_RENDER_ONLY_SPAWN_CONTAINMENT';
  markRenderOnly(group, 'authority_aligned_cladding');
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x26383e,
    metalness: 0.76,
    roughness: 0.4,
  });
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x15252b,
    metalness: 0.58,
    roughness: 0.5,
  });
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: 0x5e7479,
    metalness: 0.88,
    roughness: 0.24,
  });
  let meshCount = 0;
  for (const solid of fixture.solids) {
    if (
      solid.shape.type !== 'box'
      || !SPAWN_CONTAINMENT_COLLIDER_ID.test(solid.id)
    ) continue;
    const half = solid.shape.halfExtentsMm;
    const floorLike = /(?:spawn_pad|node_|spawn_pocket_floor|route_)/u.test(
      solid.id,
    );
    const frameLike = /door_frame/u.test(solid.id);
    const material = floorLike
      ? floorMaterial
      : frameLike
        ? trimMaterial
        : wallMaterial;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        half.x * 2 / 1_000,
        half.y * 2 / 1_000,
        half.z * 2 / 1_000,
      ),
      material,
    );
    mesh.name = `RENDER_ONLY_CLADDING_${solid.id}`;
    mesh.position.copy(mapMillimetersToScene(solid.centerMm));
    mesh.rotation.set(
      solid.rotationMilliDegrees.x * Math.PI / 180_000,
      -solid.rotationMilliDegrees.y * Math.PI / 180_000,
      -solid.rotationMilliDegrees.z * Math.PI / 180_000,
      'YXZ',
    );
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    markRenderOnly(mesh, 'authority_aligned_cladding');
    mesh.userData.authorityAlignmentColliderId = solid.id;
    group.add(mesh);
    meshCount += 1;
  }

  const canopyMaterial = new THREE.MeshStandardMaterial({
    color: 0x111d22,
    metalness: 0.72,
    roughness: 0.44,
  });
  const ribMaterial = new THREE.MeshStandardMaterial({
    color: 0x41565c,
    metalness: 0.9,
    roughness: 0.22,
  });
  const lightMaterials = {
    west: new THREE.MeshBasicMaterial({ color: 0x53e3ee }),
    east: new THREE.MeshBasicMaterial({ color: 0xff9b5b }),
  } as const;
  for (const side of [-1, 1] as const) {
    const sideName = side < 0 ? 'west' : 'east';
    const centerX = side * 32;
    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(8, 0.18, 18),
      canopyMaterial,
    );
    canopy.name = `RENDER_ONLY_${sideName.toUpperCase()}_SPAWN_CANOPY`;
    canopy.position.set(centerX, 3.42, 0);
    markRenderOnly(canopy, 'spawn_pocket_dressing');
    canopy.userData.authorityAlignedRegion = `${sideName}_spawn_pocket`;
    group.add(canopy);
    meshCount += 1;
    for (const z of [-7.7, -4, 0, 4, 7.7]) {
      const rib = new THREE.Mesh(
        new THREE.BoxGeometry(7.9, 0.14, 0.16),
        ribMaterial,
      );
      rib.name = `RENDER_ONLY_${sideName.toUpperCase()}_CANOPY_RIB_${z}`;
      rib.position.set(centerX, 3.27, z);
      markRenderOnly(rib, 'spawn_pocket_dressing');
      group.add(rib);
      meshCount += 1;
    }
    for (const z of [-5.7, -1.9, 1.9, 5.7]) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(3.4, 0.035, 0.11),
        lightMaterials[sideName],
      );
      strip.name = `RENDER_ONLY_${sideName.toUpperCase()}_SPAWN_LIGHT_${z}`;
      strip.position.set(centerX - side * 1.2, 3.15, z);
      markRenderOnly(strip, 'spawn_pocket_dressing');
      group.add(strip);
      meshCount += 1;
    }
    const pocketLight = new THREE.PointLight(
      side < 0 ? 0x68e9f3 : 0xffa36d,
      3.8,
      22,
      1.7,
    );
    pocketLight.name = `RENDER_ONLY_${sideName.toUpperCase()}_SPAWN_LIGHTING`;
    pocketLight.position.set(centerX - side * 1.5, 2.5, 0);
    markRenderOnly(pocketLight, 'spawn_pocket_dressing');
    group.add(pocketLight);
  }
  return Object.freeze({ group, meshCount });
}

function normalizedYawRadians(yawMilliDegrees: number): number {
  // Authority yaw zero faces map-east (+X). Three cameras face -Z at zero
  // rotation, so convert the map frame with a -90 degree basis offset.
  return -yawMilliDegrees * Math.PI / 180_000 - Math.PI / 2;
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
    Math.cos(yaw) * horizontal,
    Math.sin(pitch),
    -Math.sin(yaw) * horizontal,
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
  const containment = createAuthorityAlignedSpawnContainment(
    loaded.authority.fixture,
  );
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
    containment: containment.group,
    meshCount: sceneFacts.riseMeshCount
      + sceneFacts.landingMeshCount
      + (
        INKFALL_REV4_CANDIDATE_ART.meshCount
        - sceneFacts.riseMeshCount
        - sceneFacts.landingMeshCount
      ),
    containmentMeshCount: containment.meshCount,
  });
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

function selectedWeaponState(
  player: CombatPlayerSnapshotV1 | null,
): CombatWeaponSnapshotV1 | null {
  if (player === null) return null;
  const selectedId = normalizeKyxAuthorityWeaponId(player.selectedWeaponId);
  return player.weapons?.find(
    (weapon) => weapon.weaponId === selectedId,
  ) ?? null;
}

function selectedWeaponPhase(
  player: CombatPlayerSnapshotV1 | null,
  weapon: CombatWeaponSnapshotV1 | null,
): KyxWeaponPhase {
  if (player === null || player.lifePhase === 'dead') return 'dead';
  if (weapon !== null) return weapon.phase;
  return player.riflePhase;
}

function setAvatarWeapon(
  avatar: PlayerAvatar,
  selectedWeaponId: string | null | undefined,
): void {
  const normalized = normalizeKyxAuthorityWeaponId(selectedWeaponId);
  if (avatar.weaponId === normalized) return;
  if (avatar.weapon !== null) {
    avatar.root.userData.attachWeapon?.(null);
    avatar.weapon.group.parent?.remove(avatar.weapon.group);
    disposeObject(avatar.weapon.group);
  }
  avatar.weapon = createKyxWeaponPresentationModel(normalized, 'world');
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
  scene.background = new THREE.Color(0x071116);
  scene.fog = new THREE.FogExp2(0x0a171c, 0.0125);
  scene.add(loadedVisual.art, loadedVisual.containment);
  scene.add(new THREE.HemisphereLight(0xc4e6ef, 0x182126, 1.38));
  const key = new THREE.DirectionalLight(0xffd7af, 1.9);
  key.position.set(-14, 22, 12);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x70dbe8, 0.92);
  fill.position.set(18, 12, -16);
  scene.add(fill);
  const archiveGlow = new THREE.PointLight(0xffad55, 3.6, 26, 1.8);
  archiveGlow.position.set(-20, 6, -14);
  scene.add(archiveGlow);

  const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.025, 150);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  const firstPersonWeaponMount = new THREE.Group();
  firstPersonWeaponMount.name = 'ONLINE_FIRST_PERSON_WEAPON_ONLY';
  camera.add(firstPersonWeaponMount);
  let firstPersonWeapon: KyxWeaponPresentationModel | null = null;
  let selectedWeaponId: string | null = null;
  let firstPersonRecoil = 0;
  let firstPersonMelee = 0;

  const avatars = new Map<string, PlayerAvatar>();
  const grenadeProjectiles = new Map<string, THREE.Mesh>();
  const processedReliableEvents = new Set<string>();
  const weaponPresentationFx = createOnlineWeaponPresentationFx(scene, canvas);
  let renderedReliableEventCount = 0;
  let disposed = false;
  let pointerLocked = document.pointerLockElement === canvas;
  let canvasWidth = 0;
  let canvasHeight = 0;
  let previousRenderMilliseconds: number | null = null;

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

  const entityWeapon = (
    playerId: string,
    frame: OnlineAuthorityThreeFrame,
  ): KyxWeaponPresentationModel | null => {
    if (playerId === frame.combat.localPlayerId) return firstPersonWeapon;
    return avatars.get(playerId)?.weapon ?? null;
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
        const weapon = entityWeapon(semantic.playerId, frame);
        if (actor === null || muzzle === null || weapon === null) continue;
        const look = entityLook(semantic.playerId, frame);
        weaponPresentationFx.presentAttack({
          event: semantic,
          weapon,
          muzzle,
          direction: directionFromLook(look.yaw, look.pitch),
          actorPosition: actor,
          yawMilliDegrees: look.yaw,
          pitchMilliDegrees: look.pitch,
          nowMilliseconds: frame.nowMilliseconds,
          local: semantic.playerId === frame.combat.localPlayerId,
        });
        if (
          semantic.attackModel === 'melee_contact'
          && semantic.playerId === frame.combat.localPlayerId
        ) {
          firstPersonMelee = 1;
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
          const sourceMuzzle = semantic.sourcePlayerId === null
            ? null
            : entityMuzzle(semantic.sourcePlayerId, frame);
          const sourceWeapon = semantic.sourcePlayerId === null
            ? null
            : entityWeapon(semantic.sourcePlayerId, frame);
          weaponPresentationFx.presentDamage({
            event: semantic,
            impactPosition: impact,
            sourceMuzzle,
            sourceWeapon,
            nowMilliseconds: frame.nowMilliseconds,
            localSource:
              semantic.sourcePlayerId === frame.combat.localPlayerId,
            localTarget:
              semantic.targetPlayerId === frame.combat.localPlayerId,
          });
        }
        avatars.get(semantic.targetPlayerId)?.root.userData.triggerHit?.(0, 0);
      } else if (semantic.kind === 'weapon_projectile_detonated') {
        weaponPresentationFx.presentProjectileDetonation(
          semantic,
          mapMillimetersToScene(semantic.positionMillimeters),
          frame.nowMilliseconds,
          semantic.ownerPlayerId === frame.combat.localPlayerId,
        );
      } else if (semantic.kind === 'weapon_melee_contact') {
        weaponPresentationFx.presentMeleeContact(
          semantic,
          semantic.contactPointMillimeters === null
            ? null
            : mapMillimetersToScene(semantic.contactPointMillimeters),
          frame.nowMilliseconds,
          semantic.playerId === frame.combat.localPlayerId,
        );
      } else if (semantic.kind === 'impulse_grenade_detonated') {
        weaponPresentationFx.presentBlast(
          mapMillimetersToScene(semantic.positionMillimeters),
          0xc889ff,
          frame.nowMilliseconds,
        );
      } else if (
        semantic.kind === 'teleport_resource_confirmed'
        && actorId !== null
      ) {
        weaponPresentationFx.presentBlast(
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
    const weaponState = selectedWeaponState(local);
    const nextId = normalizeKyxAuthorityWeaponId(local?.selectedWeaponId);
    if (selectedWeaponId !== nextId || firstPersonWeapon === null) {
      if (firstPersonWeapon !== null) {
        firstPersonWeaponMount.remove(firstPersonWeapon.group);
        disposeObject(firstPersonWeapon.group);
      }
      firstPersonWeapon = createKyxWeaponPresentationModel(
        nextId,
        'first_person',
      );
      selectedWeaponId = nextId;
      firstPersonWeaponMount.add(firstPersonWeapon.group);
    }
    if (localId !== null && firstPersonWeapon !== null) {
      weaponPresentationFx.notifyWeaponPhase(
        localId,
        firstPersonWeapon,
        selectedWeaponPhase(local, weaponState),
        frame.nowMilliseconds,
        true,
      );
    }
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
      if (avatar.weapon !== null) {
        weaponPresentationFx.notifyWeaponPhase(
          remote.entityId,
          avatar.weapon,
          selectedWeaponPhase(combatPlayer, selectedWeaponState(combatPlayer)),
          frame.nowMilliseconds,
          false,
        );
      }
      const speed = (
        remote.state.locomotionSignal.planarSpeedMillimetersPerSecond
        / 1_000
      );
      avatar.root.userData.setLocomotion?.(
        speed,
        remote.state.grounded,
        speed > 5.4,
        remote.state.locomotionSignal.strafeLean,
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

  const render = (frame: OnlineAuthorityThreeFrame): void => {
    if (disposed) return;
    const deltaSeconds = previousRenderMilliseconds === null
      ? 1 / 60
      : Math.max(
          1 / 240,
          Math.min(0.1, (frame.nowMilliseconds - previousRenderMilliseconds) / 1_000),
        );
    previousRenderMilliseconds = frame.nowMilliseconds;
    resize();
    syncFirstPersonWeapon(frame);
    syncAvatars(frame);
    syncGrenades(frame.combat.snapshot);
    weaponPresentationFx.syncAuthoritativeRockets(
      frame.combat.snapshot?.weaponProjectiles ?? [],
      frame.nowMilliseconds,
    );
    if (firstPersonWeapon !== null) {
      updateKyxWeaponPresentation(
        firstPersonWeapon,
        frame.nowMilliseconds,
        deltaSeconds,
      );
    }
    for (const avatar of avatars.values()) {
      if (avatar.weapon === null) continue;
      updateKyxWeaponPresentation(
        avatar.weapon,
        frame.nowMilliseconds,
        deltaSeconds,
      );
    }

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

    firstPersonRecoil *= Math.pow(0.72, deltaSeconds * 60);
    firstPersonMelee *= Math.pow(0.82, deltaSeconds * 60);
    if (firstPersonWeapon !== null) {
      const movementBob = Math.min(
        1,
        frame.localSpeedMillimetersPerSecond / 5_500,
      );
      const bobPhase = frame.nowMilliseconds * 0.012;
      firstPersonWeaponMount.position.set(
        Math.sin(bobPhase) * 0.008 * movementBob,
        Math.abs(Math.cos(bobPhase)) * -0.008 * movementBob
          - firstPersonWeapon.reloadMix * 0.045,
        firstPersonRecoil * 0.055,
      );
      firstPersonWeaponMount.rotation.set(
        firstPersonRecoil * -0.08 + firstPersonWeapon.reloadMix * 0.18,
        firstPersonMelee * -0.52,
        firstPersonMelee * -0.26 + firstPersonWeapon.reloadMix * 0.24,
      );
    }
    // Reliable presentation resolves from the current camera, hand socket, and
    // authored muzzle matrices. Combat results still come only from the event.
    scene.updateMatrixWorld(true);
    processReliableEvents(frame);
    weaponPresentationFx.update(frame.nowMilliseconds);
    renderer.render(scene, camera);
  };

  const diagnostics = (): OnlineAuthorityThreeDiagnostics => {
    const weaponDiagnostics = weaponPresentationFx.diagnostics();
    return Object.freeze({
      status: disposed ? 'disposed' : 'ready',
      renderer: 'three_webgl',
      mapReference: ONLINE_INKFALL_REV4_MAP_BINDING.mapReference,
      presentationReference:
        ONLINE_INKFALL_REV4_MAP_BINDING.presentationReference,
      presentationSha256: INKFALL_REV4_CANDIDATE_ART.sha256,
      authorityFixtureHash: ONLINE_INKFALL_REV4_MAP_BINDING.fixtureHash,
      renderMeshesMayBeAuthority: false,
      renderMeshCount: loadedVisual.meshCount,
      renderOnlyContainmentMeshCount: loadedVisual.containmentMeshCount,
      spawnPocketContainmentCount: 2,
      authorityColliderCount: 339,
      spawnCount: 12,
      zoneCount: 9,
      remoteAvatarCount: avatars.size,
      grenadeProjectileCount: grenadeProjectiles.size,
      weaponProjectileCount: weaponDiagnostics.activeRocketCount,
      activeWeaponEffectCount: weaponDiagnostics.activeTransientCount,
      renderedReliableEventCount,
      acceptedAttackPresentationCount:
        weaponDiagnostics.acceptedAttackPresentationCount,
      confirmedDamagePresentationCount:
        weaponDiagnostics.confirmedDamagePresentationCount,
      reloadPresentationCount: weaponDiagnostics.reloadPresentationCount,
      authoredWeaponAudio: weaponDiagnostics.authoredAudio,
      selectedWeaponId,
      selectedProceduralDefinitionId: firstPersonWeapon?.definitionId ?? null,
      selectedWeaponLabel: firstPersonWeapon?.label ?? null,
      pointerLocked,
      canvasWidth,
      canvasHeight,
    });
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    resizeObserver.disconnect();
    document.removeEventListener('pointerlockchange', pointerLockHandler);
    if (document.pointerLockElement === canvas) void document.exitPointerLock();
    weaponPresentationFx.dispose();
    renderer.dispose();
    disposeObject(scene);
    scene.clear();
  };

  return Object.freeze({ render, diagnostics, dispose });
}
