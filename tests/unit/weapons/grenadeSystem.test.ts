import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { IMPULSE_GRENADE_RULES_V2 } from '../../../src/authority/combat/impulseGrenade';
import {
  GrenadeSystem,
  resolveLaunchImpulseVector,
} from '../../../src/weapons/GrenadeSystem.js';

describe('local grenade presentation runtime', () => {
  it('keeps smoke airborne until contact instead of airbursting on its old timer', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 100, 0);
    camera.lookAt(0, 100, -1);
    camera.updateMatrixWorld(true);
    const grenades = new GrenadeSystem(scene);

    expect(grenades.throwSmoke(camera)).toBe(true);
    for (let index = 0; index < 20; index += 1) {
      grenades.update(0.1, { player: null, targets: [], collisionMeshes: [] });
    }

    expect(grenades.throwables).toHaveLength(1);
    expect(grenades.smokeClouds).toHaveLength(0);
    expect(grenades.throwables[0]).toMatchObject({
      abilityId: 'smoke_grenade_v1',
      fuseStarted: false,
      bounceCount: 0,
    });
  });

  it('detonates Launch on first world contact without emitting a bounce', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1, 0);
    camera.lookAt(0, 0, -1);
    camera.updateMatrixWorld(true);
    const grenades = new GrenadeSystem(scene);
    const events: Array<{ kind: string; abilityId: string }> = [];
    grenades.onProjectileEvent = (event: { kind: string; abilityId: string }) => events.push(event);
    const player = {
      alive: true,
      position: new THREE.Vector3(0, 0, 0),
      velocity: new THREE.Vector3(),
    };

    expect(grenades.throwLaunch(camera)).toBe(true);
    for (let index = 0; index < 20 && grenades.throwables.length > 0; index += 1) {
      grenades.update(0.05, { player, targets: [], collisionMeshes: [] });
    }

    expect(events.filter(({ kind }) => kind === 'ability_bounce')).toHaveLength(0);
    expect(events.filter(({ kind }) => kind === 'ability_contact')).toHaveLength(1);
    expect(events.filter(({ kind }) => kind === 'ability_detonated')).toHaveLength(1);
    expect(events.map(({ kind }) => kind)).toEqual([
      'ability_throw',
      'ability_contact',
      'ability_detonated',
    ]);
    expect(player.velocity.length()).toBeGreaterThan(0);
    expect(grenades.throwables).toHaveLength(0);
  });

  it('does not evaluate the zero-tick Launch fuse before first contact', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 100, 0);
    camera.lookAt(0, 100, -1);
    camera.updateMatrixWorld(true);
    const grenades = new GrenadeSystem(scene);
    const events: Array<{ kind: string }> = [];
    grenades.onProjectileEvent = (event: { kind: string }) => events.push(event);

    expect(grenades.throwLaunch(camera)).toBe(true);
    grenades.update(0.1, { player: null, targets: [], collisionMeshes: [] });

    expect(grenades.throwables).toHaveLength(1);
    expect(grenades.throwables[0]).toMatchObject({
      fuseStarted: false,
      bounceCount: 0,
      settled: false,
    });
    expect(events.map(({ kind }) => kind)).toEqual(['ability_throw']);
  });

  it('predicts the Worker self/target caps with linear falloff and no added bounce bias', () => {
    const source = new THREE.Vector3(0, 0, 0);
    const self = resolveLaunchImpulseVector(source, source, 'self');
    const target = resolveLaunchImpulseVector(
      source,
      new THREE.Vector3(5.5, 0, 0),
      'enemy',
    );
    const outside = resolveLaunchImpulseVector(
      source,
      new THREE.Vector3(11, 0, 0),
      'enemy',
    );

    expect(self.toArray()).toEqual([
      0,
      IMPULSE_GRENADE_RULES_V2.selfImpulseMillimetersPerSecond / 1_000,
      0,
    ]);
    expect(target.toArray()).toEqual([3.5, 0, 0]);
    expect(outside.lengthSq()).toBe(0);
  });
});
