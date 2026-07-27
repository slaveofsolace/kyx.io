import { describe, expect, it } from 'vitest';

import {
  REV17_SEMANTIC_ACTION_CONTRACT,
  advanceRev17SemanticAction,
  deriveRev17AuthorityAction,
  startRev17SemanticAction,
} from '../../../src/player/rev17ActionContract.js';

describe('Rev17 semantic action contract', () => {
  it('keeps the action and marker manifest immutable and names every non-authored fallback', () => {
    expect(Object.isFrozen(REV17_SEMANTIC_ACTION_CONTRACT)).toBe(true);
    expect(REV17_SEMANTIC_ACTION_CONTRACT.fire.authoredClipKey).toBe('fire');
    expect(REV17_SEMANTIC_ACTION_CONTRACT.reload.authoredClipKey).toBe('reload');
    expect(REV17_SEMANTIC_ACTION_CONTRACT.equip).toMatchObject({
      authoredClipKey: null,
      fallback: 'procedural_equip_accent',
    });
    expect(REV17_SEMANTIC_ACTION_CONTRACT.melee).toMatchObject({
      authoredClipKey: null,
      fallback: 'procedural_melee_accent',
    });
    expect(REV17_SEMANTIC_ACTION_CONTRACT.ability).toMatchObject({
      authoredClipKey: null,
      fallback: 'procedural_ability_throw_accent',
    });
    for (const profile of Object.values(REV17_SEMANTIC_ACTION_CONTRACT)) {
      expect(Object.isFrozen(profile)).toBe(true);
      expect(Object.isFrozen(profile.markers)).toBe(true);
      expect(profile.markers.every(Object.isFrozen)).toBe(true);
      expect(profile.markers.every(
        ({ role }: { readonly role: string }) => role === 'presentation',
      )).toBe(true);
    }
  });

  it('crosses reload markers once from a deterministic action clock', () => {
    let action = startRev17SemanticAction('reload', 2);
    const seen: string[] = [];
    const advance = (seconds: number): void => {
      const result = advanceRev17SemanticAction(action, seconds);
      action = result.action;
      seen.push(...result.markers.map(({ id }: { readonly id: string }) => id));
    };

    advance(0);
    expect(seen).toEqual(['mag_detach']);
    advance(0.39);
    expect(seen).toEqual(['mag_detach']);
    advance(0.01);
    expect(seen).toEqual(['mag_detach', 'mag_out']);
    advance(0.7);
    expect(seen).toEqual(['mag_detach', 'mag_out', 'mag_in']);
    advance(0.34);
    expect(seen).toEqual(['mag_detach', 'mag_out', 'mag_in', 'mag_seat']);
    advance(0.32);
    expect(seen).toEqual([
      'mag_detach',
      'mag_out',
      'mag_in',
      'mag_seat',
      'bolt',
    ]);
    advance(1);
    expect(action.completed).toBe(true);
    expect(seen).toHaveLength(5);
  });

  it('derives remote actions only from authoritative snapshot and event fields', () => {
    const basePlayer = {
      playerId: 'player.remote',
      lifePhase: 'alive',
      riflePhase: 'ready',
    };
    const event = {
      id: 'evt.ability.7',
      serverTick: 97,
      kind: 'abilityActivated',
      subjectId: 'player.remote',
      actorId: 'player.remote',
      targetId: null,
      amountHealthPoints: null,
    };

    expect(deriveRev17AuthorityAction(
      { ...basePlayer, riflePhase: 'reloading' },
      [{ ...event, kind: 'shotAccepted' }],
      100,
    )).toMatchObject({ kind: 'reload', source: 'authority_snapshot' });
    expect(deriveRev17AuthorityAction(
      basePlayer,
      [event],
      100,
    )).toMatchObject({
      kind: 'ability',
      source: 'authority_event',
      serverTick: 97,
      ageTicks: 3,
    });
    expect(deriveRev17AuthorityAction(
      basePlayer,
      [{ ...event, actorId: 'player.other', subjectId: 'player.other' }],
      100,
    )).toMatchObject({ kind: 'idle', source: 'authority_snapshot' });
    expect(deriveRev17AuthorityAction(
      basePlayer,
      [{ ...event, serverTick: 80 }],
      100,
    )).toMatchObject({ kind: 'idle', source: 'authority_snapshot' });
    expect(deriveRev17AuthorityAction(
      { ...basePlayer, lifePhase: 'dead' },
      [event],
      100,
    )).toMatchObject({ kind: 'death', source: 'authority_snapshot' });

    // The current wire snapshot carries no melee phase. The derivation must
    // remain idle instead of inventing a remote melee action.
    expect(deriveRev17AuthorityAction(basePlayer, [], 100).kind).not.toBe('melee');
  });
});
