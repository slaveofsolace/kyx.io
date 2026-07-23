import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  deriveTransportFloodPlan,
  normalizeTransportLimitContract,
  verifyTransportFloodEvidence,
  type TransportFloodEvidence,
} from '../../../tools/evidence/g3-expanded-transport-contract.mjs';

async function contract() {
  const bytes = await readFile(new URL('../../../worker/transport-limits.json', import.meta.url));
  const raw = JSON.parse(bytes.toString('utf8')) as unknown;
  return normalizeTransportLimitContract(raw, createHash('sha256').update(bytes).digest('hex'));
}

describe('expanded G3 transport-flood evidence contract', () => {
  it('derives the one-over-limit send count and independently reconciles raw Worker counters', async () => {
    const expectedContract = await contract();
    const plan = deriveTransportFloodPlan(expectedContract);
    const evidence: TransportFloodEvidence = {
      schemaVersion: 1,
      contract: expectedContract,
      messagesSent: plan.messagesSent,
      workerCounters: {
        before: {
          inboundMessagesReceived: 14,
          inboundMessagesRateAccepted: 14,
          inboundMessagesRateRejected: 0,
        },
        after: {
          inboundMessagesReceived: 14 + plan.messagesSent,
          inboundMessagesRateAccepted: 14 + plan.messagesRateAccepted,
          inboundMessagesRateRejected: plan.messagesRateRejected,
        },
      },
      rejectionCode: 'RATE_LIMITED',
      close: { code: 1008, reason: 'Rate limit exceeded', wasClean: true },
    };

    const verification = verifyTransportFloodEvidence(evidence, expectedContract);
    expect(plan).toEqual({
      messagesSent: 385,
      messagesRateAccepted: 384,
      messagesRateRejected: 1,
    });
    expect(verification.passed).toBe(true);
    expect(verification.observed).toMatchObject(plan);
    expect(verification.observed.messagesReceived).toBe(plan.messagesSent);
  });

  it('rejects the preserved 257-recorded/385-executed mismatch even when booleans say PASS', async () => {
    const expectedContract = await contract();
    const fixture = JSON.parse(await readFile(new URL(
      '../../fixtures/g3-expanded/transport-flood-stale-count.json',
      import.meta.url,
    ), 'utf8')) as unknown;

    const verification = verifyTransportFloodEvidence(fixture, expectedContract);
    expect(verification.passed).toBe(false);
    expect(verification.observed).toMatchObject({
      messagesSent: 257,
      messagesReceived: 385,
      messagesRateAccepted: 384,
      messagesRateRejected: 1,
    });
    expect(verification.checks).toMatchObject({
      sentCountMatchesDerivedPlan: false,
      receivedCounterDeltaMatchesSentCount: false,
      acceptedCounterDeltaMatchesDerivedPlan: true,
      rejectedCounterDeltaMatchesDerivedPlan: true,
    });
  });
});
