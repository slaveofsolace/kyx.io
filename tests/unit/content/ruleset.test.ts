import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RULESET_ID,
  DEFAULT_RULESET_REVISION,
  listBundledRulesetIds,
  listBundledRulesetRevisions,
  loadRuleset,
  parseRulesetJson,
  requireRuleset,
  validateRulesetContent,
} from '../../../src/content';

describe('revamped_classic content contract', () => {
  it('loads the versioned JSON-first default ruleset', () => {
    const result = loadRuleset();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toMatchObject({
      schemaVersion: 1,
      id: DEFAULT_RULESET_ID,
      revision: DEFAULT_RULESET_REVISION,
      displayName: 'Revamped',
      implementationStatus: 'contract_only',
      tickRateHz: 20,
      movementProfile: {
        id: 'phase3_hypothesis_v1',
        revision: 1,
        implementationStatus: 'fixture_only',
      },
    });
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.abilities)).toBe(true);
    expect(Object.isFrozen(result.value.abilities[0]?.presentation)).toBe(true);
    expect(listBundledRulesetIds()).toEqual(['revamped_classic']);
    expect(listBundledRulesetRevisions(DEFAULT_RULESET_ID)).toEqual([1, 2, 3]);
    expect(listBundledRulesetRevisions('not_bundled')).toEqual([]);
  });

  it('keeps revision 1 addressable without making its identity the default', () => {
    const historical = requireRuleset(DEFAULT_RULESET_ID, 1);
    const current = requireRuleset(DEFAULT_RULESET_ID, DEFAULT_RULESET_REVISION);

    expect(historical).toMatchObject({
      id: DEFAULT_RULESET_ID,
      revision: 1,
      movementProfile: {
        id: 'revamped_classic_movement_v1',
        revision: 1,
        implementationStatus: 'contract_only',
      },
    });
    expect(current).toEqual(requireRuleset(DEFAULT_RULESET_ID));
    expect(current.revision).toBe(2);
    expect(historical).not.toEqual(current);
  });

  it('pins the proposed equip economy and keeps ammo ability off', () => {
    const ruleset = requireRuleset();

    expect(ruleset.loadout).toEqual({
      weaponSlots: {
        primary: { capacity: 1, acquisition: 'spawn' },
        secondary: { capacity: 1, acquisition: 'pickup_optional' },
        melee: { capacity: 1, acquisition: 'spawn' },
      },
      abilitySlots: { damage: 2, utility: 1 },
      ammoAbility: { enabledByDefault: false },
    });
  });

  it('truthfully covers rifle, melee, teleport, grenade, and deployable seams', () => {
    const ruleset = requireRuleset();
    const primary = ruleset.weapons.find(({ id }) => id === ruleset.verticalSlice.primaryWeaponId);
    const melee = ruleset.weapons.find(({ id }) => id === ruleset.verticalSlice.meleeWeaponId);
    const damage = ruleset.verticalSlice.damageAbilityIds.map((id) =>
      ruleset.abilities.find((ability) => ability.id === id),
    );
    const utility = ruleset.abilities.find(({ id }) => id === ruleset.verticalSlice.utilityAbilityId);

    expect(primary).toMatchObject({ slot: 'primary', category: 'rifle', implementationStatus: 'contract_only' });
    expect(melee).toMatchObject({ slot: 'melee', category: 'melee', implementationStatus: 'contract_only' });
    expect(damage.map((ability) => ability?.category)).toEqual(['grenade', 'deployable']);
    expect(utility).toMatchObject({ slot: 'utility', category: 'teleport', implementationStatus: 'contract_only' });
  });

  it('keeps unselected balance values explicit instead of silently defaulting', () => {
    const ruleset = requireRuleset();
    const rifle = ruleset.weapons.find(({ category }) => category === 'rifle');
    const grenade = ruleset.abilities.find(({ category }) => category === 'grenade');

    expect(rifle?.damage.base).toBeNull();
    expect(rifle?.timingsTicks.fireCooldown).toBeNull();
    expect(rifle?.delivery.rangeMillimeters).toBeNull();
    expect(rifle?.spread.baseMilliDegrees).toBeNull();
    expect(grenade?.effect.damageHealthPoints).toBeNull();
    expect(grenade?.effect.areaRadiusMillimeters).toBeNull();
    expect(grenade?.effect.impulseMillimetersPerSecond).toBeNull();
    expect(grenade?.timingsTicks.fuse).toBeNull();
    expect(rifle?.provenance.designReason.length).toBeGreaterThan(20);
    expect(grenade?.provenance.evidenceLabel).toBe('PRODUCT_OVERRIDE');
  });

  it('returns a stable code for missing bundled content', () => {
    const result = loadRuleset('not_bundled');

    expect(result).toEqual({
      ok: false,
      issues: [
        {
          code: 'CONTENT_RULESET_NOT_FOUND',
          path: '$',
          message: 'Bundled ruleset not found: not_bundled',
        },
      ],
    });
  });

  it('returns a stable code for an unavailable bundled revision', () => {
    const result = loadRuleset(DEFAULT_RULESET_ID, 99);

    expect(result).toEqual({
      ok: false,
      issues: [
        {
          code: 'CONTENT_RULESET_NOT_FOUND',
          path: '$',
          message: 'Bundled ruleset not found: revamped_classic@99',
        },
      ],
    });
  });

  it.each(['toString', '__proto__'])('does not resolve the inherited-looking catalog key %s', (id) => {
    expect(loadRuleset(id)).toEqual({
      ok: false,
      issues: [
        {
          code: 'CONTENT_RULESET_NOT_FOUND',
          path: '$',
          message: `Bundled ruleset not found: ${id}`,
        },
      ],
    });
  });
});

describe('ruleset validation failures', () => {
  it('reserves fixture-only status for movement-profile references', () => {
    const source = requireRuleset();
    const invalidRoot = validateRulesetContent({
      ...source,
      implementationStatus: 'fixture_only',
    });
    const invalidWeapon = validateRulesetContent({
      ...source,
      weapons: [
        { ...source.weapons[0], implementationStatus: 'fixture_only' },
        ...source.weapons.slice(1),
      ],
    });

    expect(invalidRoot).toEqual({
      ok: false,
      issues: [expect.objectContaining({
        code: 'CONTENT_INVALID_FIELD_VALUE',
        path: '$.implementationStatus',
      })],
    });
    expect(invalidWeapon).toEqual({
      ok: false,
      issues: [expect.objectContaining({
        code: 'CONTENT_INVALID_FIELD_VALUE',
        path: '$.weapons[0].implementationStatus',
      })],
    });
  });

  it('rejects malformed JSON with a stable code', () => {
    expect(parseRulesetJson('{not-json')).toEqual({
      ok: false,
      issues: [{ code: 'CONTENT_JSON_INVALID', path: '$', message: 'Ruleset JSON could not be parsed.' }],
    });
  });

  it('rejects an unsupported schema version', () => {
    const candidate = { ...requireRuleset(), schemaVersion: 2 };
    const result = validateRulesetContent(candidate);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'CONTENT_SCHEMA_VERSION_UNSUPPORTED',
      path: '$.schemaVersion',
    }));
  });

  it('rejects unknown fields instead of accepting contract drift', () => {
    const candidate = { ...requireRuleset(), inventedBalanceMode: true };
    const result = validateRulesetContent(candidate);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'CONTENT_UNKNOWN_FIELD',
      path: '$.inventedBalanceMode',
    }));
  });

  it('rejects an enabled-by-default ammo ability', () => {
    const source = requireRuleset();
    const candidate = {
      ...source,
      loadout: {
        ...source.loadout,
        ammoAbility: { enabledByDefault: true },
      },
    };
    const result = validateRulesetContent(candidate);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'CONTENT_AMMO_DEFAULT_INVALID',
      path: '$.loadout.ammoAbility.enabledByDefault',
    }));
  });

  it('rejects the wrong ability-slot budget', () => {
    const source = requireRuleset();
    const candidate = {
      ...source,
      loadout: {
        ...source.loadout,
        abilitySlots: { damage: 1, utility: 2 },
      },
    };
    const result = validateRulesetContent(candidate);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'CONTENT_LOADOUT_INVALID',
      path: '$.loadout.abilitySlots',
    }));
  });

  it('rejects a vertical slice that loses teleport', () => {
    const source = requireRuleset();
    const candidate = {
      ...source,
      abilities: source.abilities.filter(({ category }) => category !== 'teleport'),
    };
    const result = validateRulesetContent(candidate);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'CONTENT_VERTICAL_SLICE_MISSING',
      path: '$.verticalSlice.utilityAbilityId',
    }));
  });

  it('rejects duplicate semantic IDs', () => {
    const source = requireRuleset();
    const candidate = {
      ...source,
      abilities: [...source.abilities, source.abilities[0]],
    };
    const result = validateRulesetContent(candidate);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'CONTENT_DUPLICATE_ID' }));
  });

  it('enforces the schema v1 20 Hz tick rate for every semantic ID', () => {
    const candidate = {
      ...requireRuleset(),
      id: 'custom_ruleset',
      tickRateHz: 40,
    };
    const result = validateRulesetContent(candidate);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'CONTENT_INVALID_FIELD_VALUE',
      path: '$.tickRateHz',
    }));
  });

  it('returns a detached recursively frozen graph when the input root is already frozen', () => {
    const source = requireRuleset();
    const originalReason = source.provenance.designReason;
    const mutableProvenance = { ...source.provenance };
    const candidate = Object.freeze({
      ...source,
      provenance: mutableProvenance,
    });

    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(mutableProvenance)).toBe(false);

    const result = validateRulesetContent(candidate);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).not.toBe(candidate);
    expect(result.value.provenance).not.toBe(mutableProvenance);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.provenance)).toBe(true);
    expect(Object.isFrozen(result.value.weapons[0]?.presentation.markerIds)).toBe(true);
    expect(Reflect.set(result.value.provenance, 'designReason', 'mutated output')).toBe(false);

    mutableProvenance.designReason = 'mutated input';
    expect(result.value.provenance.designReason).toBe(originalReason);
  });

  it('rejects accessors without invoking them', () => {
    const source = requireRuleset();
    let getterCalls = 0;
    const ammoAbility: Record<string, unknown> = {};
    Object.defineProperty(ammoAbility, 'enabledByDefault', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return getterCalls === 1 ? false : true;
      },
    });
    const candidate = {
      ...source,
      loadout: {
        ...source.loadout,
        ammoAbility,
      },
    };

    const result = validateRulesetContent(candidate);

    expect(getterCalls).toBe(0);
    expect(result).toEqual({
      ok: false,
      issues: [
        expect.objectContaining({
          code: 'CONTENT_INVALID_FIELD_VALUE',
          path: '$.loadout.ammoAbility.enabledByDefault',
        }),
      ],
    });
  });

  it('rejects cycles, symbols, and custom prototypes with a stable boundary code', () => {
    const source = requireRuleset();
    const cyclic: Record<string, unknown> = { ...source };
    cyclic.loop = cyclic;
    const symbolField: Record<PropertyKey, unknown> = { ...source };
    symbolField[Symbol('hidden')] = true;
    const customPrototype = Object.assign(
      Object.create({ inherited: true }) as Record<string, unknown>,
      source,
    );

    for (const candidate of [cyclic, symbolField, customPrototype]) {
      const result = validateRulesetContent(candidate);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.issues[0]?.code).toBe('CONTENT_INVALID_FIELD_VALUE');
    }
  });

  it('rejects sparse and named arrays before schema validation', () => {
    const source = requireRuleset();
    const sparseAbilities = [...source.abilities];
    delete sparseAbilities[0];
    const namedAbilities = [...source.abilities];
    Object.defineProperty(namedAbilities, 'metadata', { value: true, enumerable: true });

    const sparseResult = validateRulesetContent({ ...source, abilities: sparseAbilities });
    const namedResult = validateRulesetContent({ ...source, abilities: namedAbilities });

    expect(sparseResult).toEqual({
      ok: false,
      issues: [expect.objectContaining({
        code: 'CONTENT_INVALID_FIELD_VALUE',
        path: '$.abilities[0]',
      })],
    });
    expect(namedResult).toEqual({
      ok: false,
      issues: [expect.objectContaining({
        code: 'CONTENT_INVALID_FIELD_VALUE',
        path: '$.abilities.metadata',
      })],
    });
  });

  it('rejects content deeper than the snapshot boundary', () => {
    const candidate: Record<string, unknown> = { ...requireRuleset() };
    let cursor = candidate;
    for (let depth = 0; depth < 34; depth += 1) {
      const nested: Record<string, unknown> = {};
      cursor.nested = nested;
      cursor = nested;
    }

    const result = validateRulesetContent(candidate);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'CONTENT_INVALID_FIELD_VALUE',
        message: 'Content value exceeds the maximum nesting depth.',
      }),
    ]);
  });
});
