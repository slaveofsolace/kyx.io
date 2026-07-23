import { describe, expect, it } from 'vitest';

import {
  authorityLoadoutFromRuleset,
  authorityLoadoutRequestFingerprint,
  createAuthorityLoadoutRequestMessage,
  evaluateAuthorityLoadoutRequest,
  hashAuthorityLoadoutDecisionTrace,
  type AuthorityLoadoutLifecycle,
} from '../../../../src/authority';
import { requireRuleset } from '../../../../src/content';
import {
  PROTOCOL_VERSION,
  validateClientMessage,
  type LoadoutRequestMessage,
} from '../../../../src/net';

const ruleset = requireRuleset();
const authoritativeLoadout = authorityLoadoutFromRuleset(ruleset);

function request(
  requestId: string,
  overrides: Partial<LoadoutRequestMessage> = {},
): LoadoutRequestMessage {
  return {
    ...createAuthorityLoadoutRequestMessage({ requestId, loadout: authoritativeLoadout }),
    ...overrides,
  };
}

function decide(
  message: LoadoutRequestMessage,
  lifecycle: AuthorityLoadoutLifecycle = 'lobby',
) {
  return evaluateAuthorityLoadoutRequest({
    lifecycle,
    request: message,
    authoritativeLoadout,
  });
}

function parityTrace() {
  return [
    decide(request('req.loadout.parity.accepted')),
    decide(request('req.loadout.parity.primary', { primaryWeaponId: 'forged_primary' })),
    decide(request('req.loadout.parity.secondary', { secondaryWeaponId: 'forged_secondary' })),
    decide(request('req.loadout.parity.melee', { meleeWeaponId: 'forged_melee' })),
    decide(request('req.loadout.parity.damage-one', {
      damageAbilityIds: ['forged_damage_one', authoritativeLoadout.damageAbilityIds[1]],
    })),
    decide(request('req.loadout.parity.damage-two', {
      damageAbilityIds: [authoritativeLoadout.damageAbilityIds[0], 'forged_damage_two'],
    })),
    decide(request('req.loadout.parity.utility', { utilityAbilityId: 'forged_utility' })),
    decide(request('req.loadout.parity.locked'), 'warmup'),
  ] as const;
}

describe('P5.8C authoritative loadout request boundary', () => {
  it('derives one recursively frozen selection from the active ruleset vertical slice', () => {
    expect(authoritativeLoadout).toEqual({
      schemaVersion: 1,
      rulesetId: 'revamped_classic',
      rulesetRevision: 2,
      primaryWeaponId: 'vertical_rifle_v1',
      secondaryWeaponId: null,
      meleeWeaponId: 'vertical_melee_v1',
      damageAbilityIds: [
        'vertical_grenade_v1',
        'vertical_deployable_v1',
      ],
      utilityAbilityId: 'vertical_teleport_v1',
    });
    expect(Object.isFrozen(authoritativeLoadout)).toBe(true);
    expect(Object.isFrozen(authoritativeLoadout.damageAbilityIds)).toBe(true);
  });

  it('accepts only the exact lobby selection and returns stable field/state rejection reasons', () => {
    const decisions = parityTrace();
    expect(decisions.map(({ accepted, reason }) => ({ accepted, reason }))).toEqual([
      { accepted: true, reason: null },
      { accepted: false, reason: 'primary_weapon_not_allowed' },
      { accepted: false, reason: 'secondary_weapon_not_allowed' },
      { accepted: false, reason: 'melee_weapon_not_allowed' },
      { accepted: false, reason: 'damage_ability_one_not_allowed' },
      { accepted: false, reason: 'damage_ability_two_not_allowed' },
      { accepted: false, reason: 'utility_ability_not_allowed' },
      { accepted: false, reason: 'loadout_locked' },
    ]);
    expect(decisions[0]).toMatchObject({
      accepted: true,
      requestId: 'req.loadout.parity.accepted',
      loadout: authoritativeLoadout,
    });
    for (const decision of decisions) expect(Object.isFrozen(decision)).toBe(true);
  });

  it('pins the same canonical decision hash for Node and the Worker isolate', () => {
    expect(hashAuthorityLoadoutDecisionTrace(parityTrace())).toBe('810083ecca297f5e');
  });

  it('uses payload-only idempotency fingerprints and keeps schema abuse outside authority state', () => {
    const exact = request('req.loadout.fingerprint.one');
    const replay = request('req.loadout.fingerprint.two');
    const conflict = request('req.loadout.fingerprint.one', {
      primaryWeaponId: 'forged_primary',
    });
    expect(authorityLoadoutRequestFingerprint(exact))
      .toBe(authorityLoadoutRequestFingerprint(replay));
    expect(authorityLoadoutRequestFingerprint(conflict))
      .not.toBe(authorityLoadoutRequestFingerprint(exact));
    expect(validateClientMessage(exact)).toEqual({ ok: true, value: exact });

    expect(validateClientMessage({ ...exact, damagePoints: 100 })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'PROTOCOL_UNKNOWN_FIELD',
        path: '$.damagePoints',
      }),
    });
    expect(validateClientMessage({
      ...exact,
      damageAbilityIds: ['vertical_impulse_grenade_v1', 'vertical_impulse_grenade_v1'],
    })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'PROTOCOL_DUPLICATE_ID',
        path: '$.damageAbilityIds',
      }),
    });
    expect(validateClientMessage({
      protocolVersion: PROTOCOL_VERSION,
      type: 'loadoutRequest',
      requestId: 'req.loadout.schema.forged',
      primaryWeaponId: authoritativeLoadout.primaryWeaponId,
      secondaryWeaponId: null,
      meleeWeaponId: authoritativeLoadout.meleeWeaponId,
      damageAbilityIds: authoritativeLoadout.damageAbilityIds,
      utilityAbilityId: authoritativeLoadout.utilityAbilityId,
      cooldownEndsAtTick: 0,
    })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'PROTOCOL_UNKNOWN_FIELD',
        path: '$.cooldownEndsAtTick',
      }),
    });
  });
});
