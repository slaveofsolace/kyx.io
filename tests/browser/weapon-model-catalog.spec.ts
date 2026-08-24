import { expect, test } from '@playwright/test';

type BuiltWeaponModel = {
  id: string;
  meshCount: number;
  muzzleAttached: boolean;
  finiteMuzzleTransform: boolean;
};

type BrowserSceneNode = {
  parent: BrowserSceneNode | null;
  matrixWorld: { readonly elements: ArrayLike<number> };
};

type BrowserWeaponDefinition = { readonly id: string };

type BrowserWeaponGroup = BrowserSceneNode & {
  traverse(callback: (object: { readonly isMesh?: boolean }) => void): void;
  updateMatrixWorld(force: boolean): void;
};

const REQUIRED_FAMILIES = Object.freeze({
  pistol: ['sidearm', 'magnum'],
  smg: ['uzi', 'needler'],
  shotgun: ['levershotgun', 'energyshotgun'],
  assaultRifle: ['m4', 'm16', 'rifle', 'lmg', 'battlerifle', 'plasmarifle'],
  sniperMarksman: ['boltsniper', 'dmr'],
  rocketExplosive: ['rpg', 'fuelrod', 'concussion'],
  melee: ['knife', 'sword', 'ghammer'],
});

test('every offline weapon family builds a procedural viewmodel with an attached muzzle', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'networkidle' });

  const built = await page.evaluate(async (): Promise<BuiltWeaponModel[]> => {
    const definitionsUrl = '/src/weapons/weaponDefs.js';
    const modelsUrl = '/src/weapons/WeaponModels.js';
    const [definitionsModule, modelsModule] = await Promise.all([
      import(/* @vite-ignore */ definitionsUrl),
      import(/* @vite-ignore */ modelsUrl),
    ]);
    const { WEAPONS } = definitionsModule as {
      readonly WEAPONS: readonly BrowserWeaponDefinition[];
    };
    const { buildWeaponModel } = modelsModule as {
      readonly buildWeaponModel: (
        definition: BrowserWeaponDefinition,
        options: { readonly procedural: true },
      ) => { readonly group: BrowserWeaponGroup; readonly muzzle: BrowserSceneNode };
    };

    return WEAPONS.map((definition) => {
      const { group, muzzle } = buildWeaponModel(definition, { procedural: true });
      let meshCount = 0;
      group.traverse((object) => {
        if ('isMesh' in object && object.isMesh === true) meshCount += 1;
      });

      let cursor = muzzle;
      while (cursor.parent !== null && cursor !== group) cursor = cursor.parent;
      group.updateMatrixWorld(true);
      const transform = muzzle.matrixWorld.elements;

      return {
        id: definition.id,
        meshCount,
        muzzleAttached: cursor === group,
        finiteMuzzleTransform: [transform[12], transform[13], transform[14]]
          .every(Number.isFinite),
      };
    });
  });

  const ids = built.map(({ id }) => id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).toHaveLength(20);
  for (const family of Object.values(REQUIRED_FAMILIES)) {
    expect(ids).toEqual(expect.arrayContaining(family));
  }
  for (const model of built) {
    expect(model.meshCount, `${model.id} has rendered geometry`).toBeGreaterThan(0);
    expect(model.muzzleAttached, `${model.id} muzzle belongs to its model`).toBe(true);
    expect(model.finiteMuzzleTransform, `${model.id} muzzle transform is finite`).toBe(true);
  }
});
