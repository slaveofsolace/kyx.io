import {
  PROTOCOL_LIMITS,
  PROTOCOL_VERSION,
  RELIABLE_EVENT_STREAM_VERSION,
  validateServerMessage,
  type CombatPresentationReliableEventV1,
  type ReliableEvent,
  type ReliableEventKind,
} from '../src/net';

export const MAXIMUM_RELIABLE_EVENTS = 512 as const;
export const RELIABLE_EVENT_CHECKPOINT_SCHEMA_VERSION = 1 as const;

export interface ReliableEventCheckpointV1 {
  readonly schemaVersion: typeof RELIABLE_EVENT_CHECKPOINT_SCHEMA_VERSION;
  readonly capacity: number;
  readonly nextSequence: number;
  readonly events: readonly ReliableEvent[];
}

export interface ReliableEventInput {
  readonly serverTick: number;
  readonly kind: ReliableEventKind;
  readonly subjectId: string;
  readonly actorId: string | null;
  readonly targetId: string | null;
  readonly amountHealthPoints: number | null;
  readonly presentation?: CombatPresentationReliableEventV1;
}

export type ReliableEventAcknowledgementResult =
  | 'accepted'
  | 'regression'
  | 'unknown_event'
  | 'beyond_sent';

const EVENT_ID_PATTERN = /^event\.(0|[1-9][0-9]*)$/u;
const STABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/u;
const RELIABLE_EVENT_KINDS: ReadonlySet<ReliableEventKind> = new Set([
  'shotAccepted',
  'projectileSpawned',
  'damageApplied',
  'playerKilled',
  'abilityActivated',
  'abilityRejected',
  'cooldownStarted',
  'deployableSpawned',
  'loadoutAccepted',
  'playerJoined',
  'playerLeft',
]);

function boundedInteger(value: unknown, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new RangeError(`${label} must be an integer from ${minimum} through ${maximum}`);
  }
  return value as number;
}

function stableId(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || new TextEncoder().encode(value).byteLength < 1
    || new TextEncoder().encode(value).byteLength > PROTOCOL_LIMITS.maxIdBytes
    || !STABLE_ID_PATTERN.test(value)
  ) {
    throw new RangeError(`${label} must be a bounded stable identifier`);
  }
  return value;
}

function nullableStableId(value: unknown, label: string): string | null {
  return value === null ? null : stableId(value, label);
}

function checkpointRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('reliable event checkpoint must be a record');
  }
  const keys = Object.keys(value).sort();
  const expected = ['schemaVersion', 'capacity', 'nextSequence', 'events'].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new TypeError('reliable event checkpoint contains unsupported or missing fields');
  }
  return value as Record<string, unknown>;
}

function reliableEvent(value: unknown, expectedSequence: number): ReliableEvent {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('checkpoint reliable event must be a record');
  }
  const keys = Object.keys(value).sort();
  const expected = new Set([
    'id', 'serverTick', 'kind', 'subjectId', 'actorId', 'targetId', 'amountHealthPoints',
    'presentation',
  ]);
  const required = new Set([
    'id', 'serverTick', 'kind', 'subjectId', 'actorId', 'targetId', 'amountHealthPoints',
  ]);
  if (keys.some((key) => !expected.has(key)) || [...required].some((key) => !keys.includes(key))) {
    throw new TypeError('checkpoint reliable event contains unsupported or missing fields');
  }
  const item = value as Record<string, unknown>;
  const id = stableId(item.id, 'checkpoint reliable event id');
  if (id !== `event.${expectedSequence}`) {
    throw new RangeError('checkpoint reliable event sequence is not contiguous');
  }
  if (!RELIABLE_EVENT_KINDS.has(item.kind as ReliableEventKind)) {
    throw new RangeError('checkpoint reliable event kind is unsupported');
  }
  const event = Object.freeze({
    id,
    serverTick: boundedInteger(
      item.serverTick,
      0,
      PROTOCOL_LIMITS.maxAuthorityTick,
      'checkpoint reliable event tick',
    ),
    kind: item.kind as ReliableEventKind,
    subjectId: stableId(item.subjectId, 'checkpoint reliable event subject'),
    actorId: nullableStableId(item.actorId, 'checkpoint reliable event actor'),
    targetId: nullableStableId(item.targetId, 'checkpoint reliable event target'),
    amountHealthPoints: item.amountHealthPoints === null
      ? null
      : boundedInteger(
          item.amountHealthPoints,
          0,
          1_000_000,
          'checkpoint reliable event health amount',
        ),
    ...(Object.hasOwn(item, 'presentation')
      ? { presentation: structuredClone(item.presentation) }
      : {}),
  });
  const validation = validateServerMessage({
    protocolVersion: PROTOCOL_VERSION,
    type: 'reliableEventBatch',
    reliableEventStreamVersion: RELIABLE_EVENT_STREAM_VERSION,
    matchId: 'checkpoint_validation',
    events: [event],
  });
  if (!validation.ok) {
    throw new RangeError(`checkpoint reliable event is invalid: ${validation.error.code}`);
  }
  return event as ReliableEvent;
}

function eventSequence(eventId: string): number | null {
  const match = EVENT_ID_PATTERN.exec(eventId);
  if (match === null) return null;
  const sequence = Number(match[1]);
  return Number.isSafeInteger(sequence) && sequence > 0 ? sequence : null;
}

/** Bounded ordered event stream with cumulative acknowledgements. */
export class ReliableEventStore {
  private readonly capacity: number;
  private readonly events: ReliableEvent[] = [];
  private nextSequence = 1;

  constructor(capacity: number = MAXIMUM_RELIABLE_EVENTS) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new RangeError('reliable event capacity must be a positive safe integer');
    }
    this.capacity = capacity;
  }

  exportCheckpoint(): ReliableEventCheckpointV1 {
    return Object.freeze({
      schemaVersion: RELIABLE_EVENT_CHECKPOINT_SCHEMA_VERSION,
      capacity: this.capacity,
      nextSequence: this.nextSequence,
      events: Object.freeze(this.events.map((event) => Object.freeze(structuredClone(event)))),
    });
  }

  restoreCheckpoint(checkpointValue: unknown): void {
    const checkpoint = checkpointRecord(checkpointValue);
    if (checkpoint.schemaVersion !== RELIABLE_EVENT_CHECKPOINT_SCHEMA_VERSION) {
      throw new RangeError('reliable event checkpoint schema is unsupported');
    }
    const capacity = boundedInteger(checkpoint.capacity, 1, 4_096, 'reliable event checkpoint capacity');
    if (capacity !== this.capacity) {
      throw new RangeError('reliable event checkpoint capacity does not match the store');
    }
    const nextSequence = boundedInteger(
      checkpoint.nextSequence,
      1,
      PROTOCOL_LIMITS.maxSequence + 1,
      'reliable event checkpoint next sequence',
    );
    if (!Array.isArray(checkpoint.events) || checkpoint.events.length > capacity) {
      throw new RangeError('reliable event checkpoint exceeds retained capacity');
    }
    if (checkpoint.events.length === 0 && nextSequence !== 1) {
      throw new RangeError('empty reliable event checkpoint must start at sequence one');
    }
    const firstSequence = nextSequence - checkpoint.events.length;
    const events = checkpoint.events.map((event, index) => (
      reliableEvent(event, firstSequence + index)
    ));
    if (events.some(({ id }) => eventSequence(id) === null)) {
      throw new RangeError('reliable event checkpoint contains an invalid event id');
    }

    this.events.splice(0, this.events.length, ...events);
    this.nextSequence = nextSequence;
  }

  append(input: ReliableEventInput): ReliableEvent {
    if (this.nextSequence > PROTOCOL_LIMITS.maxSequence) {
      throw new Error('reliable event sequence exhausted');
    }
    const event = Object.freeze({
      id: `event.${this.nextSequence}`,
      ...input,
    });
    this.nextSequence += 1;
    this.events.push(event);
    while (this.events.length > this.capacity) this.events.shift();
    return event;
  }

  get latestId(): string | null {
    return this.events.at(-1)?.id ?? null;
  }

  pendingAfter(lastAcknowledgedId: string | null): readonly ReliableEvent[] | null {
    const acknowledgedSequence = lastAcknowledgedId === null
      ? 0
      : eventSequence(lastAcknowledgedId);
    if (acknowledgedSequence === null || acknowledgedSequence >= this.nextSequence) return null;
    const firstRetainedSequence = this.events.length === 0
      ? this.nextSequence
      : eventSequence(this.events[0].id) ?? this.nextSequence;
    if (acknowledgedSequence < firstRetainedSequence - 1) return null;
    return Object.freeze(this.events.filter((event) => (
      (eventSequence(event.id) ?? 0) > acknowledgedSequence
    )));
  }

  validateAcknowledgement(
    previousId: string | null,
    nextId: string | null,
    lastSentId: string | null,
  ): ReliableEventAcknowledgementResult {
    const previous = previousId === null ? 0 : eventSequence(previousId);
    const next = nextId === null ? 0 : eventSequence(nextId);
    const sent = lastSentId === null ? 0 : eventSequence(lastSentId);
    if (previous === null || next === null || sent === null || next >= this.nextSequence) {
      return 'unknown_event';
    }
    if (next < previous) return 'regression';
    if (next > sent) return 'beyond_sent';
    return 'accepted';
  }
}
