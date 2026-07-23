import { describe, expect, it } from 'vitest';

import { ReliableEventStore } from '../../../worker/reliableEvents';

function appendJoined(store: ReliableEventStore, tick: number, subjectId: string) {
  return store.append({
    serverTick: tick,
    kind: 'playerJoined',
    subjectId,
    actorId: null,
    targetId: null,
    amountHealthPoints: null,
  });
}

describe('bounded reliable event stream', () => {
  it('returns ordered unacknowledged events and validates cumulative acknowledgements', () => {
    const store = new ReliableEventStore();
    const first = appendJoined(store, 1, 'player.a');
    const second = appendJoined(store, 2, 'player.b');
    expect(store.pendingAfter(null)).toEqual([first, second]);
    expect(store.pendingAfter(first.id)).toEqual([second]);
    expect(store.validateAcknowledgement(null, first.id, second.id)).toBe('accepted');
    expect(store.validateAcknowledgement(second.id, first.id, second.id)).toBe('regression');
    expect(store.validateAcknowledgement(null, second.id, first.id)).toBe('beyond_sent');
    expect(store.validateAcknowledgement(null, 'event.999', second.id)).toBe('unknown_event');
  });

  it('reports a history gap only when an acknowledgement precedes retained history', () => {
    const store = new ReliableEventStore(2);
    const first = appendJoined(store, 1, 'player.a');
    const second = appendJoined(store, 2, 'player.b');
    const third = appendJoined(store, 3, 'player.c');
    expect(store.pendingAfter(null)).toBeNull();
    expect(store.pendingAfter(first.id)).toEqual([second, third]);
    expect(store.pendingAfter(second.id)).toEqual([third]);
  });

  it('round-trips retained events and preserves the exact next sequence', () => {
    const store = new ReliableEventStore(2);
    appendJoined(store, 1, 'player.a');
    const second = appendJoined(store, 2, 'player.b');
    const third = appendJoined(store, 3, 'player.c');
    const checkpoint = store.exportCheckpoint();

    const restored = new ReliableEventStore(2);
    restored.restoreCheckpoint(JSON.parse(JSON.stringify(checkpoint)));
    expect(restored.exportCheckpoint()).toEqual(checkpoint);
    expect(restored.pendingAfter(second.id)).toEqual([third]);
    expect(appendJoined(restored, 4, 'player.d').id).toBe('event.4');
  });

  it('fails closed on incompatible, discontinuous, or capacity-drifted checkpoints', () => {
    const store = new ReliableEventStore(2);
    appendJoined(store, 1, 'player.a');
    const checkpoint = store.exportCheckpoint();

    expect(() => store.restoreCheckpoint({ ...checkpoint, schemaVersion: 2 })).toThrow(/schema/u);
    expect(() => store.restoreCheckpoint({ ...checkpoint, capacity: 3 })).toThrow(/capacity/u);
    expect(() => store.restoreCheckpoint({
      ...checkpoint,
      events: [{ ...checkpoint.events[0], id: 'event.7' }],
    })).toThrow(/contiguous/u);
  });
});
