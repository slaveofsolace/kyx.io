import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import { Game } from '../../../src/core/Game.js';

describe('same-mode player resource reuse', () => {
  it('keeps the same player body and held-weapon identity across repeated prepares', () => {
    const scene = new THREE.Scene();
    const body = new THREE.Group();
    const heldWeapon = new THREE.Group();
    body.add(heldWeapon);
    body.userData = {
      isHuman: true,
      setLocomotion: vi.fn(),
      setAim: vi.fn(),
      setMotion: vi.fn(),
    };
    scene.add(body);

    const game = Object.assign(Object.create(Game.prototype), {
      world: { scene },
      player: {
        position: new THREE.Vector3(4, 2, -8),
        yaw: 0.75,
      },
      _playerBody: body,
      _tpsWeaponId: 'm4',
    }) as Game;

    for (let restart = 0; restart < 6; restart++) {
      game._preparePlayerBody(true, 'assault');
      expect(game._playerBody).toBe(body);
      expect(body.children).toContain(heldWeapon);
      expect(game._tpsWeaponId).toBe('m4');
    }

    expect(scene.children).toEqual([body]);
    expect(body.position).toEqual(game.player.position);
    expect(body.rotation.y).toBe(game.player.yaw);
    expect(body.userData.setLocomotion).toHaveBeenCalledTimes(6);
    expect(body.userData.setAim).toHaveBeenCalledTimes(6);
    expect(body.userData.setMotion).toHaveBeenCalledTimes(6);
  });

  it('marks only the internal restart path for runtime actor reuse', () => {
    const startGame = vi.fn();
    const game = Object.assign(Object.create(Game.prototype), {
      player: { name: 'LOCAL TEST' },
      selectedSkin: { id: 'spartan' },
      selectedArmorType: 'recon',
      _mode: { id: 'deathmatch' },
      _saveStats: vi.fn(),
      hud: { hideLeaderboard: vi.fn() },
      menu: { hideGameOver: vi.fn() },
      _startGame: startGame,
    }) as Game;

    game._restart();

    expect(startGame).toHaveBeenCalledWith(
      'LOCAL TEST',
      'spartan',
      'deathmatch',
      'recon',
      { reuseRuntimeActors: true },
    );
  });
});
