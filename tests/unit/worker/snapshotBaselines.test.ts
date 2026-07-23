import { describe, expect, it } from 'vitest';

import type { SnapshotEntity } from '../../../src/net';
import { SnapshotBaselineStore } from '../../../worker/snapshotBaselines';

function entity(id: string, xMillimeters: number): SnapshotEntity {
  return {
    id,
    kind: 'player',
    xMillimeters,
    yMillimeters: 0,
    zMillimeters: 0,
    velocityXMillimetersPerSecond: 0,
    velocityYMillimetersPerSecond: 0,
    velocityZMillimetersPerSecond: 0,
    yawMilliDegrees: 0,
    pitchMilliDegrees: 0,
    healthPoints: 100,
    shieldPoints: 0,
  };
}

describe('bounded snapshot baseline store', () => {
  it('produces only changed, added, and removed entities from an exact retained tick', () => {
    const store = new SnapshotBaselineStore();
    const baseId = store.remember(
      10,
      [entity('player.b', 2), entity('player.a', 1), entity('player.gone', 3)],
    );
    const currentId = store.remember(12, [
      entity('player.a', 1),
      entity('player.b', 20),
      entity('player.new', 4),
    ]);
    expect(store.deltaFrom(baseId, 10, currentId, 12)).toEqual({
      baseSnapshotBaselineId: baseId,
      snapshotBaselineId: currentId,
      baseTick: 10,
      serverTick: 12,
      entities: [entity('player.b', 20), entity('player.new', 4)],
      removedEntityIds: ['player.gone'],
    });
  });

  it('fails closed when a baseline was never retained or has been evicted', () => {
    const store = new SnapshotBaselineStore(2);
    const evictedId = store.remember(1, [entity('player.a', 1)]);
    store.remember(2, [entity('player.a', 2)]);
    const latestId = store.remember(3, [entity('player.a', 3)]);
    expect(store.oldestTick).toBe(2);
    expect(store.latestTick).toBe(3);
    expect(store.deltaFrom(evictedId, 1, latestId, 3)).toBeNull();
    expect(store.deltaFrom(latestId, 3, latestId, 3)).toBeNull();
  });

  it('assigns distinct IDs to different states created at the same authority tick', () => {
    const store = new SnapshotBaselineStore();
    const onePlayer = store.remember(0, [entity('player.a', 1)]);
    const sameState = store.remember(0, [entity('player.a', 1)]);
    const twoPlayers = store.remember(0, [entity('player.a', 1), entity('player.b', 2)]);
    expect(sameState).toBe(onePlayer);
    expect(twoPlayers).not.toBe(onePlayer);
    expect(store.has(onePlayer, 0)).toBe(true);
    expect(store.has(twoPlayers, 0)).toBe(true);
  });

  it('rejects duplicate entity ids and backwards insertion', () => {
    const store = new SnapshotBaselineStore();
    expect(() => store.remember(1, [entity('same', 1), entity('same', 2)]))
      .toThrow('duplicate snapshot entity id');
    store.remember(2, []);
    expect(() => store.remember(1, [])).toThrow('non-decreasing tick order');
  });
});
