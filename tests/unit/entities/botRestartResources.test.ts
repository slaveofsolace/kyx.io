import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import { Bot } from '../../../src/entities/Bot.js';
import { BotManager } from '../../../src/entities/BotManager.js';

function makeResettableBot(spawnPoint = new THREE.Vector3()) {
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
  });
  material.transparent = true;
  material.opacity = 0.2;
  material.emissiveIntensity = 1;
  const mesh = new THREE.Group();
  mesh.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material));
  mesh.position.set(40, -3, 20);
  mesh.rotation.set(0.4, 0.5, 0.6);
  mesh.scale.setScalar(0.25);
  mesh.visible = false;

  const healthBarGroup = new THREE.Group();
  healthBarGroup.visible = false;
  const healthBarFg = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial(),
  );
  healthBarFg.scale.x = 0.1;
  healthBarFg.position.x = -0.2;

  const bot = Object.assign(Object.create(Bot.prototype), {
    mesh,
    bodyMat: material,
    position: spawnPoint.clone(),
    wanderTarget: spawnPoint.clone(),
    healthBarGroup,
    healthBarFg,
    maxHealth: 100,
    health: 1,
    alive: false,
    respawnTimer: 4,
    attackCooldown: 2,
    flashTimer: 1,
    wanderCooldown: 2,
    lungeTimer: 1,
    _gunTimer: 1,
    _alertBlend: 1,
    _weaponT: 1,
    _walkT: 1,
    _provoked: true,
    _provokeTimer: 7,
    _dying: true,
    _deathT: 0.5,
    _deathSide: -1,
    _deathBaseY: -3,
    _rig: null,
  }) as Bot;

  return { bot, mesh, material };
}

describe('same-mode bot resource reuse', () => {
  it('resets a bot in place without replacing its mesh or materials', () => {
    const spawn = new THREE.Vector3(3, 0, -7);
    const { bot, mesh, material } = makeResettableBot();

    bot.resetForMatch(spawn, true, 1.5, 2);

    expect(bot.mesh).toBe(mesh);
    expect((mesh.children[0] as THREE.Mesh).material).toBe(material);
    expect(bot.position).toEqual(spawn);
    expect(mesh.position).toEqual(spawn);
    expect(mesh.visible).toBe(true);
    expect(bot.alive).toBe(true);
    expect(bot.health).toBe(150);
    expect(bot.maxHealth).toBe(150);
    expect(bot.noRespawn).toBe(true);
    expect(bot.displayName).toBe('PRACTICE BOT 03');
    expect(bot._provoked).toBe(false);
    expect(bot._dying).toBe(false);
    expect(material.transparent).toBe(false);
    expect(material.opacity).toBe(1);
    expect(material.emissiveIntensity).toBe(0);
  });

  it('reuses the same actor and mesh population across repeated resets', () => {
    const scene = new THREE.Scene();
    const world = {
      spawnPoints: [
        new THREE.Vector3(1, 0, 1),
        new THREE.Vector3(-1, 0, -1),
      ],
    };
    const manager = new BotManager(world, scene);
    const first = makeResettableBot();
    const second = makeResettableBot();
    manager.bots = [first.bot, second.bot];
    scene.add(first.mesh, second.mesh);
    const actors = [...manager.bots];
    const meshes = manager.bots.map((bot) => bot.mesh);
    const resets = manager.bots.map((bot) => vi.spyOn(bot, 'resetForMatch'));

    for (let restart = 0; restart < 6; restart++) {
      expect(manager.resetAll(2, false, 1)).toBe(true);
    }

    expect(manager.bots).toEqual(actors);
    expect(manager.bots.map((bot) => bot.mesh)).toEqual(meshes);
    expect(scene.children).toEqual(meshes);
    for (const reset of resets) expect(reset).toHaveBeenCalledTimes(6);
  });

  it('declines reuse when the requested population changes', () => {
    const scene = new THREE.Scene();
    const manager = new BotManager({
      spawnPoints: [new THREE.Vector3()],
    }, scene);
    const { bot, mesh } = makeResettableBot();
    manager.bots = [bot];
    scene.add(mesh);
    const reset = vi.spyOn(bot, 'resetForMatch');

    expect(manager.resetAll(2, false, 1)).toBe(false);
    expect(reset).not.toHaveBeenCalled();
    expect(manager.bots).toEqual([bot]);
    expect(scene.children).toEqual([mesh]);
  });
});
