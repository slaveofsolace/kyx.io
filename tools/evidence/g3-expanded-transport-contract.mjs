const CONTRACT_PATH = 'worker/transport-limits.json';

function positiveSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer.`);
  }
  return value;
}

function counter(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function counterDelta(before, after) {
  const validBefore = counter(before);
  const validAfter = counter(after);
  return validBefore !== null && validAfter !== null && validAfter >= validBefore
    ? validAfter - validBefore
    : null;
}

export function normalizeTransportLimitContract(value, sha256) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Transport-limit contract must be an object.');
  }
  if (value.schemaVersion !== 1) {
    throw new TypeError('Transport-limit contract schemaVersion must be 1.');
  }
  if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(sha256)) {
    throw new TypeError('Transport-limit contract SHA-256 must be lowercase hexadecimal.');
  }

  return Object.freeze({
    schemaVersion: 1,
    path: CONTRACT_PATH,
    sha256,
    maxMessagesPerRateWindow: positiveSafeInteger(
      value.maxMessagesPerRateWindow,
      'maxMessagesPerRateWindow',
    ),
    maxBytesPerRateWindow: positiveSafeInteger(
      value.maxBytesPerRateWindow,
      'maxBytesPerRateWindow',
    ),
    rateWindowMilliseconds: positiveSafeInteger(
      value.rateWindowMilliseconds,
      'rateWindowMilliseconds',
    ),
    maxSocketBufferedBytes: positiveSafeInteger(
      value.maxSocketBufferedBytes,
      'maxSocketBufferedBytes',
    ),
    slowConsumerGraceMilliseconds: positiveSafeInteger(
      value.slowConsumerGraceMilliseconds,
      'slowConsumerGraceMilliseconds',
    ),
    maxSnapshotAckDebtMilliseconds: positiveSafeInteger(
      value.maxSnapshotAckDebtMilliseconds,
      'maxSnapshotAckDebtMilliseconds',
    ),
  });
}

export function deriveTransportFloodPlan(contract) {
  const messagesSent = positiveSafeInteger(
    contract.maxMessagesPerRateWindow,
    'maxMessagesPerRateWindow',
  ) + 1;
  if (!Number.isSafeInteger(messagesSent)) {
    throw new RangeError('Derived transport flood count exceeds the safe-integer range.');
  }
  return Object.freeze({
    messagesSent,
    messagesRateAccepted: messagesSent - 1,
    messagesRateRejected: 1,
  });
}

export function verifyTransportFloodEvidence(evidence, expectedContract) {
  const expected = deriveTransportFloodPlan(expectedContract);
  const record = evidence !== null && typeof evidence === 'object' && !Array.isArray(evidence)
    ? evidence
    : {};
  const recordedContract = record.contract !== null
    && typeof record.contract === 'object'
    && !Array.isArray(record.contract)
    ? record.contract
    : {};
  const counters = record.workerCounters !== null
    && typeof record.workerCounters === 'object'
    && !Array.isArray(record.workerCounters)
    ? record.workerCounters
    : {};
  const before = counters.before !== null
    && typeof counters.before === 'object'
    && !Array.isArray(counters.before)
    ? counters.before
    : {};
  const after = counters.after !== null
    && typeof counters.after === 'object'
    && !Array.isArray(counters.after)
    ? counters.after
    : {};
  const observed = Object.freeze({
    messagesSent: counter(record.messagesSent),
    messagesReceived: counterDelta(
      before.inboundMessagesReceived,
      after.inboundMessagesReceived,
    ),
    messagesRateAccepted: counterDelta(
      before.inboundMessagesRateAccepted,
      after.inboundMessagesRateAccepted,
    ),
    messagesRateRejected: counterDelta(
      before.inboundMessagesRateRejected,
      after.inboundMessagesRateRejected,
    ),
  });
  const checks = Object.freeze({
    evidenceSchemaVersion: record.schemaVersion === 1,
    exactCaptureContract: JSON.stringify(recordedContract) === JSON.stringify(expectedContract),
    sentCountMatchesDerivedPlan: observed.messagesSent === expected.messagesSent,
    receivedCounterDeltaMatchesDerivedPlan: observed.messagesReceived === expected.messagesSent,
    acceptedCounterDeltaMatchesDerivedPlan:
      observed.messagesRateAccepted === expected.messagesRateAccepted,
    rejectedCounterDeltaMatchesDerivedPlan:
      observed.messagesRateRejected === expected.messagesRateRejected,
    receivedCounterDeltaMatchesSentCount: observed.messagesReceived === observed.messagesSent,
    acceptedAndRejectedCountersBalance:
      observed.messagesRateAccepted !== null
      && observed.messagesRateRejected !== null
      && observed.messagesReceived
        === observed.messagesRateAccepted + observed.messagesRateRejected,
    rawRateLimitOutcomeObserved: record.rejectionCode === 'RATE_LIMITED'
      && record.close?.code === 1008
      && record.close?.reason === 'Rate limit exceeded',
  });

  return Object.freeze({
    expected,
    observed,
    checks,
    passed: Object.values(checks).every((value) => value === true),
  });
}
