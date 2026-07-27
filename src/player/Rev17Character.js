import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { G6_CHARACTER_CANDIDATE } from '../config/g6CharacterCandidate.js';

const TEMPLATES = {
  lod0: null,
  lod1: null,
  firstPerson: null,
};
const LOADING = new Set();
const CHARACTER_CALLBACKS = [];
const FIRST_PERSON_CALLBACKS = [];
const RUNTIME_INSTANCES = new Map();
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

  const play = (key, { once = false, fade = 0.14 } = {}) => {
    const next = actions[key];
    if (!next || (next === active && !once)) return;
    next.enabled = true;
    next.reset();
    next.setEffectiveTimeScale(1);
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

  const playOnce = (key, fade = 0.08) => {
    if (!actions[key]) return;
    play(key, { once: true, fade });
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
    setDesired,
    get activeKey() { return activeKey; },
  };
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
    triggerFire: () => controller.playOnce('fire'),
    triggerReload: () => controller.playOnce('reload'),
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
  group.userData = {
    ...group.userData,
    isRev17FirstPersonCandidate: true,
    candidateRevision: 'rev17',
    materials,
    mixer: controller.mixer,
    muzzle: root.getObjectByName('socket_muzzle'),
    setState: (state) => controller.setDesired(state),
    triggerFire: () => controller.playOnce('fire', 0.04),
    // The authored FP_RELOAD clip remains embedded and structurally validated,
    // but the runtime uses a bounded camera-space dip until a dedicated
    // viewmodel retarget receives human visual approval.
    triggerReload: () => controller.setDesired('idle'),
    triggerLand: () => controller.playOnce('land', 0.06),
  };
  registerRuntimeInstance(group, {
    kind: 'firstPerson',
    runtimeRole: 'firstPerson',
    lod: null,
  });
  return group;
}
