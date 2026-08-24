import { describe, expect, it } from 'vitest';

import {
  MAX_BYTES_PER_RATE_WINDOW,
  MAX_MESSAGES_PER_RATE_WINDOW,
  MAX_RETAINED_SENT_SNAPSHOT_REFERENCES,
  MAX_SNAPSHOT_SENDS_PER_SECOND,
  MAX_SNAPSHOT_ACK_DEBT_MILLISECONDS,
  MAX_SOCKET_BUFFERED_BYTES,
  RATE_WINDOW_MILLISECONDS,
  SNAPSHOT_ACK_EVICTION_GRACE_MILLISECONDS,
  SNAPSHOT_ACK_FALLBACK_MILLISECONDS,
  SLOW_CONSUMER_GRACE_MILLISECONDS,
  SOCKET_STALE_MILLISECONDS,
  applyAcceptedSnapshotAcknowledgement,
  consumeSocketRate,
  evaluateSnapshotAckDebt,
  evaluateSocketBackpressure,
  isSocketAttachment,
  isSocketStale,
  normalizeSocketAttachment,
  rememberSentSnapshot,
  type SocketAttachment,
} from '../../../worker/security';

function attachment(overrides: Partial<SocketAttachment> = {}): SocketAttachment {
  return {
    schemaVersion: 9,
    roomCode: 'KYX-234567',
    connectionId: 'connection.TEST',
    allocationLeaseId: null,
    preJoinExpiresAt: null,
    playerId: null,
    spectatorId: null,
    sessionGeneration: 0,
    rateWindowStartedAt: 1_000,
    messagesInRateWindow: 0,
    bytesInRateWindow: 0,
    lastSeenAt: 1_000,
    lastFullSnapshotRequestAt: null,
    lastAcknowledgedSnapshotTick: null,
    lastAcknowledgedSnapshotBaselineId: null,
    lastSentSnapshotTick: null,
    lastSentSnapshotBaselineId: null,
    sentSnapshotHistory: [],
    lastSnapshotSentAt: null,
    snapshotAckDebtStartedAt: null,
    lastAcknowledgedEventId: null,
    lastSentReliableEventId: null,
    backpressureStartedAt: null,
    combatPlayerScoresV1: false,
    ...overrides,
  };
}

describe('Worker socket security bounds', () => {
  it('validates only complete version-9 bounded attachments', () => {
    expect(isSocketAttachment(attachment())).toBe(true);
    expect(isSocketAttachment({ ...attachment(), schemaVersion: 1 })).toBe(false);
    expect(isSocketAttachment({ ...attachment(), bytesInRateWindow: -1 })).toBe(false);
    expect(isSocketAttachment({ ...attachment(), sessionGeneration: 0.5 })).toBe(false);
    expect(isSocketAttachment({ ...attachment(), lastFullSnapshotRequestAt: -1 })).toBe(false);
    expect(isSocketAttachment({ ...attachment(), lastAcknowledgedSnapshotTick: -1 })).toBe(false);
    expect(isSocketAttachment({ ...attachment(), lastSentSnapshotBaselineId: '' })).toBe(false);
    expect(isSocketAttachment({
      ...attachment(),
      sentSnapshotHistory: Array.from(
        { length: MAX_RETAINED_SENT_SNAPSHOT_REFERENCES + 1 },
        (_, serverTick) => ({ serverTick, snapshotBaselineId: `baseline.${serverTick}` }),
      ),
    })).toBe(false);
    expect(isSocketAttachment({
      ...attachment(),
      sentSnapshotHistory: [{ serverTick: 1, snapshotBaselineId: '' }],
    })).toBe(false);
    expect(isSocketAttachment({ ...attachment(), lastSnapshotSentAt: -1 })).toBe(false);
    expect(isSocketAttachment({ ...attachment(), snapshotAckDebtStartedAt: -1 })).toBe(false);
    expect(isSocketAttachment({ ...attachment(), lastAcknowledgedEventId: '' })).toBe(false);
    expect(isSocketAttachment({ ...attachment(), backpressureStartedAt: -1 })).toBe(false);
    expect(isSocketAttachment(attachment({ spectatorId: 'spectator.1' }))).toBe(true);
    expect(isSocketAttachment(attachment({
      playerId: 'player.1',
      spectatorId: 'spectator.1',
    }))).toBe(false);
    expect(isSocketAttachment(attachment({
      spectatorId: 'spectator.1',
      preJoinExpiresAt: 2_000,
    }))).toBe(false);
  });

  it('migrates versions 4 through 8 into bounded version-9 attachments', () => {
    const version5 = {
      ...attachment({
        lastSentSnapshotTick: 20,
        lastSentSnapshotBaselineId: 'baseline.20',
      }),
      schemaVersion: 5,
    } as Record<string, unknown>;
    delete version5.sentSnapshotHistory;
    delete version5.combatPlayerScoresV1;
    delete version5.spectatorId;
    expect(normalizeSocketAttachment(version5)).toMatchObject({
      schemaVersion: 9,
      allocationLeaseId: null,
      preJoinExpiresAt: null,
      combatPlayerScoresV1: false,
      spectatorId: null,
      sentSnapshotHistory: [{ serverTick: 20, snapshotBaselineId: 'baseline.20' }],
    });
    const version4: Record<string, unknown> = { ...version5, schemaVersion: 4 };
    delete version4.snapshotAckDebtStartedAt;
    expect(normalizeSocketAttachment(version4)).toMatchObject({
      schemaVersion: 9,
      allocationLeaseId: null,
      preJoinExpiresAt: null,
      combatPlayerScoresV1: false,
      spectatorId: null,
      snapshotAckDebtStartedAt: null,
      sentSnapshotHistory: [{ serverTick: 20, snapshotBaselineId: 'baseline.20' }],
    });
    const version6 = {
      ...attachment({
        lastSentSnapshotTick: 20,
        lastSentSnapshotBaselineId: 'baseline.20',
        sentSnapshotHistory: [{ serverTick: 20, snapshotBaselineId: 'baseline.20' }],
      }),
      schemaVersion: 6,
    } as Record<string, unknown>;
    delete version6.allocationLeaseId;
    delete version6.preJoinExpiresAt;
    delete version6.combatPlayerScoresV1;
    delete version6.spectatorId;
    expect(normalizeSocketAttachment(version6)).toMatchObject({
      schemaVersion: 9,
      allocationLeaseId: null,
      preJoinExpiresAt: null,
      combatPlayerScoresV1: false,
      spectatorId: null,
      sentSnapshotHistory: [{ serverTick: 20, snapshotBaselineId: 'baseline.20' }],
    });
    const version7 = {
      ...attachment(),
      schemaVersion: 7,
    } as Record<string, unknown>;
    delete version7.combatPlayerScoresV1;
    delete version7.spectatorId;
    expect(normalizeSocketAttachment(version7)).toMatchObject({
      schemaVersion: 9,
      combatPlayerScoresV1: false,
      spectatorId: null,
    });
    const version8 = { ...attachment(), schemaVersion: 8 } as Record<string, unknown>;
    delete version8.spectatorId;
    expect(normalizeSocketAttachment(version8)).toMatchObject({
      schemaVersion: 9,
      spectatorId: null,
      combatPlayerScoresV1: false,
    });
    expect(normalizeSocketAttachment({ ...version4, schemaVersion: 3 })).toBeNull();
    expect(normalizeSocketAttachment({ ...version4, roomCode: 'invalid' })).toBeNull();
  });

  it('retains a bounded, deduplicated session-local sent-snapshot history', () => {
    expect(MAX_RETAINED_SENT_SNAPSHOT_REFERENCES).toBe(
      Math.ceil(
        MAX_SNAPSHOT_ACK_DEBT_MILLISECONDS / 1_000 * MAX_SNAPSHOT_SENDS_PER_SECOND,
      ) + 2,
    );
    let history: SocketAttachment['sentSnapshotHistory'] = [];
    for (let serverTick = 0; serverTick < MAX_RETAINED_SENT_SNAPSHOT_REFERENCES + 5; serverTick += 1) {
      history = rememberSentSnapshot(history, serverTick, `baseline.${serverTick}`);
    }
    expect(history).toHaveLength(MAX_RETAINED_SENT_SNAPSHOT_REFERENCES);
    expect(history[0]).toEqual({ serverTick: 5, snapshotBaselineId: 'baseline.5' });
    const deduplicated = rememberSentSnapshot(
      history,
      MAX_RETAINED_SENT_SNAPSHOT_REFERENCES + 4,
      `baseline.${MAX_RETAINED_SENT_SNAPSHOT_REFERENCES + 4}`,
    );
    expect(deduplicated).toHaveLength(MAX_RETAINED_SENT_SNAPSHOT_REFERENCES);
    expect(new Set(deduplicated.map(({ serverTick }) => serverTick)).size).toBe(
      MAX_RETAINED_SENT_SNAPSHOT_REFERENCES,
    );
    expect(isSocketAttachment(attachment({ sentSnapshotHistory: deduplicated }))).toBe(true);
  });

  it('enforces both message and aggregate-byte windows and resets deterministically', () => {
    const messageLimited = consumeSocketRate(attachment({
      messagesInRateWindow: MAX_MESSAGES_PER_RATE_WINDOW,
    }), 1_001, 1);
    expect(messageLimited).toMatchObject({ ok: false, reason: 'message_rate' });

    const byteLimited = consumeSocketRate(attachment({
      bytesInRateWindow: MAX_BYTES_PER_RATE_WINDOW,
    }), 1_001, 1);
    expect(byteLimited).toMatchObject({ ok: false, reason: 'byte_rate' });

    const reset = consumeSocketRate(attachment({
      messagesInRateWindow: MAX_MESSAGES_PER_RATE_WINDOW,
      bytesInRateWindow: MAX_BYTES_PER_RATE_WINDOW,
    }), 1_000 + RATE_WINDOW_MILLISECONDS, 128);
    expect(reset).toMatchObject({
      ok: true,
      reason: null,
      attachment: { messagesInRateWindow: 1, bytesInRateWindow: 128 },
    });
  });

  it('admits legal 20 Hz input plus 10 Hz snapshot ACKs with bounded control headroom', () => {
    expect(MAX_MESSAGES_PER_RATE_WINDOW).toBeGreaterThanOrEqual(200 + 100 + 32);
    let current = attachment();
    for (let index = 0; index < 200; index += 1) {
      const consumed = consumeSocketRate(current, 1_000 + index * 50, 256);
      expect(consumed.ok).toBe(true);
      current = consumed.attachment;
    }
    expect(current.messagesInRateWindow).toBe(200);
    expect(current.bytesInRateWindow).toBe(51_200);
    for (let index = 0; index < 100; index += 1) {
      const consumed = consumeSocketRate(current, 10_999, 128);
      expect(consumed.ok).toBe(true);
      current = consumed.attachment;
    }
    expect(current.messagesInRateWindow).toBe(300);
    for (let index = 0; index < 32; index += 1) {
      const consumed = consumeSocketRate(current, 10_999, 64);
      expect(consumed.ok).toBe(true);
      current = consumed.attachment;
    }
    expect(current.messagesInRateWindow).toBe(332);
    while (current.messagesInRateWindow < MAX_MESSAGES_PER_RATE_WINDOW) {
      const consumed = consumeSocketRate(current, 10_999, 1);
      expect(consumed.ok).toBe(true);
      current = consumed.attachment;
    }
    expect(consumeSocketRate(current, 10_999, 1)).toMatchObject({
      ok: false,
      reason: 'message_rate',
    });
  });

  it('marks a socket stale at the explicit heartbeat threshold', () => {
    expect(isSocketStale(attachment(), 1_000 + SOCKET_STALE_MILLISECONDS - 1)).toBe(false);
    expect(isSocketStale(attachment(), 1_000 + SOCKET_STALE_MILLISECONDS)).toBe(true);
    expect(isSocketStale(attachment({
      spectatorId: 'spectator.1',
      preJoinExpiresAt: null,
    }), 1_000 + SOCKET_STALE_MILLISECONDS - 1)).toBe(false);
  });

  it('coalesces above 256 KiB, resets on drain, and evicts at the exact grace boundary', () => {
    const initial = attachment();
    const healthy = evaluateSocketBackpressure(
      initial,
      MAX_SOCKET_BUFFERED_BYTES,
      2_000,
    );
    expect(healthy).toMatchObject({ action: 'send', began: false, recovered: false });
    expect(healthy.attachment).toBe(initial);

    const saturated = evaluateSocketBackpressure(
      attachment(),
      MAX_SOCKET_BUFFERED_BYTES + 1,
      2_000,
    );
    expect(saturated).toMatchObject({
      action: 'coalesce',
      began: true,
      recovered: false,
      attachment: { backpressureStartedAt: 2_000 },
    });
    expect(evaluateSocketBackpressure(
      saturated.attachment,
      MAX_SOCKET_BUFFERED_BYTES + 1,
      2_000 + SLOW_CONSUMER_GRACE_MILLISECONDS - 1,
    ).action).toBe('coalesce');

    const recovered = evaluateSocketBackpressure(saturated.attachment, 0, 2_500);
    expect(recovered).toMatchObject({
      action: 'send',
      began: false,
      recovered: true,
      attachment: { backpressureStartedAt: null },
    });

    expect(evaluateSocketBackpressure(
      saturated.attachment,
      MAX_SOCKET_BUFFERED_BYTES + 1,
      2_000 + SLOW_CONSUMER_GRACE_MILLISECONDS,
    ).action).toBe('evict');
  });

  it('grants one non-refreshing final-fallback turn before exact ACK-debt eviction', () => {
    const pending = attachment({
      lastAcknowledgedSnapshotTick: 8,
      lastAcknowledgedSnapshotBaselineId: 'baseline.8',
      lastSentSnapshotTick: 10,
      lastSentSnapshotBaselineId: 'baseline.10',
      lastSnapshotSentAt: 1_000,
    });
    const coalesced = evaluateSnapshotAckDebt(
      pending,
      1_000 + SNAPSHOT_ACK_FALLBACK_MILLISECONDS - 1,
    );
    expect(coalesced).toMatchObject({
      action: 'coalesce',
      began: true,
      recovered: false,
      debtMilliseconds: SNAPSHOT_ACK_FALLBACK_MILLISECONDS - 1,
      attachment: { snapshotAckDebtStartedAt: 1_000 },
    });

    expect(evaluateSnapshotAckDebt(
      coalesced.attachment,
      1_000 + SNAPSHOT_ACK_FALLBACK_MILLISECONDS,
    ).action).toBe('fallback');
    expect(evaluateSnapshotAckDebt(
      coalesced.attachment,
      1_000 + MAX_SNAPSHOT_ACK_DEBT_MILLISECONDS - 1,
    ).action).toBe('fallback');
    const finalFallbackDue = evaluateSnapshotAckDebt(
      coalesced.attachment,
      1_000 + MAX_SNAPSHOT_ACK_DEBT_MILLISECONDS,
    );
    expect(finalFallbackDue.action).toBe('fallback');

    const afterFinalFallback = {
      ...finalFallbackDue.attachment,
      lastSentSnapshotTick: 12,
      lastSentSnapshotBaselineId: 'baseline.12',
      lastSnapshotSentAt: 1_000 + MAX_SNAPSHOT_ACK_DEBT_MILLISECONDS,
    };
    expect(evaluateSnapshotAckDebt(
      afterFinalFallback,
      1_000 + MAX_SNAPSHOT_ACK_DEBT_MILLISECONDS
        + SNAPSHOT_ACK_EVICTION_GRACE_MILLISECONDS - 1,
    ).action).toBe('coalesce');
    expect(evaluateSnapshotAckDebt(
      afterFinalFallback,
      1_000 + MAX_SNAPSHOT_ACK_DEBT_MILLISECONDS
        + SNAPSHOT_ACK_EVICTION_GRACE_MILLISECONDS,
    ).action).toBe('evict');

    // A silent client cannot get another fallback or refresh its final grace.
    const duringGrace = evaluateSnapshotAckDebt(
      afterFinalFallback,
      1_000 + MAX_SNAPSHOT_ACK_DEBT_MILLISECONDS
        + SNAPSHOT_ACK_EVICTION_GRACE_MILLISECONDS - 1,
    );
    expect(duringGrace.action).toBe('coalesce');
    expect(duringGrace.attachment.lastSnapshotSentAt).toBe(
      1_000 + MAX_SNAPSHOT_ACK_DEBT_MILLISECONDS,
    );

    const recovered = evaluateSnapshotAckDebt({
      ...coalesced.attachment,
      lastAcknowledgedSnapshotTick: 10,
      lastAcknowledgedSnapshotBaselineId: 'baseline.10',
    }, 2_000);
    expect(recovered).toMatchObject({
      action: 'none',
      began: false,
      recovered: true,
      debtMilliseconds: 0,
      attachment: { snapshotAckDebtStartedAt: null },
    });
  });

  it('advances a retained intermediate ACK and lets the queued exact latest ACK clear debt', () => {
    const beforeFinalFallback = attachment({
      lastAcknowledgedSnapshotTick: 8,
      lastAcknowledgedSnapshotBaselineId: 'baseline.8',
      lastSentSnapshotTick: 10,
      lastSentSnapshotBaselineId: 'baseline.10',
      sentSnapshotHistory: [
        { serverTick: 8, snapshotBaselineId: 'baseline.8' },
        { serverTick: 10, snapshotBaselineId: 'baseline.10' },
      ],
      lastSnapshotSentAt: 3_000,
      snapshotAckDebtStartedAt: 1_000,
    });
    expect(evaluateSnapshotAckDebt(beforeFinalFallback, 4_000).action).toBe('fallback');
    const awaitingFinalFallback = attachment({
      ...beforeFinalFallback,
      lastSentSnapshotTick: 12,
      lastSentSnapshotBaselineId: 'baseline.12',
      sentSnapshotHistory: [
        ...beforeFinalFallback.sentSnapshotHistory,
        { serverTick: 12, snapshotBaselineId: 'baseline.12' },
      ],
      lastSnapshotSentAt: 4_000,
    });
    expect(evaluateSnapshotAckDebt(awaitingFinalFallback, 4_249).action).toBe('coalesce');
    const intermediate = applyAcceptedSnapshotAcknowledgement(
      awaitingFinalFallback,
      10,
      'baseline.10',
    );
    expect(intermediate).toMatchObject({
      acknowledgesLatestSent: false,
      advancesAcknowledgement: true,
      recoveredDebt: true,
      attachment: {
        lastAcknowledgedSnapshotTick: 10,
        lastAcknowledgedSnapshotBaselineId: 'baseline.10',
        sentSnapshotHistory: [{ serverTick: 12, snapshotBaselineId: 'baseline.12' }],
        snapshotAckDebtStartedAt: 4_000,
      },
    });
    expect(intermediate.attachment).not.toBe(awaitingFinalFallback);
    expect(evaluateSnapshotAckDebt(intermediate.attachment, 4_249).action).toBe('coalesce');
    const repeatedIntermediate = applyAcceptedSnapshotAcknowledgement(
      intermediate.attachment,
      10,
      'baseline.10',
    );
    expect(repeatedIntermediate).toMatchObject({
      acknowledgesLatestSent: false,
      advancesAcknowledgement: false,
      recoveredDebt: false,
    });
    expect(repeatedIntermediate.attachment).toBe(intermediate.attachment);
    expect(repeatedIntermediate.attachment.snapshotAckDebtStartedAt).toBe(4_000);

    const exactLatest = applyAcceptedSnapshotAcknowledgement(
      repeatedIntermediate.attachment,
      12,
      'baseline.12',
    );
    expect(exactLatest).toMatchObject({
      acknowledgesLatestSent: true,
      advancesAcknowledgement: true,
      recoveredDebt: true,
      attachment: {
        lastAcknowledgedSnapshotTick: 12,
        lastAcknowledgedSnapshotBaselineId: 'baseline.12',
        sentSnapshotHistory: [],
        snapshotAckDebtStartedAt: null,
      },
    });
    expect(evaluateSnapshotAckDebt(exactLatest.attachment, 4_250).action).toBe('none');
  });

  it('keeps a finite debt origin across monotonic retained progress without a newer send', () => {
    const pending = attachment({
      lastAcknowledgedSnapshotTick: 8,
      lastAcknowledgedSnapshotBaselineId: 'baseline.8',
      lastSentSnapshotTick: 14,
      lastSentSnapshotBaselineId: 'baseline.14',
      sentSnapshotHistory: [
        { serverTick: 8, snapshotBaselineId: 'baseline.8' },
        { serverTick: 10, snapshotBaselineId: 'baseline.10' },
        { serverTick: 12, snapshotBaselineId: 'baseline.12' },
        { serverTick: 14, snapshotBaselineId: 'baseline.14' },
      ],
      lastSnapshotSentAt: 4_000,
      snapshotAckDebtStartedAt: 1_000,
    });
    const firstProgress = applyAcceptedSnapshotAcknowledgement(
      pending,
      10,
      'baseline.10',
    );
    const secondProgress = applyAcceptedSnapshotAcknowledgement(
      firstProgress.attachment,
      12,
      'baseline.12',
    );
    expect(firstProgress.attachment.snapshotAckDebtStartedAt).toBe(4_000);
    expect(secondProgress).toMatchObject({
      acknowledgesLatestSent: false,
      advancesAcknowledgement: true,
      recoveredDebt: true,
      attachment: {
        lastAcknowledgedSnapshotTick: 12,
        lastAcknowledgedSnapshotBaselineId: 'baseline.12',
        sentSnapshotHistory: [{ serverTick: 14, snapshotBaselineId: 'baseline.14' }],
        snapshotAckDebtStartedAt: 4_000,
      },
    });
    const repeated = applyAcceptedSnapshotAcknowledgement(
      secondProgress.attachment,
      12,
      'baseline.12',
    );
    expect(repeated.attachment).toBe(secondProgress.attachment);
    expect(repeated.attachment.snapshotAckDebtStartedAt).toBe(4_000);
    expect(evaluateSnapshotAckDebt(
      repeated.attachment,
      4_000 + MAX_SNAPSHOT_ACK_DEBT_MILLISECONDS,
    ).action).toBe('fallback');

    const afterFinalFallback = attachment({
      ...repeated.attachment,
      lastSentSnapshotTick: 16,
      lastSentSnapshotBaselineId: 'baseline.16',
      sentSnapshotHistory: [
        ...repeated.attachment.sentSnapshotHistory,
        { serverTick: 16, snapshotBaselineId: 'baseline.16' },
      ],
      lastSnapshotSentAt: 4_000 + MAX_SNAPSHOT_ACK_DEBT_MILLISECONDS,
    });
    expect(evaluateSnapshotAckDebt(
      afterFinalFallback,
      4_000 + MAX_SNAPSHOT_ACK_DEBT_MILLISECONDS
        + SNAPSHOT_ACK_EVICTION_GRACE_MILLISECONDS - 1,
    ).action).toBe('coalesce');
    expect(evaluateSnapshotAckDebt(
      afterFinalFallback,
      4_000 + MAX_SNAPSHOT_ACK_DEBT_MILLISECONDS
        + SNAPSHOT_ACK_EVICTION_GRACE_MILLISECONDS,
    ).action).toBe('evict');
  });
});
