import type * as THREE from 'three';

interface DisposableRenderObject extends THREE.Object3D {
  readonly geometry?: THREE.BufferGeometry;
  readonly material?: THREE.Material | THREE.Material[];
}

export interface DisposeThreeObjectResourceOptions {
  readonly geometry?: boolean;
  readonly materials?: boolean;
}

export interface DisposeThreeObjectResourceDiagnostics {
  readonly renderObjectCount: number;
  readonly geometryCount: number;
  readonly materialCount: number;
}

function isDisposableRenderObject(
  object: THREE.Object3D,
): object is DisposableRenderObject {
  const candidate = object as THREE.Object3D & {
    readonly isMesh?: boolean;
    readonly isLine?: boolean;
    readonly isPoints?: boolean;
    readonly isSprite?: boolean;
  };
  return candidate.isMesh === true
    || candidate.isLine === true
    || candidate.isPoints === true
    || candidate.isSprite === true;
}

/**
 * Releases unique GPU-owning resources below an Object3D root.
 *
 * Three.js Lines, Points, and Sprites own disposable resources just like
 * Meshes. Keeping this traversal centralized prevents map and presentation
 * teardown from silently leaking non-mesh effects. Shared resources are
 * disposed at most once per traversal.
 */
export function disposeThreeObjectResources(
  root: THREE.Object3D,
  options: DisposeThreeObjectResourceOptions = {},
): DisposeThreeObjectResourceDiagnostics {
  const shouldDisposeGeometry = options.geometry ?? true;
  const shouldDisposeMaterials = options.materials ?? true;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  let renderObjectCount = 0;

  root.traverse((object) => {
    if (!isDisposableRenderObject(object)) return;
    renderObjectCount += 1;

    // Three.js Sprites all reference one module-owned singleton quad. Disposing
    // it while tearing down one presentation invalidates every other Sprite in
    // the renderer, so only their instance-owned materials are released here.
    if (
      shouldDisposeGeometry
      && object.geometry !== undefined
      && (object as THREE.Sprite).isSprite !== true
    ) {
      geometries.add(object.geometry);
    }
    if (shouldDisposeMaterials && object.material !== undefined) {
      const objectMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of objectMaterials) materials.add(material);
    }
  });

  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();

  return Object.freeze({
    renderObjectCount,
    geometryCount: geometries.size,
    materialCount: materials.size,
  });
}
