import * as THREE from 'three';

import { GameSettings } from '../core/GameSettings.js';
import type {
  CombatPresentationDamageEventV1,
  CombatPresentationWeaponAttackEventV1,
  CombatPresentationWeaponMeleeContactEventV1,
  CombatPresentationWeaponProjectileDetonatedEventV1,
  CombatWeaponProjectileSnapshotV1,
} from '../net';
import {
  setKyxWeaponPhase,
  triggerKyxWeaponFire,
  type KyxWeaponFamily,
  type KyxWeaponPhase,
  type KyxWeaponPresentationModel,
} from '../weapons/KyxArmoryPresentation';

interface TransientEffect {
  readonly root: THREE.Object3D;
  readonly kind:
    | 'flash'
    | 'tracer'
    | 'impact_shield'
    | 'impact_health'
    | 'blast'
    | 'impulse'
    | 'melee'
    | 'rocket_trail';
  readonly startedAtMilliseconds: number;
  readonly expiresAtMilliseconds: number;
}

interface RocketPresentation {
  readonly root: THREE.Group;
  readonly plume: THREE.Mesh;
  readonly previousPosition: THREE.Vector3;
}

export interface WeaponAttackPresentationContext {
  readonly event: CombatPresentationWeaponAttackEventV1;
  readonly weapon: KyxWeaponPresentationModel;
  readonly muzzle: THREE.Vector3;
  readonly direction: THREE.Vector3;
  readonly actorPosition: THREE.Vector3;
  readonly yawMilliDegrees: number;
  readonly pitchMilliDegrees: number;
  readonly nowMilliseconds: number;
  readonly local: boolean;
}

export interface WeaponDamagePresentationContext {
  readonly event: CombatPresentationDamageEventV1;
  readonly impactPosition: THREE.Vector3;
  readonly sourceMuzzle: THREE.Vector3 | null;
  readonly sourceWeapon: KyxWeaponPresentationModel | null;
  readonly nowMilliseconds: number;
  readonly localSource: boolean;
  readonly localTarget: boolean;
}

export interface OnlineWeaponPresentationFxDiagnostics {
  readonly activeTransientCount: number;
  readonly activeRocketCount: number;
  readonly authoredAudio: 'locked' | 'ready' | 'unavailable' | 'disposed';
  readonly acceptedAttackPresentationCount: number;
  readonly confirmedDamagePresentationCount: number;
  readonly reloadPresentationCount: number;
}

export interface OnlineWeaponPresentationFx {
  readonly presentAttack: (
    context: WeaponAttackPresentationContext,
  ) => void;
  readonly presentDamage: (
    context: WeaponDamagePresentationContext,
  ) => void;
  readonly presentMeleeContact: (
    event: CombatPresentationWeaponMeleeContactEventV1,
    contactPosition: THREE.Vector3 | null,
    nowMilliseconds: number,
    local: boolean,
  ) => void;
  readonly presentProjectileDetonation: (
    event: CombatPresentationWeaponProjectileDetonatedEventV1,
    position: THREE.Vector3,
    nowMilliseconds: number,
    local: boolean,
  ) => void;
  readonly presentBlast: (
    position: THREE.Vector3,
    color: number,
    nowMilliseconds: number,
    radius?: number,
  ) => void;
  readonly presentImpulsePulse: (
    position: THREE.Vector3,
    nowMilliseconds: number,
    radius?: number,
  ) => void;
  readonly notifyWeaponPhase: (
    playerId: string,
    weapon: KyxWeaponPresentationModel,
    phase: KyxWeaponPhase,
    nowMilliseconds: number,
    local: boolean,
  ) => void;
  readonly syncAuthoritativeRockets: (
    projectiles: readonly CombatWeaponProjectileSnapshotV1[],
    nowMilliseconds: number,
  ) => void;
  readonly update: (nowMilliseconds: number) => void;
  readonly diagnostics: () => OnlineWeaponPresentationFxDiagnostics;
  readonly dispose: () => void;
}

type AuthoredAudioState = OnlineWeaponPresentationFxDiagnostics['authoredAudio'];

class AuthoredWeaponAudio {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private roomInput: GainNode | null = null;
  private room: ConvolverNode | null = null;
  private state: AuthoredAudioState = 'locked';
  private variationState = 0x4b595857;
  private readonly unlock: () => void;

  constructor(target: HTMLElement) {
    this.unlock = () => {
      if (this.state === 'disposed' || this.state === 'unavailable') return;
      try {
        if (this.context === null) {
          this.context = new AudioContext({ latencyHint: 'interactive' });
          this.output = this.context.createGain();
          const settingsVolume = Number(GameSettings.get('volume') ?? 0.5);
          this.output.gain.value = Math.max(0, Math.min(1, settingsVolume)) * 0.68;
          const limiter = this.context.createDynamicsCompressor();
          limiter.threshold.value = -8;
          limiter.knee.value = 8;
          limiter.ratio.value = 10;
          limiter.attack.value = 0.002;
          limiter.release.value = 0.14;
          this.output.connect(limiter).connect(this.context.destination);
          this.noise = this.createNoiseBuffer(this.context);
          this.room = this.context.createConvolver();
          this.room.buffer = this.createRoomImpulse(this.context);
          this.roomInput = this.context.createGain();
          const roomOutput = this.context.createGain();
          roomOutput.gain.value = 0.2;
          this.roomInput.connect(this.room).connect(roomOutput).connect(this.output);
        }
        void this.context.resume().then(() => {
          if (this.state !== 'disposed') this.state = 'ready';
        });
      } catch {
        this.state = 'unavailable';
      }
    };
    target.addEventListener('pointerdown', this.unlock, { passive: true });
    target.addEventListener('keydown', this.unlock);
    window.addEventListener('keydown', this.unlock);
  }

  private createNoiseBuffer(context: AudioContext): AudioBuffer {
    const durationSeconds = 1.4;
    const buffer = context.createBuffer(
      1,
      Math.ceil(context.sampleRate * durationSeconds),
      context.sampleRate,
    );
    const channel = buffer.getChannelData(0);
    let state = 0x1f2e3d4c;
    for (let index = 0; index < channel.length; index += 1) {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      channel[index] = (state / 0xffff_ffff) * 2 - 1;
    }
    return buffer;
  }

  private createRoomImpulse(context: AudioContext): AudioBuffer {
    const length = Math.ceil(context.sampleRate * 0.72);
    const impulse = context.createBuffer(2, length, context.sampleRate);
    for (let channelIndex = 0; channelIndex < 2; channelIndex += 1) {
      const channel = impulse.getChannelData(channelIndex);
      let state = 0x1f2e3d4c ^ (channelIndex * 0x9e3779b9);
      for (let index = 0; index < channel.length; index += 1) {
        state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
        channel[index] = ((state / 0xffff_ffff) * 2 - 1)
          * Math.pow(1 - index / channel.length, 4)
          * 0.36;
      }
    }
    return impulse;
  }

  private variation(amount = 0.035): number {
    this.variationState = (
      Math.imul(this.variationState, 1_664_525) + 1_013_904_223
    ) >>> 0;
    return 1 + (
      this.variationState / 0xffff_ffff * 2 - 1
    ) * amount;
  }

  private oscillator(
    frequencyStart: number,
    frequencyEnd: number,
    durationSeconds: number,
    gain: number,
    type: OscillatorType,
    delaySeconds = 0,
  ): void {
    if (
      this.state !== 'ready'
      || this.context === null
      || this.output === null
    ) return;
    const start = this.context.currentTime + delaySeconds;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    // Oscillators are restricted to damped low-frequency body. Bright square
    // and saw voices were the source of the old chiptune character.
    oscillator.type = type === 'sine' ? 'sine' : 'triangle';
    oscillator.frequency.setValueAtTime(frequencyStart * this.variation(0.025), start);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(20, frequencyEnd * this.variation(0.02)),
      start + durationSeconds,
    );
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + 0.004);
    envelope.gain.exponentialRampToValueAtTime(
      0.0001,
      start + durationSeconds,
    );
    oscillator.connect(envelope);
    envelope.connect(this.output);
    oscillator.start(start);
    oscillator.stop(start + durationSeconds + 0.01);
  }

  private noiseBurst(
    durationSeconds: number,
    gain: number,
    filterFrequency: number,
    filterType: BiquadFilterType,
    delaySeconds = 0,
    endFrequency = filterFrequency * 0.42,
    resonance = 0.65,
    roomAmount = 0,
  ): void {
    if (
      this.state !== 'ready'
      || this.context === null
      || this.output === null
      || this.noise === null
    ) return;
    const start = this.context.currentTime + delaySeconds;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const envelope = this.context.createGain();
    source.buffer = this.noise;
    source.playbackRate.value = this.variation(0.025);
    filter.type = filterType;
    filter.Q.value = resonance;
    filter.frequency.setValueAtTime(
      filterFrequency * this.variation(0.02),
      start,
    );
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(30, endFrequency * this.variation(0.02)),
      start + durationSeconds,
    );
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + 0.003);
    envelope.gain.exponentialRampToValueAtTime(
      0.0001,
      start + durationSeconds,
    );
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.output);
    if (this.roomInput !== null && roomAmount > 0) {
      const send = this.context.createGain();
      send.gain.value = roomAmount;
      envelope.connect(send).connect(this.roomInput);
    }
    const maxOffset = Math.max(0, this.noise.duration - durationSeconds - 0.02);
    source.start(
      start,
      (this.variationState / 0xffff_ffff) * maxOffset,
      durationSeconds,
    );
  }

  fire(family: KyxWeaponFamily, local: boolean): void {
    const level = local ? 1 : 0.5;
    switch (family) {
      case 'rifle':
        this.noiseBurst(0.018, 0.31 * level, 5_800, 'highpass', 0, 2_500, 0.6, 0.1);
        this.noiseBurst(0.14, 0.25 * level, 1_250, 'bandpass', 0, 280, 0.72, 0.22);
        this.oscillator(132, 48, 0.13, 0.15 * level, 'sine');
        this.noiseBurst(0.035, 0.065 * level, 2_800, 'bandpass', 0.016, 1_050, 4, 0.04);
        break;
      case 'pistol':
        this.noiseBurst(0.016, 0.34 * level, 4_700, 'highpass', 0, 2_100, 0.65, 0.09);
        this.noiseBurst(0.13, 0.22 * level, 1_450, 'bandpass', 0, 340, 0.8, 0.18);
        this.oscillator(148, 58, 0.12, 0.14 * level, 'sine');
        this.noiseBurst(0.03, 0.075 * level, 3_100, 'bandpass', 0.02, 1_300, 4.5, 0.04);
        break;
      case 'shotgun':
        this.noiseBurst(0.026, 0.48 * level, 2_700, 'highpass', 0, 1_000, 0.52, 0.18);
        this.noiseBurst(0.32, 0.46 * level, 940, 'lowpass', 0, 105, 0.42, 0.42);
        this.oscillator(94, 29, 0.28, 0.28 * level, 'sine');
        this.noiseBurst(0.075, 0.11 * level, 1_450, 'bandpass', 0.05, 540, 2.8, 0.15);
        break;
      case 'sniper':
        this.noiseBurst(0.022, 0.52 * level, 6_800, 'highpass', 0, 2_400, 0.72, 0.22);
        this.noiseBurst(0.42, 0.43 * level, 820, 'bandpass', 0, 110, 0.46, 0.58);
        this.oscillator(80, 24, 0.38, 0.3 * level, 'sine');
        this.noiseBurst(0.52, 0.15 * level, 2_200, 'bandpass', 0.055, 230, 0.3, 0.7);
        break;
      case 'rocket':
        this.noiseBurst(0.045, 0.38 * level, 1_500, 'highpass', 0, 620, 0.5, 0.18);
        this.noiseBurst(0.48, 0.47 * level, 720, 'lowpass', 0, 75, 0.38, 0.48);
        this.oscillator(66, 22, 0.46, 0.32 * level, 'sine');
        this.noiseBurst(0.28, 0.18 * level, 1_050, 'bandpass', 0.06, 180, 0.35, 0.35);
        break;
      case 'melee':
        this.noiseBurst(0.2, 0.3 * level, 520, 'bandpass', 0, 3_100, 0.58, 0.09);
        this.noiseBurst(0.1, 0.11 * level, 2_800, 'highpass', 0.055, 1_200, 0.45, 0.06);
        this.oscillator(178, 72, 0.13, 0.09 * level, 'sine');
        break;
    }
  }

  reload(stage: 'start' | 'complete', family: KyxWeaponFamily, local: boolean): void {
    const level = local ? 1 : 0.4;
    const heavy = family === 'shotgun' || family === 'rocket' || family === 'sniper';
    if (stage === 'start') {
      this.noiseBurst(
        0.08,
        0.09 * level,
        heavy ? 820 : 1_450,
        'bandpass',
        0,
        heavy ? 340 : 620,
        1.4,
        0.05,
      );
      this.noiseBurst(0.026, 0.07 * level, 2_100, 'bandpass', 0.035, 950, 4, 0.04);
      this.oscillator(
        heavy ? 170 : 215,
        heavy ? 85 : 105,
        0.08,
        0.045 * level,
        'sine',
      );
    } else {
      this.noiseBurst(
        0.12,
        0.09 * level,
        heavy ? 620 : 780,
        'bandpass',
        0,
        heavy ? 2_100 : 2_700,
        1.1,
        0.06,
      );
      this.noiseBurst(0.032, 0.12 * level, 3_100, 'bandpass', 0.08, 1_250, 4.5, 0.06);
      this.oscillator(heavy ? 155 : 190, 78, 0.09, 0.05 * level, 'sine', 0.075);
    }
  }

  impact(kind: 'shield' | 'health' | 'blast' | 'melee', local: boolean): void {
    const level = local ? 1 : 0.52;
    if (kind === 'shield') {
      this.noiseBurst(0.12, 0.17 * level, 3_800, 'bandpass', 0, 720, 2.4, 0.16);
      this.oscillator(390, 118, 0.15, 0.075 * level, 'sine');
      this.noiseBurst(0.055, 0.065 * level, 5_100, 'highpass', 0.018, 2_400, 0.7, 0.1);
    } else if (kind === 'health') {
      this.noiseBurst(0.1, 0.14 * level, 1_250, 'lowpass', 0, 160, 0.52, 0.05);
      this.oscillator(155, 58, 0.11, 0.085 * level, 'sine');
    } else if (kind === 'blast') {
      this.noiseBurst(0.035, 0.48 * level, 2_300, 'highpass', 0, 820, 0.55, 0.2);
      this.noiseBurst(0.62, 0.48 * level, 780, 'lowpass', 0, 65, 0.42, 0.55);
      this.oscillator(86, 24, 0.58, 0.31 * level, 'sine');
    } else {
      this.noiseBurst(0.12, 0.15 * level, 2_300, 'bandpass', 0, 510, 1.2, 0.08);
      this.oscillator(205, 72, 0.12, 0.07 * level, 'sine');
    }
  }

  diagnostics(): AuthoredAudioState {
    return this.state;
  }

  dispose(target: HTMLElement): void {
    if (this.state === 'disposed') return;
    this.state = 'disposed';
    target.removeEventListener('pointerdown', this.unlock);
    target.removeEventListener('keydown', this.unlock);
    window.removeEventListener('keydown', this.unlock);
    if (this.context !== null) void this.context.close();
    this.context = null;
    this.output = null;
    this.noise = null;
    this.roomInput = null;
    this.room = null;
  }
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh && !(object as THREE.Line).isLine) return;
    const renderable = object as THREE.Mesh | THREE.Line;
    renderable.geometry.dispose();
    const materials = Array.isArray(renderable.material)
      ? renderable.material
      : [renderable.material];
    for (const material of materials) material.dispose();
  });
}

function mapVelocityToScene(
  value: Readonly<{ x: number; y: number; z: number }>,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  return target.set(value.x, value.y, -value.z);
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

function hashUnit(value: string, salt: number): number {
  let hash = (0x811c9dc5 ^ salt) >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash / 0xffff_ffff;
}

function cylinderBetween(
  origin: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  material: THREE.Material,
  radialSegments = 6,
): THREE.Mesh {
  const delta = end.clone().sub(origin);
  const length = Math.max(0.001, delta.length());
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, radialSegments),
    material,
  );
  mesh.position.copy(origin).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    delta.normalize(),
  );
  return mesh;
}

function rocketModel(): RocketPresentation {
  const root = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x38444a,
    metalness: 0.86,
    roughness: 0.22,
  });
  const darkMaterial = new THREE.MeshStandardMaterial({
    color: 0x11171a,
    metalness: 0.62,
    roughness: 0.38,
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: 0xff6845,
    emissive: 0xff3d24,
    emissiveIntensity: 2.5,
    metalness: 0.25,
    roughness: 0.2,
  });
  const plumeMaterial = new THREE.MeshBasicMaterial({
    color: 0xffa34f,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
  });
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.105, 0.58, 10),
    bodyMaterial,
  );
  body.rotation.x = Math.PI / 2;
  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.087, 0.2, 10),
    accentMaterial,
  );
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -0.39;
  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(0.105, 0.018, 7, 14),
    darkMaterial,
  );
  collar.position.z = 0.25;
  root.add(body, nose, collar);
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.16, 0.18),
      darkMaterial,
    );
    fin.position.set(
      Math.cos(angle) * 0.11,
      Math.sin(angle) * 0.11,
      0.2,
    );
    fin.rotation.z = angle;
    root.add(fin);
  }
  const plume = new THREE.Mesh(
    new THREE.ConeGeometry(0.095, 0.42, 10),
    plumeMaterial,
  );
  plume.rotation.x = Math.PI / 2;
  plume.position.z = 0.5;
  root.add(plume);
  root.userData.presentationOnly = true;
  root.userData.noHit = true;
  return {
    root,
    plume,
    previousPosition: new THREE.Vector3(
      Number.NaN,
      Number.NaN,
      Number.NaN,
    ),
  };
}

export function createOnlineWeaponPresentationFx(
  scene: THREE.Scene,
  interactionTarget: HTMLElement,
): OnlineWeaponPresentationFx {
  const audio = new AuthoredWeaponAudio(interactionTarget);
  const transients: TransientEffect[] = [];
  const rockets = new Map<string, RocketPresentation>();
  const phases = new Map<string, KyxWeaponPhase>();
  let acceptedAttackPresentationCount = 0;
  let confirmedDamagePresentationCount = 0;
  let reloadPresentationCount = 0;
  let disposed = false;

  const addTransient = (
    root: THREE.Object3D,
    kind: TransientEffect['kind'],
    nowMilliseconds: number,
    lifetimeMilliseconds: number,
  ): void => {
    root.traverse((object) => {
      object.userData.presentationOnly = true;
      object.userData.noHit = true;
      if ((object as THREE.Mesh).isMesh) {
        const mesh = object as THREE.Mesh;
        mesh.frustumCulled = false;
        mesh.renderOrder = 32;
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        for (const material of materials) {
          if ('opacity' in material) {
            material.userData.baseOpacity = material.opacity;
          }
        }
      }
    });
    scene.add(root);
    transients.push({
      root,
      kind,
      startedAtMilliseconds: nowMilliseconds,
      expiresAtMilliseconds: nowMilliseconds + lifetimeMilliseconds,
    });
  };

  const presentBlast = (
    position: THREE.Vector3,
    color: number,
    nowMilliseconds: number,
    radius = 0.55,
  ): void => {
    const group = new THREE.Group();
    group.position.copy(position);
    const shellMaterial = new THREE.MeshBasicMaterial({
      color,
      wireframe: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0xffe4b0,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    });
    group.add(
      new THREE.Mesh(
        new THREE.IcosahedronGeometry(radius, 2),
        shellMaterial,
      ),
      new THREE.Mesh(
        new THREE.SphereGeometry(radius * 0.48, 12, 8),
        coreMaterial,
      ),
    );
    const light = new THREE.PointLight(color, 7.5, radius * 12, 2);
    group.add(light);
    addTransient(group, 'blast', nowMilliseconds, 650);
  };

  const presentImpulsePulse = (
    position: THREE.Vector3,
    nowMilliseconds: number,
    radius = 0.72,
  ): void => {
    const group = new THREE.Group();
    group.position.copy(position);
    group.name = 'CUTLINE_LAUNCH_TERMINAL_PULSE';

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x7de9e1,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const edgeMaterial = new THREE.MeshBasicMaterial({
      color: 0xd8fffb,
      transparent: true,
      opacity: 0.66,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const horizontalRing = new THREE.Mesh(
      new THREE.TorusGeometry(radius, radius * 0.045, 6, 32),
      ringMaterial,
    );
    horizontalRing.rotation.x = Math.PI / 2;
    const verticalRing = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.62, radius * 0.026, 5, 28),
      edgeMaterial,
    );
    verticalRing.rotation.y = Math.PI / 2;
    const pressureCore = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.22, 12, 8),
      new THREE.MeshBasicMaterial({
        color: 0xffc46b,
        transparent: true,
        opacity: 0.58,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    pressureCore.scale.set(1, 0.42, 1);
    group.add(horizontalRing, verticalRing, pressureCore);
    group.add(new THREE.PointLight(0x7de9e1, 4.2, radius * 9, 2));
    addTransient(group, 'impulse', nowMilliseconds, 480);
  };

  const muzzleFlash = (
    position: THREE.Vector3,
    direction: THREE.Vector3,
    family: KyxWeaponFamily,
    color: number,
    nowMilliseconds: number,
    local: boolean,
  ): void => {
    if (family === 'melee') return;
    const group = new THREE.Group();
    group.position.copy(position);
    group.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, -1),
      direction.clone().normalize(),
    );
    const worldSize = family === 'rocket'
      ? 0.42
      : family === 'shotgun'
        ? 0.28
        : family === 'sniper'
          ? 0.23
          : family === 'pistol'
            ? 0.17
            : 0.18;
    // A world-scale flash placed centimeters from the first-person camera
    // blooms into a screen-filling white polygon. Preserve the readable remote
    // silhouette while using a compact, shorter-lived local flash.
    const size = worldSize * (local ? 0.42 : 1);
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0xfff1c4,
      transparent: true,
      opacity: local ? 0.72 : 0.98,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const accentMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: local ? 0.58 : 0.86,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const core = new THREE.Mesh(
      new THREE.ConeGeometry(size * 0.28, size, 7),
      coreMaterial,
    );
    core.rotation.x = -Math.PI / 2;
    core.position.z = -size * 0.45;
    group.add(core);
    for (const angle of [0, Math.PI / 2]) {
      const flare = new THREE.Mesh(
        new THREE.ConeGeometry(size * 0.42, size * 0.72, 4),
        accentMaterial,
      );
      flare.rotation.set(-Math.PI / 2, 0, angle);
      flare.position.z = -size * 0.3;
      group.add(flare);
    }
    const light = new THREE.PointLight(
      color,
      local ? 1.4 : family === 'rocket' ? 8 : 4,
      local ? 2 : 4,
    );
    group.add(light);
    addTransient(
      group,
      'flash',
      nowMilliseconds,
      local ? 78 : family === 'rocket' ? 160 : 145,
    );
  };

  const tracer = (
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    distance: number,
    color: number,
    family: KyxWeaponFamily,
    nowMilliseconds: number,
    opacity = 0.9,
  ): void => {
    const startOffset = family === 'shotgun' ? 0.18 : 0.08;
    const start = origin.clone().addScaledVector(direction, startOffset);
    const end = origin.clone().addScaledVector(direction, distance);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const radius = family === 'sniper'
      ? 0.018
      : family === 'shotgun'
        ? 0.009
        : family === 'pistol'
          ? 0.013
          : 0.011;
    const mesh = cylinderBetween(start, end, radius, material);
    addTransient(
      mesh,
      'tracer',
      nowMilliseconds,
      family === 'sniper' ? 210 : 175,
    );
  };

  const meleeArc = (
    actorPosition: THREE.Vector3,
    yawMilliDegrees: number,
    color: number,
    nowMilliseconds: number,
  ): void => {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const slash = new THREE.Mesh(
      new THREE.TorusGeometry(0.8, 0.035, 5, 30, Math.PI * 1.35),
      material,
    );
    slash.position.copy(actorPosition).add(new THREE.Vector3(0, 1.2, 0));
    slash.rotation.set(
      Math.PI / 2,
      -yawMilliDegrees * Math.PI / 180_000 - Math.PI / 2,
      0.28,
    );
    addTransient(slash, 'melee', nowMilliseconds, 245);
  };

  const impact = (
    position: THREE.Vector3,
    kind: 'shield' | 'health',
    eventId: string,
    nowMilliseconds: number,
  ): void => {
    const group = new THREE.Group();
    group.position.copy(position);
    const color = kind === 'shield' ? 0x6eeaff : 0xffb26a;
    const ringMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(kind === 'shield' ? 0.28 : 0.2, 0.022, 6, 24),
      ringMaterial,
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    if (kind === 'shield') {
      const shellMaterial = new THREE.MeshBasicMaterial({
        color,
        wireframe: true,
        transparent: true,
        opacity: 0.52,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      group.add(new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.34, 1),
        shellMaterial,
      ));
    } else {
      for (let index = 0; index < 7; index += 1) {
        const azimuth = hashUnit(eventId, index * 13 + 5) * Math.PI * 2;
        const elevation = (
          hashUnit(eventId, index * 17 + 9) - 0.35
        ) * Math.PI * 0.7;
        const direction = new THREE.Vector3(
          Math.cos(azimuth) * Math.cos(elevation),
          Math.sin(elevation),
          Math.sin(azimuth) * Math.cos(elevation),
        );
        const sparkMaterial = ringMaterial.clone();
        const spark = cylinderBetween(
          new THREE.Vector3(),
          direction.multiplyScalar(0.22 + index * 0.018),
          0.008,
          sparkMaterial,
          4,
        );
        group.add(spark);
      }
    }
    addTransient(
      group,
      kind === 'shield' ? 'impact_shield' : 'impact_health',
      nowMilliseconds,
      kind === 'shield' ? 360 : 260,
    );
  };

  const presentAttack = (
    context: WeaponAttackPresentationContext,
  ): void => {
    if (disposed) return;
    acceptedAttackPresentationCount += 1;
    triggerKyxWeaponFire(context.weapon);
    audio.fire(context.weapon.family, context.local);
    if (context.weapon.family === 'melee') {
      meleeArc(
        context.actorPosition,
        context.yawMilliDegrees,
        context.weapon.accent,
        context.nowMilliseconds,
      );
      return;
    }
    muzzleFlash(
      context.muzzle,
      context.direction,
      context.weapon.family,
      context.weapon.accent,
      context.nowMilliseconds,
      context.local,
    );
    if (context.event.attackModel === 'pellet_hitscan') {
      const ballistics = context.event.ballistics.length > 0
        ? context.event.ballistics
        : [{ pelletIndex: 0, spreadPitchMilliDegrees: 0, spreadYawMilliDegrees: 0 }];
      for (const pellet of ballistics.slice(0, 16)) {
        tracer(
          context.muzzle,
          directionFromLook(
            context.yawMilliDegrees + pellet.spreadYawMilliDegrees,
            context.pitchMilliDegrees + pellet.spreadPitchMilliDegrees,
          ),
          24,
          context.weapon.tracer,
          'shotgun',
          context.nowMilliseconds,
          0.74,
        );
      }
    } else if (context.event.attackModel === 'hitscan') {
      tracer(
        context.muzzle,
        context.direction,
        context.weapon.family === 'sniper' ? 118 : 76,
        context.weapon.tracer,
        context.weapon.family,
        context.nowMilliseconds,
      );
    }
    if (
      context.weapon.family === 'rocket'
      && context.weapon.backblast !== null
    ) {
      const backblast = context.weapon.backblast.getWorldPosition(
        new THREE.Vector3(),
      );
      presentBlast(
        backblast,
        0xff7a45,
        context.nowMilliseconds,
        0.16,
      );
    }
  };

  const presentDamage = (
    context: WeaponDamagePresentationContext,
  ): void => {
    if (disposed) return;
    confirmedDamagePresentationCount += 1;
    const shield = context.event.shieldDamagePoints > 0;
    impact(
      context.impactPosition,
      shield ? 'shield' : 'health',
      context.event.eventId,
      context.nowMilliseconds,
    );
    audio.impact(
      shield ? 'shield' : 'health',
      context.localSource || context.localTarget,
    );
    if (
      context.sourceMuzzle !== null
      && context.sourceWeapon !== null
      && context.sourceWeapon.family === 'sniper'
    ) {
      const direction = context.impactPosition.clone()
        .sub(context.sourceMuzzle)
        .normalize();
      tracer(
        context.sourceMuzzle,
        direction,
        context.sourceMuzzle.distanceTo(context.impactPosition),
        context.sourceWeapon.tracer,
        'sniper',
        context.nowMilliseconds,
        0.98,
      );
    }
  };

  const presentMeleeContact = (
    event: CombatPresentationWeaponMeleeContactEventV1,
    contactPosition: THREE.Vector3 | null,
    nowMilliseconds: number,
    local: boolean,
  ): void => {
    if (disposed || contactPosition === null || event.outcome !== 'contact') {
      return;
    }
    impact(contactPosition, 'shield', event.eventId, nowMilliseconds);
    audio.impact('melee', local);
  };

  const presentProjectileDetonation = (
    _event: CombatPresentationWeaponProjectileDetonatedEventV1,
    position: THREE.Vector3,
    nowMilliseconds: number,
    local: boolean,
  ): void => {
    if (disposed) return;
    presentBlast(position, 0xff6845, nowMilliseconds, 0.72);
    audio.impact('blast', local);
  };

  const notifyWeaponPhase = (
    playerId: string,
    weapon: KyxWeaponPresentationModel,
    phase: KyxWeaponPhase,
    nowMilliseconds: number,
    local: boolean,
  ): void => {
    if (disposed) return;
    const key = `${playerId}:${weapon.authorityWeaponId}`;
    const previous = phases.get(key);
    phases.set(key, phase);
    setKyxWeaponPhase(weapon, phase, nowMilliseconds);
    if (previous === undefined || previous === phase) return;
    if (phase === 'reloading') {
      reloadPresentationCount += 1;
      audio.reload('start', weapon.family, local);
    } else if (previous === 'reloading') {
      reloadPresentationCount += 1;
      audio.reload('complete', weapon.family, local);
    }
  };

  const syncAuthoritativeRockets = (
    projectiles: readonly CombatWeaponProjectileSnapshotV1[],
    nowMilliseconds: number,
  ): void => {
    if (disposed) return;
    const active = new Set<string>();
    for (const projectile of projectiles) {
      if (projectile.phase !== 'active') continue;
      active.add(projectile.projectileId);
      let presentation = rockets.get(projectile.projectileId);
      if (presentation === undefined) {
        presentation = rocketModel();
        presentation.root.name = `ONLINE_AUTHORITY_ROCKET_${projectile.projectileId}`;
        rockets.set(projectile.projectileId, presentation);
        scene.add(presentation.root);
      }
      const nextPosition = new THREE.Vector3(
        projectile.xMillimeters / 1_000,
        projectile.yMillimeters / 1_000,
        -projectile.zMillimeters / 1_000,
      );
      if (
        Number.isFinite(presentation.previousPosition.x)
        && presentation.previousPosition.distanceToSquared(nextPosition) > 0.003
      ) {
        const trailMaterial = new THREE.MeshBasicMaterial({
          color: 0xff7a45,
          transparent: true,
          opacity: 0.48,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const trail = cylinderBetween(
          presentation.previousPosition,
          nextPosition,
          0.035,
          trailMaterial,
          5,
        );
        addTransient(trail, 'rocket_trail', nowMilliseconds, 150);
      }
      presentation.previousPosition.copy(nextPosition);
      presentation.root.position.copy(nextPosition);
      const velocity = mapVelocityToScene({
        x: projectile.velocityXMillimetersPerSecond,
        y: projectile.velocityYMillimetersPerSecond,
        z: projectile.velocityZMillimetersPerSecond,
      });
      if (velocity.lengthSq() > 0) {
        presentation.root.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 0, -1),
          velocity.normalize(),
        );
      }
      const plumePulse = 0.9 + Math.sin(
        nowMilliseconds * 0.035
          + hashUnit(projectile.projectileId, 7) * Math.PI * 2,
      ) * 0.18;
      presentation.plume.scale.set(1, plumePulse, 1);
    }
    for (const [projectileId, presentation] of rockets) {
      if (active.has(projectileId)) continue;
      scene.remove(presentation.root);
      disposeObject(presentation.root);
      rockets.delete(projectileId);
    }
  };

  const update = (nowMilliseconds: number): void => {
    if (disposed) return;
    for (let index = transients.length - 1; index >= 0; index -= 1) {
      const effect = transients[index];
      const span = effect.expiresAtMilliseconds - effect.startedAtMilliseconds;
      const progress = Math.max(
        0,
        Math.min(1, (nowMilliseconds - effect.startedAtMilliseconds) / span),
      );
      effect.root.traverse((object) => {
        if (!(object as THREE.Mesh).isMesh && !(object as THREE.Line).isLine) {
          return;
        }
        const renderable = object as THREE.Mesh | THREE.Line;
        const materials = Array.isArray(renderable.material)
          ? renderable.material
          : [renderable.material];
        for (const material of materials) {
          if ('opacity' in material) {
            const baseOpacity = typeof material.userData.baseOpacity === 'number'
              ? material.userData.baseOpacity
              : 1;
            material.opacity = Math.max(0, baseOpacity * (1 - progress));
          }
        }
      });
      if (effect.kind === 'blast') {
        effect.root.scale.setScalar(1 + progress * 6.5);
      } else if (effect.kind === 'impulse') {
        effect.root.scale.setScalar(1 + progress * 7.5);
      } else if (
        effect.kind === 'impact_shield'
        || effect.kind === 'impact_health'
      ) {
        effect.root.scale.setScalar(1 + progress * 2.2);
        effect.root.rotation.y += 0.08;
      } else if (effect.kind === 'melee') {
        effect.root.rotation.z += 0.065;
        effect.root.scale.setScalar(1 + progress * 0.28);
      } else if (effect.kind === 'flash') {
        effect.root.scale.setScalar(1 + progress * 0.75);
      }
      if (nowMilliseconds < effect.expiresAtMilliseconds) continue;
      scene.remove(effect.root);
      disposeObject(effect.root);
      transients.splice(index, 1);
    }
  };

  const diagnostics = (): OnlineWeaponPresentationFxDiagnostics => ({
    activeTransientCount: transients.length,
    activeRocketCount: rockets.size,
    authoredAudio: disposed ? 'disposed' : audio.diagnostics(),
    acceptedAttackPresentationCount,
    confirmedDamagePresentationCount,
    reloadPresentationCount,
  });

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    audio.dispose(interactionTarget);
    for (const effect of transients) {
      scene.remove(effect.root);
      disposeObject(effect.root);
    }
    transients.length = 0;
    for (const presentation of rockets.values()) {
      scene.remove(presentation.root);
      disposeObject(presentation.root);
    }
    rockets.clear();
    phases.clear();
  };

  return Object.freeze({
    presentAttack,
    presentDamage,
    presentMeleeContact,
    presentProjectileDetonation,
    presentBlast,
    presentImpulsePulse,
    notifyWeaponPhase,
    syncAuthoritativeRockets,
    update,
    diagnostics,
    dispose,
  });
}
