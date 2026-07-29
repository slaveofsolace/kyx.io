import * as THREE from 'three';

import combatAuthorityFixtureSource from '../../assets/source/maps/inkfall-foundry/runtime/combat-authority-fixture.g5-revision3.v1.json';
import { validateBundledMapPackage } from '../content/maps';
import type { AuthorityEvidencePresentation } from '../dev/authorityEvidenceClient';
import type {
  CombatPlayerSnapshotV1,
  CombatSnapshotV1,
  CombatWeaponSnapshotV1,
  ReliableEvent,
} from '../net';
import {
  buildHumanSoldier,
  isHumanSoldierReady,
  preloadHumanSoldier,
} from '../player/HumanSoldier.js';
import { buildPreviewCharacter } from '../player/PreviewCharacter.js';
import {
  hashPhysicsFixture,
  loadPhysicsFixture,
} from '../physics';
import {
  createKyxWeaponPresentationModel,
  normalizeKyxAuthorityWeaponId,
  setKyxWeaponAim,
  updateKyxWeaponPresentation,
  type KyxWeaponPhase,
  type KyxWeaponPresentationModel,
} from '../weapons/KyxArmoryPresentation';
import {
  createInkfallRev5PortalPresentation,
  type InkfallRev5PortalAudioCallback,
} from './inkfallRev5PortalPresentation';
import {
  createInkfallRev5VisualContinuity,
} from './inkfallRev5VisualContinuity';
import type { OnlineBlinkPreview } from './onlineBlinkPreview';
import {
  createOnlineBlinkPreviewPresentation,
} from './onlineBlinkPreviewPresentation';
import {
  ONLINE_INKFALL_REV5_MAP_BINDING,
} from './onlineAuthorityProfiles';
import { createOnlineWeaponPresentationFx } from './onlineWeaponPresentationFx';

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
  readonly aimHeld: boolean;
  readonly blinkPreview: OnlineBlinkPreview | null;
}

export interface OnlineAuthorityThreeDiagnostics {
  readonly status: 'ready' | 'disposed';
  readonly renderer: 'three_webgl';
  readonly mapReference: typeof ONLINE_INKFALL_REV5_MAP_BINDING.mapReference;
  readonly presentationReference:
    typeof ONLINE_INKFALL_REV5_MAP_BINDING.presentationReference;
  readonly presentationMode:
    | 'review_glb'
    | 'procedural_authority_containment';
  readonly presentationSha256: string | null;
  readonly authorityFixtureHash: typeof ONLINE_INKFALL_REV5_MAP_BINDING.fixtureHash;
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
  readonly portalTraversalPresentationCount: number;
  readonly activePortalEffectCount: number;
  readonly portalAudioDelegation: 'shared_callback';
  readonly authoredWeaponAudio: 'locked' | 'ready' | 'unavailable' | 'disposed';
  readonly selectedWeaponId: string | null;
  readonly selectedProceduralDefinitionId: string | null;
  readonly selectedWeaponLabel: string | null;
  readonly selectedWeaponFamily: string | null;
  readonly selectedWeaponSilhouette: string | null;
  readonly selectedFirstPersonHandCount: number;
  readonly selectedFirstPersonContactMode: string;
  readonly selectedFirstPersonAimRequested: boolean;
  readonly selectedFirstPersonAimMix: number;
  readonly selectedFirstPersonScale: number;
  readonly selectedFirstPersonFieldOfViewDegrees: number;
  readonly selectedFirstPersonFireImpulse: number;
  readonly selectedFirstPersonReloadProgress: number;
  readonly selectedFirstPersonReloadPoseMix: number;
  readonly blinkPreviewActive: boolean;
  readonly blinkPreviewValid: boolean;
  readonly blinkPreviewAuthorityBound: boolean;
  readonly blinkPreviewReason: string;
  readonly blinkPreviewDistanceMillimeters: number;
  readonly blinkPreviewMaximumRangeMillimeters: number;
  readonly pointerLocked: boolean;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
}

export interface OnlineAuthorityThreeRuntime {
  readonly render: (frame: OnlineAuthorityThreeFrame) => void;
  readonly diagnostics: () => OnlineAuthorityThreeDiagnostics;
  readonly dispose: () => void;
}

export interface OnlineAuthorityThreeRuntimeOptions {
  readonly onWorldPortalAudio?: InkfallRev5PortalAudioCallback;
}

interface PlayerAvatar {
  readonly root: THREE.Group;
  weapon: KyxWeaponPresentationModel | null;
  weaponId: string | null;
  recoil: number;
  previousLifePhase: CombatPlayerSnapshotV1['lifePhase'] | null;
  previousWeaponPhase: KyxWeaponPhase | null;
  previousYawRadians: number | null;
  smoothedTurnRateRadiansPerSecond: number;
  deathPresentationUntilMilliseconds: number;
}

interface LoadedRev5Visual {
  readonly art: THREE.Group;
  readonly containment: THREE.Group;
  readonly meshCount: number;
  readonly containmentMeshCount: number;
  readonly presentationMode:
    | 'review_glb'
    | 'procedural_authority_containment';
  readonly presentationSha256: string | null;
}

const PROCESSED_RELIABLE_EVENT_RETENTION = 2_048;
const AUTHORITY_SIMULATION_RATE_HZ = 20;
const DEATH_PRESENTATION_DURATION_MILLISECONDS = 2_550;
const BASE_FIRST_PERSON_FIELD_OF_VIEW_DEGREES = 72;

function mapMillimetersToScene(
  value: Readonly<{ x: number; y: number; z: number }>,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  return target.set(value.x / 1_000, value.y / 1_000, -value.z / 1_000);
}

function avatarYawRadians(yawMilliDegrees: number): number {
  // The humanoid source faces +X while the canonical authority look basis
  // faces +Z, so remote bodies retain a model-only quarter-turn.
  return -yawMilliDegrees * Math.PI / 180_000 - Math.PI / 2;
}

export function authorityCameraYawRadians(
  yawMilliDegrees: number,
): number {
  // Authority +Z maps to Three -Z; yaw zero therefore maps to camera yaw zero.
  return -yawMilliDegrees * Math.PI / 180_000;
}

export function directionFromAuthorityLook(
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

function loadReleaseRev5Visual(): LoadedRev5Visual {
  const validated = validateBundledMapPackage('inkfall_foundry', 3);
  if (!validated.ok) {
    throw new Error('ONLINE_REV5_AUTHORITY_PACKAGE_NOT_BUNDLED');
  }
  const loaded = validated.value;
  const fixtureRecord = combatAuthorityFixtureSource;
  const fixture = loadPhysicsFixture(fixtureRecord.fixture);
  const fixtureHash = hashPhysicsFixture(fixture);
  if (
    loaded.id !== ONLINE_INKFALL_REV5_MAP_BINDING.mapId
    || loaded.revision !== ONLINE_INKFALL_REV5_MAP_BINDING.mapRevision
    || loaded.identity.digest
      !== ONLINE_INKFALL_REV5_MAP_BINDING.packageDigest
    || fixture.id !== ONLINE_INKFALL_REV5_MAP_BINDING.fixtureId
    || fixtureHash
      !== ONLINE_INKFALL_REV5_MAP_BINDING.fixtureHash
    || fixtureRecord.fixtureHash !== fixtureHash
    || fixtureRecord.mapId !== loaded.id
    || fixtureRecord.mapRevision !== loaded.revision
    || fixtureRecord.packageDigest !== loaded.identity.digest
    || fixtureRecord.collisionSha256 !== loaded.artifacts.collision.sha256
    || fixture.solids.length
      !== ONLINE_INKFALL_REV5_MAP_BINDING.colliderCardinality
    || loaded.spawns.length !== 12
    || loaded.zones.length !== 9
    || loaded.pickups.length !== 0
    || loaded.authority.renderMeshesMayBeAuthority !== false
  ) {
    throw new Error('ONLINE_REV5_AUTHORITY_BINDING_MISMATCH');
  }
  const containment = createInkfallRev5VisualContinuity(fixture);
  const art = new THREE.Group();
  art.name = 'INKFALL_RELEASE_PROCEDURAL_PRESENTATION_FALLBACK';
  art.userData.presentationRole = 'rev5_modular_render_only_no_hit';
  art.userData.renderMeshesMayBeAuthority = false;
  art.userData.noHit = true;
  return Object.freeze({
    art,
    containment: containment.group,
    meshCount: 0,
    containmentMeshCount: containment.meshCount,
    presentationMode: 'procedural_authority_containment',
    presentationSha256: null,
  });
}

async function loadRev5Visual(): Promise<LoadedRev5Visual> {
  if (!import.meta.env.DEV) return loadReleaseRev5Visual();
  // Runtime resolution preserves the local review visual without allowing
  // Rollup to discover and package its unapproved GLBs in production.
  const reviewVisualModulePath = '../dev/loadInkfallRev5ReviewVisual.ts';
  const { loadInkfallRev5ReviewVisual } = await import(
    /* @vite-ignore */ reviewVisualModulePath
  );
  return loadInkfallRev5ReviewVisual();
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
  const armorTypeId = teamId === 'team_red' ? 'heavy' : 'recon';
  const root = (buildHumanSoldier(
    null,
    armorTypeId,
    {
      runtimeRole: 'online_remote',
      presentationOnly: true,
    },
  ) ?? buildPreviewCharacter(
    teamId === 'team_red'
      ? { primary: 0x9a4a1f, secondary: 0x171c26 }
      : { primary: 0x2f6fae, secondary: 0x151c27 },
    armorTypeId,
    null,
    { allowHuman: false },
  )) as THREE.Group;
  root.name = isHumanSoldierReady()
    ? 'ONLINE_AUTHORITY_HUMAN_SOLDIER'
    : 'ONLINE_AUTHORITY_PROCEDURAL_SOLDIER';
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
    previousLifePhase: null,
    previousWeaponPhase: null,
    previousYawRadians: null,
    smoothedTurnRateRadiansPerSecond: 0,
    deathPresentationUntilMilliseconds: 0,
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
): boolean {
  const normalized = normalizeKyxAuthorityWeaponId(selectedWeaponId);
  if (avatar.weaponId === normalized) return false;
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
  return true;
}

function shortestAngleDeltaRadians(current: number, previous: number): number {
  return Math.atan2(
    Math.sin(current - previous),
    Math.cos(current - previous),
  );
}

function remainingAuthorityPhaseSeconds(
  completionTick: number | null | undefined,
  estimatedServerTick: number,
  fallbackSeconds: number,
): number {
  if (completionTick === null || completionTick === undefined) {
    return fallbackSeconds;
  }
  return THREE.MathUtils.clamp(
    (completionTick - estimatedServerTick) / AUTHORITY_SIMULATION_RATE_HZ,
    0.12,
    fallbackSeconds,
  );
}

export async function createOnlineAuthorityThreeRuntime(
  canvas: HTMLCanvasElement,
  options: OnlineAuthorityThreeRuntimeOptions = {},
): Promise<OnlineAuthorityThreeRuntime> {
  const [loadedVisual] = await Promise.all([
    loadRev5Visual(),
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
  renderer.toneMappingExposure = 1.28;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1b22);
  scene.fog = new THREE.FogExp2(0x16272d, 0.0075);
  scene.add(loadedVisual.art, loadedVisual.containment);
  scene.add(new THREE.HemisphereLight(0xd7eef3, 0x26353a, 1.72));
  const key = new THREE.DirectionalLight(0xffd7af, 2.25);
  key.position.set(-14, 22, 12);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x70dbe8, 1.2);
  fill.position.set(18, 12, -16);
  scene.add(fill);
  const archiveGlow = new THREE.PointLight(0xffad55, 4.2, 28, 1.8);
  archiveGlow.position.set(-20, 6, -14);
  scene.add(archiveGlow);

  const camera = new THREE.PerspectiveCamera(
    BASE_FIRST_PERSON_FIELD_OF_VIEW_DEGREES,
    16 / 9,
    0.025,
    150,
  );
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  const firstPersonWeaponMount = new THREE.Group();
  firstPersonWeaponMount.name = 'ONLINE_FIRST_PERSON_WEAPON_ONLY';
  camera.add(firstPersonWeaponMount);
  // Camera-space key/fill keeps the six authored silhouettes legible in dark
  // Inkfall interiors without altering authority-owned world lighting.
  const firstPersonWeaponKey = new THREE.PointLight(
    0xd9f8ff,
    5.2,
    2.4,
    1.65,
  );
  firstPersonWeaponKey.name = 'ONLINE_FIRST_PERSON_WEAPON_KEY';
  firstPersonWeaponKey.position.set(0.42, 0.28, 0.06);
  const firstPersonWeaponFill = new THREE.PointLight(
    0xffbd78,
    2.2,
    2.1,
    1.8,
  );
  firstPersonWeaponFill.name = 'ONLINE_FIRST_PERSON_WEAPON_FILL';
  firstPersonWeaponFill.position.set(-0.34, -0.2, -0.08);
  camera.add(firstPersonWeaponKey, firstPersonWeaponFill);
  let firstPersonWeapon: KyxWeaponPresentationModel | null = null;
  let selectedWeaponId: string | null = null;
  let firstPersonRecoil = 0;
  let firstPersonMelee = 0;

  const avatars = new Map<string, PlayerAvatar>();
  const grenadeProjectiles = new Map<string, THREE.Mesh>();
  const abilityProjectiles = new Map<string, THREE.Mesh>();
  const smokeFields = new Map<string, THREE.Group>();
  const processedReliableEvents = new Set<string>();
  const processedReliableEventOrder: string[] = [];
  const weaponPresentationFx = createOnlineWeaponPresentationFx(scene, canvas);
  const portalPresentation = createInkfallRev5PortalPresentation(
    scene,
    options.onWorldPortalAudio,
  );
  const blinkPreviewPresentation = createOnlineBlinkPreviewPresentation(scene);
  const reducedMotionQuery = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  );
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
      processedReliableEventOrder.push(event.id);
      if (
        processedReliableEventOrder.length
        > PROCESSED_RELIABLE_EVENT_RETENTION
      ) {
        const expiredEventId = processedReliableEventOrder.shift();
        if (expiredEventId !== undefined) {
          processedReliableEvents.delete(expiredEventId);
        }
      }
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
          direction: directionFromAuthorityLook(look.yaw, look.pitch),
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
            if (semantic.attackModel === 'melee_contact') {
              avatar.root.userData.triggerMelee?.();
            } else {
              avatar.root.userData.triggerFire?.(1);
            }
          }
        }
      } else if (semantic.kind === 'damage_applied') {
        const impact = entityScenePosition(semantic.targetPlayerId, frame);
        if (impact !== null) {
          impact.y += semantic.hitRegion === 'head' ? 1.65 : 1.15;
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
      } else if (semantic.kind === 'world_portal_traversed') {
        portalPresentation.present(
          semantic,
          frame.nowMilliseconds,
          semantic.playerId === frame.combat.localPlayerId,
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

  const syncAvatars = (
    frame: OnlineAuthorityThreeFrame,
    deltaSeconds: number,
  ): void => {
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
      const lifePhase = combatPlayer?.lifePhase ?? 'alive';
      if (lifePhase === 'dead' && avatar.previousLifePhase !== 'dead') {
        avatar.root.userData.triggerDeath?.();
        avatar.deathPresentationUntilMilliseconds = (
          frame.nowMilliseconds + DEATH_PRESENTATION_DURATION_MILLISECONDS
        );
      } else if (
        lifePhase === 'alive'
        && avatar.previousLifePhase === 'dead'
      ) {
        avatar.root.userData.resetPresentation?.();
      }
      avatar.root.visible = lifePhase === 'alive' || (
        frame.nowMilliseconds < avatar.deathPresentationUntilMilliseconds
      );
      avatar.root.position.copy(
        mapMillimetersToScene(remote.state.feetPosition),
      );
      const yawRadians = avatarYawRadians(
        remote.state.yawMilliDegrees,
      );
      const rawTurnRate = avatar.previousYawRadians === null
        ? 0
        : shortestAngleDeltaRadians(
            yawRadians,
            avatar.previousYawRadians,
          ) / Math.max(deltaSeconds, 1 / 240);
      avatar.smoothedTurnRateRadiansPerSecond += (
        THREE.MathUtils.clamp(rawTurnRate, -8, 8)
        - avatar.smoothedTurnRateRadiansPerSecond
      ) * (1 - Math.exp(-deltaSeconds * 10));
      avatar.previousYawRadians = yawRadians;
      avatar.root.rotation.y = yawRadians;
      avatar.root.scale.y = remote.state.stance === 'crouched' ? 0.78 : 1;
      const selectedState = selectedWeaponState(combatPlayer);
      const weaponPhase = combatPlayer === null
        ? 'ready'
        : selectedWeaponPhase(combatPlayer, selectedState);
      const weaponChanged = setAvatarWeapon(
        avatar,
        combatPlayer?.selectedWeaponId,
      );
      if (lifePhase === 'alive') {
        if (
          weaponPhase === 'reloading'
          && avatar.previousWeaponPhase !== 'reloading'
        ) {
          avatar.root.userData.triggerReload?.(
            remainingAuthorityPhaseSeconds(
              selectedState?.reloadCompletesAtTick
                ?? combatPlayer?.reloadCompletesAtTick,
              frame.presentation.estimatedServerTick,
              2.05,
            ),
          );
        } else if (
          weaponPhase === 'equipping'
          && avatar.previousWeaponPhase !== 'equipping'
        ) {
          avatar.root.userData.triggerEquip?.(
            remainingAuthorityPhaseSeconds(
              selectedState?.readyAtTick,
              frame.presentation.estimatedServerTick,
              0.34,
            ),
          );
        } else if (
          weaponChanged
          && avatar.previousWeaponPhase !== null
        ) {
          avatar.root.userData.triggerEquip?.(0.34);
        }
      }
      if (avatar.weapon !== null) {
        weaponPresentationFx.notifyWeaponPhase(
          remote.entityId,
          avatar.weapon,
          weaponPhase,
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
        {
          ...remote.state.locomotionSignal,
          turnRateRadiansPerSecond:
            avatar.smoothedTurnRateRadiansPerSecond,
        },
      );
      avatar.root.userData.setAim?.(
        remote.state.pitchMilliDegrees * Math.PI / 180_000,
        0,
      );
      avatar.recoil *= 0.72;
      avatar.root.userData.mixer?.update(deltaSeconds);
      avatar.root.userData.actionTick?.(deltaSeconds);
      avatar.root.userData.armorTick?.(deltaSeconds);
      avatar.previousLifePhase = lifePhase;
      avatar.previousWeaponPhase = weaponPhase;
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

  const syncGrenades = (
    combat: CombatSnapshotV1 | null,
    estimatedServerTick: number,
  ): void => {
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
    const activeAbilities = new Set<string>();
    for (const projectile of combat?.abilityProjectiles ?? []) {
      activeAbilities.add(projectile.projectileId);
      let mesh = abilityProjectiles.get(projectile.projectileId);
      if (mesh === undefined) {
        const color = projectile.abilityId === 'smoke_grenade_v1'
          ? 0x8ca3a7
          : projectile.abilityId === 'flash_grenade_v1'
            ? 0x7fe7ff
            : projectile.abilityId === 'sticky_grenade_v1' ? 0xff8b61 : 0xff654f;
        mesh = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.14, 1),
          new THREE.MeshStandardMaterial({
            color,
            emissive: color,
            emissiveIntensity: 1.15,
            metalness: 0.62,
            roughness: 0.28,
          }),
        );
        mesh.name = `ONLINE_AUTHORITY_ABILITY_${projectile.abilityId}_${projectile.projectileId}`;
        abilityProjectiles.set(projectile.projectileId, mesh);
        scene.add(mesh);
      }
      mesh.position.set(
        projectile.xMillimeters / 1_000,
        projectile.yMillimeters / 1_000,
        -projectile.zMillimeters / 1_000,
      );
      mesh.rotation.x += 0.07;
      mesh.rotation.y += 0.11;
    }
    for (const [projectileId, mesh] of abilityProjectiles) {
      if (activeAbilities.has(projectileId)) continue;
      scene.remove(mesh);
      disposeObject(mesh);
      abilityProjectiles.delete(projectileId);
    }
    const activeSmokeFields = new Set<string>();
    for (const field of combat?.smokeFields ?? []) {
      activeSmokeFields.add(field.fieldId);
      let smoke = smokeFields.get(field.fieldId);
      if (smoke === undefined) {
        smoke = new THREE.Group();
        smoke.name = `ONLINE_AUTHORITY_SMOKE_${field.fieldId}`;
        for (const [layerScale, opacity] of [
          [1, 0.2],
          [0.72, 0.16],
          [0.46, 0.12],
        ] as const) {
          const layer = new THREE.Mesh(
            new THREE.SphereGeometry(1, 20, 14),
            new THREE.MeshStandardMaterial({
              color: 0x8aa2a8,
              emissive: 0x263a40,
              emissiveIntensity: 0.38,
              transparent: true,
              opacity,
              depthWrite: false,
              side: THREE.DoubleSide,
              roughness: 1,
            }),
          );
          layer.scale.setScalar(layerScale);
          layer.userData.baseOpacity = opacity;
          smoke.add(layer);
        }
        smokeFields.set(field.fieldId, smoke);
        scene.add(smoke);
      }
      smoke.position.set(
        field.xMillimeters / 1_000,
        field.yMillimeters / 1_000,
        -field.zMillimeters / 1_000,
      );
      const radius = field.radiusMillimeters / 1_000;
      const expansionLinear = THREE.MathUtils.clamp(
        (estimatedServerTick - field.spawnedAtTick) / 27,
        0,
        1,
      );
      const expansion = expansionLinear * expansionLinear * (3 - 2 * expansionLinear);
      const fade = THREE.MathUtils.clamp(
        (field.expiresAtTick - estimatedServerTick) / 30,
        0,
        1,
      );
      const scale = radius * Math.max(0.04, expansion);
      smoke.scale.set(scale, scale * 0.72, scale);
      smoke.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        if (!(child.material instanceof THREE.MeshStandardMaterial)) return;
        child.material.opacity = Number(child.userData.baseOpacity ?? 0.12) * fade;
      });
    }
    for (const [fieldId, smoke] of smokeFields) {
      if (activeSmokeFields.has(fieldId)) continue;
      scene.remove(smoke);
      disposeObject(smoke);
      smokeFields.delete(fieldId);
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
    blinkPreviewPresentation.update(
      frame.blinkPreview,
      frame.nowMilliseconds,
      reducedMotionQuery.matches,
    );
    syncAvatars(frame, deltaSeconds);
    syncGrenades(frame.combat.snapshot, frame.presentation.estimatedServerTick);
    weaponPresentationFx.syncAuthoritativeRockets(
      frame.combat.snapshot?.weaponProjectiles ?? [],
      frame.nowMilliseconds,
    );
    if (firstPersonWeapon !== null) {
      setKyxWeaponAim(firstPersonWeapon, frame.aimHeld);
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
      camera.rotation.y = authorityCameraYawRadians(
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
      const pose = firstPersonWeapon.firstPersonPose;
      const aim = firstPersonWeapon.aimMix;
      const reload = firstPersonWeapon.reloadPoseMix;
      firstPersonWeapon.group.scale.setScalar(
        pose.baseScale * THREE.MathUtils.lerp(
          1,
          pose.aimScaleMultiplier,
          aim,
        ),
      );
      const movementBob = Math.min(
        1,
        frame.localSpeedMillimetersPerSecond / 5_500,
      );
      const bobPhase = frame.nowMilliseconds * 0.012;
      firstPersonWeaponMount.position.set(
        Math.sin(bobPhase) * 0.008 * movementBob
          + pose.aimOffset.x * aim
          + pose.recoilOffset.x * firstPersonRecoil
          + pose.reloadOffset.x * reload,
        Math.abs(Math.cos(bobPhase)) * -0.008 * movementBob
          + pose.aimOffset.y * aim
          + pose.recoilOffset.y * firstPersonRecoil
          + pose.reloadOffset.y * reload,
        pose.aimOffset.z * aim
          + pose.recoilOffset.z * firstPersonRecoil
          + pose.reloadOffset.z * reload,
      );
      firstPersonWeaponMount.rotation.set(
        pose.aimRotation.x * aim
          + pose.recoilRotation.x * firstPersonRecoil
          + pose.reloadRotation.x * reload,
        pose.aimRotation.y * aim
          + pose.recoilRotation.y * firstPersonRecoil
          + pose.reloadRotation.y * reload
          + firstPersonMelee * -0.52,
        pose.aimRotation.z * aim
          + pose.recoilRotation.z * firstPersonRecoil
          + pose.reloadRotation.z * reload
          + firstPersonMelee * -0.26,
      );
      const targetFieldOfView = THREE.MathUtils.lerp(
        BASE_FIRST_PERSON_FIELD_OF_VIEW_DEGREES,
        pose.aimFieldOfViewDegrees,
        aim,
      );
      if (Math.abs(camera.fov - targetFieldOfView) > 0.005) {
        camera.fov = targetFieldOfView;
        camera.updateProjectionMatrix();
      }
    } else if (
      camera.fov !== BASE_FIRST_PERSON_FIELD_OF_VIEW_DEGREES
    ) {
      camera.fov = BASE_FIRST_PERSON_FIELD_OF_VIEW_DEGREES;
      camera.updateProjectionMatrix();
    }
    // Reliable presentation resolves from the current camera, hand socket, and
    // authored muzzle matrices. Combat results still come only from the event.
    scene.updateMatrixWorld(true);
    processReliableEvents(frame);
    weaponPresentationFx.update(frame.nowMilliseconds);
    portalPresentation.update(frame.nowMilliseconds);
    renderer.render(scene, camera);
  };

  const diagnostics = (): OnlineAuthorityThreeDiagnostics => {
    const weaponDiagnostics = weaponPresentationFx.diagnostics();
    const portalDiagnostics = portalPresentation.diagnostics();
    const blinkDiagnostics = blinkPreviewPresentation.diagnostics();
    return Object.freeze({
      status: disposed ? 'disposed' : 'ready',
      renderer: 'three_webgl',
      mapReference: ONLINE_INKFALL_REV5_MAP_BINDING.mapReference,
      presentationReference:
        ONLINE_INKFALL_REV5_MAP_BINDING.presentationReference,
      presentationMode: loadedVisual.presentationMode,
      presentationSha256: loadedVisual.presentationSha256,
      authorityFixtureHash: ONLINE_INKFALL_REV5_MAP_BINDING.fixtureHash,
      renderMeshesMayBeAuthority: false,
      renderMeshCount: loadedVisual.meshCount,
      renderOnlyContainmentMeshCount: loadedVisual.containmentMeshCount,
      spawnPocketContainmentCount: 2,
      authorityColliderCount: 339,
      spawnCount: 12,
      zoneCount: 9,
      remoteAvatarCount: avatars.size,
      grenadeProjectileCount: grenadeProjectiles.size + abilityProjectiles.size,
      weaponProjectileCount: weaponDiagnostics.activeRocketCount,
      activeWeaponEffectCount: weaponDiagnostics.activeTransientCount,
      renderedReliableEventCount,
      acceptedAttackPresentationCount:
        weaponDiagnostics.acceptedAttackPresentationCount,
      confirmedDamagePresentationCount:
        weaponDiagnostics.confirmedDamagePresentationCount,
      reloadPresentationCount: weaponDiagnostics.reloadPresentationCount,
      portalTraversalPresentationCount: portalDiagnostics.cueCount,
      activePortalEffectCount: portalDiagnostics.activeTransientCount,
      portalAudioDelegation: portalDiagnostics.audioDelegation,
      authoredWeaponAudio: weaponDiagnostics.authoredAudio,
      selectedWeaponId,
      selectedProceduralDefinitionId: firstPersonWeapon?.definitionId ?? null,
      selectedWeaponLabel: firstPersonWeapon?.label ?? null,
      selectedWeaponFamily: firstPersonWeapon?.family ?? null,
      selectedWeaponSilhouette: firstPersonWeapon?.silhouette ?? null,
      selectedFirstPersonHandCount:
        firstPersonWeapon?.firstPersonHandCount ?? 0,
      selectedFirstPersonContactMode:
        String(
          firstPersonWeapon?.group.userData.firstPersonContactMode ?? 'none',
        ),
      selectedFirstPersonAimRequested:
        firstPersonWeapon?.aimRequested ?? false,
      selectedFirstPersonAimMix:
        firstPersonWeapon?.aimMix ?? 0,
      selectedFirstPersonScale:
        firstPersonWeapon?.group.scale.x ?? 0,
      selectedFirstPersonFieldOfViewDegrees: camera.fov,
      selectedFirstPersonFireImpulse:
        firstPersonWeapon?.fireImpulse ?? 0,
      selectedFirstPersonReloadProgress:
        firstPersonWeapon?.reloadProgress ?? 0,
      selectedFirstPersonReloadPoseMix:
        firstPersonWeapon?.reloadPoseMix ?? 0,
      blinkPreviewActive: blinkDiagnostics.active,
      blinkPreviewValid: blinkDiagnostics.valid,
      blinkPreviewAuthorityBound: blinkDiagnostics.authorityBound,
      blinkPreviewReason: blinkDiagnostics.reason,
      blinkPreviewDistanceMillimeters:
        blinkDiagnostics.distanceMillimeters,
      blinkPreviewMaximumRangeMillimeters:
        blinkDiagnostics.maximumRangeMillimeters,
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
    portalPresentation.dispose();
    weaponPresentationFx.dispose();
    blinkPreviewPresentation.dispose();
    processedReliableEvents.clear();
    processedReliableEventOrder.length = 0;
    renderer.dispose();
    disposeObject(scene);
    scene.clear();
  };

  return Object.freeze({ render, diagnostics, dispose });
}
