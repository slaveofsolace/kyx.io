import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { G6_CHARACTER_CANDIDATE } from '../config/g6CharacterCandidate.js';
import {
  advanceRev17SemanticAction,
  getRev17SemanticActionProfile,
  rev17SemanticActionProgress,
  startRev17SemanticAction,
} from './rev17ActionContract.js';
import {
  fitRev17WeaponContact,
  normalizeRev17LocomotionPresentation,
  rev17GaitPlaybackRate,
  rev17RuntimeRoleLod,
} from './rev17PresentationPolish.js';

const TEMPLATES = {
  lod0: null,
  lod1: null,
  firstPerson: null,
};
const LOADING = new Set();
const CHARACTER_CALLBACKS = [];
const FIRST_PERSON_CALLBACKS = [];
const RUNTIME_INSTANCES = new Map();
const FALLBACK_WARNINGS = new Set();
let runtimeInstanceSerial = 0;
let reviewStanceOverride = null;
const CHARACTER_REVISION = G6_CHARACTER_CANDIDATE.revision ?? 'rev17';
const CHARACTER_REVISION_TOKEN = String(CHARACTER_REVISION)
  .replace(/[^a-z0-9]+/gi, '_')
  .toUpperCase();
const CHARACTER_IS_DEFAULT = G6_CHARACTER_CANDIDATE.default ?? false;
const CHARACTER_RUNTIME_ACTIVE = (
  G6_CHARACTER_CANDIDATE.enabled || CHARACTER_IS_DEFAULT
);
const CHARACTER_EVIDENCE_HOOK = (
  `__KYX_G6_${CHARACTER_REVISION_TOKEN}_EVIDENCE__`
);

function registerRuntimeInstance(group, record) {
  if (!CHARACTER_RUNTIME_ACTIVE) return;
  const id = `${CHARACTER_REVISION}-${++runtimeInstanceSerial}`;
  RUNTIME_INSTANCES.set(id, { group, ...record });
  group.userData.rev17RuntimeInstanceId = id;
  group.userData.g6RuntimeInstanceId = id;
}

if (CHARACTER_RUNTIME_ACTIVE && typeof window !== 'undefined') {
  const evidenceApi = Object.freeze({
    revision: CHARACTER_REVISION,
    default: CHARACTER_IS_DEFAULT,
    snapshot: () => {
      const instances = [...RUNTIME_INSTANCES.entries()].map(([id, entry]) => ({
        id,
        kind: entry.kind,
        runtimeRole: entry.runtimeRole,
        lod: entry.lod,
        connectedToScene: !!entry.group.parent,
        visible: entry.group.visible,
        action: entry.group.userData.getActionState?.() ?? null,
        presentation: entry.group.userData.getPresentationState?.() ?? null,
      }));
      return {
        revision: CHARACTER_REVISION,
        default: CHARACTER_IS_DEFAULT,
        instances,
        connectedByRole: instances
          .filter((instance) => instance.connectedToScene)
          .reduce((counts, instance) => {
            const key = instance.runtimeRole;
            counts[key] = (counts[key] ?? 0) + 1;
            return counts;
          }, {}),
      };
    },
    setStanceOverride: (stance) => {
      reviewStanceOverride = stance === 'crouched' || stance === 'standing'
        ? stance
        : null;
      for (const entry of RUNTIME_INSTANCES.values()) {
        entry.group.userData.setStance?.(reviewStanceOverride ?? 'standing');
      }
    },
  });
  window[CHARACTER_EVIDENCE_HOOK] = evidenceApi;
  window.__KYX_G6_CHARACTER_EVIDENCE__ = evidenceApi;
}

const THIRD_PERSON_CLIPS = Object.freeze({
  idle: 'KYX_REV17_TP_IDLE',
  walk: 'KYX_REV17_TP_WALK',
  run: 'KYX_REV17_TP_RUN',
  jump: 'KYX_REV17_TP_JUMP_START',
  air: 'KYX_REV17_TP_AIRBORNE_LOOP',
  land: 'KYX_REV17_TP_LAND',
  fire: 'KYX_REV17_TP_PRIMARY_FIRE',
  reload: 'KYX_REV17_TP_RELOAD',
  hit: 'KYX_REV17_TP_HIT_REACTION_FRONT',
  death: 'KYX_REV17_TP_DEATH_FRONT',
});

const FIRST_PERSON_CLIPS = Object.freeze({
  idle: 'KYX_REV17_FP_IDLE',
  fire: 'KYX_REV17_FP_FIRE',
  reload: 'KYX_REV17_FP_RELOAD',
  sprint: 'KYX_REV17_FP_SPRINT',
  air: 'KYX_REV17_FP_AIRBORNE',
  land: 'KYX_REV17_FP_LAND',
});

const REV17_MELEE_SOCKET_CONTACT = Object.freeze({
  position: Object.freeze([0, 0, 0]),
  rotation: Object.freeze([0, Math.PI, 0]),
  uniformScale: 0.75,
});

export function getRev17MeleeSocketContactTransform() {
  return REV17_MELEE_SOCKET_CONTACT;
}

function notifyIfReady(kind) {
  const callbacks = kind === 'firstPerson'
    ? FIRST_PERSON_CALLBACKS
    : CHARACTER_CALLBACKS;
  const ready = kind === 'firstPerson'
    ? !!TEMPLATES.firstPerson
    : !!TEMPLATES.lod0 && !!TEMPLATES.lod1;
  if (!ready) return;
  callbacks.splice(0).forEach((callback) => callback());
}

function loadTemplate(kind, url, aliases = []) {
  if (!CHARACTER_RUNTIME_ACTIVE || typeof url !== 'string' || url.length === 0) {
    return;
  }
  const templateKeys = [kind, ...aliases];
  const existing = templateKeys
    .map((key) => TEMPLATES[key])
    .find(Boolean);
  if (existing) {
    templateKeys.forEach((key) => { TEMPLATES[key] = existing; });
    notifyIfReady(kind === 'firstPerson' ? 'firstPerson' : 'character');
    return;
  }
  if (templateKeys.some((key) => LOADING.has(key))) return;
  templateKeys.forEach((key) => LOADING.add(key));
  new GLTFLoader().load(
    url,
    (gltf) => {
      gltf.scene.traverse((object) => {
        if (!object.isMesh) return;
        object.castShadow = true;
        object.receiveShadow = true;
        object.frustumCulled = false;
      });
      const template = {
        scene: gltf.scene,
        animations: gltf.animations,
      };
      templateKeys.forEach((key) => {
        TEMPLATES[key] = template;
        LOADING.delete(key);
      });
      notifyIfReady(kind === 'firstPerson' ? 'firstPerson' : 'character');
    },
    undefined,
    (error) => {
      console.warn(`[Rev17Character] ${kind} load failed:`, error?.message);
      templateKeys.forEach((key) => LOADING.delete(key));
    },
  );
}

export function preloadRev17Character(onLoad) {
  if (!CHARACTER_RUNTIME_ACTIVE) {
    queueMicrotask(() => onLoad?.());
    return;
  }
  if (isRev17CharacterReady()) {
    onLoad?.();
    return;
  }
  if (onLoad) CHARACTER_CALLBACKS.push(onLoad);
  if (G6_CHARACTER_CANDIDATE.assets.lod0 === G6_CHARACTER_CANDIDATE.assets.lod1) {
    loadTemplate(
      'lod0',
      G6_CHARACTER_CANDIDATE.assets.lod0,
      ['lod1'],
    );
  } else {
    loadTemplate('lod0', G6_CHARACTER_CANDIDATE.assets.lod0);
    loadTemplate('lod1', G6_CHARACTER_CANDIDATE.assets.lod1);
  }
}

export function isRev17CharacterReady() {
  return !!TEMPLATES.lod0 && !!TEMPLATES.lod1;
}

export function preloadRev17FirstPerson(onLoad) {
  if (!CHARACTER_RUNTIME_ACTIVE) {
    queueMicrotask(() => onLoad?.());
    return;
  }
  if (TEMPLATES.firstPerson) {
    onLoad?.();
    return;
  }
  if (onLoad) FIRST_PERSON_CALLBACKS.push(onLoad);
  loadTemplate('firstPerson', G6_CHARACTER_CANDIDATE.assets.firstPerson);
}

function cloneMaterials(root) {
  const materials = {
    body: [],
    armor: [],
    visor: [],
    rifle: [],
  };
  root.traverse((object) => {
    if (!object.isMesh) return;
    const sourceMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    const cloned = sourceMaterials.map((material) => material.clone());
    object.material = Array.isArray(object.material) ? cloned : cloned[0];
    object.castShadow = true;
    object.receiveShadow = true;
    object.frustumCulled = false;
    let includesRifleMaterial = false;
    cloned.forEach((material) => {
      const materialLabel = material.name ?? '';
      const fallbackObjectLabel = materialLabel ? '' : object.name;
      const label = `${materialLabel} ${fallbackObjectLabel}`;
      const bucket = /RIFLE/i.test(label)
        ? materials.rifle
        : /VISOR/i.test(label)
          ? materials.visor
          : /ARMOR|SLEEVE|KNEE/i.test(label)
            ? materials.armor
            : materials.body;
      bucket.push(material);
      includesRifleMaterial ||= bucket === materials.rifle;
    });
    if (includesRifleMaterial) object.userData.noHit = true;
  });
  return materials;
}

function tintMaterials(materials, skin, armorTypeId = 'assault', armorSkin = null) {
  const armorDefaults = {
    assault: 0xb8c4cd,
    recon: 0x5a8fac,
    heavy: 0x9b5f38,
    stealth: 0x505363,
  };
  const primary = armorSkin?.primary ?? skin?.primary ?? armorDefaults[armorTypeId] ?? armorDefaults.assault;
  const secondary = armorSkin?.secondary ?? skin?.secondary ?? 0x303942;
  const armorTint = new THREE.Color(primary).lerp(new THREE.Color(0xffffff), 0.42);
  const bodyTint = new THREE.Color(secondary).lerp(new THREE.Color(0xffffff), 0.74);
  const allCharacterMaterials = [
    ...materials.body,
    ...materials.armor,
    ...materials.visor,
  ];
  const preservesAuthoredDarkBase = allCharacterMaterials.some(
    (material) => /^KYX_REV(?:30|38)_/i.test(material.name ?? ''),
  );

  if (preservesAuthoredDarkBase) {
    const teamPrimary = new THREE.Color(primary);
    const teamSecondary = new THREE.Color(secondary);
    const readableArmor = teamPrimary.clone().lerp(new THREE.Color(0xffffff), 0.16);
    const readableSuit = teamSecondary.clone().lerp(new THREE.Color(0xffffff), 0.22);
    const visorAccent = new THREE.Color(
      armorSkin?.accent ?? skin?.accent ?? 0x2dcbff,
    );
    for (const material of materials.armor) {
      material.color?.lerp(readableArmor, 0.38);
      material.roughness = Math.max(material.roughness ?? 0.36, 0.36);
      material.metalness = Math.min(material.metalness ?? 0.42, 0.46);
    }
    for (const material of materials.body) {
      material.color?.lerp(readableSuit, 0.26);
      material.roughness = Math.max(material.roughness ?? 0.42, 0.42);
    }
    for (const material of materials.visor) {
      material.color?.lerp(visorAccent, 0.55);
      if (material.emissive) {
        material.emissive.copy(visorAccent).multiplyScalar(0.48);
        material.emissiveIntensity = Math.max(
          material.emissiveIntensity ?? 0,
          0.58,
        );
      }
    }
    return;
  }

  for (const material of materials.armor) {
    material.color?.copy(armorTint);
    material.roughness = armorSkin?.roughness ?? 0.48;
    material.metalness = armorSkin?.metalness ?? 0.42;
  }
  for (const material of materials.body) {
    material.color?.copy(bodyTint);
    material.roughness = Math.max(material.roughness ?? 0.72, 0.58);
  }
  for (const material of materials.visor) {
    material.color?.copy(new THREE.Color(primary));
  }
}

function createActionController(root, clips, clipNames) {
  const mixer = new THREE.AnimationMixer(root);
  const byName = new Map(clips.map((clip) => [clip.name, clip]));
  const actions = {};
  for (const [key, clipName] of Object.entries(clipNames)) {
    const clip = byName.get(clipName);
    if (!clip) continue;
    const action = mixer.clipAction(clip);
    action.enabled = true;
    action.setEffectiveWeight(1);
    actions[key] = action;
  }

  let desired = actions.idle ? 'idle' : Object.keys(actions)[0];
  let active = null;
  let activeKey = null;
  let playingOnce = false;
  let desiredPlaybackRate = 1;

  const play = (
    key,
    { once = false, fade = 0.14, durationSeconds = null } = {},
  ) => {
    const next = actions[key];
    if (!next || (next === active && !once)) return;
    next.enabled = true;
    next.reset();
    const playbackRate = once ? 1 : desiredPlaybackRate;
    next.setEffectiveTimeScale(playbackRate);
    if (!once && playbackRate < 0) {
      next.time = Math.max(0, next.getClip().duration - Number.EPSILON);
    }
    if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
      next.setDuration(durationSeconds);
    }
    next.setEffectiveWeight(1);
    if (once) {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = false;
    }
    next.play();
    if (active && active !== next) active.crossFadeTo(next, fade, false);
    active = next;
    activeKey = key;
    playingOnce = once;
  };

  const setDesired = (key) => {
    if (!actions[key]) return;
    desired = key;
    if (!playingOnce) play(key);
  };

  const setPlaybackRate = (rate) => {
    if (!Number.isFinite(rate) || rate === 0) return;
    const previousSign = Math.sign(desiredPlaybackRate);
    desiredPlaybackRate = THREE.MathUtils.clamp(rate, -1.7, 1.7);
    if (!active || playingOnce) return;
    if (previousSign !== Math.sign(desiredPlaybackRate)) {
      const duration = active.getClip().duration;
      active.time = Math.max(
        0,
        Math.min(duration - Number.EPSILON, duration - active.time),
      );
    }
    active.setEffectiveTimeScale(desiredPlaybackRate);
  };

  const playOnce = (key, fade = 0.08, durationSeconds = null) => {
    if (!actions[key]) return;
    play(key, { once: true, fade, durationSeconds });
  };

  const cancelOnce = (fade = 0.08) => {
    if (!playingOnce) return;
    playingOnce = false;
    play(desired, { fade });
  };

  mixer.addEventListener('finished', ({ action }) => {
    if (action !== active || !playingOnce) return;
    playingOnce = false;
    play(desired, { fade: 0.12 });
  });

  play(desired, { fade: 0 });
  return {
    mixer,
    actions,
    play,
    playOnce,
    cancelOnce,
    setDesired,
    setPlaybackRate,
    get activeKey() { return activeKey; },
    get playingOnce() { return playingOnce; },
    get playbackRate() { return desiredPlaybackRate; },
  };
}

function warnFallbackOnce(runtimeRole, kind, fallback) {
  if (!import.meta.env?.DEV) return;
  const key = `${runtimeRole}:${kind}:${fallback}`;
  if (FALLBACK_WARNINGS.has(key)) return;
  FALLBACK_WARNINGS.add(key);
  console.warn(
    `[Rev17Character] ${runtimeRole} ${kind} uses named fallback `
    + `"${fallback}"; no authored Rev17 ${kind} clip is claimed.`,
  );
}

function createSemanticActionDriver(
  controller,
  root,
  runtimeRole,
  {
    authoredClipOverrides = {},
    fallbackOverrides = {},
  } = {},
) {
  let action = null;
  let activeAuthoredClipKey = null;
  let activeFallback = null;
  let actionSequence = 0;
  let lastStarted = null;
  let lastMarkers = Object.freeze([]);
  const bones = {
    chest: root.getObjectByName('chest'),
    spine: root.getObjectByName('spine_02'),
    upperArmLeft: root.getObjectByName('upper_arm.L'),
    upperArmRight: root.getObjectByName('upper_arm.R'),
    forearmLeft: root.getObjectByName('forearm.L'),
    forearmRight: root.getObjectByName('forearm.R'),
  };
  const offset = new THREE.Quaternion();
  const euler = new THREE.Euler();

  const applyOffset = (bone, x = 0, y = 0, z = 0) => {
    if (!bone) return;
    offset.setFromEuler(euler.set(x, y, z));
    bone.quaternion.multiply(offset);
  };

  const trigger = (request) => {
    const data = typeof request === 'string' ? { kind: request } : request;
    const profile = getRev17SemanticActionProfile(data?.kind);
    if (!profile) return false;
    action = startRev17SemanticAction(data.kind, data.durationSeconds);
    const initial = advanceRev17SemanticAction(action, 0);
    action = initial.action;
    lastMarkers = initial.markers;

    const authoredClipKey = Object.hasOwn(authoredClipOverrides, data.kind)
      ? authoredClipOverrides[data.kind]
      : profile.authoredClipKey;
    const fallback = Object.hasOwn(fallbackOverrides, data.kind)
      ? fallbackOverrides[data.kind]
      : profile.fallback;
    activeAuthoredClipKey = authoredClipKey;
    activeFallback = fallback;
    actionSequence += 1;
    lastStarted = Object.freeze({
      sequence: actionSequence,
      kind: data.kind,
      durationSeconds: action.durationSeconds,
      authoredClipKey,
      fallback,
    });
    if (authoredClipKey) {
      controller.playOnce(
        authoredClipKey,
        data.kind === 'fire' ? 0.04 : 0.08,
        action.durationSeconds,
      );
    } else if (fallback) {
      if (data.kind === 'equip') controller.cancelOnce();
      warnFallbackOnce(runtimeRole, data.kind, fallback);
    }
    return true;
  };

  const tick = (deltaSeconds) => {
    if (!action) {
      lastMarkers = Object.freeze([]);
      return;
    }
    const advanced = advanceRev17SemanticAction(action, deltaSeconds);
    action = advanced.action;
    lastMarkers = advanced.markers;
    const progress = rev17SemanticActionProgress(action);
    const pulse = Math.sin(progress * Math.PI);
    const smooth = (value) => value * value * (3 - 2 * value);

    // These bounded post-mixer accents make currently unsupported semantic
    // actions visible without pretending they are authored clips. Socketed
    // weapons remain children of the hand bones and retain their contact.
    if (action.kind === 'equip') {
      const settle = smooth(Math.min(1, progress / 0.72))
        * (1 - smooth(Math.max(0, (progress - 0.72) / 0.28)));
      applyOffset(bones.chest, 0.035 * settle, 0, 0);
      applyOffset(bones.upperArmLeft, -0.16 * settle, 0, -0.1 * settle);
      applyOffset(bones.forearmLeft, -0.08 * settle, 0, -0.05 * settle);
      applyOffset(bones.upperArmRight, -0.2 * settle, 0, 0.14 * settle);
    } else if (action.kind === 'melee') {
      const windup = smooth(Math.min(1, progress / 0.22));
      const strike = smooth(Math.min(1, Math.max(0, (progress - 0.22) / 0.28)));
      const recover = smooth(Math.min(1, Math.max(0, (progress - 0.5) / 0.5)));
      const sweep = strike * (1 - recover);
      const guard = windup * (1 - strike);
      applyOffset(bones.spine, 0.02 * sweep, -0.18 * guard + 0.34 * sweep, 0);
      applyOffset(bones.chest, 0, -0.22 * guard + 0.42 * sweep, 0.06 * sweep);
      applyOffset(
        bones.upperArmRight,
        -0.48 * guard - 0.92 * sweep,
        0.18 * sweep,
        -0.28 * guard - 0.58 * sweep,
      );
      applyOffset(
        bones.forearmRight,
        -0.26 * guard - 0.38 * sweep,
        0,
        0.14 * guard + 0.3 * sweep,
      );
    } else if (action.kind === 'ability') {
      const commit = smooth(Math.min(1, progress / 0.44));
      const recover = smooth(Math.min(1, Math.max(0, (progress - 0.44) / 0.56)));
      const throwWeight = commit * (1 - recover);
      applyOffset(bones.chest, -0.04 * throwWeight, 0.18 * throwWeight, 0);
      applyOffset(
        bones.upperArmRight,
        -1.02 * throwWeight,
        0.12 * throwWeight,
        0.26 * throwWeight,
      );
      applyOffset(bones.forearmRight, -0.3 * throwWeight, 0, -0.16 * throwWeight);
    } else if (action.kind === 'fire') {
      applyOffset(bones.spine, -0.025 * pulse, 0, 0);
      applyOffset(bones.chest, -0.04 * pulse, 0, 0);
    }
    if (action.completed) {
      action = null;
      activeAuthoredClipKey = null;
      activeFallback = null;
    }
  };

  return Object.freeze({
    trigger,
    tick,
    snapshot: () => Object.freeze({
      kind: action?.kind ?? 'idle',
      sequence: actionSequence,
      lastStarted,
      elapsedSeconds: action?.elapsedSeconds ?? 0,
      durationSeconds: action?.durationSeconds ?? null,
      markers: lastMarkers,
      authoredClipKey: action ? activeAuthoredClipKey : null,
      fallback: action ? activeFallback : null,
    }),
  });
}

export function buildRev17Character(
  skin = null,
  armorTypeId = 'assault',
  opts = {},
) {
  const runtimeRole = opts.runtimeRole ?? 'preview';
  const runtimeLod = rev17RuntimeRoleLod(runtimeRole);
  const template = runtimeLod === 1 ? TEMPLATES.lod1 : TEMPLATES.lod0;
  if (!template) return null;

  const root = cloneSkeleton(template.scene);
  const materials = cloneMaterials(root);
  tintMaterials(materials, skin, armorTypeId);

  const group = new THREE.Group();
  group.name = `KYX_${CHARACTER_REVISION_TOKEN}_${runtimeLod === 1 ? 'REMOTE_LOD1' : 'PLAYER_LOD0'}`;
  group.add(root);

  // Cache neutral-pose framing metrics before the mixer starts posing the
  // skeleton. Re-measuring a live SkinnedMesh later can produce a degenerate
  // box, which previously left the loadout turntable with NaN transforms.
  group.updateWorldMatrix(true, true);
  const framingBox = new THREE.Box3().setFromObject(group);
  const framingSize = framingBox.getSize(new THREE.Vector3());
  const framingCenter = framingBox.getCenter(new THREE.Vector3());

  const controller = createActionController(
    root,
    template.animations,
    THIRD_PERSON_CLIPS,
  );
  const semanticActions = createSemanticActionDriver(
    controller,
    root,
    runtimeRole,
  );
  let grounded = true;
  let targetCrouchMix = 0;
  let smoothCrouchMix = 0;
  let locomotion = normalizeRev17LocomotionPresentation(0);
  let targetAimPitch = 0;
  let targetAimYaw = 0;
  let smoothAimPitch = 0;
  let smoothAimYaw = 0;
  let smoothRightRatio = 0;
  let smoothForwardRatio = 1;
  let smoothStrafeLean = 0;
  let smoothTurnRate = 0;
  let locomotionClock = 0;
  let attachedWeapon = null;
  let weaponContact = null;
  const embeddedRifle = [];
  root.traverse((object) => {
    if (object.isMesh && /RIFLE/i.test(object.name)) {
      object.visible = false;
      embeddedRifle.push(object);
    }
  });
  const findPoseBone = (...names) => names
    .map((name) => root.getObjectByName(name))
    .find(Boolean) ?? null;
  const poseBones = {
    root: root.getObjectByName('root'),
    spine1: root.getObjectByName('spine_01'),
    spine2: root.getObjectByName('spine_02'),
    chest: root.getObjectByName('chest'),
    neck: root.getObjectByName('neck'),
    head: root.getObjectByName('head'),
    thighLeft: findPoseBone('thigh_anchor.L', 'thigh_anchorL'),
    thighRight: findPoseBone('thigh_anchor.R', 'thigh_anchorR'),
    shinLeft: findPoseBone('shin_anchor.L', 'shin_anchorL'),
    shinRight: findPoseBone('shin_anchor.R', 'shin_anchorR'),
    upperArmLeft: findPoseBone('upper_arm.L', 'upper_armL'),
    forearmLeft: findPoseBone('forearm.L', 'forearmL'),
    palmLeft: findPoseBone('palm.L', 'palmL'),
  };
  const poseEuler = new THREE.Euler();
  const poseQuaternion = new THREE.Quaternion();
  const inversePoseQuaternion = new THREE.Quaternion();
  const previousPoseOffsets = new Map();
  const currentPoseOffsets = new Map();
  let presentationFramePrepared = false;
  const ikBonePosition = new THREE.Vector3();
  const ikEndPosition = new THREE.Vector3();
  const ikTargetPosition = new THREE.Vector3();
  const ikCurrentDirection = new THREE.Vector3();
  const ikTargetDirection = new THREE.Vector3();
  const ikBoneWorld = new THREE.Quaternion();
  const ikParentWorld = new THREE.Quaternion();
  const ikDeltaWorld = new THREE.Quaternion();
  const ikLimitedWorld = new THREE.Quaternion();
  const ikDesiredLocal = new THREE.Quaternion();
  const ikIdentity = new THREE.Quaternion();

  const showEmbeddedRifle = (visible) => {
    embeddedRifle.forEach((object) => { object.visible = visible; });
  };

  const setLocomotion = (
    speed,
    isGrounded = true,
    sprinting = false,
    signalOrStrafe = 0,
    legacyForwardRatio = null,
    legacyTurnRateRadiansPerSecond = 0,
  ) => {
    locomotion = normalizeRev17LocomotionPresentation(
      speed,
      signalOrStrafe,
      legacyForwardRatio,
      legacyTurnRateRadiansPerSecond,
    );
    if (!isGrounded) {
      controller.setDesired('air');
      controller.setPlaybackRate(1);
      if (grounded) controller.playOnce('jump');
    } else {
      const key = sprinting || locomotion.planarSpeed > 4.2
        ? 'run'
        : locomotion.planarSpeed > 0.45
          ? 'walk'
          : 'idle';
      controller.setPlaybackRate(rev17GaitPlaybackRate(key, locomotion));
      controller.setDesired(key);
      if (!grounded) controller.playOnce('land');
    }
    grounded = isGrounded;
  };

  const setAim = (pitch = 0, yaw = 0) => {
    targetAimPitch = THREE.MathUtils.clamp(
      Number.isFinite(pitch) ? pitch : 0,
      -1.15,
      1.15,
    );
    targetAimYaw = THREE.MathUtils.clamp(
      Number.isFinite(yaw) ? yaw : 0,
      -0.95,
      0.95,
    );
  };

  const setStance = (stance = 'standing') => {
    const effectiveStance = reviewStanceOverride ?? stance;
    targetCrouchMix = effectiveStance === 'crouched' ? 1 : 0;
  };

  const beginPresentationFrame = () => {
    for (const [bone, offset] of previousPoseOffsets) {
      inversePoseQuaternion.copy(offset).invert();
      bone.quaternion.multiply(inversePoseQuaternion);
    }
    previousPoseOffsets.clear();
    currentPoseOffsets.clear();
    presentationFramePrepared = true;
  };

  const applyPoseOffset = (bone, x = 0, y = 0, z = 0) => {
    if (!bone) return;
    poseQuaternion.setFromEuler(poseEuler.set(x, y, z, 'XYZ'));
    bone.quaternion.multiply(poseQuaternion);
    const accumulated = currentPoseOffsets.get(bone) ?? new THREE.Quaternion();
    accumulated.multiply(poseQuaternion);
    currentPoseOffsets.set(bone, accumulated);
  };

  const rotateBoneToward = (
    bone,
    end,
    target,
    weight,
    maximumRadians,
  ) => {
    if (!bone || !end || !target || weight <= 0) return;
    root.updateMatrixWorld(true);
    bone.getWorldPosition(ikBonePosition);
    end.getWorldPosition(ikEndPosition);
    target.getWorldPosition(ikTargetPosition);
    ikCurrentDirection.subVectors(ikEndPosition, ikBonePosition);
    ikTargetDirection.subVectors(ikTargetPosition, ikBonePosition);
    if (
      ikCurrentDirection.lengthSq() < 1e-8
      || ikTargetDirection.lengthSq() < 1e-8
    ) return;
    ikDeltaWorld.setFromUnitVectors(
      ikCurrentDirection.normalize(),
      ikTargetDirection.normalize(),
    );
    const angle = 2 * Math.acos(
      THREE.MathUtils.clamp(Math.abs(ikDeltaWorld.w), 0, 1),
    );
    const limitedWeight = Math.min(
      weight,
      angle > 1e-5 ? maximumRadians / angle : weight,
    );
    ikLimitedWorld.slerpQuaternions(
      ikIdentity.identity(),
      ikDeltaWorld,
      THREE.MathUtils.clamp(limitedWeight, 0, 1),
    );
    bone.getWorldQuaternion(ikBoneWorld);
    ikLimitedWorld.multiply(ikBoneWorld);
    ikParentWorld.identity();
    bone.parent?.getWorldQuaternion(ikParentWorld);
    ikDesiredLocal.copy(ikParentWorld).invert().multiply(ikLimitedWorld);
    bone.quaternion.copy(ikDesiredLocal);
  };

  const armorTick = (deltaSeconds) => {
    if (!presentationFramePrepared) beginPresentationFrame();
    const dt = THREE.MathUtils.clamp(
      Number.isFinite(deltaSeconds) ? deltaSeconds : 0,
      0,
      0.1,
    );
    locomotionClock += dt;
    const fast = 1 - Math.exp(-dt * 12);
    const medium = 1 - Math.exp(-dt * 8);
    smoothAimPitch += (targetAimPitch - smoothAimPitch) * fast;
    smoothAimYaw += (targetAimYaw - smoothAimYaw) * fast;
    smoothRightRatio += (locomotion.rightRatio - smoothRightRatio) * medium;
    smoothForwardRatio += (locomotion.forwardRatio - smoothForwardRatio) * medium;
    smoothStrafeLean += (locomotion.strafeLean - smoothStrafeLean) * medium;
    smoothTurnRate += (
      locomotion.turnRateRadiansPerSecond - smoothTurnRate
    ) * medium;
    smoothCrouchMix += (targetCrouchMix - smoothCrouchMix) * fast;

    const moving = grounded && locomotion.planarSpeed > 0.35;
    const backward = Math.max(0, -smoothForwardRatio);
    const lateral = smoothRightRatio;
    const cadence = controller.activeKey === 'run' ? 7.9 : 6.05;
    const footPhase = Math.sin(locomotionClock * cadence);

    // Keep the lower body biased toward measured travel while the shoulders and
    // weapon remain aligned with authority yaw/aim. This is intentionally
    // bounded: pure strafes reach about 10 degrees, not the prior 45-degree skid.
    if (moving) {
      applyPoseOffset(poseBones.root, 0, lateral * 0.17, 0);
      applyPoseOffset(poseBones.spine1, 0, lateral * -0.12, smoothStrafeLean * 0.055);
      applyPoseOffset(poseBones.spine2, backward * -0.045, lateral * -0.04, 0);
      applyPoseOffset(
        poseBones.thighLeft,
        backward * 0.08,
        lateral * 0.08,
        lateral * footPhase * 0.045,
      );
      applyPoseOffset(
        poseBones.thighRight,
        backward * 0.08,
        lateral * 0.08,
        lateral * footPhase * -0.045,
      );
      applyPoseOffset(poseBones.shinLeft, backward * 0.07, 0, 0);
      applyPoseOffset(poseBones.shinRight, backward * 0.07, 0, 0);
    } else if (grounded && Math.abs(smoothTurnRate) > 0.12) {
      const turn = THREE.MathUtils.clamp(smoothTurnRate / 4.5, -1, 1);
      const turnStep = Math.sin(locomotionClock * 7 + turn * 0.7);
      applyPoseOffset(poseBones.root, 0, turn * 0.12, 0);
      applyPoseOffset(poseBones.spine1, 0, turn * -0.09, 0);
      applyPoseOffset(poseBones.thighLeft, turnStep * 0.035, turn * -0.08, 0);
      applyPoseOffset(poseBones.thighRight, turnStep * -0.035, turn * -0.08, 0);
    }

    if (smoothCrouchMix > 1e-4) {
      applyPoseOffset(poseBones.spine1, smoothCrouchMix * 0.14, 0, 0);
      applyPoseOffset(poseBones.spine2, smoothCrouchMix * -0.05, 0, 0);
      applyPoseOffset(poseBones.thighLeft, smoothCrouchMix * 0.62, 0, 0);
      applyPoseOffset(poseBones.thighRight, smoothCrouchMix * 0.62, 0, 0);
      applyPoseOffset(poseBones.shinLeft, smoothCrouchMix * -0.92, 0, 0);
      applyPoseOffset(poseBones.shinRight, smoothCrouchMix * -0.92, 0, 0);
    }

    // Aim is layered after locomotion so camera pitch/yaw remains legible while
    // the authored fire/reload clips continue to own the arms.
    applyPoseOffset(
      poseBones.spine1,
      smoothAimPitch * 0.14,
      smoothAimYaw * 0.18,
      0,
    );
    applyPoseOffset(
      poseBones.spine2,
      smoothAimPitch * 0.22,
      smoothAimYaw * 0.27,
      0,
    );
    applyPoseOffset(
      poseBones.chest,
      smoothAimPitch * 0.27,
      smoothAimYaw * 0.3,
      0,
    );
    applyPoseOffset(
      poseBones.neck,
      smoothAimPitch * 0.13,
      smoothAimYaw * 0.13,
      0,
    );
    applyPoseOffset(
      poseBones.head,
      smoothAimPitch * 0.18,
      smoothAimYaw * 0.12,
      0,
    );

    // Conservative two-bone support-hand contact. Reload/equip intentionally
    // release most of the IK weight so authored hand separation is preserved.
    const actionKind = semanticActions.snapshot().kind;
    const supportWeight = actionKind === 'reload' || actionKind === 'equip'
      ? 0.08
      : actionKind === 'ability' || actionKind === 'melee'
        ? 0
        : grounded
          ? 0.62
          : 0.42;
    if (weaponContact?.supportTarget && supportWeight > 0) {
      for (let iteration = 0; iteration < 2; iteration += 1) {
        rotateBoneToward(
          poseBones.upperArmLeft,
          poseBones.palmLeft,
          weaponContact.supportTarget,
          supportWeight * 0.55,
          0.34,
        );
        rotateBoneToward(
          poseBones.forearmLeft,
          poseBones.palmLeft,
          weaponContact.supportTarget,
          supportWeight * 0.72,
          0.42,
        );
      }
    }
    for (const [bone, offset] of currentPoseOffsets) {
      previousPoseOffsets.set(bone, offset.clone());
    }
    presentationFramePrepared = false;
  };

  const attachWeapon = (weapon, isMelee = false) => {
    attachedWeapon?.removeFromParent();
    attachedWeapon = null;
    weaponContact = null;
    showEmbeddedRifle(false);
    if (!weapon) return;
    const socket = root.getObjectByName('socket_weapon_r')
      || root.getObjectByName('palm.R');
    if (!socket) return;
    const authoredMuzzle = root.getObjectByName('socket_muzzle');
    socket.add(weapon);
    weaponContact = fitRev17WeaponContact(
      weapon,
      socket,
      authoredMuzzle,
      isMelee,
    );
    attachedWeapon = weapon;
  };

  group.userData = {
    ...group.userData,
    isHuman: true,
    isRev17Candidate: true,
    isG6CharacterCandidate: true,
    candidateRevision: CHARACTER_REVISION,
    candidateDefault: CHARACTER_IS_DEFAULT,
    runtimeRole,
    armorTypeId,
    standHeight: framingSize.y || 1.8,
    feetY: framingBox.min.y,
    centerX: framingCenter.x,
    centerZ: framingCenter.z,
    primaryMat: materials.armor[0] ?? materials.body[0] ?? null,
    materials,
    mixer: controller.mixer,
    setMotion: (name) => controller.setDesired(name === 'airborne' ? 'air' : name),
    setLocomotion,
    setAim,
    beginPresentationFrame,
    setStance,
    getStanceOffsetY: () => -0.18 * smoothCrouchMix,
    armorTick,
    triggerAction: (request) => semanticActions.trigger(request),
    getActionState: () => semanticActions.snapshot(),
    getPresentationState: () => Object.freeze({
      locomotion,
      activeClipKey: controller.activeKey,
      gaitPlaybackRate: controller.playbackRate,
      grounded,
      crouchMix: smoothCrouchMix,
      stanceOffsetY: -0.18 * smoothCrouchMix,
      aimPitch: smoothAimPitch,
      aimYaw: smoothAimYaw,
      weaponContact: weaponContact
        ? Object.freeze({
            family: weaponContact.family,
            socketName: weaponContact.socketName,
            muzzleNodeName: weaponContact.muzzleNodeName,
            supportHandContact: weaponContact.supportTarget !== null,
          })
        : null,
    }),
    actionTick: (dt) => semanticActions.tick(dt),
    triggerEquip: (durationSeconds) => semanticActions.trigger({
      kind: 'equip',
      durationSeconds,
    }),
    triggerFire: () => semanticActions.trigger('fire'),
    triggerReload: (durationSeconds) => semanticActions.trigger({
      kind: 'reload',
      durationSeconds,
    }),
    triggerMelee: (durationSeconds) => semanticActions.trigger({
      kind: 'melee',
      durationSeconds,
    }),
    triggerAbility: (durationSeconds) => semanticActions.trigger({
      kind: 'ability',
      durationSeconds,
    }),
    triggerHit: () => controller.playOnce('hit'),
    triggerJump: () => {
      grounded = false;
      controller.setDesired('air');
      controller.playOnce('jump');
    },
    triggerDeath: () => controller.playOnce('death', 0.12),
    resetPresentation: () => {
      controller.cancelOnce(0.06);
      controller.setPlaybackRate(1);
      controller.setDesired('idle');
    },
    attachWeapon,
  };
  registerRuntimeInstance(group, {
    kind: 'thirdPerson',
    runtimeRole,
    lod: runtimeLod,
  });
  return group;
}

export function tintRev17Character(group, skin, armorSkin = null) {
  if (!group?.userData?.isRev17Candidate) return;
  tintMaterials(
    group.userData.materials,
    skin,
    group.userData.armorTypeId,
    armorSkin,
  );
}

export function buildRev17FirstPerson() {
  const template = TEMPLATES.firstPerson;
  if (!template) return null;
  const root = cloneSkeleton(template.scene);
  const materials = cloneMaterials(root);
  root.scale.setScalar(0.42);
  root.position.set(0, -0.42, -0.35);

  const group = new THREE.Group();
  group.name = 'KYX_REV17_FIRST_PERSON_CANDIDATE';
  group.add(root);
  const controller = createActionController(
    root,
    template.animations,
    FIRST_PERSON_CLIPS,
  );
  const semanticActions = createSemanticActionDriver(
    controller,
    root,
    'firstPerson',
    {
      authoredClipOverrides: { reload: null },
      fallbackOverrides: { reload: 'bounded_viewmodel_reload_envelope' },
    },
  );
  group.userData = {
    ...group.userData,
    isRev17FirstPersonCandidate: true,
    candidateRevision: 'rev17',
    materials,
    mixer: controller.mixer,
    muzzle: root.getObjectByName('socket_muzzle'),
    setState: (state) => controller.setDesired(state),
    triggerAction: (request) => semanticActions.trigger(request),
    getActionState: () => semanticActions.snapshot(),
    actionTick: (dt) => semanticActions.tick(dt),
    triggerFire: () => semanticActions.trigger('fire'),
    // The authored FP_RELOAD clip remains embedded and structurally validated,
    // but the runtime uses a bounded camera-space dip until a dedicated
    // viewmodel retarget receives human visual approval.
    triggerReload: (durationSeconds) => {
      controller.setDesired('idle');
      semanticActions.trigger({ kind: 'reload', durationSeconds });
    },
    triggerLand: () => controller.playOnce('land', 0.06),
  };
  registerRuntimeInstance(group, {
    kind: 'firstPerson',
    runtimeRole: 'firstPerson',
    lod: null,
  });
  return group;
}
