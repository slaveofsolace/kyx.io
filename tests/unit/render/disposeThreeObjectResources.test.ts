import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import { disposeThreeObjectResources } from '../../../src/render/disposeThreeObjectResources';

describe('disposeThreeObjectResources', () => {
  it('covers meshes, lines, points, and sprites without double-disposal', () => {
    const root = new THREE.Group();
    const sharedGeometry = new THREE.BufferGeometry();
    const pointGeometry = new THREE.BufferGeometry();
    const sharedMaterial = new THREE.MeshBasicMaterial();
    const pointMaterial = new THREE.PointsMaterial();
    const spriteMaterial = new THREE.SpriteMaterial();
    const sharedGeometryDispose = vi.spyOn(sharedGeometry, 'dispose');
    const pointGeometryDispose = vi.spyOn(pointGeometry, 'dispose');
    const sharedMaterialDispose = vi.spyOn(sharedMaterial, 'dispose');
    const pointMaterialDispose = vi.spyOn(pointMaterial, 'dispose');
    const spriteMaterialDispose = vi.spyOn(spriteMaterial, 'dispose');
    const sprite = new THREE.Sprite(spriteMaterial);
    const sharedSpriteGeometryDispose = vi.spyOn(sprite.geometry, 'dispose');

    root.add(
      new THREE.Mesh(sharedGeometry, sharedMaterial),
      new THREE.Line(sharedGeometry, sharedMaterial),
      new THREE.Points(pointGeometry, pointMaterial),
      sprite,
    );

    expect(disposeThreeObjectResources(root)).toEqual({
      renderObjectCount: 4,
      geometryCount: 2,
      materialCount: 3,
    });
    expect(sharedGeometryDispose).toHaveBeenCalledTimes(1);
    expect(pointGeometryDispose).toHaveBeenCalledTimes(1);
    expect(sharedMaterialDispose).toHaveBeenCalledTimes(1);
    expect(pointMaterialDispose).toHaveBeenCalledTimes(1);
    expect(spriteMaterialDispose).toHaveBeenCalledTimes(1);
    expect(sharedSpriteGeometryDispose).not.toHaveBeenCalled();
  });

  it('can preserve geometry while releasing presentation materials', () => {
    const root = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.MeshBasicMaterial();
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    root.add(new THREE.Mesh(geometry, material));

    expect(disposeThreeObjectResources(root, { geometry: false })).toEqual({
      renderObjectCount: 1,
      geometryCount: 0,
      materialCount: 1,
    });
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });
});
