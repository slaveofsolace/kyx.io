import * as THREE from 'three';
import { buildHumanSoldier, isHumanSoldierReady, tintHumanSoldier } from './HumanSoldier.js';
import { normalizeRev17LocomotionPresentation } from './rev17PresentationPolish.js';

// Compatibility hooks retained for menu callers. Quarantined static models
// cannot be fetched; previews use the project-authored runtime when available
// and the procedural builders below otherwise.
export function preloadSpartanModel(onLoad) {
  onLoad?.();
}
export function isSpartanReady() { return false; }
export function buildSpartanModel() {
  return null;
}

export function preloadPlayerModel(onLoad) {
  onLoad?.();
}

// ---------------------------------------------------------------------------
// Shared fixed materials (not recolored by skins)
// ---------------------------------------------------------------------------
const _trimMat = new THREE.MeshStandardMaterial({
  color: 0x9aaab4, roughness: 0.22, metalness: 0.88
});
const _darkJoint = new THREE.MeshStandardMaterial({
  color: 0x08090c, roughness: 0.78, metalness: 0.08
});
const _skinMat  = new THREE.MeshStandardMaterial({ color: 0xc8a882, roughness: 0.82, metalness: 0.0 });
const _bootMat  = new THREE.MeshStandardMaterial({ color: 0x1c1a14, roughness: 0.88, metalness: 0.06 });
const _odMat    = new THREE.MeshStandardMaterial({ color: 0x3e4a2e, roughness: 0.90, metalness: 0.04 });

// ---------------------------------------------------------------------------
// Primitive factories
// ---------------------------------------------------------------------------
function B(w, h, d, mat) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); }
function Cap(r, h, mat, segs = 8) {
  return new THREE.Mesh(new THREE.CapsuleGeometry(r, h, segs, 12), mat);
}
function Cyl(r, h, mat, segs = 10) {
  return new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segs), mat);
}
function Sph(r, mat, sw = 10, sh = 8) {
  return new THREE.Mesh(new THREE.SphereGeometry(r, sw, sh), mat);
}

function add(g, mesh, x, y, z, rx = 0, ry = 0, rz = 0) {
  mesh.position.set(x, y, z);
  if (rx || ry || rz) mesh.rotation.set(rx, ry, rz);
  g.add(mesh);
  return mesh;
}

function namedAdd(g, mesh, name, x, y, z, rx = 0, ry = 0, rz = 0) {
  mesh.name = name;
  return add(g, mesh, x, y, z, rx, ry, rz);
}

// ===========================================================================
// Shared human body base — BDU uniform, boots, skin face/hands.
// Every mesh that should animate with a limb carries a name matching
// rigCharacterLimbs() regexes so walk cycles work automatically.
// ===========================================================================
function _buildSoldierBase(g, P, S) {
  const SK = _skinMat, BT = _bootMat, BD = S;

  // ── Legs (left x=-0.13, right x=+0.13) ──
  for (const [sx, sd] of [[-0.13, 'L'], [0.13, 'R']]) {
    namedAdd(g, B(0.13, 0.06, 0.26, BT), `boot_${sd}`,     sx,  0.03,  0.02);
    namedAdd(g, B(0.12, 0.24, 0.15, BT), `boot_${sd}_u`,   sx,  0.18, -0.01);
    namedAdd(g, Cap(0.068, 0.27, BD, 8), `lleg_${sd}`,      sx,  0.54,  0);
    namedAdd(g, B(0.11, 0.09, 0.08, BD), `knee_${sd}`,      sx,  0.70, -0.03);
    namedAdd(g, Cap(0.092, 0.25, BD, 8), `thigh_${sd}`,     sx,  0.96,  0);
    namedAdd(g, B(0.09, 0.09, 0.07, BD), `thigh_${sd}_pkt`,
      sx + (sd === 'L' ? -0.05 : 0.05), 0.95, -0.08);
  }

  // ── Hips / belt ──
  add(g, B(0.32, 0.09, 0.25, BD),       0, 1.16, 0);
  add(g, B(0.34, 0.05, 0.27, _trimMat), 0, 1.21, 0);

  // ── Torso undersuit ──
  add(g, Cap(0.19, 0.40, BD, 8), 0, 1.48, 0);

  // ── Arms (left x=-0.33, right x=+0.33) ──
  for (const [sx, sd] of [[-0.33, 'L'], [0.33, 'R']]) {
    namedAdd(g, Cap(0.070, 0.22, BD, 8), `uarm_${sd}`,  sx, 1.51, 0);
    namedAdd(g, B(0.11, 0.08, 0.11, BD), `elbow_${sd}`, sx, 1.30, 0);
    namedAdd(g, Cap(0.060, 0.18, BD, 8), `farm_${sd}`,  sx, 1.08, 0);
    namedAdd(g, B(0.10, 0.10, 0.08, SK), `hand_${sd}`,  sx, 0.88, 0);
  }

  // ── Neck ──
  add(g, Cyl(0.066, 0.10, SK, 8), 0, 1.80, 0);

  // ── Head (skin sphere + face/chin overlays) ──
  add(g, Sph(0.150, SK, 10, 8),   0, 2.01,  0);
  add(g, B(0.17, 0.13, 0.04, SK), 0, 1.99, -0.13);
  add(g, B(0.11, 0.05, 0.04, SK), 0, 1.89, -0.11);
}

// ===========================================================================
// ASSAULT — standard plate carrier, ACH helmet
// ===========================================================================
function buildAssault(g, P, S) {
  _buildSoldierBase(g, P, S);
  const PL = P;

  // Front SAPI plate carrier
  add(g, B(0.40, 0.36, 0.09, PL), 0, 1.50, -0.17);
  for (let i = 0; i < 3; i++) add(g, B(0.38, 0.005, 0.09, _trimMat), 0, 1.38 + i * 0.10, -0.176);
  add(g, B(0.12, 0.12, 0.10, S),  0, 1.39, -0.23);  // admin pouch
  // Back plate + hydration carrier
  add(g, B(0.40, 0.34, 0.09, PL), 0, 1.50,  0.17);
  add(g, B(0.18, 0.22, 0.09, S),  0, 1.56,  0.25);
  // Side plates
  [-0.22, 0.22].forEach(px => add(g, B(0.07, 0.22, 0.07, PL), px, 1.50, 0));
  // Shoulder straps + pauldrons
  [-1, 1].forEach(s => {
    add(g, B(0.07, 0.24, 0.07, PL), s * 0.17, 1.65, -0.09);
    add(g, Sph(0.086, S),            s * 0.27, 1.70,  0);
    add(g, B(0.14, 0.07, 0.18, PL), s * 0.27, 1.70,  0);
  });
  // Knee pads (named — swing with the leg)
  for (const [sx, sd] of [[-0.13, 'L'], [0.13, 'R']]) {
    namedAdd(g, B(0.13, 0.12, 0.09, PL), `knee_${sd}_kp`, sx, 0.73, -0.09);
  }
  // ACH helmet: box shell + dome sphere + brims + ear pads + chin strap
  add(g, B(0.29, 0.16, 0.32, _odMat),     0, 2.14, 0.01);
  add(g, Sph(0.168, _odMat, 10, 7),        0, 2.17, 0.01);
  add(g, B(0.26, 0.04, 0.08, _odMat),      0, 2.07, -0.21);
  add(g, B(0.24, 0.04, 0.07, _odMat),      0, 2.07,  0.21);
  [-1, 1].forEach(s => add(g, B(0.04, 0.14, 0.22, _darkJoint), s * 0.182, 2.15, 0.01));
  add(g, B(0.20, 0.022, 0.04, _trimMat), 0, 1.89, -0.14);
}

// ===========================================================================
// RECON — lightweight chest rig, FAST helmet with NVG mount
// ===========================================================================
function buildRecon(g, P, S) {
  _buildSoldierBase(g, P, S);
  const PL = P;

  // Lightweight chest rig — front pouches, no full back plate
  add(g, B(0.34, 0.28, 0.07, PL), 0, 1.50, -0.14);
  for (let i = 0; i < 3; i++) add(g, B(0.32, 0.005, 0.07, _trimMat), 0, 1.40 + i * 0.09, -0.146);
  add(g, B(0.10, 0.10, 0.09, S),  0, 1.40, -0.20);  // utility pouch
  // Slim straps + small pauldrons
  [-0.15, 0.15].forEach(px => add(g, B(0.05, 0.22, 0.05, S), px, 1.63, -0.07));
  [-1, 1].forEach(s => {
    add(g, Sph(0.074, S),            s * 0.23, 1.67, 0);
    add(g, B(0.10, 0.05, 0.14, PL), s * 0.23, 1.67, 0);
  });
  // Slim back hydration pack
  add(g, B(0.20, 0.28, 0.08, S), 0, 1.52, 0.16);
  // Elbow pads (named — swing with arm)
  for (const [sx, sd] of [[-0.33, 'L'], [0.33, 'R']]) {
    namedAdd(g, B(0.10, 0.07, 0.09, PL), `elbow_${sd}_ep`, sx, 1.30, -0.07);
  }
  // FAST helmet — sleeker dome, smaller brims
  add(g, Sph(0.158, _odMat, 10, 8),    0, 2.14,  0);
  add(g, B(0.26, 0.14, 0.30, _odMat),  0, 2.11,  0);
  add(g, B(0.24, 0.035, 0.07, _odMat), 0, 2.06, -0.19);  // front brim
  add(g, B(0.22, 0.035, 0.06, _odMat), 0, 2.06,  0.19);  // rear brim
  // NVG mount bracket
  add(g, B(0.08, 0.04, 0.08, _trimMat),  0, 2.22, -0.11);
  add(g, B(0.14, 0.025, 0.04, _trimMat), 0, 2.25, -0.16);
  [-1, 1].forEach(s => add(g, B(0.03, 0.12, 0.18, _darkJoint), s * 0.168, 2.12, 0));
  add(g, B(0.18, 0.020, 0.04, _trimMat), 0, 1.89, -0.13);
}

// ===========================================================================
// HEAVY — full MTV vest, large MICH helmet, leg armor
// ===========================================================================
function buildHeavy(g, P, S) {
  _buildSoldierBase(g, P, S);
  const PL = P;

  // Full MTV front plate (wider coverage)
  add(g, B(0.48, 0.44, 0.10, PL), 0, 1.52, -0.19);
  for (let i = 0; i < 4; i++) add(g, B(0.46, 0.005, 0.10, _trimMat), 0, 1.36 + i * 0.09, -0.196);
  add(g, B(0.14, 0.14, 0.11, S),  0, 1.38, -0.26);
  // Back plate
  add(g, B(0.48, 0.42, 0.10, PL), 0, 1.52, 0.19);
  // Plate collar
  add(g, B(0.36, 0.08, 0.32, PL), 0, 1.79, 0);
  // Wide side plates
  [-0.25, 0.25].forEach(px => add(g, B(0.09, 0.30, 0.09, PL), px, 1.52, 0));
  // Heavy shoulder straps + large pauldrons
  [-1, 1].forEach(s => {
    add(g, B(0.09, 0.28, 0.08, PL), s * 0.20, 1.66, -0.09);
    add(g, Sph(0.11, S),             s * 0.32, 1.73,  0);
    add(g, B(0.20, 0.10, 0.24, PL), s * 0.32, 1.71,  0);
    add(g, B(0.22, 0.08, 0.26, PL), s * 0.32, 1.82,  0);
  });
  // Leg armor: greave plates + large knee pads (named — swing with leg)
  for (const [sx, sd] of [[-0.13, 'L'], [0.13, 'R']]) {
    namedAdd(g, B(0.13, 0.26, 0.08, PL), `lleg_${sd}_grv`, sx,  0.54, -0.11);
    namedAdd(g, B(0.14, 0.13, 0.10, PL), `knee_${sd}_kp`,  sx,  0.72, -0.11);
  }
  // Forearm vambraces (named — swing with arm)
  for (const [sx, sd] of [[-0.33, 'L'], [0.33, 'R']]) {
    namedAdd(g, B(0.13, 0.18, 0.08, PL), `farm_${sd}_va`, sx, 1.08, -0.10);
  }
  // Large MICH helmet
  add(g, B(0.32, 0.18, 0.36, _odMat),   0, 2.16, 0.01);
  add(g, Sph(0.182, _odMat, 10, 7),      0, 2.19, 0.01);
  add(g, B(0.28, 0.05, 0.09, _odMat),    0, 2.08, -0.22);
  add(g, B(0.26, 0.05, 0.08, _odMat),    0, 2.08,  0.23);
  [-1, 1].forEach(s => add(g, B(0.05, 0.18, 0.26, _darkJoint), s * 0.196, 2.17, 0.01));
  add(g, B(0.26, 0.08, 0.05, _trimMat),  0, 2.10, -0.23);  // visor rail
  add(g, B(0.22, 0.020, 0.04, _trimMat), 0, 1.89, -0.14);
}

// ===========================================================================
// STEALTH — minimal chest rig, soft balaclava, low-profile
// ===========================================================================
function buildStealth(g, P, S) {
  _buildSoldierBase(g, P, S);
  const PL = P;

  // Minimal chest rig (thin front panels, no back plate)
  add(g, B(0.30, 0.22, 0.07, PL), 0, 1.50, -0.12);
  for (let i = 0; i < 2; i++) add(g, B(0.28, 0.005, 0.07, _trimMat), 0, 1.42 + i * 0.09, -0.126);
  // Slim back utility pack
  add(g, B(0.14, 0.20, 0.08, S), 0, 1.56, 0.18);
  // Thin shoulder straps + minimal shoulder pads
  [-0.13, 0.13].forEach(px => add(g, B(0.05, 0.20, 0.05, S), px, 1.62, -0.06));
  [-1, 1].forEach(s => add(g, Sph(0.067, S), s * 0.21, 1.65, 0));
  // Wrist devices (named — swing with arm)
  for (const [sx, sd] of [[-0.33, 'L'], [0.33, 'R']]) {
    namedAdd(g, B(0.11, 0.07, 0.10, S),         `farm_${sd}_wr`, sx, 0.97, -0.02);
    namedAdd(g, B(0.03, 0.04, 0.014, _trimMat), `farm_${sd}_wt`, sx, 0.97, -0.079);
  }
  // Balaclava: fabric sphere covers head, face cover, eye slit
  add(g, Sph(0.158, S, 10, 8),              0, 2.01,  0.01);
  add(g, B(0.20, 0.17, 0.05, S),            0, 1.99, -0.14);
  add(g, B(0.15, 0.04, 0.025, _darkJoint),  0, 2.04, -0.185);  // eye slit
  // Soft cap / beanie on top
  add(g, Sph(0.162, _odMat, 10, 6), 0, 2.08, 0.02);
  add(g, B(0.30, 0.10, 0.33, _odMat), 0, 2.09, 0.01);
  add(g, B(0.02, 0.10, 0.04, _trimMat), 0, 1.89, -0.13);  // chin band
}

// ===========================================================================
// Public API
// ===========================================================================

const BUILDERS = {
  assault: buildAssault,
  recon:   buildRecon,
  heavy:   buildHeavy,
  stealth: buildStealth,
};

export function buildPreviewCharacter(skin, armorTypeId = 'assault', armorSkin = null, opts = {}) {
  // The Blender-built Spartan (static mesh) — used for menu/loadout previews.
  if (opts.preferSpartan && isSpartanReady()) {
    const sp = buildSpartanModel();
    if (sp) return sp;
  }
  // Prefer the real rigged human soldier (the player). Bots opt out with
  // allowHuman:false — they rely on the procedural model's limb-pivot rig,
  // per-part headshot zones, and weapon-hand attachment.
  if (opts.allowHuman !== false && isHumanSoldierReady()) {
    const human = buildHumanSoldier(skin, armorTypeId, opts);
    if (human) return human;
  }

  // Project-authored procedural fallback.
  const g = new THREE.Group();

  const src = armorSkin || {};
  const primaryColor   = armorSkin ? armorSkin.primary   : skin.primary;
  const secondaryColor = armorSkin ? armorSkin.secondary : skin.secondary;

  const P = new THREE.MeshStandardMaterial({
    color:             primaryColor,
    roughness:         src.roughness         ?? 0.82,
    metalness:         src.metalness         ?? 0.06,
    emissive:          new THREE.Color(src.emissive ?? 0x000000),
    emissiveIntensity: src.emissiveIntensity ?? 0,
  });
  const S = new THREE.MeshStandardMaterial({
    color:     secondaryColor,
    roughness: (src.roughness ?? 0.82) * 1.1,
    metalness: (src.metalness ?? 0.06) * 0.2,
  });

  const builder = BUILDERS[armorTypeId] || buildAssault;
  builder(g, P, S);

  g.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow    = true;
      obj.receiveShadow = true;
    }
  });

  g.userData = { primaryMat: P, secondaryMat: S, armorTypeId };
  if (opts.animate === true) installProceduralCharacterPresentation(g);
  return g;
}

export function applySkinToCharacter(group, skin, armorSkin = null) {
  // Human soldier: tint the body texture instead of recoloring armor plates.
  if (group.userData?.isHuman) { tintHumanSoldier(group, skin, armorSkin); return; }

  const { primaryMat, secondaryMat } = group.userData;
  if (!primaryMat || !secondaryMat) return;
  primaryMat.color.setHex(armorSkin ? armorSkin.primary   : skin.primary);
  secondaryMat.color.setHex(armorSkin ? armorSkin.secondary : skin.secondary);
  if (armorSkin) {
    primaryMat.roughness         = armorSkin.roughness         ?? 0.42;
    primaryMat.metalness         = armorSkin.metalness         ?? 0.52;
    primaryMat.emissive.setHex(armorSkin.emissive ?? 0x000000);
    primaryMat.emissiveIntensity = armorSkin.emissiveIntensity ?? 0;
  }
}

// ===========================================================================
// Limb rigging for the third-person body
// ---------------------------------------------------------------------------
// The character is a flat collection of armour plates (named GLB nodes). To
// animate a walk cycle we regroup those plates into four pivots — left/right
// shoulder and left/right hip — so each limb can swing about its joint.
// Returns a rig object { armL, armR, legL, legR } or null when a source lacks
// the named limb coverage required for deterministic pivots.
// ===========================================================================
const _ARM_RE = /uarm|farm|elbow|hand|shoulder|pau|pvs/i;
const _LEG_RE = /thigh|lleg|knee|boot|shinp|sole|grv|kn_|knsph|tpl|cg_/i;

export function rigCharacterLimbs(group) {
  try {
    group.updateWorldMatrix(true, true);

    const meshes = [];
    group.traverse((o) => { if (o.isMesh && o.name) meshes.push(o); });
    if (!meshes.length) return null;

    const buckets = { armL: [], armR: [], legL: [], legR: [] };
    const wp = new THREE.Vector3();
    for (const m of meshes) {
      m.getWorldPosition(wp);
      const side = wp.x < 0 ? 'L' : 'R';
      if      (_ARM_RE.test(m.name) && Math.abs(wp.x) > 0.12) buckets['arm' + side].push(m);
      else if (_LEG_RE.test(m.name) && Math.abs(wp.x) > 0.04) buckets['leg' + side].push(m);
    }

    const makePivot = (parts, jointY) => {
      if (parts.length < 2) return null;
      let ax = 0;
      for (const m of parts) { m.getWorldPosition(wp); ax += wp.x; }
      ax /= parts.length;
      const pivot = new THREE.Group();
      pivot.position.set(ax, jointY, 0);
      group.add(pivot);
      for (const m of parts) pivot.attach(m); // attach() preserves world transform
      return pivot;
    };

    const rig = {
      armL: makePivot(buckets.armL, 1.76),
      armR: makePivot(buckets.armR, 1.76),
      legL: makePivot(buckets.legL, 1.21),
      legR: makePivot(buckets.legR, 1.21),
    };
    if (!rig.armL || !rig.armR || !rig.legL || !rig.legR) return null;
    group.userData.rig = rig;
    return rig;
  } catch (e) {
    console.warn('[rigCharacterLimbs] failed:', e.message);
    return null;
  }
}

// ===========================================================================
// Procedural runtime presentation
// ---------------------------------------------------------------------------
// The provenance-safe fallback is intentionally simple art, but it still needs
// to obey the same online presentation contract as a rigged candidate. This
// controller animates the existing named limb pivots from measured authority
// velocity. It never feeds movement authority or changes collision state.
// ===========================================================================

export function installProceduralCharacterPresentation(group) {
  const rig = rigCharacterLimbs(group);
  if (!rig) return null;

  const clamp = THREE.MathUtils.clamp;
  const handRight = group.getObjectByName('hand_R');
  let locomotion = normalizeRev17LocomotionPresentation(0, 0);
  let grounded = true;
  let sprinting = false;
  let locomotionClock = 0;
  let airTime = 0;
  let landRemaining = 0;
  let targetAimPitch = 0;
  let targetAimYaw = 0;
  let smoothAimPitch = 0;
  let smoothAimYaw = 0;
  let smoothRightRatio = 0;
  let smoothForwardRatio = 1;
  let smoothStrafeLean = 0;
  let smoothTurnRate = 0;
  let fireRecoil = 0;
  let flinch = 0;
  let action = null;
  let heldWeapon = null;
  let heldWeaponIsMelee = false;
  let dead = false;

  const setLocomotion = (
    speed,
    isGrounded = true,
    isSprinting = false,
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
    if (isGrounded && !grounded) landRemaining = 0.24;
    if (!isGrounded && grounded) airTime = 0;
    grounded = isGrounded;
    sprinting = isSprinting;
  };

  const setAim = (pitch = 0, yaw = 0) => {
    targetAimPitch = clamp(Number.isFinite(pitch) ? pitch : 0, -1.15, 1.15);
    targetAimYaw = clamp(Number.isFinite(yaw) ? yaw : 0, -0.95, 0.95);
  };

  const beginAction = (kind, durationSeconds) => {
    const duration = clamp(
      Number.isFinite(durationSeconds) ? durationSeconds : 0.35,
      0.12,
      4,
    );
    action = { kind, duration, remaining: duration };
  };

  const triggerReload = (durationSeconds = 1.8) => {
    beginAction('reload', durationSeconds);
  };
  const triggerEquip = (durationSeconds = 0.34) => {
    beginAction('equip', durationSeconds);
  };
  const triggerMelee = (durationSeconds = 0.55) => {
    beginAction('melee', durationSeconds);
  };
  const triggerAbility = (durationSeconds = 0.65) => {
    beginAction('ability', durationSeconds);
  };
  const triggerFire = (kick = 1) => {
    fireRecoil = Math.max(fireRecoil, clamp(kick, 0, 3) * 0.14);
  };
  const triggerHit = (x = 0) => {
    flinch = clamp(Number.isFinite(x) ? x : 0, -1, 1) || 0.45;
  };
  const triggerJump = () => {
    grounded = false;
    airTime = 0;
  };
  const triggerDeath = () => {
    dead = true;
    action = null;
  };
  const resetPresentation = () => {
    dead = false;
    action = null;
    fireRecoil = 0;
    flinch = 0;
    airTime = 0;
    landRemaining = 0;
    group.rotation.z = 0;
  };

  const attachWeapon = (weapon, isMelee = false) => {
    if (heldWeapon !== null) heldWeapon.parent?.remove(heldWeapon);
    heldWeapon = weapon ?? null;
    heldWeaponIsMelee = isMelee;
    if (heldWeapon === null || handRight === null) return;
    if (isMelee) {
      heldWeapon.position.set(0.02, 0.06, 0.02);
      heldWeapon.rotation.set(Math.PI * 0.5, 0, Math.PI * 0.5);
      heldWeapon.scale.setScalar(1.15);
    } else {
      heldWeapon.position.set(-0.02, 0.04, 0.02);
      heldWeapon.rotation.set(1.15, Math.PI, 0.15);
      heldWeapon.scale.setScalar(1);
    }
    handRight.add(heldWeapon);
  };

  const actionTick = (deltaSeconds) => {
    const dt = clamp(
      Number.isFinite(deltaSeconds) ? deltaSeconds : 0,
      0,
      0.1,
    );
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

    rig.armL.rotation.set(0, 0, 0);
    rig.armR.rotation.set(0, 0, 0);
    rig.legL.rotation.set(0, 0, 0);
    rig.legR.rotation.set(0, 0, 0);

    if (dead) {
      group.rotation.z += (-1.42 - group.rotation.z) * medium;
      rig.armL.rotation.x = -0.34;
      rig.armR.rotation.x = 0.48;
      rig.legL.rotation.x = 0.28;
      rig.legR.rotation.x = -0.18;
      return;
    }
    group.rotation.z += (0 - group.rotation.z) * medium;

    const moving = grounded && locomotion.planarSpeed > 0.28;
    const cadence = sprinting ? 10.2 : 7.1;
    if (moving) {
      locomotionClock += dt * cadence * locomotion.gaitPlaybackDirection;
    } else if (grounded && Math.abs(smoothTurnRate) > 0.12) {
      locomotionClock += dt * 6.4 * Math.sign(smoothTurnRate);
    }
    const step = Math.sin(locomotionClock);
    const authoredSpeed = sprinting ? 5.5 : 2.15;
    const speedMix = moving
      ? clamp(locomotion.planarSpeed / authoredSpeed, 0.25, 1)
      : 0;
    const stride = step * speedMix * (sprinting ? 0.72 : 0.52);
    const lateralStep = step * smoothRightRatio * 0.13;
    const lowerBodyYaw = clamp(
      locomotion.travelDirectionRadians * 0.11,
      -0.18,
      0.18,
    );

    rig.legL.rotation.x = stride;
    rig.legR.rotation.x = -stride;
    rig.legL.rotation.y = lowerBodyYaw;
    rig.legR.rotation.y = lowerBodyYaw;
    rig.legL.rotation.z = lateralStep;
    rig.legR.rotation.z = -lateralStep;

    const weaponHeld = heldWeapon !== null;
    const weaponSupport = weaponHeld && !heldWeaponIsMelee;
    rig.armR.rotation.x = weaponHeld
      ? 1.02 + smoothAimPitch * 0.28 - fireRecoil
      : -stride * 0.62;
    rig.armL.rotation.x = weaponSupport
      ? 0.82 + smoothAimPitch * 0.2
      : stride * 0.62;
    rig.armR.rotation.y = weaponHeld ? smoothAimYaw * 0.24 : 0;
    rig.armL.rotation.y = weaponSupport ? smoothAimYaw * 0.18 : 0;
    rig.armR.rotation.z = smoothStrafeLean * -0.045;
    rig.armL.rotation.z = smoothStrafeLean * -0.035;

    if (!moving && grounded && Math.abs(smoothTurnRate) > 0.12) {
      const turnStep = step * clamp(smoothTurnRate / 4.5, -1, 1) * 0.16;
      rig.legL.rotation.x = turnStep;
      rig.legR.rotation.x = -turnStep;
      rig.legL.rotation.y = clamp(smoothTurnRate * 0.035, -0.14, 0.14);
      rig.legR.rotation.y = rig.legL.rotation.y;
    }

    if (!grounded) {
      airTime += dt;
      const tuck = Math.sin(clamp(airTime / 0.32, 0, 1) * Math.PI * 0.5);
      rig.legL.rotation.x = -0.34 * tuck;
      rig.legR.rotation.x = 0.22 * tuck;
      rig.armL.rotation.x += 0.14 * tuck;
      rig.armR.rotation.x += 0.14 * tuck;
    } else if (landRemaining > 0) {
      const landMix = Math.sin((landRemaining / 0.24) * Math.PI);
      rig.legL.rotation.x -= landMix * 0.2;
      rig.legR.rotation.x -= landMix * 0.2;
      landRemaining = Math.max(0, landRemaining - dt);
    }

    if (action !== null) {
      const progress = 1 - action.remaining / action.duration;
      const mix = Math.sin(clamp(progress, 0, 1) * Math.PI);
      if (action.kind === 'reload') {
        rig.armR.rotation.x += mix * 0.48;
        rig.armR.rotation.z += mix * 0.42;
        rig.armL.rotation.x += mix * 0.22;
      } else if (action.kind === 'melee') {
        rig.armR.rotation.x -= mix * 0.74;
        rig.armR.rotation.y -= mix * 0.34;
        rig.armR.rotation.z -= mix * 0.22;
        rig.armL.rotation.x += mix * 0.18;
      } else if (action.kind === 'ability') {
        rig.armR.rotation.x -= mix * 0.52;
        rig.armR.rotation.y += mix * 0.28;
        rig.armL.rotation.x -= mix * 0.26;
        rig.armL.rotation.y -= mix * 0.18;
      } else if (action.kind === 'equip') {
        rig.armR.rotation.x -= mix * 0.3;
        rig.armL.rotation.x -= mix * 0.16;
      }
      action.remaining = Math.max(0, action.remaining - dt);
      if (action.remaining === 0) action = null;
    }

    fireRecoil = Math.max(0, fireRecoil - dt * 1.65);
    if (flinch !== 0) {
      group.rotation.z += flinch * 0.045;
      flinch *= Math.pow(0.08, dt);
      if (Math.abs(flinch) < 0.002) flinch = 0;
    }
  };

  const locomotionDiagnostics = () => Object.freeze({
    planarSpeed: locomotion.planarSpeed,
    forwardRatio: smoothForwardRatio,
    rightRatio: smoothRightRatio,
    strafeLean: smoothStrafeLean,
    gaitPlaybackDirection: locomotion.gaitPlaybackDirection,
    sector: locomotion.sector,
    turnRateRadiansPerSecond: smoothTurnRate,
    grounded,
    sprinting,
    dead,
    action: action?.kind ?? null,
    weaponAttached: heldWeapon !== null,
  });

  Object.assign(group.userData, {
    proceduralPresentation: true,
    setLocomotion,
    setAim,
    triggerReload,
    triggerEquip,
    triggerMelee,
    triggerAbility,
    triggerFire,
    triggerHit,
    triggerJump,
    triggerDeath,
    resetPresentation,
    attachWeapon,
    actionTick,
    armorTick: () => {},
    locomotionDiagnostics,
  });
  return Object.freeze({ rig, locomotionDiagnostics });
}
