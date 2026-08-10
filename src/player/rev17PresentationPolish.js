import * as THREE from 'three';

const clamp = (value, minimum, maximum) => (
  Math.max(minimum, Math.min(maximum, value))
);

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function rev17RuntimeRoleLod(runtimeRole) {
  return runtimeRole === 'preview' || runtimeRole === 'player' ? 0 : 1;
}

export function rev17LocomotionClipKey(planarSpeed, sprinting = false) {
  const speed = Math.max(0, finite(planarSpeed));
  if (speed <= 0.45) return 'idle';
  return sprinting || speed >= 3 ? 'run' : 'walk';
}

function sectorForDirection(directionRadians, speed) {
  if (speed <= 1e-4) return 'idle';
  const octant = Math.round(directionRadians / (Math.PI / 4));
  return [
    'forward',
    'forward_right',
    'right',
    'backward_right',
    'backward',
    'backward_left',
    'left',
    'forward_left',
  ][(octant + 8) % 8];
}

/**
 * @typedef {object} Rev17LocomotionAuthoritySignal
 * @property {number} [planarSpeedMillimetersPerSecond]
 * @property {number} [forwardSpeedMillimetersPerSecond]
 * @property {number} [rightSpeedMillimetersPerSecond]
 * @property {number} [travelDirectionRadians]
 * @property {number} [strafeLean]
 * @property {number} [gaitPlaybackDirection]
 * @property {string} [sector]
 * @property {number} [turnRateRadiansPerSecond]
 */

/**
 * Normalize both the legacy numeric strafe input and the newer measured
 * authority signal into one presentation-only locomotion contract.
 *
 * @param {number} speed
 * @param {number | Rev17LocomotionAuthoritySignal} [signalOrStrafe=0]
 * @param {number | null} [legacyForwardRatio=null]
 * @param {number} [legacyTurnRateRadiansPerSecond=0]
 */
export function normalizeRev17LocomotionPresentation(
  speed,
  signalOrStrafe = 0,
  legacyForwardRatio = null,
  legacyTurnRateRadiansPerSecond = 0,
) {
  const fallbackSpeed = Math.max(0, finite(speed));
  if (signalOrStrafe && typeof signalOrStrafe === 'object') {
    const planarSpeed = Math.max(
      0,
      finite(
        signalOrStrafe.planarSpeedMillimetersPerSecond,
        fallbackSpeed * 1_000,
      ) / 1_000,
    );
    const denominator = Math.max(planarSpeed, 1e-4);
    const forwardSpeed = finite(
      signalOrStrafe.forwardSpeedMillimetersPerSecond,
      planarSpeed * 1_000,
    ) / 1_000;
    const rightSpeed = finite(
      signalOrStrafe.rightSpeedMillimetersPerSecond,
      0,
    ) / 1_000;
    const forwardRatio = clamp(forwardSpeed / denominator, -1, 1);
    const rightRatio = clamp(rightSpeed / denominator, -1, 1);
    const travelDirectionRadians = finite(
      signalOrStrafe.travelDirectionRadians,
      Math.atan2(rightRatio, forwardRatio),
    );
    return Object.freeze({
      planarSpeed,
      forwardRatio,
      rightRatio,
      travelDirectionRadians,
      strafeLean: clamp(
        finite(signalOrStrafe.strafeLean, -rightRatio),
        -1,
        1,
      ),
      gaitPlaybackDirection:
        signalOrStrafe.gaitPlaybackDirection === -1 || forwardRatio < -0.08
          ? -1
          : 1,
      sector: signalOrStrafe.sector
        ?? sectorForDirection(travelDirectionRadians, planarSpeed),
      turnRateRadiansPerSecond: clamp(
        finite(signalOrStrafe.turnRateRadiansPerSecond),
        -8,
        8,
      ),
    });
  }

  const strafeLean = clamp(finite(signalOrStrafe), -1, 1);
  const rightRatio = -strafeLean;
  const inferredForward = Math.sqrt(Math.max(0, 1 - rightRatio * rightRatio));
  const forwardRatio = clamp(
    legacyForwardRatio === null
      ? inferredForward
      : finite(legacyForwardRatio, inferredForward),
    -1,
    1,
  );
  const travelDirectionRadians = Math.atan2(rightRatio, forwardRatio);
  return Object.freeze({
    planarSpeed: fallbackSpeed,
    forwardRatio,
    rightRatio,
    travelDirectionRadians,
    strafeLean,
    gaitPlaybackDirection: forwardRatio < -0.08 ? -1 : 1,
    sector: sectorForDirection(travelDirectionRadians, fallbackSpeed),
    turnRateRadiansPerSecond: clamp(
      finite(legacyTurnRateRadiansPerSecond),
      -8,
      8,
    ),
  });
}

export function rev17GaitPlaybackRate(locomotionKey, signal) {
  if (locomotionKey !== 'walk' && locomotionKey !== 'run') return 1;
  const authoredSpeed = locomotionKey === 'run' ? 5.5 : 2.15;
  const minimumRate = locomotionKey === 'run' ? 0.55 : 0.35;
  const magnitude = clamp(
    signal.planarSpeed / authoredSpeed,
    minimumRate,
    1.35,
  );
  return magnitude * signal.gaitPlaybackDirection;
}

export function rev17ProjectedGaitSpeed(locomotionKey, playbackRate) {
  const authoredSpeed = locomotionKey === 'run'
    ? 5.5
    : locomotionKey === 'walk'
      ? 2.15
      : 0;
  return authoredSpeed * Math.abs(finite(playbackRate, 0));
}

const CONTACT_PROFILES = Object.freeze({
  rifle: Object.freeze({
    uniformScale: 0.86,
    gripPoint: Object.freeze([0, -0.105, 0.19]),
    supportPoint: Object.freeze([0, 0.02, -0.31]),
  }),
  pistol: Object.freeze({
    uniformScale: 0.92,
    gripPoint: Object.freeze([0, -0.105, 0.12]),
    supportPoint: null,
  }),
  shotgun: Object.freeze({
    uniformScale: 0.84,
    gripPoint: Object.freeze([0, -0.1, 0.2]),
    supportPoint: Object.freeze([0, 0.015, -0.34]),
  }),
  sniper: Object.freeze({
    uniformScale: 0.76,
    gripPoint: Object.freeze([0, -0.1, 0.17]),
    supportPoint: Object.freeze([0, 0.02, -0.43]),
  }),
  rocket: Object.freeze({
    uniformScale: 0.78,
    gripPoint: Object.freeze([0, -0.09, 0.14]),
    supportPoint: Object.freeze([0, 0.025, -0.22]),
  }),
  melee: Object.freeze({
    uniformScale: 0.78,
    gripPoint: Object.freeze([0, 0.02, 0.14]),
    supportPoint: null,
  }),
});

export function getRev17WeaponContactProfile(weapon, isMelee = false) {
  const family = isMelee
    ? 'melee'
    : weapon?.userData?.weaponFamily;
  return Object.freeze({
    family: Object.hasOwn(CONTACT_PROFILES, family) ? family : 'rifle',
    ...(CONTACT_PROFILES[family] ?? CONTACT_PROFILES.rifle),
  });
}

/**
 * Fit a weapon's authored grip point to the right-hand socket while aiming its
 * real muzzle node along the Rev17 socket-nozzle direction. Weapon length is
 * preserved, so a sidearm does not get stretched to rifle length.
 */
export function fitRev17WeaponContact(
  weapon,
  socket,
  authoredMuzzle,
  isMelee = false,
  overrides = /** @type {{
    uniformScale: number,
    gripPoint: readonly number[],
    supportPoint: readonly number[] | null,
  } | null} */ (null),
) {
  const baseProfile = getRev17WeaponContactProfile(weapon, isMelee);
  const profile = overrides
    ? { ...baseProfile, ...overrides }
    : baseProfile;
  const muzzleName = weapon?.userData?.muzzleNodeName;
  const muzzle = typeof muzzleName === 'string'
    ? weapon.getObjectByName(muzzleName)
    : null;
  const gripPoint = new THREE.Vector3(...profile.gripPoint);
  const supportTarget = profile.supportPoint === null
    ? null
    : new THREE.Object3D();
  const gripTarget = new THREE.Object3D();

  weapon.position.set(0, 0, 0);
  weapon.rotation.set(0, 0, 0);
  weapon.scale.setScalar(1);
  weapon.updateMatrixWorld(true);
  socket.updateWorldMatrix(true, false);

  const localMuzzle = muzzle
    ? weapon.worldToLocal(muzzle.getWorldPosition(new THREE.Vector3()))
    : new THREE.Vector3(0, 0, -0.8);
  const weaponDirection = localMuzzle.sub(gripPoint).normalize();
  const targetWorld = authoredMuzzle
    ? authoredMuzzle.getWorldPosition(new THREE.Vector3())
    : socket.localToWorld(new THREE.Vector3(0, 0, -1));
  const targetDirection = socket.worldToLocal(targetWorld).normalize();
  const rotation = new THREE.Quaternion().setFromUnitVectors(
    weaponDirection,
    targetDirection,
  );
  const scaledGrip = gripPoint
    .multiplyScalar(profile.uniformScale)
    .applyQuaternion(rotation);

  weapon.quaternion.copy(rotation);
  weapon.scale.setScalar(profile.uniformScale);
  weapon.position.copy(scaledGrip).multiplyScalar(-1);

  gripTarget.name = 'KYX_REV17_PRIMARY_HAND_CONTACT';
  gripTarget.position.set(...profile.gripPoint);
  weapon.add(gripTarget);

  if (supportTarget !== null) {
    supportTarget.name = 'KYX_REV17_SUPPORT_HAND_CONTACT';
    supportTarget.position.set(...profile.supportPoint);
    weapon.add(supportTarget);
  }

  return Object.freeze({
    family: profile.family,
    profileSource: overrides ? 'candidate-exact' : 'family-default',
    gripPoint: Object.freeze([...profile.gripPoint]),
    supportPoint: profile.supportPoint === null
      ? null
      : Object.freeze([...profile.supportPoint]),
    muzzle,
    gripTarget,
    supportTarget,
    socketName: socket.name,
    muzzleNodeName: muzzle?.name ?? null,
    uniformScale: profile.uniformScale,
  });
}
