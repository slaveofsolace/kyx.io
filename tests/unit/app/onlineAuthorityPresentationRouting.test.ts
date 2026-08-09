import { describe, expect, it } from 'vitest';
import type { ReliableEvent } from '../../../src/net';
import {
  classifyOnlineAuthorityPresentationEvent,
  selectOnlineAbilityPresentationAudioOwner,
} from '../../../src/app/onlineAuthorityPresentationRouting';

function reliableEvent(
  presentation: ReliableEvent['presentation'],
): ReliableEvent {
  return {
    id: 'event.8',
    serverTick: 45,
    kind: presentation?.kind === 'world_portal_traversed'
      ? 'worldPortalTraversed'
      : 'damageApplied',
    subjectId: presentation?.kind === 'world_portal_traversed'
      ? 'world_portal.player_A.45.red_fold_lower'
      : 'damage.player_A.45',
    actorId: 'player_A',
    targetId: null,
    amountHealthPoints: null,
    ...(presentation === undefined ? {} : { presentation }),
  };
}

describe('online authority presentation routing', () => {
  it('keeps world portal semantics out of the strict combat adapter', () => {
    expect(classifyOnlineAuthorityPresentationEvent(reliableEvent({
      schemaVersion: 1,
      kind: 'world_portal_traversed',
      eventId: 'world_portal.player_A.45.red_fold_lower',
      authorityTick: 45,
      playerId: 'player_A',
      capabilityId: 'inkfall_rev5_linked_world_portal_v1',
      endpointId: 'red_fold_lower',
      partnerEndpointId: 'red_fold_upper',
      from: { x: -4_000, y: -3_000, z: -10_000 },
      to: { x: 1_539, y: 1_431, z: -4_461 },
      departureAudioHook: 'inkfall.portal.red_fold_lower.departure',
      arrivalAudioHook: 'inkfall.portal.red_fold_lower.arrival',
      departureVfxHook: 'inkfall.portal.red_fold_lower.energy_departure',
      arrivalVfxHook: 'inkfall.portal.red_fold_lower.energy_arrival',
    }))).toBe('world');
  });

  it('continues to send damage semantics through the combat lane', () => {
    expect(classifyOnlineAuthorityPresentationEvent(reliableEvent({
      schemaVersion: 1,
      kind: 'damage_applied',
      eventId: 'damage.player_A.45',
      eventSequence: 8,
      authorityTick: 45,
      causeId: 'shot.player_A.45',
      sourcePlayerId: 'player_A',
      targetPlayerId: 'player_B',
      shieldDamagePoints: 0,
      healthDamagePoints: 18,
      shieldPointsAfter: 0,
      healthPointsAfter: 82,
      hitRegion: 'head',
    }))).toBe('combat');
  });

  it('leaves events without semantic payloads unpresented', () => {
    expect(classifyOnlineAuthorityPresentationEvent(reliableEvent(undefined))).toBe('none');
  });

  it('assigns one ability audio owner and suppresses per-target Launch repeats', () => {
    const three = { threeRuntimeActive: true, threeDimensionalMap: true };
    expect(selectOnlineAbilityPresentationAudioOwner('throwable', three))
      .toBe('three_runtime');
    expect(selectOnlineAbilityPresentationAudioOwner('launch_detonation', three))
      .toBe('three_runtime');
    expect(selectOnlineAbilityPresentationAudioOwner('launch_impulse', three))
      .toBe('none');
    expect(selectOnlineAbilityPresentationAudioOwner('route_feedback', three))
      .toBe('route');

    const fallback = { threeRuntimeActive: false, threeDimensionalMap: false };
    expect(selectOnlineAbilityPresentationAudioOwner('throwable', fallback))
      .toBe('route');
    expect(selectOnlineAbilityPresentationAudioOwner('launch_detonation', fallback))
      .toBe('route');
    expect(selectOnlineAbilityPresentationAudioOwner('launch_impulse', fallback))
      .toBe('route');
  });
});
