import { describe, expect, it } from 'vitest';

import { KyxRoom } from '../../worker/room';
import type { SocketAttachment } from '../../worker/security';

interface SocketAttachmentCacheHarness {
  socketAttachments: Map<string, SocketAttachment>;
  readSocketAttachment(webSocket: WebSocket): SocketAttachment | null;
  writeSocketAttachment(webSocket: WebSocket, attachment: SocketAttachment): void;
  forgetSocketAttachment(attachment: SocketAttachment): void;
}

function attachment(connectionId: string): SocketAttachment {
  return Object.freeze({
    schemaVersion: 9,
    roomCode: 'KYX-234567',
    connectionId,
    allocationLeaseId: null,
    preJoinExpiresAt: null,
    playerId: 'player.cache-test',
    spectatorId: null,
    sessionGeneration: 1,
    rateWindowStartedAt: 1,
    messagesInRateWindow: 0,
    bytesInRateWindow: 0,
    lastSeenAt: 1,
    lastFullSnapshotRequestAt: null,
    lastAcknowledgedSnapshotTick: 0,
    lastAcknowledgedSnapshotBaselineId: 'baseline.0.1',
    lastSentSnapshotTick: 0,
    lastSentSnapshotBaselineId: 'baseline.0.1',
    sentSnapshotHistory: Object.freeze([Object.freeze({
      serverTick: 0,
      snapshotBaselineId: 'baseline.0.1',
    })]),
    lastSnapshotSentAt: 1,
    snapshotAckDebtStartedAt: null,
    lastAcknowledgedEventId: 'event.1',
    lastSentReliableEventId: 'event.1',
    backpressureStartedAt: null,
    combatPlayerScoresV1: false,
  });
}

describe('KyxRoom socket attachment cache', () => {
  it('keeps the latest attachment across stale hibernation wrappers in one callback', () => {
    const initial = attachment('connection.cache-test');
    const updated: SocketAttachment = Object.freeze({
      ...initial,
      lastSentSnapshotTick: 2,
      lastSentSnapshotBaselineId: 'baseline.2.2',
      lastSnapshotSentAt: 2,
      lastSentReliableEventId: 'event.2',
    });
    let serializedWrite: unknown = null;
    const staleWrapper = {
      deserializeAttachment: () => initial,
      serializeAttachment: (value: unknown) => { serializedWrite = value; },
    } as unknown as WebSocket;
    const room = Object.create(KyxRoom.prototype) as SocketAttachmentCacheHarness;
    room.socketAttachments = new Map();

    room.writeSocketAttachment(staleWrapper, updated);

    expect(serializedWrite).toBe(updated);
    expect(room.readSocketAttachment(staleWrapper)).toBe(updated);

    room.forgetSocketAttachment(updated);
    expect(room.readSocketAttachment(staleWrapper)).toBe(initial);
  });

  it('rejects an invalid serialized attachment instead of consulting the cache', () => {
    const room = Object.create(KyxRoom.prototype) as SocketAttachmentCacheHarness;
    room.socketAttachments = new Map([
      ['connection.cache-test', attachment('connection.cache-test')],
    ]);
    const invalidWrapper = {
      deserializeAttachment: () => ({ connectionId: 'connection.cache-test' }),
    } as unknown as WebSocket;

    expect(room.readSocketAttachment(invalidWrapper)).toBeNull();
  });

  it('migrates and immediately reserializes the version-4 shape', () => {
    const current = attachment('connection.legacy-cache-test');
    const legacy = { ...current, schemaVersion: 4 } as Record<string, unknown>;
    delete legacy.snapshotAckDebtStartedAt;
    delete legacy.sentSnapshotHistory;
    delete legacy.spectatorId;
    let serializedWrite: unknown = null;
    const legacyWrapper = {
      deserializeAttachment: () => legacy,
      serializeAttachment: (value: unknown) => { serializedWrite = value; },
    } as unknown as WebSocket;
    const room = Object.create(KyxRoom.prototype) as SocketAttachmentCacheHarness;
    room.socketAttachments = new Map();

    const migrated = room.readSocketAttachment(legacyWrapper);

    expect(migrated).toMatchObject({
      schemaVersion: 9,
      connectionId: current.connectionId,
      allocationLeaseId: null,
      preJoinExpiresAt: null,
      combatPlayerScoresV1: false,
      spectatorId: null,
      snapshotAckDebtStartedAt: null,
      sentSnapshotHistory: [{
        serverTick: 0,
        snapshotBaselineId: 'baseline.0.1',
      }],
    });
    expect(serializedWrite).toBe(migrated);
    expect(room.socketAttachments.get(current.connectionId)).toBe(migrated);
  });
});
