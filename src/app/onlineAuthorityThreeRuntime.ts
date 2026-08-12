import * as THREE from 'three';

import revision3CombatAuthorityFixtureSource from '../../assets/source/maps/inkfall-foundry/runtime/combat-authority-fixture.g5-revision3.v1.json';
import revision4CombatAuthorityFixtureSource from '../../assets/source/maps/inkfall-foundry/runtime/combat-authority-fixture.g5-revision4.v1.json';
import {
  advanceSmokePresentationAgeTicks,
  smokePuffExpansion,
} from '../abilities/abilityPresentationSemantics';
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
  type PhysicsFixtureV1,
} from '../physics';
import { disposeThreeObjectResources } from '../render/disposeThreeObjectResources';
import {
  createKyxWeaponPresentationModel,
  normalizeKyxAuthorityWeaponId,
  setKyxWeaponAim,
  triggerKyxWeaponEquip,
  updateKyxWeaponPresentation,
  type KyxWeaponPhase,
  type KyxWeaponPresentationModel,
} from '../weapons/KyxArmoryPresentation';
import {
  inspectKyxFirstPersonWeaponMount,
  replaceKyxFirstPersonWeaponMount,
} from '../weapons/KyxFirstPersonWeaponMount';
import {
  inspectKyxWorldWeaponMount,
  replaceKyxWorldWeaponMount,
} from '../weapons/KyxWorldWeaponMount';
import {
  createInkfallRev5PortalPresentation,
  type InkfallRev5PortalAudioCallback,
  type WorldPortalPresentationDefinition,
} from './inkfallRev5PortalPresentation';
import {
  createRelayVisualContinuity,
  RELAY_AUTHORITY_COMPATIBILITY,
  RELAY_DISPLAY_NAME,
  RELAY_LEGACY_AUTHORITY_COMPATIBILITY,
} from './relayVisualContinuity';
import { createOriginalArenaVisualContinuity } from './originalArenaVisualContinuity';
import {
  combatAvatarArmorType,
  type CombatAvatarArmorTypeId,
} from './combatAvatarRole';
import type { OnlineBlinkPreview } from './onlineBlinkPreview';
import {
  createOnlineBlinkPreviewPresentation,
} from './onlineBlinkPreviewPresentation';
import {
  ONLINE_INKFALL_REV5_MAP_BINDING,
  type OnlineAuthorityMapBinding,
  type OnlineOriginalArenaMapBinding,
  type OnlineInkfallRevision4MapBinding,
  type OnlineInkfallRevision5MapBinding,
} from './onlineAuthorityProfiles';
import { createOnlineWeaponPresentationFx } from './onlineWeaponPresentationFx';

type OnlineInkfallThreeMapBinding =
  | OnlineInkfallRevision4MapBinding
  | OnlineInkfallRevision5MapBinding;

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
  readonly mapReference: string;
  readonly presentationReference: string;
  readonly presentationMode:
    | 'review_glb'
    | 'procedural_authority_containment'
    | 'relay_visual_candidate'
    | 'original_arena_visual_v1';
  readonly presentationDisplayName: string;
  readonly authorityCompatibility: string;
  readonly presentationSha256: string | null;
  readonly authorityFixtureHash: string;
  readonly renderMeshesMayBeAuthority: false;
  readonly renderMeshCount: number;
  readonly renderOnlyContainmentMeshCount: number;
  readonly spawnPocketContainmentCount: number;
  readonly authorityColliderCount: number;
  readonly spawnCount: number;
  readonly zoneCount: number;
  readonly remoteAvatarCount: number;
  readonly remoteAvatarCandidateCount: number;
  readonly remoteAvatarAnimationContractCount: number;
  readonly remoteAvatarAuthoredClipCount: number;
  readonly remoteAvatarProceduralAnimationCount: number;
  readonly remoteAvatarWeaponAttachmentCount: number;
  readonly remoteAvatarWorldWeaponRootCount: number;
  readonly remoteAvatarWorldWeaponOverlapFreeCount: number;
  readonly remoteAvatarWorldWeaponSelectionMatchCount: number;
  readonly remoteAvatarSupportHandContactCount: number;
  readonly remoteAvatarQualifiedSupportHandContactCount: number;
  readonly remoteAvatarMaximumSupportHandErrorMeters: number | null;
  readonly remoteAvatarSkeletalStanceContractCount: number;
  readonly remoteAvatarWholeBodySquashCount: number;
  readonly remoteAvatarRoleVariantCount: number;
  readonly remoteAvatarRoleVariants: readonly CombatAvatarArmorTypeId[];
  readonly grenadeProjectileCount: number;
  readonly activeSmokeFieldCount: number;
  readonly launchProjectilePresentation: 'cutline_launch_canister_v1';
  readonly launchCanisterPresentationCount: number;
  readonly launchPulsePresentationCount: number;
  readonly weaponProjectileCount: number;
  readonly activeWeaponEffectCount: number;
  readonly renderedReliableEventCount: number;
  readonly acceptedAttackPresentationCount: number;
  readonly confirmedDamagePresentationCount: number;
  readonly confirmedHitPresentationCount: number;
  readonly headshotPresentationCount: number;
  readonly killPresentationCount: number;
  readonly lastConfirmedDamagePresentation: string | null;
  readonly reloadPresentationCount: number;
  readonly throwablePresentationCount: number;
  readonly portalTraversalPresentationCount: number;
  readonly activePortalEffectCount: number;
  readonly staticWorldPortalCount: number;
  readonly staticWorldPortalMeshCount: number;
  readonly portalAudioDelegation: 'shared_callback';
  readonly authoredWeaponAudio: 'locked' | 'ready' | 'unavailable' | 'disposed';
  readonly selectedWeaponId: string | null;
  readonly selectedProceduralDefinitionId: string | null;
  readonly selectedWeaponLabel: string | null;
  readonly selectedWeaponFamily: string | null;
  readonly selectedWeaponSilhouette: string | null;
  readonly selectedWeaponVisualSource: string;
  readonly selectedFirstPersonHandCount: number;
  readonly selectedFirstPersonContactMode: string;
  readonly selectedFirstPersonMountChildCount: number;
  readonly selectedFirstPersonWeaponRootCount: number;
  readonly selectedFirstPersonOverlapFree: boolean;
  readonly selectedFirstPersonAimRequested: boolean;
  readonly selectedFirstPersonAimMix: number;
  readonly selectedFirstPersonAimPresentation: string | null;
  readonly selectedFirstPersonAimDatumNodeName: string | null;
  readonly selectedFirstPersonAuthorityMuzzleReferenceBound: boolean;
  readonly selectedFirstPersonEquipMix: number;
  readonly selectedFirstPersonSprintMix: number;
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
  readonly mapBinding?: OnlineAuthorityMapBinding;
  readonly presentationFixture?: PhysicsFixtureV1;
  readonly presentationIdentity?: OnlineAuthorityVisualIdentity;
  readonly showStaticWorldPortals?: boolean;
  readonly staticWorldPortalDefinitions?: readonly WorldPortalPresentationDefinition[];
}

export interface OnlineAuthorityVisualIdentity {
  readonly mapReference: string;
  readonly presentationReference: string;
  readonly fixtureHash: string;
  readonly colliderCardinality: number;
  readonly spawnCount: number;
  readonly zoneCount: number;
  readonly spawnPocketContainmentCount: number;
  readonly authorityCompatibility: string;
}

interface PlayerAvatar {
  readonly root: THREE.Group;
  readonly armorTypeId: CombatAvatarArmorTypeId;
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
    | 'procedural_authority_containment'
    | 'relay_visual_candidate'
    | 'original_arena_visual_v1';
  readonly displayName: string;
  readonly presentationSha256: string | null;
}

function createRelayLoadedVisual(fixture: PhysicsFixtureV1): LoadedRev5Visual {
  const relay = createRelayVisualContinuity(fixture);
  const containment = new THREE.Group();
  containment.name = 'RELAY_EMPTY_LEGACY_CONTAINMENT_SLOT';
  containment.userData.presentationRole = 'empty_compatibility_slot';
  containment.userData.renderMeshesMayBeAuthority = false;
  containment.userData.noHit = true;
  return Object.freeze({
    art: relay.group,
    containment,
    meshCount: relay.meshCount,
    containmentMeshCount: 0,
    presentationMode: 'relay_visual_candidate',
    displayName: RELAY_DISPLAY_NAME,
    presentationSha256: null,
  });
}

function createOriginalArenaLoadedVisual(
  mapBinding: OnlineOriginalArenaMapBinding,
  fixture: PhysicsFixtureV1,
): LoadedRev5Visual {
  const arena = createOriginalArenaVisualContinuity(mapBinding, fixture);
  const containment = new THREE.Group();
  containment.name = `${mapBinding.mapId.toUpperCase()}_EMPTY_LEGACY_CONTAINMENT_SLOT`;
  containment.userData.presentationRole = 'empty_compatibility_slot';
  containment.userData.renderMeshesMayBeAuthority = false;
  containment.userData.noHit = true;
  return Object.freeze({
    art: arena.group,
    containment,
    meshCount: arena.meshCount,
    containmentMeshCount: 0,
    presentationMode: 'original_arena_visual_v1',
    displayName: arena.displayName,
    presentationSha256: null,
  });
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

function loadReleaseRev5Visual(
  mapBinding: OnlineInkfallThreeMapBinding,
): LoadedRev5Visual {
  const validated = validateBundledMapPackage('inkfall_foundry', mapBinding.mapRevision);
  if (!validated.ok) {
    throw new Error('ONLINE_REV5_AUTHORITY_PACKAGE_NOT_BUNDLED');
  }
  const loaded = validated.value;
  const fixtureRecord = mapBinding.mapRevision === 4
    ? revision4CombatAuthorityFixtureSource
    : revision3CombatAuthorityFixtureSource;
  const fixture = loadPhysicsFixture(fixtureRecord.fixture);
  const fixtureHash = hashPhysicsFixture(fixture);
  if (
    loaded.id !== mapBinding.mapId
    || loaded.revision !== mapBinding.mapRevision
    || loaded.identity.digest
      !== mapBinding.packageDigest
    || fixture.id !== mapBinding.fixtureId
    || fixtureHash
      !== mapBinding.fixtureHash
    || fixtureRecord.fixtureHash !== fixtureHash
    || fixtureRecord.mapId !== loaded.id
    || fixtureRecord.mapRevision !== loaded.revision
    || fixtureRecord.packageDigest !== loaded.identity.digest
    || fixtureRecord.collisionSha256 !== loaded.artifacts.collision.sha256
    || fixture.solids.length
      !== mapBinding.colliderCardinality
    || loaded.spawns.length !== 12
    || loaded.zones.length !== 9
    || loaded.pickups.length !== 0
    || loaded.authority.renderMeshesMayBeAuthority !== false
  ) {
    throw new Error('ONLINE_REV5_AUTHORITY_BINDING_MISMATCH');
  }
  const relay = createRelayVisualContinuity(fixture);
  const containment = new THREE.Group();
  containment.name = 'RELAY_EMPTY_LEGACY_CONTAINMENT_SLOT';
  containment.userData.presentationRole = 'empty_compatibility_slot';
  containment.userData.renderMeshesMayBeAuthority = false;
  containment.userData.noHit = true;
  return Object.freeze({
    art: relay.group,
    containment,
    meshCount: relay.meshCount,
    containmentMeshCount: 0,
    presentationMode: 'relay_visual_candidate',
    displayName: RELAY_DISPLAY_NAME,
    presentationSha256: null,
  });
}

async function loadRev5Visual(
  mapBinding: OnlineAuthorityMapBinding,
  presentationFixture?: PhysicsFixtureV1,
): Promise<LoadedRev5Visual> {
  if (presentationFixture !== undefined) {
    if (mapBinding.mapId === 'relay') {
      return createRelayLoadedVisual(presentationFixture);
    }
    if (mapBinding.mapId === 'switchyard' || mapBinding.mapId === 'crownpoint') {
      return createOriginalArenaLoadedVisual(mapBinding, presentationFixture);
    }
  }
  if (mapBinding.mapId === 'relay') {
    throw new Error('ONLINE_RELAY_PRESENTATION_FIXTURE_REQUIRED');
  }
  if (mapBinding.mapRevision !== 3 && mapBinding.mapRevision !== 4) {
    throw new Error('ONLINE_AUTHORITY_VISUAL_PROFILE_UNSUPPORTED');
  }
  return loadReleaseRev5Visual(mapBinding);
}

async function loadWeaponReviewShells(): Promise<void> {
  if (import.meta.env.MODE !== 'staging-review' && !import.meta.env.DEV) return;
  const developmentVlr7ModulePath =
    '../dev/loadKyxVlr7QuaterniusReview.ts';
  const developmentArmoryModulePath =
    '../dev/loadKyxQuaterniusArmoryReview.ts';
  const vlr7Module = import.meta.env.MODE === 'staging-review'
    ? await import('../dev/loadKyxVlr7QuaterniusReview')
    : await import(
      /* @vite-ignore */ developmentVlr7ModulePath
    );
  const armoryModule = import.meta.env.MODE === 'staging-review'
    ? await import('../dev/loadKyxQuaterniusArmoryReview')
    : await import(
      /* @vite-ignore */ developmentArmoryModulePath
    );
  await Promise.all([
    vlr7Module.loadKyxVlr7QuaterniusReview(),
    armoryModule.loadKyxQuaterniusArmoryReview(),
  ]);
}

function disposeObject(root: THREE.Object3D): void {
  disposeThreeObjectResources(root);
}

function disposeObjectMaterials(root: THREE.Object3D): void {
  disposeThreeObjectResources(root, { geometry: false });
}

function createCutlineLaunchCanister(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'CUTLINE_LAUNCH_CANISTER';
  root.userData.presentationOnly = true;
  root.userData.noHit = true;

  const graphite = new THREE.MeshStandardMaterial({
    color: 0x182127,
    emissive: 0x071013,
    emissiveIntensity: 0.28,
    metalness: 0.84,
    roughness: 0.26,
  });
  const collar = new THREE.MeshStandardMaterial({
    color: 0x6d7d82,
    metalness: 0.9,
    roughness: 0.2,
  });
  const chargeBand = new THREE.MeshStandardMaterial({
    color: 0x8be8df,
    emissive: 0x55c8c2,
    emissiveIntensity: 1.05,
    metalness: 0.48,
    roughness: 0.22,
  });
  const contactCap = new THREE.MeshStandardMaterial({
    color: 0xf0ad57,
    emissive: 0x8c4d16,
    emissiveIntensity: 0.76,
    metalness: 0.64,
    roughness: 0.3,
  });
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.1, 0.3, 12, 1, false),
    graphite,
  );
  body.rotation.x = Math.PI / 2;
  root.add(body);
  for (const z of [-0.105, 0, 0.105]) {
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(
        z === 0 ? 0.104 : 0.112,
        z === 0 ? 0.104 : 0.112,
        z === 0 ? 0.018 : 0.026,
        12,
      ),
      z === 0 ? chargeBand : collar,
    );
    band.rotation.x = Math.PI / 2;
    band.position.z = z;
    root.add(band);
  }
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.062, 0.075, 0.024, 12),
    contactCap,
  );
  cap.rotation.x = Math.PI / 2;
  cap.position.z = 0.168;
  root.add(cap);
  return root;
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

function createPlayerAvatar(
  teamId: string | null,
  combatPlayer: CombatPlayerSnapshotV1 | null,
): PlayerAvatar {
  const skin = teamId === 'team_red'
    ? { primary: 0xc96a49, secondary: 0x252932, accent: 0xff8060 }
    : teamId === 'team_blue'
      ? { primary: 0x5797b7, secondary: 0x202932, accent: 0x62e6ff }
      : { primary: 0x9daab2, secondary: 0x242b32, accent: 0xa8f0ff };
  const armorTypeId = combatAvatarArmorType(combatPlayer);
  const root = (buildHumanSoldier(
    skin,
    armorTypeId,
    {
      runtimeRole: 'online_remote',
      presentationOnly: true,
    },
  ) ?? buildPreviewCharacter(
    skin,
    armorTypeId,
    null,
    { allowHuman: false, animate: true, runtimeRole: 'online_remote' },
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
    armorTypeId,
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

function isAttachedBelow(
  object: THREE.Object3D,
  expectedAncestor: THREE.Object3D,
): boolean {
  let current: THREE.Object3D | null = object.parent;
  while (current !== null) {
    if (current === expectedAncestor) return true;
    current = current.parent;
  }
  return false;
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
  if (
    avatar.weaponId === normalized
    && avatar.weapon !== null
    && inspectKyxWorldWeaponMount(avatar.root, avatar.weapon).overlapFree
  ) {
    return false;
  }
  const previous = avatar.weapon;
  const next = avatar.weaponId === normalized && previous !== null
    ? previous
    : createKyxWeaponPresentationModel(normalized, 'world');
  replaceKyxWorldWeaponMount(
    avatar.root,
    previous,
    next,
    (group) => {
      if (typeof avatar.root.userData.attachWeapon === 'function') {
        avatar.root.userData.attachWeapon(
          group,
          normalized === 'kyx_edge_v1',
        );
      } else {
        group.position.set(-0.4, 1.05, -0.1);
        group.rotation.set(-0.35, Math.PI, 0.14);
        avatar.root.add(group);
      }
    },
    disposeObject,
  );
  avatar.weapon = next;
  avatar.weaponId = normalized;
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
  const mapBinding = options.mapBinding ?? ONLINE_INKFALL_REV5_MAP_BINDING;
  const presentationIdentity = options.presentationIdentity ?? Object.freeze({
    mapReference: mapBinding.mapReference,
    presentationReference: 'presentationReference' in mapBinding
      ? mapBinding.presentationReference
      : mapBinding.mapReference,
    fixtureHash: mapBinding.fixtureHash,
    colliderCardinality: mapBinding.colliderCardinality,
    spawnCount: mapBinding.spawns.length,
    zoneCount: 'zones' in mapBinding ? mapBinding.zones.length : 0,
    spawnPocketContainmentCount: 2,
    authorityCompatibility: mapBinding.mapId === 'relay'
      ? RELAY_AUTHORITY_COMPATIBILITY
      : RELAY_LEGACY_AUTHORITY_COMPATIBILITY,
  });
  const [loadedVisual] = await Promise.all([
    loadRev5Visual(mapBinding, options.presentationFixture),
    ensureHumanSoldierReady(),
    loadWeaponReviewShells(),
  ]);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.24;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9db8c1);
  scene.fog = new THREE.FogExp2(0x9baca9, 0.0045);
  scene.add(loadedVisual.art, loadedVisual.containment);

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
  // Camera-space key/fill keeps weapon contact legible across Relay's bright
  // exterior and shaded lower route without changing authority state.
  const firstPersonWeaponKey = new THREE.PointLight(
    0xd9f8ff,
    1.65,
    2.2,
    1.65,
  );
  firstPersonWeaponKey.name = 'ONLINE_FIRST_PERSON_WEAPON_KEY';
  firstPersonWeaponKey.position.set(0.42, 0.28, 0.06);
  const firstPersonWeaponFill = new THREE.PointLight(
    0xffbd78,
    0.72,
    2.1,
    1.8,
  );
  firstPersonWeaponFill.name = 'ONLINE_FIRST_PERSON_WEAPON_FILL';
  firstPersonWeaponFill.position.set(-0.34, -0.2, -0.08);
  camera.add(firstPersonWeaponKey, firstPersonWeaponFill);
  let firstPersonWeapon: KyxWeaponPresentationModel | null = null;
  let selectedWeaponId: string | null = null;
  let firstPersonMelee = 0;

  const avatars = new Map<string, PlayerAvatar>();
  const grenadeProjectiles = new Map<string, THREE.Group>();
  const abilityProjectiles = new Map<string, THREE.Group>();
  const smokeFields = new Map<string, THREE.Group>();
  const smokePresentationAgeTicks = new Map<string, number>();
  const processedReliableEvents = new Set<string>();
  const processedReliableEventOrder: string[] = [];
  const weaponPresentationFx = createOnlineWeaponPresentationFx(scene, canvas);
  const portalPresentation = createInkfallRev5PortalPresentation(
    scene,
    options.onWorldPortalAudio,
    options.showStaticWorldPortals ?? true,
    options.staticWorldPortalDefinitions,
  );
  const blinkPreviewPresentation = createOnlineBlinkPreviewPresentation(scene);
  const reducedMotionQuery = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  );
  let renderedReliableEventCount = 0;
  let launchCanisterPresentationCount = 0;
  let launchPulsePresentationCount = 0;
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
        if (semantic.playerId !== frame.combat.localPlayerId) {
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
        weaponPresentationFx.presentImpulsePulse(
          mapMillimetersToScene(semantic.positionMillimeters),
          frame.nowMilliseconds,
          semantic.ownerPlayerId === frame.combat.localPlayerId,
        );
        launchPulsePresentationCount += 1;
      } else if (semantic.kind === 'throwable_ability_event') {
        const projectile = semantic.projectileId === null
          ? null
          : abilityProjectiles.get(semantic.projectileId) ?? null;
        const position = semantic.positionMillimeters !== null
          ? mapMillimetersToScene(semantic.positionMillimeters)
          : projectile?.position.clone() ?? null;
        weaponPresentationFx.presentThrowableAbility(
          semantic,
          position,
          frame.nowMilliseconds,
          semantic.playerId === frame.combat.localPlayerId,
        );
        if (
          semantic.phase === 'activated'
          && semantic.playerId !== frame.combat.localPlayerId
        ) {
          avatars.get(semantic.playerId)?.root.userData.triggerAbility?.(0.65);
        }
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
      const nextWeapon = createKyxWeaponPresentationModel(
        nextId,
        'first_person',
      );
      replaceKyxFirstPersonWeaponMount(
        firstPersonWeaponMount,
        firstPersonWeapon,
        nextWeapon,
        disposeObject,
      );
      triggerKyxWeaponEquip(nextWeapon);
      firstPersonWeapon = nextWeapon;
      selectedWeaponId = nextId;
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
        avatar = createPlayerAvatar(combatPlayer?.teamId ?? null, combatPlayer);
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
      avatar.root.scale.set(1, 1, 1);
      avatar.root.userData.setStance?.(remote.state.stance);
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
      avatar.root.userData.beginPresentationFrame?.();
      avatar.root.userData.mixer?.update(deltaSeconds);
      avatar.root.userData.actionTick?.(deltaSeconds);
      avatar.root.userData.armorTick?.(deltaSeconds);
      avatar.root.position.y += avatar.root.userData.getStanceOffsetY?.() ?? 0;
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
    deltaSeconds: number,
  ): void => {
    const active = new Set<string>();
    for (const projectile of combat?.projectiles ?? []) {
      if (projectile.phase !== 'active') continue;
      active.add(projectile.projectileId);
      let canister = grenadeProjectiles.get(projectile.projectileId);
      if (canister === undefined) {
        canister = createCutlineLaunchCanister();
        canister.name = `ONLINE_AUTHORITY_LAUNCH_${projectile.projectileId}`;
        grenadeProjectiles.set(projectile.projectileId, canister);
        scene.add(canister);
        launchCanisterPresentationCount += 1;
      }
      canister.position.set(
        projectile.xMillimeters / 1_000,
        projectile.yMillimeters / 1_000,
        -projectile.zMillimeters / 1_000,
      );
      const velocity = new THREE.Vector3(
        projectile.velocityXMillimetersPerSecond,
        projectile.velocityYMillimetersPerSecond,
        -projectile.velocityZMillimetersPerSecond,
      );
      if (velocity.lengthSq() > 0) {
        canister.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          velocity.normalize(),
        );
        canister.rotateZ((estimatedServerTick % 200) * 0.19);
      }
    }
    for (const [projectileId, canister] of grenadeProjectiles) {
      if (active.has(projectileId)) continue;
      scene.remove(canister);
      disposeObject(canister);
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
        mesh = new THREE.Group();
        const bodyMaterial = new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.16,
          metalness: 0.72,
          roughness: 0.42,
        });
        const isCanister = projectile.abilityId === 'smoke_grenade_v1'
          || projectile.abilityId === 'sticky_grenade_v1';
        const body = new THREE.Mesh(
          isCanister
            ? new THREE.CylinderGeometry(0.075, 0.075, 0.2, 12)
            : new THREE.SphereGeometry(0.105, 12, 8),
          bodyMaterial,
        );
        if (!isCanister) body.scale.set(1, 0.86, 1);
        const band = new THREE.Mesh(
          new THREE.TorusGeometry(isCanister ? 0.078 : 0.101, 0.011, 5, 16),
          new THREE.MeshStandardMaterial({
            color: 0x162029,
            metalness: 0.82,
            roughness: 0.34,
          }),
        );
        band.rotation.x = Math.PI / 2;
        const cap = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035, 0.046, 0.03, 9),
          new THREE.MeshStandardMaterial({
            color: 0x27333c,
            metalness: 0.88,
            roughness: 0.3,
          }),
        );
        cap.position.y = isCanister ? 0.115 : 0.09;
        mesh.add(body, band, cap);
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
        const puffCount = 16;
        for (let index = 0; index < puffCount; index += 1) {
          const angle = index * Math.PI * (3 - Math.sqrt(5));
          const ring = Math.sqrt((index + 0.5) / puffCount);
          const layer = new THREE.Mesh(
            new THREE.SphereGeometry(1, 18, 12),
            new THREE.ShaderMaterial({
              uniforms: {
                uColor: {
                    value: new THREE.Color(index % 2 === 0 ? 0xa6b4b7 : 0x7d8e94),
                },
                uOpacity: { value: 0 },
              },
              vertexShader: `
                varying vec3 vNormalView;
                varying vec3 vViewPosition;
                void main() {
                  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
                  vNormalView = normalize(normalMatrix * normal);
                  vViewPosition = -viewPosition.xyz;
                  gl_Position = projectionMatrix * viewPosition;
                }
              `,
              fragmentShader: `
                uniform vec3 uColor;
                uniform float uOpacity;
                varying vec3 vNormalView;
                varying vec3 vViewPosition;
                void main() {
                  float facing = abs(dot(
                    normalize(vNormalView),
                    normalize(vViewPosition)
                  ));
                  float softEdge = smoothstep(0.0, 0.72, facing);
                  gl_FragColor = vec4(uColor, uOpacity * softEdge);
                }
              `,
              transparent: true,
              depthWrite: false,
              side: THREE.DoubleSide,
            }),
          );
          layer.position.set(
            Math.cos(angle) * 0.4 * ring,
            0.16 + (index % 5) * 0.075,
            Math.sin(angle) * 0.4 * ring,
          );
          layer.userData.baseScale = 0.39 + (index % 4) * 0.026;
          layer.userData.baseOpacity = 0.62 + (index % 2) * 0.06;
          layer.userData.phase = index / puffCount;
          layer.scale.setScalar(0.02);
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
      const authoritativeAgeTicks = Math.max(
        0,
        estimatedServerTick - field.spawnedAtTick,
      );
      const presentationAgeTicks = advanceSmokePresentationAgeTicks(
        smokePresentationAgeTicks.get(field.fieldId) ?? null,
        authoritativeAgeTicks,
        deltaSeconds,
      );
      smokePresentationAgeTicks.set(field.fieldId, presentationAgeTicks);
      const fade = THREE.MathUtils.clamp(
        (field.expiresAtTick - estimatedServerTick) / 30,
        0,
        1,
      );
      smoke.scale.set(radius, radius * 0.78, radius);
      smoke.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        if (!(child.material instanceof THREE.ShaderMaterial)) return;
        const phase = Number(child.userData.phase ?? 0);
        const delayed = smokePuffExpansion(presentationAgeTicks, phase);
        const baseScale = Number(child.userData.baseScale ?? 0.39);
        child.scale.setScalar(baseScale * Math.max(0.025, delayed));
        child.material.uniforms.uOpacity.value = Number(child.userData.baseOpacity ?? 0.62)
          * delayed
          * fade;
      });
    }
    for (const [fieldId, smoke] of smokeFields) {
      if (activeSmokeFields.has(fieldId)) continue;
      scene.remove(smoke);
      disposeObject(smoke);
      smokeFields.delete(fieldId);
      smokePresentationAgeTicks.delete(fieldId);
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
    syncGrenades(
      frame.combat.snapshot,
      frame.presentation.estimatedServerTick,
      deltaSeconds,
    );
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

    firstPersonMelee *= Math.pow(0.82, deltaSeconds * 60);
    if (firstPersonWeapon !== null) {
      const pose = firstPersonWeapon.firstPersonPose;
      const aim = firstPersonWeapon.aimMix;
      const reload = firstPersonWeapon.reloadPoseMix;
      const equip = firstPersonWeapon.equipMix;
      const sprint = firstPersonWeapon.sprintMix;
      const recoil = firstPersonWeapon.fireImpulse;
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
          + pose.recoilOffset.x * recoil
          + pose.reloadOffset.x * reload
          + pose.equipOffset.x * equip
          + pose.sprintOffset.x * sprint,
        Math.abs(Math.cos(bobPhase)) * -0.008 * movementBob
          + pose.aimOffset.y * aim
          + pose.recoilOffset.y * recoil
          + pose.reloadOffset.y * reload
          + pose.equipOffset.y * equip
          + pose.sprintOffset.y * sprint,
        pose.aimOffset.z * aim
          + pose.recoilOffset.z * recoil
          + pose.reloadOffset.z * reload
          + pose.equipOffset.z * equip
          + pose.sprintOffset.z * sprint,
      );
      firstPersonWeaponMount.rotation.set(
        pose.aimRotation.x * aim
          + pose.recoilRotation.x * recoil
          + pose.reloadRotation.x * reload
          + pose.equipRotation.x * equip
          + pose.sprintRotation.x * sprint,
        pose.aimRotation.y * aim
          + pose.recoilRotation.y * recoil
          + pose.reloadRotation.y * reload
          + pose.equipRotation.y * equip
          + pose.sprintRotation.y * sprint
          + firstPersonMelee * -0.52,
        pose.aimRotation.z * aim
          + pose.recoilRotation.z * recoil
          + pose.reloadRotation.z * reload
          + pose.equipRotation.z * equip
          + pose.sprintRotation.z * sprint
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
    const remoteAvatars = [...avatars.values()];
    const remoteAvatarPresentationStates = remoteAvatars.map(
      (avatar) => avatar.root.userData.getPresentationState?.() ?? null,
    );
    const remoteAvatarSupportHandErrors = remoteAvatarPresentationStates
      .map((state) => state?.weaponContact?.supportHandErrorMeters)
      .filter((error): error is number => Number.isFinite(error));
    const remoteWorldMountDiagnostics = remoteAvatars.map((avatar) => (
      inspectKyxWorldWeaponMount(avatar.root, avatar.weapon)
    ));
    const firstPersonMountDiagnostics = inspectKyxFirstPersonWeaponMount(
      firstPersonWeaponMount,
      firstPersonWeapon,
    );
    return Object.freeze({
      status: disposed ? 'disposed' : 'ready',
      renderer: 'three_webgl',
      mapReference: presentationIdentity.mapReference,
      presentationReference: presentationIdentity.presentationReference,
      presentationMode: loadedVisual.presentationMode,
      presentationDisplayName: loadedVisual.displayName,
      authorityCompatibility: presentationIdentity.authorityCompatibility,
      presentationSha256: loadedVisual.presentationSha256,
      authorityFixtureHash: presentationIdentity.fixtureHash,
      renderMeshesMayBeAuthority: false,
      renderMeshCount: loadedVisual.meshCount,
      renderOnlyContainmentMeshCount: loadedVisual.containmentMeshCount,
      spawnPocketContainmentCount:
        presentationIdentity.spawnPocketContainmentCount,
      authorityColliderCount: presentationIdentity.colliderCardinality,
      spawnCount: presentationIdentity.spawnCount,
      zoneCount: presentationIdentity.zoneCount,
      remoteAvatarCount: avatars.size,
      remoteAvatarCandidateCount: remoteAvatars.filter(
        (avatar) => avatar.root.userData.isG6CharacterCandidate === true,
      ).length,
      remoteAvatarAnimationContractCount: remoteAvatars.filter(
        (avatar) => typeof avatar.root.userData.setLocomotion === 'function'
          && typeof avatar.root.userData.actionTick === 'function',
      ).length,
      remoteAvatarAuthoredClipCount: remoteAvatarPresentationStates.filter(
        (state) => typeof state?.activeClipKey === 'string',
      ).length,
      remoteAvatarProceduralAnimationCount: remoteAvatars.filter(
        (avatar) => avatar.root.userData.proceduralPresentation === true,
      ).length,
      remoteAvatarWeaponAttachmentCount: remoteAvatars.filter(
        (avatar) => avatar.weapon !== null
          && isAttachedBelow(avatar.weapon.group, avatar.root),
      ).length,
      remoteAvatarWorldWeaponRootCount: remoteWorldMountDiagnostics.reduce(
        (sum, item) => sum + item.weaponRootCount,
        0,
      ),
      remoteAvatarWorldWeaponOverlapFreeCount:
        remoteWorldMountDiagnostics.filter((item) => item.overlapFree).length,
      remoteAvatarWorldWeaponSelectionMatchCount:
        remoteWorldMountDiagnostics.filter(
          (item) => item.selectedWeaponMatches,
        ).length,
      remoteAvatarSupportHandContactCount: remoteAvatarPresentationStates.filter(
        (state) => state?.weaponContact?.supportHandContact === true,
      ).length,
      remoteAvatarQualifiedSupportHandContactCount:
        remoteAvatarSupportHandErrors.filter((error) => error <= 0.12).length,
      remoteAvatarMaximumSupportHandErrorMeters:
        remoteAvatarSupportHandErrors.length > 0
          ? Math.max(...remoteAvatarSupportHandErrors)
          : null,
      remoteAvatarSkeletalStanceContractCount: remoteAvatars.filter(
        (avatar) => typeof avatar.root.userData.setStance === 'function'
          && typeof avatar.root.userData.getStanceOffsetY === 'function',
      ).length,
      remoteAvatarWholeBodySquashCount: remoteAvatars.filter(
        (avatar) => Math.abs(avatar.root.scale.y - avatar.root.scale.x) > 1e-4
          || Math.abs(avatar.root.scale.y - avatar.root.scale.z) > 1e-4,
      ).length,
      remoteAvatarRoleVariantCount: new Set(
        remoteAvatars.map(({ armorTypeId }) => armorTypeId),
      ).size,
      remoteAvatarRoleVariants: Object.freeze([
        ...new Set(remoteAvatars.map(({ armorTypeId }) => armorTypeId)),
      ].sort()),
      grenadeProjectileCount: grenadeProjectiles.size + abilityProjectiles.size,
      activeSmokeFieldCount: smokeFields.size,
      launchProjectilePresentation: 'cutline_launch_canister_v1',
      launchCanisterPresentationCount,
      launchPulsePresentationCount,
      weaponProjectileCount: weaponDiagnostics.activeRocketCount,
      activeWeaponEffectCount: weaponDiagnostics.activeTransientCount,
      renderedReliableEventCount,
      acceptedAttackPresentationCount:
        weaponDiagnostics.acceptedAttackPresentationCount,
      confirmedDamagePresentationCount:
        weaponDiagnostics.confirmedDamagePresentationCount,
      confirmedHitPresentationCount:
        weaponDiagnostics.confirmedHitPresentationCount,
      headshotPresentationCount:
        weaponDiagnostics.headshotPresentationCount,
      killPresentationCount:
        weaponDiagnostics.killPresentationCount,
      lastConfirmedDamagePresentation:
        weaponDiagnostics.lastConfirmedDamagePresentation,
      reloadPresentationCount: weaponDiagnostics.reloadPresentationCount,
      throwablePresentationCount: weaponDiagnostics.throwablePresentationCount,
      portalTraversalPresentationCount: portalDiagnostics.cueCount,
      activePortalEffectCount: portalDiagnostics.activeTransientCount,
      staticWorldPortalCount: portalDiagnostics.staticPortalCount,
      staticWorldPortalMeshCount: portalDiagnostics.staticPresentationMeshCount,
      portalAudioDelegation: portalDiagnostics.audioDelegation,
      authoredWeaponAudio: weaponDiagnostics.authoredAudio,
      selectedWeaponId,
      selectedProceduralDefinitionId: firstPersonWeapon?.definitionId ?? null,
      selectedWeaponLabel: firstPersonWeapon?.label ?? null,
      selectedWeaponFamily: firstPersonWeapon?.family ?? null,
      selectedWeaponSilhouette: firstPersonWeapon?.silhouette ?? null,
      selectedWeaponVisualSource: String(
        firstPersonWeapon?.group.userData.weaponVisualSource ?? 'none',
      ),
      selectedFirstPersonHandCount:
        firstPersonWeapon?.firstPersonHandCount ?? 0,
      selectedFirstPersonContactMode:
        String(
          firstPersonWeapon?.group.userData.firstPersonContactMode ?? 'none',
        ),
      selectedFirstPersonMountChildCount:
        firstPersonMountDiagnostics.childCount,
      selectedFirstPersonWeaponRootCount:
        firstPersonMountDiagnostics.weaponRootCount,
      selectedFirstPersonOverlapFree:
        firstPersonMountDiagnostics.overlapFree,
      selectedFirstPersonAimRequested:
        firstPersonWeapon?.aimRequested ?? false,
      selectedFirstPersonAimMix:
        firstPersonWeapon?.aimMix ?? 0,
      selectedFirstPersonAimPresentation:
        firstPersonWeapon?.firstPersonPose.aimPresentation ?? null,
      selectedFirstPersonAimDatumNodeName:
        firstPersonWeapon?.firstPersonPose.aimDatumNodeName ?? null,
      selectedFirstPersonAuthorityMuzzleReferenceBound:
        firstPersonWeapon?.group.userData.authorityMuzzleReferenceBound === true,
      selectedFirstPersonEquipMix:
        firstPersonWeapon?.equipMix ?? 0,
      selectedFirstPersonSprintMix:
        firstPersonWeapon?.sprintMix ?? 0,
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
    smokePresentationAgeTicks.clear();
    processedReliableEvents.clear();
    processedReliableEventOrder.length = 0;
    renderer.dispose();
    disposeObject(scene);
    scene.clear();
  };

  return Object.freeze({ render, diagnostics, dispose });
}
