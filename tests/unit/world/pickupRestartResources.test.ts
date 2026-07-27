import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { PickupSystem } from '../../../src/world/PickupSystem.js';

describe('same-mode pickup resource reuse', () => {
  it('resets pickup state without replacing meshes, geometries, or materials', () => {
    const scene = new THREE.Scene();
    const system = new PickupSystem(scene);
    const pickups = [...system._pickups];
    const meshes = pickups.map((pickup) => pickup.mesh);
    const geometries = meshes.map((mesh) => (
      mesh.children.map((child: THREE.Object3D) => (child as THREE.Mesh).geometry)
    ));
    const materials = meshes.map((mesh) => (
      mesh.children.map((child: THREE.Object3D) => (child as THREE.Mesh).material)
    ));

    for (const pickup of system._pickups) {
      pickup.active = false;
      pickup.respawnTimer = 12;
      pickup.mesh.visible = false;
      pickup.mesh.position.y = -20;
      pickup.mesh.rotation.set(1, 2, 3);
    }

    for (let restart = 0; restart < 6; restart++) system.reset();

    expect(system._pickups).toEqual(pickups);
    expect(system._pickups.map((pickup) => pickup.mesh)).toEqual(meshes);
    expect(scene.children).toEqual(meshes);
    for (let index = 0; index < system._pickups.length; index++) {
      const pickup = system._pickups[index];
      expect(pickup.active).toBe(true);
      expect(pickup.respawnTimer).toBe(0);
      expect(pickup.mesh.visible).toBe(true);
      expect(pickup.mesh.position.y).toBe(pickup.baseY);
      expect(pickup.mesh.rotation.toArray()).toEqual([0, 0, 0, 'XYZ']);
      expect(
        pickup.mesh.children.map((child: THREE.Object3D) => (child as THREE.Mesh).geometry),
      ).toEqual(geometries[index]);
      expect(
        pickup.mesh.children.map((child: THREE.Object3D) => (child as THREE.Mesh).material),
      ).toEqual(materials[index]);
    }
  });
});
