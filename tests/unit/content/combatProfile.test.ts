import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RULESET_REVISION,
  hashRulesetContent,
  requireRuleset,
  validateRulesetContent,
} from '../../../src/content';

describe('revamped_classic revision 3 combat implementation fixture', () => {
  it('keeps revision 2 as the accepted default and exposes revision 3 only by address', () => {
    const defaultRuleset = requireRuleset();
    const combatRuleset = requireRuleset('revamped_classic', 3);

    expect(DEFAULT_RULESET_REVISION).toBe(2);
    expect(defaultRuleset.revision).toBe(2);
    expect(defaultRuleset.combatProfile).toBeUndefined();
    expect(combatRuleset).toMatchObject({
      revision: 3,
      implementationStatus: 'contract_only',
      combatProfile: {
        schemaVersion: 1,
        implementationStatus: 'implementation_fixture',
        life: {
          maximumHealthPoints: 100,
          maximumShieldPoints: 0,
          spawnProtectionTicks: 20,
          respawnDelayTicks: 160,
          regenerationEnabled: false,
        },
        match: {
          mode: 'team_deathmatch',
          warmupTicks: 40,
          activeTicks: 9_600,
          postmatchTicks: 200,
          teamScoreLimit: 40,
        },
        autoRifle: {
          weaponId: 'vertical_rifle_v1',
          baseDamagePoints: 10,
          magazineCapacity: 50,
          reserveCapacity: 150,
          fireCooldownTicks: 2,
          reloadTicks: 60,
          readyTicks: 4,
          maximumSpreadMilliDegrees: 1_146,
          recoilPatternId: 'kyx_auto_rifle_12_v1',
        },
        impulseGrenade: {
          abilityId: 'vertical_impulse_grenade_v1',
          damageHealthPoints: 0,
          areaRadiusMillimeters: 11_000,
          projectileSpeedMillimetersPerSecond: 18_000,
          cooldownTicks: 240,
          fuseTicks: 30,
          maximumBounces: 3,
          maximumActivePerPlayer: 2,
        },
      },
    });
    expect(Object.isFrozen(combatRuleset)).toBe(true);
    expect(Object.isFrozen(combatRuleset.combatProfile)).toBe(true);
    expect(Object.isFrozen(combatRuleset.combatProfile?.impulseGrenade)).toBe(true);
  });

  it('pins the immutable revision 3 identity without changing historical identities', () => {
    expect(hashRulesetContent(requireRuleset('revamped_classic', 1))).toBe('75c24a622286d2b0');
    expect(hashRulesetContent(requireRuleset('revamped_classic', 2))).toBe('039ae95bed7ee716');
    expect(hashRulesetContent(requireRuleset('revamped_classic', 3))).toBe('d5f0418d1d927370');
  });

  it('requires the combat profile at revision 3 and forbids it on earlier revisions', () => {
    const combatRuleset = requireRuleset('revamped_classic', 3);
    const withoutCombat = structuredClone(combatRuleset) as unknown as Record<string, unknown>;
    Reflect.deleteProperty(withoutCombat, 'combatProfile');

    const missing = validateRulesetContent(withoutCombat);
    const premature = validateRulesetContent({
      ...requireRuleset('revamped_classic', 2),
      combatProfile: combatRuleset.combatProfile,
    });

    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.issues).toContainEqual(expect.objectContaining({
        code: 'CONTENT_REQUIRED_FIELD',
        path: '$.combatProfile',
      }));
    }
    expect(premature.ok).toBe(false);
    if (!premature.ok) {
      expect(premature.issues).toContainEqual(expect.objectContaining({
        code: 'CONTENT_INVALID_FIELD_VALUE',
        path: '$.combatProfile',
      }));
    }
  });

  it('rejects unknown, null, and out-of-range nested profile fields', () => {
    const source = requireRuleset('revamped_classic', 3);
    const profile = source.combatProfile!;
    const unknown = validateRulesetContent({
      ...source,
      combatProfile: {
        ...profile,
        life: { ...profile.life, clientChosenDamage: 10 },
      },
    });
    const invalidHealth = validateRulesetContent({
      ...source,
      combatProfile: {
        ...profile,
        life: { ...profile.life, maximumHealthPoints: null },
      },
    });
    const invalidSpread = validateRulesetContent({
      ...source,
      combatProfile: {
        ...profile,
        autoRifle: {
          ...profile.autoRifle,
          baseSpreadMilliDegrees: profile.autoRifle.maximumSpreadMilliDegrees + 1,
        },
      },
    });

    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.issues).toContainEqual(expect.objectContaining({
        code: 'CONTENT_UNKNOWN_FIELD',
        path: '$.combatProfile.life.clientChosenDamage',
      }));
    }
    expect(invalidHealth.ok).toBe(false);
    if (!invalidHealth.ok) {
      expect(invalidHealth.issues).toContainEqual(expect.objectContaining({
        code: 'CONTENT_INVALID_FIELD_TYPE',
        path: '$.combatProfile.life.maximumHealthPoints',
      }));
    }
    expect(invalidSpread.ok).toBe(false);
    if (!invalidSpread.ok) {
      expect(invalidSpread.issues).toContainEqual(expect.objectContaining({
        code: 'CONTENT_INVALID_FIELD_VALUE',
        path: '$.combatProfile.autoRifle.baseSpreadMilliDegrees',
      }));
    }
  });

  it('rejects drift between the Auto Rifle profile and weapon record', () => {
    const source = requireRuleset('revamped_classic', 3);
    const candidate = {
      ...source,
      weapons: source.weapons.map((weapon) => weapon.id === 'vertical_rifle_v1'
        ? { ...weapon, damage: { ...weapon.damage, base: 11 } }
        : weapon),
    };

    const result = validateRulesetContent(candidate);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'CONTENT_INVALID_FIELD_VALUE',
      path: '$.combatProfile.autoRifle.baseDamagePoints',
    }));
  });

  it('rejects drift between the Impulse Grenade profile and ability record', () => {
    const source = requireRuleset('revamped_classic', 3);
    const candidate = {
      ...source,
      abilities: source.abilities.map((ability) => ability.id === 'vertical_impulse_grenade_v1'
        ? { ...ability, effect: { ...ability.effect, areaRadiusMillimeters: 10_000 } }
        : ability),
    };

    const result = validateRulesetContent(candidate);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'CONTENT_INVALID_FIELD_VALUE',
      path: '$.combatProfile.impulseGrenade.areaRadiusMillimeters',
    }));
  });
});
