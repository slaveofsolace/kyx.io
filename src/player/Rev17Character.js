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

function registerRuntimeInstance(group, record) {
  if (!G6_CHARACTER_CANDIDATE.enabled) return;
  const id = `rev17-${++runtimeInstanceSerial}`;
  RUNTIME_INSTANCES.set(id, { group, ...record });
  group.userData.rev17RuntimeInstanceId = id;
}

if (G6_CHARACTER_CANDIDATE.enabled && typeof window !== 'undefined') {
  window.__KYX_G6_REV17_EVIDENCE__ = Object.freeze({
    revision: 'rev17',
    default: false,
    snapshot: () => {
      const instances = [...RUNTIME_INSTANCES.entries()].map(([id, entry]) => ({
        id,
        kind: entry.kind,
        runtimeRole: entry.runtimeRole,
        lod: entry.lod,
        connectedToScene: !!entry.group.parent,
        visible: entry.group.visible,
        action: entry.group.userData.getActionState?.() ?? null,
      }));
      return {
        revision: 'rev17',
        default: false,
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
  });
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

function loadTemplate(kind, url) {
  if (TEMPLATES[kind] || LOADING.has(kind)) return;
  LOADING.add(kind);
  new GLTFLoader().load(
    url,
    (gltf) => {
      gltf.scene.traverse((object) => {
        if (!object.isMesh) return;
        object.castShadow = true;
        object.receiveShadow = true;
        object.frustumCulled = false;
      });
      TEMPLATES[kind] = {
        scene: gltf.scene,
        animations: gltf.animations,
      };
      LOADING.delete(kind);
      notifyIfReady(kind === 'firstPerson' ? 'firstPerson' : 'character');
    },
    undefined,
    (error) => {
      console.warn(`[Rev17Character] ${kind} load failed:`, error?.message);
      LOADING.delete(kind);
    },
  );
}

export function preloadRev17Character(onLoad) {
  if (isRev17CharacterReady()) {
    onLoad?.();
    return;
  }
  if (onLoad) CHARACTER_CALLBACKS.push(onLoad);
  loadTemplate('lod0', G6_CHARACTER_CANDIDATE.assets.lod0);
  loadTemplate('lod1', G6_CHARACTER_CANDIDATE.assets.lod1);
}

export function isRev17CharacterReady() {
  return !!TEMPLATES.lod0 && !!TEMPLATES.lod1;
}

export function preloadRev17FirstPerson(onLoad) {
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
    const label = `${object.name} ${cloned.map((material) => material.name).join(' ')}`;
    const bucket = /RIFLE/i.test(label)
      ? materials.rifle
      : /ARMOR|SLEEVE/i.test(label)
        ? materials.armor
        : materials.body;
    bucket.push(...cloned);
    if (/RIFLE/i.test(label)) object.userData.noHit = true;
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

  for (const material of materials.armor) {
    material.color?.copy(armorTint);
    material.roughness = armorSkin?.roughness ?? 0.48;
    material.metalness = armorSkin?.metalness ?? 0.42;
  }
  for (const material of materials.body) {
    material.color?.copy(bodyTint);
    material.roughness = Math.max(material.roughness ?? 0.72, 0.58);
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

  const play = (
    key,
    { once = false, fade = 0.14, durationSeconds = null } = {},
  ) => {
    const next = actions[key];
    if (!next || (next === active && !once)) return;
    next.enabled = true;
    next.reset();
    next.setEffectiveTimeScale(1);
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
    get activeKey() { return activeKey; },
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
    upperArmLeft: root.getObjectByName('upper_arm.L'),
    upperArmRight: root.getObjectByName('upper_arm.R'),
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

    // These bounded post-mixer accents make currently unsupported semantic
    // actions visible without pretending they are authored clips. Socketed
    // weapons remain children of the hand bones and retain their contact.
    if (action.kind === 'equip') {
      applyOffset(bones.chest, 0.04 * pulse, 0, 0);
      applyOffset(bones.upperArmLeft, -0.18 * pulse, 0, -0.12 * pulse);
      applyOffset(bones.upperArmRight, -0.22 * pulse, 0, 0.16 * pulse);
    } else if (action.kind === 'melee') {
      applyOffset(bones.chest, 0, -0.2 * pulse, 0.04 * pulse);
      applyOffset(bones.upperArmRight, -0.82 * pulse, 0, -0.52 * pulse);
      applyOffset(bones.forearmRight, -0.42 * pulse, 0, 0.24 * pulse);
    } else if (action.kind === 'ability') {
      applyOffset(bones.chest, -0.04 * pulse, 0.18 * pulse, 0);
      applyOffset(bones.upperArmRight, -1.02 * pulse, 0.12 * pulse, 0.26 * pulse);
      applyOffset(bones.forearmRight, -0.3 * pulse, 0, -0.16 * pulse);
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
  const template = opts.runtimeRole === 'enemy' ? TEMPLATES.lod1 : TEMPLATES.lod0;
  if (!template) return null;

  const root = cloneSkeleton(template.scene);
  const materials = cloneMaterials(root);
  tintMaterials(materials, skin, armorTypeId);

  const group = new THREE.Group();
  group.name = `KYX_REV17_${opts.runtimeRole === 'enemy' ? 'ENEMY_LOD1' : 'PLAYER_LOD0'}`;
  group.add(root);

  const controller = createActionController(
    root,
    template.animations,
    THIRD_PERSON_CLIPS,
  );
  const semanticActions = createSemanticActionDriver(
    controller,
    root,
    opts.runtimeRole ?? 'preview',
  );
  let grounded = true;
  let attachedMelee = null;
  const embeddedRifle = [];
  root.traverse((object) => {
    if (object.isMesh && /RIFLE/i.test(object.name)) embeddedRifle.push(object);
  });

  const showEmbeddedRifle = (visible) => {
    embeddedRifle.forEach((object) => { object.visible = visible; });
  };

  const setLocomotion = (speed, isGrounded = true, sprinting = false) => {
    if (!isGrounded) {
      controller.setDesired('air');
      if (grounded) controller.playOnce('jump');
    } else {
      const key = sprinting || speed > 4.2
        ? 'run'
        : speed > 0.45
          ? 'walk'
          : 'idle';
      controller.setDesired(key);
      if (!grounded) controller.playOnce('land');
    }
    grounded = isGrounded;
  };

  const attachWeapon = (weapon, isMelee = false) => {
    attachedMelee?.removeFromParent();
    attachedMelee = null;
    showEmbeddedRifle(!isMelee);
    if (!isMelee || !weapon) return;
    const socket = root.getObjectByName('socket_weapon_r')
      || root.getObjectByName('palm.R');
    if (!socket) return;
    const contact = getRev17MeleeSocketContactTransform();
    attachedMelee = weapon;
    weapon.position.set(...contact.position);
    weapon.rotation.set(...contact.rotation);
    weapon.scale.setScalar(contact.uniformScale);
    socket.add(weapon);
  };

  group.userData = {
    ...group.userData,
    isHuman: true,
    isRev17Candidate: true,
    candidateRevision: 'rev17',
    runtimeRole: opts.runtimeRole ?? 'preview',
    armorTypeId,
    primaryMat: materials.armor[0] ?? materials.body[0] ?? null,
    materials,
    mixer: controller.mixer,
    setMotion: (name) => controller.setDesired(name === 'airborne' ? 'air' : name),
    setLocomotion,
    setAim: () => {},
    armorTick: () => {},
    triggerAction: (request) => semanticActions.trigger(request),
    getActionState: () => semanticActions.snapshot(),
    actionTick: (dt) => semanticActions.tick(dt),
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
    attachWeapon,
  };
  registerRuntimeInstance(group, {
    kind: 'thirdPerson',
    runtimeRole: opts.runtimeRole ?? 'preview',
    lod: opts.runtimeRole === 'enemy' ? 1 : 0,
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
