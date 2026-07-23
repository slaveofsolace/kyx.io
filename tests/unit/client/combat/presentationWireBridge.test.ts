import { describe, expect, it } from 'vitest';

import {
  COMBAT_PRESENTATION_MARKERS_V1,
  applyCombatPresentationReliableEvent,
  applyCombatPresentationWireHydration,
  createCombatPresentationAdapter,
  type CombatPresentationAdapterV1,
} from '../../../../src/client';
import type { ReliableEvent } from '../../../../src/net';

const IDENTITY = Object.freeze({
  roomId: 'room_wire',
  matchId: 'match_wire',
  rulesetId: 'revamped_classic',
  rulesetRevision: 3,
  rulesetHash: 'd5f0418d1d927370',
  mapId: 'inkfall_foundry',
  fixtureId: 'inkfall_foundry_map_collision',
  fixtureHash: '3a762cae95c5d204',
  physicsAdapterId: 'rapier3d_deterministic_compat',
  physicsAdapterVersion: '0.19.3',
  movementProfileId: 'phase3_hypothesis_movement',
  movementProfileRevision: 1,
  movementProfileHash: '595a0117da2ed475',
});

function hydrate(
  adapter: CombatPresentationAdapterV1,
  serverTick = 10,
  reliableEventBaselineSequence = 0,
) {
  return applyCombatPresentationWireHydration(adapter, {
    schemaVersion: 1,
    identity: IDENTITY,
    serverTick,
    lifecycle: 'active',
    reliableEventBaselineSequence,
    localPlayer: {
      playerId: 'player_A',
      lifePhase: 'alive',
      healthPoints: 100,
      shieldPoints: 0,
      riflePhase: 'ready',
      magazineRounds: 50,
      reserveRounds: 150,
      grenadePhase: 'ready',
      grenadeCooldownEndsAtTick: 0,
      activeProjectileCount: 0,
      teleportCooldownTicksRemaining: 0,
    },
    match: {
      phase: 'active',
      activeTicksRemaining: 9_500,
      teamScores: [
        { teamId: 'team_blue', score: 0 },
        { teamId: 'team_red', score: 0 },
      ],
      feedSequence: 0,
    },
  });
}

function adapter(): CombatPresentationAdapterV1 {
  return hydrate(createCombatPresentationAdapter({
    schemaVersion: 1,
    localPlayerId: 'player_A',
  })).adapter;
}

function damageEvent(options: {
  readonly sequence: number;
  readonly shieldDamagePoints?: number;
  readonly healthDamagePoints?: number;
  readonly shieldPointsAfter?: number;
  readonly healthPointsAfter?: number;
}): ReliableEvent {
  const healthDamagePoints = options.healthDamagePoints ?? 10;
  const eventId = `combat.damage.${options.sequence}`;
  return {
    id: `event.${options.sequence}`,
    serverTick: 10 + options.sequence,
    kind: 'damageApplied',
    subjectId: eventId,
    actorId: 'player_A',
    targetId: 'player_B',
    amountHealthPoints: healthDamagePoints,
    presentation: {
      schemaVersion: 1,
      kind: 'damage_applied',
      eventId,
      eventSequence: options.sequence,
      authorityTick: 10 + options.sequence,
      causeId: 'vertical_rifle_v1',
      sourcePlayerId: 'player_A',
      targetPlayerId: 'player_B',
      shieldDamagePoints: options.shieldDamagePoints ?? 0,
      healthDamagePoints,
      shieldPointsAfter: options.shieldPointsAfter ?? 0,
      healthPointsAfter: options.healthPointsAfter ?? 90,
    },
  };
}

function teleportEvent(sequence: number): ReliableEvent {
  const eventId = `ability_resource.player_A.${sequence}.teleport.0`;
  return {
    id: `event.${sequence}`,
    serverTick: 10 + sequence,
    kind: 'abilityActivated',
    subjectId: eventId,
    actorId: 'player_A',
    targetId: null,
    amountHealthPoints: null,
    presentation: {
      schemaVersion: 1,
      kind: 'teleport_resource_confirmed',
      eventId,
      authorityTick: 10 + sequence,
      playerId: 'player_A',
      abilityId: 'vertical_teleport_v1',
      outcome: 'full',
      from: { x: 0, y: 0, z: 0 },
      to: { x: 0, y: 0, z: 9_000 },
      cooldownTicksRemaining: 160,
      weaponRecoveryTicks: 0,
      combatStatePolicy: 'preserve_existing_combat_state',
    },
  };
}

describe('reliable-wire combat presentation bridge', () => {
  it.each([
    {
      label: 'body',
      event: damageEvent({ sequence: 1 }),
      markers: COMBAT_PRESENTATION_MARKERS_V1.hitBody,
    },
    {
      label: 'shield',
      event: damageEvent({
        sequence: 2,
        shieldDamagePoints: 10,
        healthDamagePoints: 0,
        shieldPointsAfter: 15,
        healthPointsAfter: 100,
      }),
      markers: COMBAT_PRESENTATION_MARKERS_V1.hitShield,
    },
    {
      label: 'kill',
      event: damageEvent({ sequence: 3, healthPointsAfter: 0 }),
      markers: COMBAT_PRESENTATION_MARKERS_V1.hitKill,
    },
    {
      label: 'teleport',
      event: teleportEvent(4),
      markers: COMBAT_PRESENTATION_MARKERS_V1.teleportConfirmed,
    },
  ])('emits explicit confirmed $label HUD, audio, and VFX intents', ({ event, markers }) => {
    const applied = applyCombatPresentationReliableEvent(adapter(), event);
    expect(applied.status).toBe('applied');
    expect(applied.intents).toHaveLength(1);
    expect(applied.intents[0]).toMatchObject({
      source: 'confirmed',
      authorityEventId: event.presentation?.eventId,
      markers,
    });
    expect(applied.intents[0]?.markers.hud).not.toBeNull();
    expect(applied.intents[0]?.markers.audio).not.toBeNull();
    expect(applied.intents[0]?.markers.vfx).not.toBeNull();
  });

  it('fails closed on unknown fields, unknown semantics, and conflicting projections', () => {
    const valid = damageEvent({ sequence: 5 });
    expect(() => applyCombatPresentationReliableEvent(adapter(), {
      ...valid,
      presentation: { ...valid.presentation, unsupported: true },
    })).toThrow(/unsupported or missing fields/u);
    expect(() => applyCombatPresentationReliableEvent(adapter(), {
      ...valid,
      presentation: { ...valid.presentation, kind: 'client_claimed_kill' },
    })).toThrow(/teleport resource event kind|unsupported/u);
    expect(() => applyCombatPresentationReliableEvent(adapter(), {
      ...valid,
      amountHealthPoints: 999,
    })).toThrow('COMBAT_PRESENTATION_WIRE_DAMAGE_PROJECTION_MISMATCH');
  });

  it('deduplicates exact resend and rejects a conflicting authority payload', () => {
    const event = damageEvent({ sequence: 6 });
    const first = applyCombatPresentationReliableEvent(adapter(), event);
    const duplicate = applyCombatPresentationReliableEvent(first.adapter, event);
    expect(duplicate.intents).toEqual([]);
    expect(duplicate.adapter.metrics.duplicateAuthorityEvents).toBe(1);
    expect(() => applyCombatPresentationReliableEvent(first.adapter, {
      ...event,
      presentation: { ...event.presentation, healthPointsAfter: 89 },
    })).toThrow('AUTHORITY_EVENT_ID_HAS_CONFLICTING_PAYLOADS');
  });

  it('hydrates reconnect state without celebration and suppresses its reliable baseline', () => {
    const created = createCombatPresentationAdapter({
      schemaVersion: 1,
      localPlayerId: 'player_A',
    });
    const resumed = hydrate(created, 15, 4);
    expect(resumed.status).toBe('snapshot_applied');
    expect(resumed.intents.map(({ source }) => source)).toEqual(['snapshot']);
    expect(resumed.intents[0]?.markers).toBe(COMBAT_PRESENTATION_MARKERS_V1.snapshotHudSync);
    expect(applyCombatPresentationReliableEvent(
      resumed.adapter,
      teleportEvent(4),
    ).intents).toEqual([]);
    const afterBaseline = applyCombatPresentationReliableEvent(
      resumed.adapter,
      damageEvent({ sequence: 5 }),
    );
    expect(afterBaseline.intents[0]?.markers).toBe(COMBAT_PRESENTATION_MARKERS_V1.hitBody);
  });

  it('pins all authority identity fields across wire rehydration', () => {
    const first = hydrate(createCombatPresentationAdapter({
      schemaVersion: 1,
      localPlayerId: 'player_A',
    }));
    expect(() => applyCombatPresentationWireHydration(first.adapter, {
      schemaVersion: 1,
      identity: { ...IDENTITY, fixtureHash: 'aaaaaaaaaaaaaaaa' },
      serverTick: 12,
      lifecycle: 'active',
      reliableEventBaselineSequence: 0,
      localPlayer: null,
      match: null,
    })).toThrow('COMBAT_PRESENTATION_WIRE_IDENTITY_MISMATCH');
  });
});
