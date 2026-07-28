import {
  CLIENT_MESSAGE_TYPES,
  FORBIDDEN_CLIENT_COMMAND_TYPES,
  PROTOCOL_LIMITS,
  PROTOCOL_VERSION,
  SERVER_MESSAGE_TYPES,
  type ClientMessage,
  type CombatPresentationReliableEventV1,
  type CombatSnapshotV1,
  type LocalReconciliationStateV1,
  type MovementSimulationIdentityV1,
  type PlayerIntentCommand,
  type ProtocolFailure,
  type ProtocolMessage,
  type ProtocolValidationResult,
  type ReliableEvent,
  type ServerMessage,
  type SimulationIdentityV1,
  type SnapshotEntity,
} from './protocol';

type UnknownRecord = Record<string, unknown>;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;
const CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const IDENTITY_HASH_PATTERN = /^(?:[a-f0-9]{16}|[a-f0-9]{64})$/;
const RESUME_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const RELIABLE_EVENT_ID_PATTERN = /^event\.([1-9][0-9]*)$/;
const encoder = new TextEncoder();

class ValidationAbort extends Error {
  readonly failure: ProtocolFailure;

  constructor(failure: ProtocolFailure) {
    super(failure.message);
    this.failure = failure;
  }
}

function fail(code: ProtocolFailure['code'], path: string, message: string): never {
  throw new ValidationAbort({ code, path, message });
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function snapshotProtocolValue(
  value: unknown,
  path: string,
  active: Set<object>,
  depth: number,
): unknown {
  if (depth > 32) {
    fail('PROTOCOL_INVALID_FIELD_VALUE', path, 'Protocol value exceeds the maximum nesting depth.');
  }
  if (typeof value !== 'object' || value === null) return value;
  if (active.has(value)) {
    fail('PROTOCOL_INVALID_FIELD_VALUE', path, 'Protocol values cannot contain cycles.');
  }

  active.add(value);
  try {
    const prototype = Object.getPrototypeOf(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key === 'symbol')) {
      fail('PROTOCOL_INVALID_FIELD_VALUE', path, 'Protocol values cannot contain symbol fields.');
    }

    if (Array.isArray(value)) {
      if (prototype !== Array.prototype) {
        fail('PROTOCOL_INVALID_FIELD_VALUE', path, 'Expected a plain protocol array.');
      }
      if (value.length > PROTOCOL_LIMITS.maxEntitiesPerSnapshot) {
        fail(
          'PROTOCOL_ARRAY_TOO_LONG',
          path,
          `Protocol array exceeds the absolute ${PROTOCOL_LIMITS.maxEntitiesPerSnapshot}-entry limit.`,
        );
      }
      const allowedKeys = new Set(['length', ...Array.from({ length: value.length }, (_, index) => String(index))]);
      for (const key of keys) {
        if (typeof key === 'string' && !allowedKeys.has(key)) {
          fail('PROTOCOL_INVALID_FIELD_VALUE', `${path}.${key}`, 'Protocol arrays cannot contain named fields.');
        }
      }

      const snapshot: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor) {
          fail('PROTOCOL_INVALID_FIELD_VALUE', `${path}[${index}]`, 'Protocol arrays cannot be sparse.');
        }
        if (!('value' in descriptor) || descriptor.get || descriptor.set) {
          fail('PROTOCOL_INVALID_FIELD_VALUE', `${path}[${index}]`, 'Protocol values cannot contain accessors.');
        }
        snapshot.push(snapshotProtocolValue(descriptor.value, `${path}[${index}]`, active, depth + 1));
      }
      return snapshot;
    }

    if (prototype !== Object.prototype && prototype !== null) {
      fail('PROTOCOL_INVALID_FIELD_VALUE', path, 'Expected a plain protocol object.');
    }
    if (keys.length > 128) {
      fail('PROTOCOL_INVALID_FIELD_VALUE', path, 'Protocol object contains too many fields.');
    }
    const snapshot: UnknownRecord = Object.create(null) as UnknownRecord;
    for (const key of keys) {
      if (typeof key !== 'string') continue;
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor) || descriptor.get || descriptor.set) {
        fail('PROTOCOL_INVALID_FIELD_VALUE', `${path}.${key}`, 'Protocol fields must be enumerable data properties.');
      }
      snapshot[key] = snapshotProtocolValue(descriptor.value, `${path}.${key}`, active, depth + 1);
    }
    return snapshot;
  } catch (error) {
    if (error instanceof ValidationAbort) throw error;
    fail('PROTOCOL_INVALID_FIELD_VALUE', path, 'Protocol value could not be inspected safely.');
  } finally {
    active.delete(value);
  }
}

function recordAt(value: unknown, path: string): UnknownRecord {
  if (!isRecord(value)) {
    fail(path === '$' ? 'PROTOCOL_ROOT_NOT_OBJECT' : 'PROTOCOL_INVALID_FIELD_TYPE', path, 'Expected an object.');
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail('PROTOCOL_INVALID_FIELD_VALUE', path, 'Expected a plain protocol object.');
  }
  return value;
}

function exactKeys(record: UnknownRecord, path: string, allowedKeys: readonly string[]): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      fail('PROTOCOL_UNKNOWN_FIELD', `${path}.${key}`, 'Unknown protocol field.');
    }
  }
}

function required(record: UnknownRecord, key: string, path: string): unknown {
  if (!Object.hasOwn(record, key)) {
    fail('PROTOCOL_REQUIRED_FIELD', `${path}.${key}`, 'Required protocol field is missing.');
  }
  return record[key];
}

interface StringOptions {
  readonly maxBytes?: number;
  readonly allowed?: readonly string[];
  readonly id?: boolean;
  readonly code?: boolean;
  readonly nullable?: boolean;
}

function stringAt(value: unknown, path: string, options: StringOptions = {}): string | null {
  if (value === null && options.nullable) return null;
  if (typeof value !== 'string') {
    fail('PROTOCOL_INVALID_FIELD_TYPE', path, 'Expected a string.');
  }
  const maxBytes = options.maxBytes ?? PROTOCOL_LIMITS.maxIdBytes;
  if (value.length === 0) {
    fail('PROTOCOL_INVALID_FIELD_VALUE', path, 'String cannot be empty.');
  }
  if (encoder.encode(value).byteLength > maxBytes) {
    fail('PROTOCOL_STRING_TOO_LONG', path, `UTF-8 string exceeds ${maxBytes} bytes.`);
  }
  if (value.trim() !== value) {
    fail('PROTOCOL_INVALID_FIELD_VALUE', path, 'Leading or trailing whitespace is not allowed.');
  }
  if (/[\u0000-\u001f\u007f]/u.test(value)) {
    fail('PROTOCOL_INVALID_FIELD_VALUE', path, 'Control characters are not allowed.');
  }
  if (options.id && !ID_PATTERN.test(value)) {
    fail('PROTOCOL_INVALID_FIELD_VALUE', path, 'Expected a stable protocol ID.');
  }
  if (options.code && !CODE_PATTERN.test(value)) {
    fail('PROTOCOL_INVALID_FIELD_VALUE', path, 'Expected an uppercase stable code.');
  }
  if (options.allowed && !options.allowed.includes(value)) {
    fail('PROTOCOL_INVALID_FIELD_VALUE', path, 'Value is not in the supported set.');
  }
  return value;
}

interface NumberOptions {
  readonly integer?: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly nullable?: boolean;
}

function numberAt(value: unknown, path: string, options: NumberOptions = {}): number | null {
  if (value === null && options.nullable) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('PROTOCOL_INVALID_FIELD_TYPE', path, 'Expected a finite number.');
  }
  if (options.integer && !Number.isInteger(value)) {
    fail('PROTOCOL_INVALID_FIELD_VALUE', path, 'Expected an integer.');
  }
  if ((options.min !== undefined && value < options.min) || (options.max !== undefined && value > options.max)) {
    fail('PROTOCOL_NUMERIC_OUT_OF_RANGE', path, 'Number is outside the supported range.');
  }
  return value;
}

function booleanAt(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    fail('PROTOCOL_INVALID_FIELD_TYPE', path, 'Expected a boolean.');
  }
  return value;
}

function arrayAt(value: unknown, path: string, maxLength: number, allowEmpty = true): readonly unknown[] {
  if (!Array.isArray(value)) {
    fail('PROTOCOL_INVALID_FIELD_TYPE', path, 'Expected an array.');
  }
  if (value.length > maxLength) {
    fail('PROTOCOL_ARRAY_TOO_LONG', path, `Array exceeds ${maxLength} entries.`);
  }
  if (!allowEmpty && value.length === 0) {
    fail('PROTOCOL_EMPTY_INPUT_BATCH', path, 'At least one input command is required.');
  }
  return value;
}

function idAt(value: unknown, path: string): string {
  return stringAt(value, path, { id: true, maxBytes: PROTOCOL_LIMITS.maxIdBytes }) as string;
}

function nullableIdAt(value: unknown, path: string): string | null {
  return stringAt(value, path, { id: true, maxBytes: PROTOCOL_LIMITS.maxIdBytes, nullable: true });
}

function reliableEventIdAt(value: unknown, path: string, nullable = false): string | null {
  if (value === null && nullable) return null;
  const id = idAt(value, path);
  const match = RELIABLE_EVENT_ID_PATTERN.exec(id);
  const sequence = match === null ? Number.NaN : Number(match[1]);
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > PROTOCOL_LIMITS.maxSequence) {
    fail('PROTOCOL_INVALID_FIELD_VALUE', path, 'Expected a version-1 reliable event ID.');
  }
  return id;
}

function tickAt(value: unknown, path: string): number {
  return numberAt(value, path, {
    integer: true,
    min: 0,
    max: PROTOCOL_LIMITS.maxAuthorityTick,
  }) as number;
}

function sequenceAt(value: unknown, path: string): number {
  return numberAt(value, path, {
    integer: true,
    min: 0,
    max: PROTOCOL_LIMITS.maxSequence,
  }) as number;
}

function processedSequenceAt(value: unknown, path: string): number {
  return numberAt(value, path, {
    integer: true,
    min: -1,
    max: PROTOCOL_LIMITS.maxSequence,
  }) as number;
}

function revisionAt(value: unknown, path: string): number {
  return numberAt(value, path, { integer: true, min: 1, max: 65_535 }) as number;
}

function identityHashAt(value: unknown, path: string): string {
  const hash = stringAt(value, path, { maxBytes: 64 }) as string;
  if (!IDENTITY_HASH_PATTERN.test(hash)) {
    fail(
      'PROTOCOL_INVALID_FIELD_VALUE',
      path,
      'Identity hash must be lowercase hexadecimal with exactly 16 or 64 characters.',
    );
  }
  return hash;
}

function resumeTokenAt(value: unknown, path: string): string {
  const token = stringAt(value, path, {
    maxBytes: PROTOCOL_LIMITS.maxResumeTokenBytes,
  }) as string;
  if (!RESUME_TOKEN_PATTERN.test(token)) {
    fail(
      'PROTOCOL_INVALID_FIELD_VALUE',
      path,
      'Resume token must be an unpadded 32-byte base64url value with exactly 43 characters.',
    );
  }
  return token;
}

function validateProtocolVersion(record: UnknownRecord, path: string): void {
  if (!Object.hasOwn(record, 'protocolVersion')) {
    fail('PROTOCOL_VERSION_REQUIRED', `${path}.protocolVersion`, 'Protocol version is required.');
  }
  if (record.protocolVersion !== PROTOCOL_VERSION) {
    fail(
      'PROTOCOL_VERSION_UNSUPPORTED',
      `${path}.protocolVersion`,
      `Only protocol version ${PROTOCOL_VERSION} is supported.`,
    );
  }
}

function messageType(record: UnknownRecord, path: string): string {
  if (!Object.hasOwn(record, 'type')) {
    fail('PROTOCOL_TYPE_REQUIRED', `${path}.type`, 'Message type is required.');
  }
  if (typeof record.type !== 'string') {
    fail('PROTOCOL_INVALID_FIELD_TYPE', `${path}.type`, 'Message type must be a string.');
  }
  return record.type;
}

function envelope(value: unknown): { readonly record: UnknownRecord; readonly type: string } {
  const record = recordAt(value, '$');
  validateProtocolVersion(record, '$');
  return { record, type: messageType(record, '$') };
}

function validateIntent(value: unknown, path: string): PlayerIntentCommand {
  const record = recordAt(value, path);
  const typeValue = required(record, 'type', path);
  if (typeof typeValue !== 'string') {
    fail('PROTOCOL_INVALID_FIELD_TYPE', `${path}.type`, 'Command type must be a string.');
  }

  const normalized = typeValue.replace(/[^A-Za-z]/g, '').toLowerCase();
  if ((FORBIDDEN_CLIENT_COMMAND_TYPES as readonly string[]).includes(normalized)) {
    fail('PROTOCOL_FORBIDDEN_COMMAND', `${path}.type`, 'Client commands may request intent, never authoritative facts.');
  }

  if (typeValue === 'input') {
    exactKeys(record, path, [
      'type', 'sequence', 'clientTick', 'moveX', 'moveY',
      'lookYawDeltaMilliDegrees', 'lookPitchDeltaMilliDegrees',
      'heldButtons', 'pressedButtons', 'releasedButtons', 'selectedSlot',
    ]);
    sequenceAt(required(record, 'sequence', path), `${path}.sequence`);
    tickAt(required(record, 'clientTick', path), `${path}.clientTick`);
    numberAt(required(record, 'moveX', path), `${path}.moveX`, { integer: true, min: -PROTOCOL_LIMITS.maxAxisMagnitude, max: PROTOCOL_LIMITS.maxAxisMagnitude });
    numberAt(required(record, 'moveY', path), `${path}.moveY`, { integer: true, min: -PROTOCOL_LIMITS.maxAxisMagnitude, max: PROTOCOL_LIMITS.maxAxisMagnitude });
    numberAt(required(record, 'lookYawDeltaMilliDegrees', path), `${path}.lookYawDeltaMilliDegrees`, { integer: true, min: -PROTOCOL_LIMITS.maxLookDeltaMilliDegrees, max: PROTOCOL_LIMITS.maxLookDeltaMilliDegrees });
    numberAt(required(record, 'lookPitchDeltaMilliDegrees', path), `${path}.lookPitchDeltaMilliDegrees`, { integer: true, min: -PROTOCOL_LIMITS.maxLookDeltaMilliDegrees, max: PROTOCOL_LIMITS.maxLookDeltaMilliDegrees });
    const heldButtons = numberAt(required(record, 'heldButtons', path), `${path}.heldButtons`, { integer: true, min: 0, max: PROTOCOL_LIMITS.maxButtonBits }) as number;
    const pressedButtons = numberAt(required(record, 'pressedButtons', path), `${path}.pressedButtons`, { integer: true, min: 0, max: PROTOCOL_LIMITS.maxButtonBits }) as number;
    const releasedButtons = numberAt(required(record, 'releasedButtons', path), `${path}.releasedButtons`, { integer: true, min: 0, max: PROTOCOL_LIMITS.maxButtonBits }) as number;
    if ((pressedButtons & releasedButtons) !== 0) {
      fail('PROTOCOL_INVALID_FIELD_VALUE', `${path}.pressedButtons`, 'Pressed and released edges cannot overlap.');
    }
    if ((pressedButtons & heldButtons) !== pressedButtons) {
      fail('PROTOCOL_INVALID_FIELD_VALUE', `${path}.pressedButtons`, 'Pressed edges must also be present in held buttons.');
    }
    if ((releasedButtons & heldButtons) !== 0) {
      fail('PROTOCOL_INVALID_FIELD_VALUE', `${path}.releasedButtons`, 'Released edges cannot remain held.');
    }
    if (Object.hasOwn(record, 'selectedSlot')) {
      numberAt(record.selectedSlot, `${path}.selectedSlot`, { integer: true, min: 0, max: PROTOCOL_LIMITS.maxSelectedSlot });
    }
    return record as unknown as PlayerIntentCommand;
  }

  fail('PROTOCOL_TYPE_UNSUPPORTED', `${path}.type`, 'Unsupported player-intent command type.');
}

function validateStringIds(value: unknown, path: string, maxLength: number): readonly string[] {
  const values = arrayAt(value, path, maxLength);
  return values.map((entry, index) => idAt(entry, `${path}[${index}]`));
}

function assertUnique(values: readonly string[], path: string): void {
  if (new Set(values).size !== values.length) {
    fail('PROTOCOL_DUPLICATE_ID', path, 'IDs in this array must be unique.');
  }
}

function validateHello(record: UnknownRecord): ClientMessage {
  exactKeys(record, '$', ['protocolVersion', 'type', 'requestId', 'clientBuild', 'requestedRulesetId', 'capabilities']);
  idAt(required(record, 'requestId', '$'), '$.requestId');
  stringAt(required(record, 'clientBuild', '$'), '$.clientBuild', { id: true, maxBytes: PROTOCOL_LIMITS.maxBuildIdBytes });
  idAt(required(record, 'requestedRulesetId', '$'), '$.requestedRulesetId');
  const capabilities = validateStringIds(required(record, 'capabilities', '$'), '$.capabilities', PROTOCOL_LIMITS.maxCapabilities);
  assertUnique(capabilities, '$.capabilities');
  return record as unknown as ClientMessage;
}

function validateAuthenticate(record: UnknownRecord): ClientMessage {
  exactKeys(record, '$', ['protocolVersion', 'type', 'requestId', 'accessToken']);
  idAt(required(record, 'requestId', '$'), '$.requestId');
  stringAt(required(record, 'accessToken', '$'), '$.accessToken', {
    maxBytes: PROTOCOL_LIMITS.maxAuthTokenBytes,
  });
  return record as unknown as ClientMessage;
}

function validateJoinRoom(record: UnknownRecord): ClientMessage {
  exactKeys(record, '$', ['protocolVersion', 'type', 'requestId', 'roomCode', 'displayName']);
  idAt(required(record, 'requestId', '$'), '$.requestId');
  stringAt(required(record, 'roomCode', '$'), '$.roomCode', { id: true, maxBytes: PROTOCOL_LIMITS.maxRoomCodeBytes });
  stringAt(required(record, 'displayName', '$'), '$.displayName', { maxBytes: PROTOCOL_LIMITS.maxDisplayNameBytes });
  return record as unknown as ClientMessage;
}

function validateResumeRoom(record: UnknownRecord): ClientMessage {
  exactKeys(record, '$', ['protocolVersion', 'type', 'requestId', 'roomCode', 'resumeToken']);
  idAt(required(record, 'requestId', '$'), '$.requestId');
  stringAt(required(record, 'roomCode', '$'), '$.roomCode', {
    id: true,
    maxBytes: PROTOCOL_LIMITS.maxRoomCodeBytes,
  });
  resumeTokenAt(required(record, 'resumeToken', '$'), '$.resumeToken');
  return record as unknown as ClientMessage;
}

function validateRequestFullSnapshot(record: UnknownRecord): ClientMessage {
  exactKeys(record, '$', ['protocolVersion', 'type', 'requestId', 'reason']);
  idAt(required(record, 'requestId', '$'), '$.requestId');
  stringAt(required(record, 'reason', '$'), '$.reason', {
    allowed: ['missing_baseline', 'history_gap', 'manual_evidence'],
  });
  return record as unknown as ClientMessage;
}

function validateInputBatch(record: UnknownRecord): ClientMessage {
  exactKeys(record, '$', ['protocolVersion', 'type', 'commands']);
  const values = arrayAt(required(record, 'commands', '$'), '$.commands', PROTOCOL_LIMITS.maxCommandsPerBatch, false);
  const commands = values.map((command, index) => validateIntent(command, `$.commands[${index}]`));
  let previousSequence = -1;
  for (const [index, command] of commands.entries()) {
    if (command.sequence <= previousSequence) {
      fail('PROTOCOL_SEQUENCE_INVALID', `$.commands[${index}].sequence`, 'Input-batch sequences must be strictly increasing.');
    }
    previousSequence = command.sequence;
  }
  return record as unknown as ClientMessage;
}

function validateLoadoutRequest(record: UnknownRecord): ClientMessage {
  exactKeys(record, '$', [
    'protocolVersion', 'type', 'requestId', 'primaryWeaponId', 'secondaryWeaponId',
    'meleeWeaponId', 'damageAbilityIds', 'utilityAbilityId',
  ]);
  idAt(required(record, 'requestId', '$'), '$.requestId');
  idAt(required(record, 'primaryWeaponId', '$'), '$.primaryWeaponId');
  nullableIdAt(required(record, 'secondaryWeaponId', '$'), '$.secondaryWeaponId');
  idAt(required(record, 'meleeWeaponId', '$'), '$.meleeWeaponId');
  const damageIds = validateStringIds(required(record, 'damageAbilityIds', '$'), '$.damageAbilityIds', 3);
  if (damageIds.length !== 2 && damageIds.length !== 3) {
    fail(
      'PROTOCOL_INVALID_FIELD_VALUE',
      '$.damageAbilityIds',
      'Two legacy or three current selectable ability IDs are required.',
    );
  }
  assertUnique(damageIds, '$.damageAbilityIds');
  idAt(required(record, 'utilityAbilityId', '$'), '$.utilityAbilityId');
  return record as unknown as ClientMessage;
}

function validatePing(record: UnknownRecord): ClientMessage {
  exactKeys(record, '$', ['protocolVersion', 'type', 'nonce', 'clientTick']);
  numberAt(required(record, 'nonce', '$'), '$.nonce', { integer: true, min: 0, max: 0xffff_ffff });
  tickAt(required(record, 'clientTick', '$'), '$.clientTick');
  return record as unknown as ClientMessage;
}

function validateAck(record: UnknownRecord): ClientMessage {
  exactKeys(record, '$', [
    'protocolVersion',
    'type',
    'snapshotBaselineVersion',
    'reliableEventStreamVersion',
    'snapshotBaselineId',
    'serverTick',
    'lastEventId',
  ]);
  if (required(record, 'snapshotBaselineVersion', '$') !== 1) {
    fail('PROTOCOL_INVALID_FIELD_VALUE', '$.snapshotBaselineVersion', 'Unsupported snapshot baseline version.');
  }
  if (required(record, 'reliableEventStreamVersion', '$') !== 1) {
    fail('PROTOCOL_INVALID_FIELD_VALUE', '$.reliableEventStreamVersion', 'Unsupported reliable-event stream version.');
  }
  idAt(required(record, 'snapshotBaselineId', '$'), '$.snapshotBaselineId');
  tickAt(required(record, 'serverTick', '$'), '$.serverTick');
  reliableEventIdAt(required(record, 'lastEventId', '$'), '$.lastEventId', true);
  return record as unknown as ClientMessage;
}

function validateProtocolConfig(value: unknown, path: string): void {
  const record = recordAt(value, path);
  exactKeys(record, path, [
    'protocolVersion',
    'snapshotBaselineVersion',
    'reliableEventStreamVersion',
    'simulationHz',
    'snapshotHz',
    'maxMessageBytes',
    'maxCommandsPerBatch',
  ]);
  if (required(record, 'protocolVersion', path) !== PROTOCOL_VERSION) {
    fail('PROTOCOL_VERSION_UNSUPPORTED', `${path}.protocolVersion`, 'Nested protocol version does not match the envelope.');
  }
  if (required(record, 'simulationHz', path) !== 20) {
    fail('PROTOCOL_INVALID_FIELD_VALUE', `${path}.simulationHz`, 'The initial authority simulation contract is 20 Hz.');
  }
  if (required(record, 'snapshotBaselineVersion', path) !== 1) {
    fail('PROTOCOL_INVALID_FIELD_VALUE', `${path}.snapshotBaselineVersion`, 'Unsupported snapshot baseline version.');
  }
  if (required(record, 'reliableEventStreamVersion', path) !== 1) {
    fail('PROTOCOL_INVALID_FIELD_VALUE', `${path}.reliableEventStreamVersion`, 'Unsupported reliable-event stream version.');
  }
  numberAt(required(record, 'snapshotHz', path), `${path}.snapshotHz`, { integer: true, min: 1, max: 20 });
  numberAt(required(record, 'maxMessageBytes', path), `${path}.maxMessageBytes`, { integer: true, min: 1, max: PROTOCOL_LIMITS.maxMessageBytes });
  numberAt(required(record, 'maxCommandsPerBatch', path), `${path}.maxCommandsPerBatch`, { integer: true, min: 1, max: PROTOCOL_LIMITS.maxCommandsPerBatch });
}

function validateSimulationIdentity(value: unknown, path: string): SimulationIdentityV1 {
  const record = recordAt(value, path);
  exactKeys(record, path, [
    'schemaVersion',
    'mapId',
    'rulesetId',
    'rulesetRevision',
    'rulesetHash',
    'movementProfileId',
    'movementProfileRevision',
    'movementProfileHash',
    'fixtureId',
    'fixtureHash',
    'physicsAdapterId',
    'physicsAdapterVersion',
  ]);
  if (required(record, 'schemaVersion', path) !== 1) {
    fail('PROTOCOL_INVALID_FIELD_VALUE', `${path}.schemaVersion`, 'Simulation identity schema version must be 1.');
  }
  for (const key of [
    'mapId',
    'rulesetId',
    'movementProfileId',
    'fixtureId',
    'physicsAdapterId',
    'physicsAdapterVersion',
  ] as const) {
    idAt(required(record, key, path), `${path}.${key}`);
  }
  revisionAt(required(record, 'rulesetRevision', path), `${path}.rulesetRevision`);
  revisionAt(required(record, 'movementProfileRevision', path), `${path}.movementProfileRevision`);
  for (const key of ['rulesetHash', 'movementProfileHash', 'fixtureHash'] as const) {
    identityHashAt(required(record, key, path), `${path}.${key}`);
  }
  return record as unknown as SimulationIdentityV1;
}

function validateMovementSimulationIdentity(
  value: unknown,
  path: string,
): MovementSimulationIdentityV1 {
  const record = recordAt(value, path);
  exactKeys(record, path, [
    'rulesetId',
    'rulesetRevision',
    'rulesetHash',
    'movementProfileId',
    'movementProfileRevision',
    'movementProfileHash',
    'fixtureId',
    'fixtureHash',
    'physicsAdapterId',
    'physicsAdapterVersion',
  ]);
  for (const key of [
    'rulesetId',
    'movementProfileId',
    'fixtureId',
    'physicsAdapterId',
    'physicsAdapterVersion',
  ] as const) {
    idAt(required(record, key, path), `${path}.${key}`);
  }
  revisionAt(required(record, 'rulesetRevision', path), `${path}.rulesetRevision`);
  revisionAt(required(record, 'movementProfileRevision', path), `${path}.movementProfileRevision`);
  for (const key of ['rulesetHash', 'movementProfileHash', 'fixtureHash'] as const) {
    identityHashAt(required(record, key, path), `${path}.${key}`);
  }
  return record as unknown as MovementSimulationIdentityV1;
}

function assertMovementIdentityMatchesSimulation(
  movement: MovementSimulationIdentityV1,
  simulation: SimulationIdentityV1,
  path: string,
): void {
  for (const key of [
    'rulesetId',
    'rulesetRevision',
    'rulesetHash',
    'movementProfileId',
    'movementProfileRevision',
    'movementProfileHash',
    'fixtureId',
    'fixtureHash',
    'physicsAdapterId',
    'physicsAdapterVersion',
  ] as const) {
    if (movement[key] !== simulation[key]) {
      fail(
        'PROTOCOL_INVALID_FIELD_VALUE',
        `${path}.${key}`,
        'Local reconciliation identity does not match the snapshot simulation identity.',
      );
    }
  }
}

function validateReconciliationVector(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): void {
  const record = recordAt(value, path);
  exactKeys(record, path, ['x', 'y', 'z']);
  for (const axis of ['x', 'y', 'z'] as const) {
    numberAt(required(record, axis, path), `${path}.${axis}`, {
      integer: true,
      min: minimum,
      max: maximum,
    });
  }
}

function validateReconciliationIntent(value: unknown, path: string): void {
  const record = recordAt(value, path);
  exactKeys(record, path, [
    'moveX',
    'moveZ',
    'heldButtons',
    'pressedButtons',
    'releasedButtons',
    'selectedSlot',
  ]);
  for (const key of ['moveX', 'moveZ'] as const) {
    numberAt(required(record, key, path), `${path}.${key}`, {
      integer: true,
      min: -PROTOCOL_LIMITS.maxAxisMagnitude,
      max: PROTOCOL_LIMITS.maxAxisMagnitude,
    });
  }
  numberAt(required(record, 'heldButtons', path), `${path}.heldButtons`, {
    integer: true,
    min: 0,
    max: PROTOCOL_LIMITS.maxButtonBits,
  });
  numberAt(required(record, 'pressedButtons', path), `${path}.pressedButtons`, {
    integer: true,
    min: 0,
    max: PROTOCOL_LIMITS.maxButtonBits,
  });
  numberAt(required(record, 'releasedButtons', path), `${path}.releasedButtons`, {
    integer: true,
    min: 0,
    max: PROTOCOL_LIMITS.maxButtonBits,
  });
  // Reconciliation intent is an authority-tick aggregate, not one input
  // command. A short pulse can therefore be pressed and released while
  // multiple queued commands are consumed in the same simulation tick. The
  // final held mask records the terminal state; both edge masks record every
  // transition observed during that tick. Per-command validation above stays
  // strict so an individual command cannot contain contradictory edges.
  numberAt(required(record, 'selectedSlot', path), `${path}.selectedSlot`, {
    integer: true,
    min: 0,
    max: PROTOCOL_LIMITS.maxSelectedSlot,
  });
}

function validateReconciliationSupport(value: unknown, path: string): void {
  if (value === null) return;
  const record = recordAt(value, path);
  exactKeys(record, path, ['colliderId', 'layer', 'normalQ15', 'velocity']);
  idAt(required(record, 'colliderId', path), `${path}.colliderId`);
  stringAt(required(record, 'layer', path), `${path}.layer`, {
    allowed: [
      'world_static',
      'dynamic_platform',
      'player_body',
      'door',
      'spawn_barrier',
      'kill_volume',
      'forbidden_volume',
      'recovery_volume',
    ],
  });
  validateReconciliationVector(required(record, 'normalQ15', path), `${path}.normalQ15`, -32_767, 32_767);
  validateReconciliationVector(
    required(record, 'velocity', path),
    `${path}.velocity`,
    -PROTOCOL_LIMITS.maxVelocityMillimetersPerSecond,
    PROTOCOL_LIMITS.maxVelocityMillimetersPerSecond,
  );
}

function validateReconciliationVolumes(value: unknown, path: string): void {
  const volumes = arrayAt(
    value,
    path,
    PROTOCOL_LIMITS.maxActiveVolumesPerPlayer,
  );
  const colliderIds: string[] = [];
  for (const [index, volume] of volumes.entries()) {
    const volumePath = `${path}[${index}]`;
    const record = recordAt(volume, volumePath);
    exactKeys(record, volumePath, ['colliderId', 'kind']);
    colliderIds.push(idAt(required(record, 'colliderId', volumePath), `${volumePath}.colliderId`));
    stringAt(required(record, 'kind', volumePath), `${volumePath}.kind`, {
      allowed: ['kill', 'forbidden', 'recovery'],
    });
  }
  assertUnique(colliderIds, path);
}

function validateReconciliationPlayer(value: unknown, path: string): void {
  const record = recordAt(value, path);
  exactKeys(record, path, [
    'id',
    'feetPosition',
    'velocity',
    'integrationRemainders',
    'yawMilliDegrees',
    'pitchMilliDegrees',
    'lastProcessedSequence',
    'ticksSinceAcceptedCommand',
    'intent',
    'stance',
    'locomotion',
    'grounded',
    'support',
    'coyoteTicksRemaining',
    'jumpBufferTicksRemaining',
    'slideTicksRemaining',
    'slideCooldownTicksRemaining',
    'teleportCooldownTicksRemaining',
    'standBlocked',
    'activeVolumes',
  ]);
  idAt(required(record, 'id', path), `${path}.id`);
  validateReconciliationVector(
    required(record, 'feetPosition', path),
    `${path}.feetPosition`,
    -PROTOCOL_LIMITS.maxCoordinateMillimeters,
    PROTOCOL_LIMITS.maxCoordinateMillimeters,
  );
  validateReconciliationVector(
    required(record, 'velocity', path),
    `${path}.velocity`,
    -PROTOCOL_LIMITS.maxVelocityMillimetersPerSecond,
    PROTOCOL_LIMITS.maxVelocityMillimetersPerSecond,
  );

  const remaindersPath = `${path}.integrationRemainders`;
  const remainders = recordAt(required(record, 'integrationRemainders', path), remaindersPath);
  exactKeys(remainders, remaindersPath, [
    'positionX',
    'positionY',
    'positionZ',
    'planarAcceleration',
    'gravity',
  ]);
  for (const key of [
    'positionX',
    'positionY',
    'positionZ',
    'planarAcceleration',
    'gravity',
  ] as const) {
    numberAt(required(remainders, key, remaindersPath), `${remaindersPath}.${key}`, {
      integer: true,
      min: Number.MIN_SAFE_INTEGER,
      max: Number.MAX_SAFE_INTEGER,
    });
  }

  numberAt(required(record, 'yawMilliDegrees', path), `${path}.yawMilliDegrees`, {
    integer: true,
    min: 0,
    max: 359_999,
  });
  numberAt(required(record, 'pitchMilliDegrees', path), `${path}.pitchMilliDegrees`, {
    integer: true,
    min: -89_000,
    max: 89_000,
  });
  processedSequenceAt(required(record, 'lastProcessedSequence', path), `${path}.lastProcessedSequence`);
  numberAt(required(record, 'ticksSinceAcceptedCommand', path), `${path}.ticksSinceAcceptedCommand`, {
    integer: true,
    min: 0,
    max: 1_000_000,
  });
  validateReconciliationIntent(required(record, 'intent', path), `${path}.intent`);
  const stance = stringAt(required(record, 'stance', path), `${path}.stance`, {
    allowed: ['standing', 'crouched'],
  });
  const locomotion = stringAt(required(record, 'locomotion', path), `${path}.locomotion`, {
    allowed: ['grounded', 'airborne', 'sliding'],
  });
  const grounded = booleanAt(required(record, 'grounded', path), `${path}.grounded`);
  const support = required(record, 'support', path);
  validateReconciliationSupport(support, `${path}.support`);
  for (const key of [
    'coyoteTicksRemaining',
    'jumpBufferTicksRemaining',
    'slideTicksRemaining',
    'slideCooldownTicksRemaining',
    'teleportCooldownTicksRemaining',
  ] as const) {
    numberAt(required(record, key, path), `${path}.${key}`, {
      integer: true,
      min: 0,
      max: 1_000_000,
    });
  }
  const standBlocked = booleanAt(required(record, 'standBlocked', path), `${path}.standBlocked`);
  validateReconciliationVolumes(required(record, 'activeVolumes', path), `${path}.activeVolumes`);

  if (support !== null && !grounded) {
    fail('PROTOCOL_INVALID_FIELD_VALUE', `${path}.support`, 'Airborne reconciliation state cannot retain support.');
  }
  if ((grounded && locomotion === 'airborne') || (!grounded && locomotion !== 'airborne')) {
    fail('PROTOCOL_INVALID_FIELD_VALUE', `${path}.locomotion`, 'Grounded and locomotion fields contradict each other.');
  }
  if (locomotion === 'sliding' && stance !== 'crouched') {
    fail('PROTOCOL_INVALID_FIELD_VALUE', `${path}.stance`, 'Sliding reconciliation state must be crouched.');
  }
  if (locomotion === 'sliding' && record.slideTicksRemaining === 0) {
    fail('PROTOCOL_INVALID_FIELD_VALUE', `${path}.slideTicksRemaining`, 'Sliding reconciliation state requires remaining slide time.');
  }
  if (standBlocked && stance !== 'crouched') {
    fail('PROTOCOL_INVALID_FIELD_VALUE', `${path}.standBlocked`, 'Stand-blocked reconciliation state must be crouched.');
  }
}

function validateLocalReconciliation(
  value: unknown,
  path: string,
  expectedServerTick: number,
): LocalReconciliationStateV1 {
  const record = recordAt(value, path);
  exactKeys(record, path, ['schemaVersion', 'identity', 'simulationRateHz', 'tick', 'player']);
  if (required(record, 'schemaVersion', path) !== 1) {
    fail('PROTOCOL_INVALID_FIELD_VALUE', `${path}.schemaVersion`, 'Movement state schema version must be 1.');
  }
  validateMovementSimulationIdentity(required(record, 'identity', path), `${path}.identity`);
  if (required(record, 'simulationRateHz', path) !== 20) {
    fail('PROTOCOL_INVALID_FIELD_VALUE', `${path}.simulationRateHz`, 'Reconciliation state must use the 20 Hz authority rate.');
  }
  const tick = tickAt(required(record, 'tick', path), `${path}.tick`);
  if (tick !== expectedServerTick) {
    fail('PROTOCOL_INVALID_FIELD_VALUE', `${path}.tick`, 'Reconciliation tick must equal the enclosing server tick.');
  }
  validateReconciliationPlayer(required(record, 'player', path), `${path}.player`);
  return record as unknown as LocalReconciliationStateV1;
}

function validateWelcome(record: UnknownRecord): ServerMessage {
  exactKeys(record, '$', [
    'protocolVersion',
    'type',
    'connectionId',
    'serverTick',
    'protocolConfig',
    'simulationIdentity',
  ]);
  idAt(required(record, 'connectionId', '$'), '$.connectionId');
  tickAt(required(record, 'serverTick', '$'), '$.serverTick');
  validateProtocolConfig(required(record, 'protocolConfig', '$'), '$.protocolConfig');
  validateSimulationIdentity(required(record, 'simulationIdentity', '$'), '$.simulationIdentity');
  return record as unknown as ServerMessage;
}

function validateJoinAccepted(record: UnknownRecord): ServerMessage {
  exactKeys(record, '$', [
    'protocolVersion',
    'type',
    'requestId',
    'playerId',
    'roomId',
    'matchId',
    'serverTick',
    'connectionMode',
    'resumeToken',
    'simulationIdentity',
  ]);
  for (const key of ['requestId', 'playerId', 'roomId', 'matchId'] as const) {
    idAt(required(record, key, '$'), `$.${key}`);
  }
  tickAt(required(record, 'serverTick', '$'), '$.serverTick');
  stringAt(required(record, 'connectionMode', '$'), '$.connectionMode', {
    allowed: ['joined', 'resumed'],
  });
  resumeTokenAt(required(record, 'resumeToken', '$'), '$.resumeToken');
  validateSimulationIdentity(required(record, 'simulationIdentity', '$'), '$.simulationIdentity');
  return record as unknown as ServerMessage;
}

function validateJoinRejected(record: UnknownRecord): ServerMessage {
  exactKeys(record, '$', ['protocolVersion', 'type', 'requestId', 'code']);
  idAt(required(record, 'requestId', '$'), '$.requestId');
  stringAt(required(record, 'code', '$'), '$.code', {
    allowed: [
      'ROOM_NOT_FOUND',
      'ROOM_FULL',
      'MATCH_INCOMPATIBLE',
      'DISPLAY_NAME_REJECTED',
      'AUTH_REQUIRED',
      'DUPLICATE_SESSION',
      'RESUME_REJECTED',
    ],
    code: true,
  });
  return record as unknown as ServerMessage;
}

function validateEntity(value: unknown, path: string): SnapshotEntity {
  const record = recordAt(value, path);
  exactKeys(record, path, [
    'id', 'kind', 'xMillimeters', 'yMillimeters', 'zMillimeters',
    'velocityXMillimetersPerSecond', 'velocityYMillimetersPerSecond',
    'velocityZMillimetersPerSecond', 'yawMilliDegrees', 'pitchMilliDegrees',
    'healthPoints', 'shieldPoints', 'movement',
  ]);
  idAt(required(record, 'id', path), `${path}.id`);
  stringAt(required(record, 'kind', path), `${path}.kind`, { allowed: ['player', 'projectile', 'deployable', 'pickup'] });
  for (const key of ['xMillimeters', 'yMillimeters', 'zMillimeters'] as const) {
    numberAt(required(record, key, path), `${path}.${key}`, {
      integer: true,
      min: -PROTOCOL_LIMITS.maxCoordinateMillimeters,
      max: PROTOCOL_LIMITS.maxCoordinateMillimeters,
    });
  }
  for (const key of ['velocityXMillimetersPerSecond', 'velocityYMillimetersPerSecond', 'velocityZMillimetersPerSecond'] as const) {
    numberAt(required(record, key, path), `${path}.${key}`, {
      integer: true,
      min: -PROTOCOL_LIMITS.maxVelocityMillimetersPerSecond,
      max: PROTOCOL_LIMITS.maxVelocityMillimetersPerSecond,
    });
  }
  numberAt(required(record, 'yawMilliDegrees', path), `${path}.yawMilliDegrees`, { integer: true, min: -PROTOCOL_LIMITS.maxYawMilliDegrees, max: PROTOCOL_LIMITS.maxYawMilliDegrees });
  numberAt(required(record, 'pitchMilliDegrees', path), `${path}.pitchMilliDegrees`, { integer: true, min: -PROTOCOL_LIMITS.maxPitchMilliDegrees, max: PROTOCOL_LIMITS.maxPitchMilliDegrees });
  numberAt(required(record, 'healthPoints', path), `${path}.healthPoints`, { min: 0, max: PROTOCOL_LIMITS.maxHealthValue, nullable: true });
  numberAt(required(record, 'shieldPoints', path), `${path}.shieldPoints`, { min: 0, max: PROTOCOL_LIMITS.maxHealthValue, nullable: true });
  if (Object.hasOwn(record, 'movement')) {
    if (record.kind !== 'player') {
      fail(
        'PROTOCOL_INVALID_FIELD_VALUE',
        `${path}.movement`,
        'movement facts are valid only for player entities',
      );
    }
    const movement = recordAt(record.movement, `${path}.movement`);
    exactKeys(movement, `${path}.movement`, [
      'schemaVersion', 'grounded', 'stance', 'locomotion',
    ]);
    numberAt(
      required(movement, 'schemaVersion', `${path}.movement`),
      `${path}.movement.schemaVersion`,
      { integer: true, min: 1, max: 1 },
    );
    booleanAt(
      required(movement, 'grounded', `${path}.movement`),
      `${path}.movement.grounded`,
    );
    stringAt(
      required(movement, 'stance', `${path}.movement`),
      `${path}.movement.stance`,
      { allowed: ['standing', 'crouched'] },
    );
    stringAt(
      required(movement, 'locomotion', `${path}.movement`),
      `${path}.movement.locomotion`,
      { allowed: ['grounded', 'airborne', 'sliding'] },
    );
    if (movement.grounded === (movement.locomotion === 'airborne')) {
      fail(
        'PROTOCOL_INVALID_FIELD_VALUE',
        `${path}.movement`,
        'grounded and locomotion states disagree',
      );
    }
    if (movement.locomotion === 'sliding' && movement.stance !== 'crouched') {
      fail(
        'PROTOCOL_INVALID_FIELD_VALUE',
        `${path}.movement`,
        'sliding movement must use the crouched stance',
      );
    }
  }
  return record as unknown as SnapshotEntity;
}

function validateEntities(value: unknown, path: string): readonly SnapshotEntity[] {
  const entities = arrayAt(value, path, PROTOCOL_LIMITS.maxEntitiesPerSnapshot).map((entity, index) =>
    validateEntity(entity, `${path}[${index}]`),
  );
  assertUnique(entities.map((entity) => entity.id), path);
  return entities;
}

function nullableTickAt(value: unknown, path: string): number | null {
  return numberAt(value, path, {
    integer: true,
    min: 0,
    max: PROTOCOL_LIMITS.maxAuthorityTick,
    nullable: true,
  });
}

const COMBAT_WEAPON_PROFILE_BY_ID = Object.freeze({
  vertical_rifle_v1: Object.freeze({
    slot: 0, family: 'rifle', attackModel: 'hitscan', pellets: 1,
  }),
  kyx_sidearm_v1: Object.freeze({
    slot: 1, family: 'pistol', attackModel: 'hitscan', pellets: 1,
  }),
  kyx_scattergun_v1: Object.freeze({
    slot: 2,
    family: 'shotgun',
    attackModel: 'pellet_hitscan',
    pellets: 8,
  }),
  kyx_longshot_v1: Object.freeze({
    slot: 3, family: 'sniper', attackModel: 'hitscan', pellets: 1,
  }),
  kyx_breach_rocket_v1: Object.freeze({
    slot: 4,
    family: 'rocket',
    attackModel: 'projectile',
    pellets: 1,
  }),
  kyx_edge_v1: Object.freeze({
    slot: 5, family: 'melee', attackModel: 'melee_contact', pellets: 1,
  }),
} as const);

function validateCombatWeapon(
  value: unknown,
  path: string,
): Readonly<{ readonly weaponId: string; readonly slot: number }> {
  const record = recordAt(value, path);
  exactKeys(record, path, [
    'weaponId', 'slot', 'family', 'attackModel', 'phase', 'magazineRounds',
    'reserveRounds', 'readyAtTick', 'reloadCompletesAtTick', 'nextAttackAtTick',
    'acceptedAttackCount',
  ]);
  const weaponId = idAt(required(record, 'weaponId', path), `${path}.weaponId`);
  const profile = COMBAT_WEAPON_PROFILE_BY_ID[
    weaponId as keyof typeof COMBAT_WEAPON_PROFILE_BY_ID
  ];
  if (profile === undefined) {
    fail('PROTOCOL_INVALID_FIELD_VALUE', `${path}.weaponId`, 'Unsupported KYX weapon profile.');
  }
  const slot = numberAt(required(record, 'slot', path), `${path}.slot`, {
    integer: true,
    min: 0,
    max: PROTOCOL_LIMITS.maxSelectedSlot,
  });
  const family = stringAt(required(record, 'family', path), `${path}.family`, {
    allowed: ['rifle', 'pistol', 'shotgun', 'sniper', 'rocket', 'melee'],
  });
  const attackModel = stringAt(required(record, 'attackModel', path), `${path}.attackModel`, {
    allowed: ['hitscan', 'pellet_hitscan', 'projectile', 'melee_contact'],
  });
  if (
    slot !== profile.slot
    || family !== profile.family
    || attackModel !== profile.attackModel
  ) {
    fail(
      'PROTOCOL_INVALID_FIELD_VALUE',
      path,
      'Weapon slot, family, and attack model must match the authoritative profile.',
    );
  }
  stringAt(required(record, 'phase', path), `${path}.phase`, {
    allowed: ['holstered', 'equipping', 'ready', 'recovering', 'reloading', 'empty', 'dead'],
  });
  for (const key of ['magazineRounds', 'reserveRounds'] as const) {
    numberAt(required(record, key, path), `${path}.${key}`, {
      integer: true,
      min: 0,
      max: PROTOCOL_LIMITS.maxSequence,
      nullable: true,
    });
  }
  nullableTickAt(required(record, 'readyAtTick', path), `${path}.readyAtTick`);
  nullableTickAt(
    required(record, 'reloadCompletesAtTick', path),
    `${path}.reloadCompletesAtTick`,
  );
  tickAt(required(record, 'nextAttackAtTick', path), `${path}.nextAttackAtTick`);
  numberAt(required(record, 'acceptedAttackCount', path), `${path}.acceptedAttackCount`, {
    integer: true,
    min: 0,
    max: PROTOCOL_LIMITS.maxSequence,
  });
  return Object.freeze({ weaponId, slot });
}

function validateCombatPlayer(value: unknown, path: string): CombatSnapshotV1['players'][number] {
  const record = recordAt(value, path);
  const hasAbilityLoadout = Object.hasOwn(record, 'abilityLoadout');
  const armoryKeys = ['weaponCatalogId', 'selectedWeaponSlot', 'selectedWeaponId', 'weapons'];
  const presentArmoryKeys = armoryKeys.filter((key) => Object.hasOwn(record, key));
  if (presentArmoryKeys.length !== 0 && presentArmoryKeys.length !== armoryKeys.length) {
    fail(
      'PROTOCOL_REQUIRED_FIELD',
      path,
      'Combat armory projection must be omitted or supplied as one complete unit.',
    );
  }
  exactKeys(record, path, [
    'playerId', 'connected', 'teamId', 'lifePhase', 'healthPoints', 'shieldPoints',
    'deathOrdinal', 'respawnEligibleAtTick', 'riflePhase', 'magazineRounds',
    'reserveRounds', 'nextShotAtTick', 'reloadCompletesAtTick', 'acceptedShotCount',
    'grenadePhase', 'grenadeCooldownEndsAtTick', 'acceptedThrowCount',
    'activeProjectileCount',
    ...(presentArmoryKeys.length === 0 ? [] : armoryKeys),
    ...(hasAbilityLoadout ? ['abilityLoadout'] : []),
  ]);
  idAt(required(record, 'playerId', path), `${path}.playerId`);
  booleanAt(required(record, 'connected', path), `${path}.connected`);
  nullableIdAt(required(record, 'teamId', path), `${path}.teamId`);
  stringAt(required(record, 'lifePhase', path), `${path}.lifePhase`, {
    allowed: ['alive', 'dead'],
  });
  for (const key of ['healthPoints', 'shieldPoints'] as const) {
    numberAt(required(record, key, path), `${path}.${key}`, {
      integer: true,
      min: 0,
      max: PROTOCOL_LIMITS.maxHealthValue,
    });
  }
  for (const key of ['deathOrdinal', 'magazineRounds', 'reserveRounds', 'acceptedShotCount',
    'acceptedThrowCount', 'activeProjectileCount'] as const) {
    numberAt(required(record, key, path), `${path}.${key}`, {
      integer: true,
      min: 0,
      max: PROTOCOL_LIMITS.maxSequence,
    });
  }
  nullableTickAt(required(record, 'respawnEligibleAtTick', path), `${path}.respawnEligibleAtTick`);
  stringAt(required(record, 'riflePhase', path), `${path}.riflePhase`, {
    allowed: [
      'holstered', 'equipping', 'ready', 'firing', 'recovering', 'reloading',
      'sprinting', 'empty', 'dead',
    ],
  });
  tickAt(required(record, 'nextShotAtTick', path), `${path}.nextShotAtTick`);
  nullableTickAt(required(record, 'reloadCompletesAtTick', path), `${path}.reloadCompletesAtTick`);
  stringAt(required(record, 'grenadePhase', path), `${path}.grenadePhase`, {
    allowed: ['equipping', 'ready', 'cooldown', 'dead'],
  });
  tickAt(required(record, 'grenadeCooldownEndsAtTick', path), `${path}.grenadeCooldownEndsAtTick`);
  if (presentArmoryKeys.length !== 0) {
    stringAt(required(record, 'weaponCatalogId', path), `${path}.weaponCatalogId`, {
      allowed: ['kyx_authoritative_armory_v1'],
    });
    const selectedWeaponSlot = numberAt(
      required(record, 'selectedWeaponSlot', path),
      `${path}.selectedWeaponSlot`,
      {
      integer: true,
      min: 0,
      max: PROTOCOL_LIMITS.maxSelectedSlot,
      },
    );
    const selectedWeaponId = nullableIdAt(
      required(record, 'selectedWeaponId', path),
      `${path}.selectedWeaponId`,
    );
    const weapons = arrayAt(required(record, 'weapons', path), `${path}.weapons`, 8);
    if (weapons.length !== 6) {
      fail(
        'PROTOCOL_INVALID_FIELD_VALUE',
        `${path}.weapons`,
        'The KYX armory projection requires all six original weapon profiles.',
      );
    }
    const weaponIdentities = weapons.map((weapon, index) => validateCombatWeapon(
      weapon,
      `${path}.weapons[${index}]`,
    ));
    assertUnique(
      weaponIdentities.map(({ weaponId }) => weaponId),
      `${path}.weapons.weaponId`,
    );
    assertUnique(
      weaponIdentities.map(({ slot }) => String(slot)),
      `${path}.weapons.slot`,
    );
    const expectedSelectedWeaponId = weaponIdentities.find(
      ({ slot }) => slot === selectedWeaponSlot,
    )?.weaponId ?? null;
    if (selectedWeaponId !== expectedSelectedWeaponId) {
      fail(
        'PROTOCOL_INVALID_FIELD_VALUE',
        `${path}.selectedWeaponId`,
        'Selected weapon id must match the authoritative selected slot.',
      );
    }
  }
  if (hasAbilityLoadout) {
    const loadoutPath = `${path}.abilityLoadout`;
    const loadout = recordAt(required(record, 'abilityLoadout', path), loadoutPath);
    exactKeys(loadout, loadoutPath, [
      'slots', 'cooldownEndsAtTicks', 'currentCharges', 'maximumCharges',
      'acceptedActivationCounts', 'flashImpairedUntilTick',
    ]);
    const slots = arrayAt(required(loadout, 'slots', loadoutPath), `${loadoutPath}.slots`, 4);
    if (slots.length !== 4) {
      fail('PROTOCOL_INVALID_FIELD_VALUE', `${loadoutPath}.slots`, 'Ability loadout requires four slots.');
    }
    const abilityIds = slots.map((ability, index) => stringAt(
      ability,
      `${loadoutPath}.slots[${index}]`,
      {
        allowed: [
          'vertical_teleport_v1',
          'vertical_impulse_grenade_v1',
          'frag_grenade_v1',
          'smoke_grenade_v1',
          'sticky_grenade_v1',
          'flash_grenade_v1',
        ],
      },
    ) as string);
    if (abilityIds[0] !== 'vertical_teleport_v1') {
      fail('PROTOCOL_INVALID_FIELD_VALUE', `${loadoutPath}.slots[0]`, 'Blink must remain locked.');
    }
    assertUnique(abilityIds, `${loadoutPath}.slots`);
    for (const key of ['cooldownEndsAtTicks', 'acceptedActivationCounts'] as const) {
      const values = arrayAt(required(loadout, key, loadoutPath), `${loadoutPath}.${key}`, 3);
      if (values.length !== 3) {
        fail('PROTOCOL_INVALID_FIELD_VALUE', `${loadoutPath}.${key}`, 'Ability slot state requires three values.');
      }
      values.forEach((entry, index) => tickAt(entry, `${loadoutPath}.${key}[${index}]`));
    }
    const currentCharges = arrayAt(
      required(loadout, 'currentCharges', loadoutPath),
      `${loadoutPath}.currentCharges`,
      3,
    );
    const maximumCharges = arrayAt(
      required(loadout, 'maximumCharges', loadoutPath),
      `${loadoutPath}.maximumCharges`,
      3,
    );
    if (currentCharges.length !== 3 || maximumCharges.length !== 3) {
      fail('PROTOCOL_INVALID_FIELD_VALUE', loadoutPath, 'Ability charge state requires three values.');
    }
    currentCharges.forEach((entry, index) => {
      const current = numberAt(
        entry,
        `${loadoutPath}.currentCharges[${index}]`,
        { integer: true, min: 0, max: 2 },
      )!;
      const maximum = numberAt(
        maximumCharges[index],
        `${loadoutPath}.maximumCharges[${index}]`,
        { integer: true, min: 2, max: 2 },
      )!;
      if (current > maximum) {
        fail(
          'PROTOCOL_INVALID_FIELD_VALUE',
          `${loadoutPath}.currentCharges[${index}]`,
          'Ability charge count exceeds its maximum.',
        );
      }
    });
    tickAt(
      required(loadout, 'flashImpairedUntilTick', loadoutPath),
      `${loadoutPath}.flashImpairedUntilTick`,
    );
  }
  return record as unknown as CombatSnapshotV1['players'][number];
}

function validateCombatProjectile(
  value: unknown,
  path: string,
): CombatSnapshotV1['projectiles'][number] {
  const record = recordAt(value, path);
  exactKeys(record, path, [
    'projectileId', 'ownerPlayerId', 'ownerTeamId', 'phase', 'spawnTick',
    'lifetimeEndsAtTick', 'fuseStartedAtTick', 'detonatesAtTick', 'xMillimeters',
    'yMillimeters', 'zMillimeters', 'velocityXMillimetersPerSecond',
    'velocityYMillimetersPerSecond', 'velocityZMillimetersPerSecond',
    'bounceCount', 'settled',
  ]);
  idAt(required(record, 'projectileId', path), `${path}.projectileId`);
  idAt(required(record, 'ownerPlayerId', path), `${path}.ownerPlayerId`);
  nullableIdAt(required(record, 'ownerTeamId', path), `${path}.ownerTeamId`);
  stringAt(required(record, 'phase', path), `${path}.phase`, {
    allowed: ['active', 'detonated'],
  });
  for (const key of ['spawnTick', 'lifetimeEndsAtTick'] as const) {
    tickAt(required(record, key, path), `${path}.${key}`);
  }
  nullableTickAt(required(record, 'fuseStartedAtTick', path), `${path}.fuseStartedAtTick`);
  nullableTickAt(required(record, 'detonatesAtTick', path), `${path}.detonatesAtTick`);
  for (const key of ['xMillimeters', 'yMillimeters', 'zMillimeters'] as const) {
    numberAt(required(record, key, path), `${path}.${key}`, {
      integer: true,
      min: -PROTOCOL_LIMITS.maxCoordinateMillimeters,
      max: PROTOCOL_LIMITS.maxCoordinateMillimeters,
    });
  }
  for (const key of ['velocityXMillimetersPerSecond', 'velocityYMillimetersPerSecond',
    'velocityZMillimetersPerSecond'] as const) {
    numberAt(required(record, key, path), `${path}.${key}`, {
      integer: true,
      min: -PROTOCOL_LIMITS.maxVelocityMillimetersPerSecond,
      max: PROTOCOL_LIMITS.maxVelocityMillimetersPerSecond,
    });
  }
  numberAt(required(record, 'bounceCount', path), `${path}.bounceCount`, {
    integer: true,
    min: 0,
    max: PROTOCOL_LIMITS.maxSequence,
  });
  booleanAt(required(record, 'settled', path), `${path}.settled`);
  return record as unknown as CombatSnapshotV1['projectiles'][number];
}

function validateCombatWeaponProjectile(value: unknown, path: string): void {
  const record = recordAt(value, path);
  exactKeys(record, path, [
    'projectileId', 'ownerPlayerId', 'ownerTeamId', 'weaponId', 'phase', 'spawnTick',
    'expiresAtTick', 'xMillimeters', 'yMillimeters', 'zMillimeters',
    'velocityXMillimetersPerSecond', 'velocityYMillimetersPerSecond',
    'velocityZMillimetersPerSecond', 'radiusMillimeters', 'splashRadiusMillimeters',
  ]);
  idAt(required(record, 'projectileId', path), `${path}.projectileId`);
  idAt(required(record, 'ownerPlayerId', path), `${path}.ownerPlayerId`);
  nullableIdAt(required(record, 'ownerTeamId', path), `${path}.ownerTeamId`);
  stringAt(required(record, 'weaponId', path), `${path}.weaponId`, {
    allowed: ['kyx_breach_rocket_v1'],
  });
  stringAt(required(record, 'phase', path), `${path}.phase`, {
    allowed: ['active', 'detonated', 'expired'],
  });
  tickAt(required(record, 'spawnTick', path), `${path}.spawnTick`);
  tickAt(required(record, 'expiresAtTick', path), `${path}.expiresAtTick`);
  for (const key of ['xMillimeters', 'yMillimeters', 'zMillimeters'] as const) {
    numberAt(required(record, key, path), `${path}.${key}`, {
      integer: true,
      min: -PROTOCOL_LIMITS.maxCoordinateMillimeters,
      max: PROTOCOL_LIMITS.maxCoordinateMillimeters,
    });
  }
  for (const key of [
    'velocityXMillimetersPerSecond',
    'velocityYMillimetersPerSecond',
    'velocityZMillimetersPerSecond',
  ] as const) {
    numberAt(required(record, key, path), `${path}.${key}`, {
      integer: true,
      min: -PROTOCOL_LIMITS.maxVelocityMillimetersPerSecond,
      max: PROTOCOL_LIMITS.maxVelocityMillimetersPerSecond,
    });
  }
  for (const key of ['radiusMillimeters', 'splashRadiusMillimeters'] as const) {
    numberAt(required(record, key, path), `${path}.${key}`, {
      integer: true,
      min: 1,
      max: PROTOCOL_LIMITS.maxCoordinateMillimeters,
    });
  }
}

function validateCombatAbilityProjectile(value: unknown, path: string): void {
  const record = recordAt(value, path);
  exactKeys(record, path, [
    'projectileId', 'ownerPlayerId', 'ownerTeamId', 'abilityId', 'spawnTick',
    'lifetimeEndsAtTick', 'detonatesAtTick', 'xMillimeters', 'yMillimeters',
    'zMillimeters', 'velocityXMillimetersPerSecond', 'velocityYMillimetersPerSecond',
    'velocityZMillimetersPerSecond', 'bounceCount', 'settled', 'attachedPlayerId',
  ]);
  idAt(required(record, 'projectileId', path), `${path}.projectileId`);
  idAt(required(record, 'ownerPlayerId', path), `${path}.ownerPlayerId`);
  nullableIdAt(required(record, 'ownerTeamId', path), `${path}.ownerTeamId`);
  stringAt(required(record, 'abilityId', path), `${path}.abilityId`, {
    allowed: [
      'frag_grenade_v1', 'smoke_grenade_v1', 'sticky_grenade_v1', 'flash_grenade_v1',
    ],
  });
  tickAt(required(record, 'spawnTick', path), `${path}.spawnTick`);
  tickAt(required(record, 'lifetimeEndsAtTick', path), `${path}.lifetimeEndsAtTick`);
  nullableTickAt(required(record, 'detonatesAtTick', path), `${path}.detonatesAtTick`);
  for (const key of ['xMillimeters', 'yMillimeters', 'zMillimeters'] as const) {
    numberAt(required(record, key, path), `${path}.${key}`, {
      integer: true,
      min: -PROTOCOL_LIMITS.maxCoordinateMillimeters,
      max: PROTOCOL_LIMITS.maxCoordinateMillimeters,
    });
  }
  for (const key of [
    'velocityXMillimetersPerSecond',
    'velocityYMillimetersPerSecond',
    'velocityZMillimetersPerSecond',
  ] as const) {
    numberAt(required(record, key, path), `${path}.${key}`, {
      integer: true,
      min: -PROTOCOL_LIMITS.maxVelocityMillimetersPerSecond,
      max: PROTOCOL_LIMITS.maxVelocityMillimetersPerSecond,
    });
  }
  numberAt(required(record, 'bounceCount', path), `${path}.bounceCount`, {
    integer: true,
    min: 0,
    max: PROTOCOL_LIMITS.maxSequence,
  });
  booleanAt(required(record, 'settled', path), `${path}.settled`);
  nullableIdAt(required(record, 'attachedPlayerId', path), `${path}.attachedPlayerId`);
}

function validateCombatSmokeField(value: unknown, path: string): void {
  const record = recordAt(value, path);
  exactKeys(record, path, [
    'fieldId', 'ownerPlayerId', 'ownerTeamId', 'spawnedAtTick', 'expiresAtTick',
    'xMillimeters', 'yMillimeters', 'zMillimeters', 'radiusMillimeters',
  ]);
  idAt(required(record, 'fieldId', path), `${path}.fieldId`);
  idAt(required(record, 'ownerPlayerId', path), `${path}.ownerPlayerId`);
  nullableIdAt(required(record, 'ownerTeamId', path), `${path}.ownerTeamId`);
  tickAt(required(record, 'spawnedAtTick', path), `${path}.spawnedAtTick`);
  tickAt(required(record, 'expiresAtTick', path), `${path}.expiresAtTick`);
  for (const key of ['xMillimeters', 'yMillimeters', 'zMillimeters'] as const) {
    numberAt(required(record, key, path), `${path}.${key}`, {
      integer: true,
      min: -PROTOCOL_LIMITS.maxCoordinateMillimeters,
      max: PROTOCOL_LIMITS.maxCoordinateMillimeters,
    });
  }
  numberAt(required(record, 'radiusMillimeters', path), `${path}.radiusMillimeters`, {
    integer: true,
    min: 1,
    max: PROTOCOL_LIMITS.maxCoordinateMillimeters,
  });
}

function validateCombatSnapshot(value: unknown, path: string): CombatSnapshotV1 {
  const record = recordAt(value, path);
  exactKeys(record, path, [
    'schemaVersion', 'players', 'projectiles', 'match',
    ...(Object.hasOwn(record, 'weaponProjectiles') ? ['weaponProjectiles'] : []),
    ...(Object.hasOwn(record, 'abilityProjectiles') ? ['abilityProjectiles'] : []),
    ...(Object.hasOwn(record, 'smokeFields') ? ['smokeFields'] : []),
  ]);
  if (required(record, 'schemaVersion', path) !== 1) {
    fail('PROTOCOL_INVALID_FIELD_VALUE', `${path}.schemaVersion`, 'Unsupported combat snapshot version.');
  }
  const players = arrayAt(
    required(record, 'players', path),
    `${path}.players`,
    PROTOCOL_LIMITS.maxEntitiesPerSnapshot,
  ).map((player, index) => validateCombatPlayer(player, `${path}.players[${index}]`));
  assertUnique(players.map(({ playerId }) => playerId), `${path}.players`);
  const projectiles = arrayAt(
    required(record, 'projectiles', path),
    `${path}.projectiles`,
    PROTOCOL_LIMITS.maxEntitiesPerSnapshot,
  ).map((projectile, index) => (
    validateCombatProjectile(projectile, `${path}.projectiles[${index}]`)
  ));
  assertUnique(projectiles.map(({ projectileId }) => projectileId), `${path}.projectiles`);
  if (Object.hasOwn(record, 'weaponProjectiles')) {
    const weaponProjectiles = arrayAt(
      required(record, 'weaponProjectiles', path),
      `${path}.weaponProjectiles`,
      PROTOCOL_LIMITS.maxEntitiesPerSnapshot,
    );
    weaponProjectiles.forEach((projectile, index) => validateCombatWeaponProjectile(
      projectile,
      `${path}.weaponProjectiles[${index}]`,
    ));
    assertUnique(
      weaponProjectiles.map((projectile, index) => (
        idAt(
          required(
            recordAt(projectile, `${path}.weaponProjectiles[${index}]`),
            'projectileId',
            `${path}.weaponProjectiles[${index}]`,
          ),
          `${path}.weaponProjectiles[${index}].projectileId`,
        )
      )),
      `${path}.weaponProjectiles`,
    );
  }
  if (Object.hasOwn(record, 'abilityProjectiles')) {
    const abilityProjectiles = arrayAt(
      required(record, 'abilityProjectiles', path),
      `${path}.abilityProjectiles`,
      PROTOCOL_LIMITS.maxEntitiesPerSnapshot,
    );
    abilityProjectiles.forEach((projectile, index) => validateCombatAbilityProjectile(
      projectile,
      `${path}.abilityProjectiles[${index}]`,
    ));
    assertUnique(
      abilityProjectiles.map((projectile, index) => idAt(
        required(
          recordAt(projectile, `${path}.abilityProjectiles[${index}]`),
          'projectileId',
          `${path}.abilityProjectiles[${index}]`,
        ),
        `${path}.abilityProjectiles[${index}].projectileId`,
      )),
      `${path}.abilityProjectiles`,
    );
  }
  if (Object.hasOwn(record, 'smokeFields')) {
    const smokeFields = arrayAt(
      required(record, 'smokeFields', path),
      `${path}.smokeFields`,
      PROTOCOL_LIMITS.maxEntitiesPerSnapshot,
    );
    smokeFields.forEach((field, index) => validateCombatSmokeField(
      field,
      `${path}.smokeFields[${index}]`,
    ));
    assertUnique(
      smokeFields.map((field, index) => idAt(
        required(
          recordAt(field, `${path}.smokeFields[${index}]`),
          'fieldId',
          `${path}.smokeFields[${index}]`,
        ),
        `${path}.smokeFields[${index}].fieldId`,
      )),
      `${path}.smokeFields`,
    );
  }

  const matchPath = `${path}.match`;
  const match = recordAt(required(record, 'match', path), matchPath);
  exactKeys(match, matchPath, [
    'phase', 'phaseEndsAtTick', 'activeTicksRemaining', 'teamScores',
    'feedSequence', 'result',
  ]);
  stringAt(required(match, 'phase', matchPath), `${matchPath}.phase`, {
    allowed: ['lobby', 'warmup', 'active', 'postmatch', 'completed'],
  });
  nullableTickAt(required(match, 'phaseEndsAtTick', matchPath), `${matchPath}.phaseEndsAtTick`);
  tickAt(required(match, 'activeTicksRemaining', matchPath), `${matchPath}.activeTicksRemaining`);
  const teamScores = arrayAt(required(match, 'teamScores', matchPath), `${matchPath}.teamScores`, 64)
    .map((value, index) => {
      const scorePath = `${matchPath}.teamScores[${index}]`;
      const score = recordAt(value, scorePath);
      exactKeys(score, scorePath, ['teamId', 'score']);
      idAt(required(score, 'teamId', scorePath), `${scorePath}.teamId`);
      numberAt(required(score, 'score', scorePath), `${scorePath}.score`, {
        integer: true,
        min: 0,
        max: PROTOCOL_LIMITS.maxSequence,
      });
      return score as unknown as CombatSnapshotV1['match']['teamScores'][number];
    });
  assertUnique(teamScores.map(({ teamId }) => teamId), `${matchPath}.teamScores`);
  numberAt(required(match, 'feedSequence', matchPath), `${matchPath}.feedSequence`, {
    integer: true,
    min: 0,
    max: PROTOCOL_LIMITS.maxSequence,
  });
  const resultValue = required(match, 'result', matchPath);
  if (resultValue !== null) {
    const resultPath = `${matchPath}.result`;
    const result = recordAt(resultValue, resultPath);
    exactKeys(result, resultPath, ['reason', 'winningTeamId', 'draw']);
    stringAt(required(result, 'reason', resultPath), `${resultPath}.reason`, {
      allowed: ['score_limit', 'time_limit'],
    });
    nullableIdAt(required(result, 'winningTeamId', resultPath), `${resultPath}.winningTeamId`);
    booleanAt(required(result, 'draw', resultPath), `${resultPath}.draw`);
  }
  return record as unknown as CombatSnapshotV1;
}

function assertLocalEntityProjection(
  entities: readonly SnapshotEntity[],
  local: LocalReconciliationStateV1,
  path: string,
  requiredProjection: boolean,
): void {
  const player = local.player;
  const entityIndex = entities.findIndex(({ id }) => id === player.id);
  if (entityIndex < 0) {
    if (requiredProjection) {
      fail('PROTOCOL_REQUIRED_FIELD', path, 'Full snapshot must include the local player entity projection.');
    }
    return;
  }
  const entity = entities[entityIndex];
  const entityPath = `${path}[${entityIndex}]`;
  if (entity.kind !== 'player') {
    fail('PROTOCOL_INVALID_FIELD_VALUE', `${entityPath}.kind`, 'Local reconciliation ID must project as a player entity.');
  }

  const expectedYaw = player.yawMilliDegrees > 180_000
    ? player.yawMilliDegrees - 360_000
    : player.yawMilliDegrees;
  const expectations = [
    ['xMillimeters', player.feetPosition.x],
    ['yMillimeters', player.feetPosition.y],
    ['zMillimeters', player.feetPosition.z],
    ['velocityXMillimetersPerSecond', player.velocity.x],
    ['velocityYMillimetersPerSecond', player.velocity.y],
    ['velocityZMillimetersPerSecond', player.velocity.z],
    ['yawMilliDegrees', expectedYaw],
    ['pitchMilliDegrees', player.pitchMilliDegrees],
  ] as const;
  for (const [key, expected] of expectations) {
    if (entity[key] !== expected) {
      fail(
        'PROTOCOL_INVALID_FIELD_VALUE',
        `${entityPath}.${key}`,
        'Local entity projection contradicts the canonical reconciliation state.',
      );
    }
  }
}

function validatePhase(value: unknown, path: string): void {
  stringAt(value, path, { allowed: ['lobby', 'warmup', 'active', 'postmatch'] });
}

function validateFullSnapshot(record: UnknownRecord): ServerMessage {
  exactKeys(record, '$', [
    'protocolVersion',
    'type',
    'snapshotBaselineVersion',
    'snapshotBaselineId',
    'reliableEventStreamVersion',
    'reliableEventBaselineId',
    'resyncRequestId',
    'matchId',
    'serverTick',
    'phase',
    'phaseEndsAtTick',
    'simulationIdentity',
    'localReconciliation',
    'entities',
    'combat',
  ]);
  if (required(record, 'snapshotBaselineVersion', '$') !== 1) {
    fail('PROTOCOL_INVALID_FIELD_VALUE', '$.snapshotBaselineVersion', 'Unsupported snapshot baseline version.');
  }
  idAt(required(record, 'snapshotBaselineId', '$'), '$.snapshotBaselineId');
  if (required(record, 'reliableEventStreamVersion', '$') !== 1) {
    fail('PROTOCOL_INVALID_FIELD_VALUE', '$.reliableEventStreamVersion', 'Unsupported reliable-event stream version.');
  }
  reliableEventIdAt(
    required(record, 'reliableEventBaselineId', '$'),
    '$.reliableEventBaselineId',
    true,
  );
  if (Object.hasOwn(record, 'resyncRequestId')) {
    idAt(record.resyncRequestId, '$.resyncRequestId');
  }
  idAt(required(record, 'matchId', '$'), '$.matchId');
  const serverTick = tickAt(required(record, 'serverTick', '$'), '$.serverTick');
  validatePhase(required(record, 'phase', '$'), '$.phase');
  tickAt(required(record, 'phaseEndsAtTick', '$'), '$.phaseEndsAtTick');
  const simulationIdentity = validateSimulationIdentity(
    required(record, 'simulationIdentity', '$'),
    '$.simulationIdentity',
  );
  const local = validateLocalReconciliation(
    required(record, 'localReconciliation', '$'),
    '$.localReconciliation',
    serverTick,
  );
  assertMovementIdentityMatchesSimulation(
    local.identity,
    simulationIdentity,
    '$.localReconciliation.identity',
  );
  const entities = validateEntities(required(record, 'entities', '$'), '$.entities');
  assertLocalEntityProjection(entities, local, '$.entities', true);
  if (Object.hasOwn(record, 'combat')) validateCombatSnapshot(record.combat, '$.combat');
  return record as unknown as ServerMessage;
}

function validateDeltaSnapshot(record: UnknownRecord): ServerMessage {
  exactKeys(record, '$', [
    'protocolVersion',
    'type',
    'snapshotBaselineVersion',
    'baseSnapshotBaselineId',
    'snapshotBaselineId',
    'matchId',
    'baseTick',
    'serverTick',
    'phase',
    'phaseEndsAtTick',
    'localReconciliation',
    'entities',
    'removedEntityIds',
    'combat',
  ]);
  if (required(record, 'snapshotBaselineVersion', '$') !== 1) {
    fail('PROTOCOL_INVALID_FIELD_VALUE', '$.snapshotBaselineVersion', 'Unsupported snapshot baseline version.');
  }
  idAt(required(record, 'baseSnapshotBaselineId', '$'), '$.baseSnapshotBaselineId');
  idAt(required(record, 'snapshotBaselineId', '$'), '$.snapshotBaselineId');
  idAt(required(record, 'matchId', '$'), '$.matchId');
  const baseTick = tickAt(required(record, 'baseTick', '$'), '$.baseTick');
  const serverTick = tickAt(required(record, 'serverTick', '$'), '$.serverTick');
  if (baseTick >= serverTick) {
    fail('PROTOCOL_INVALID_FIELD_VALUE', '$.baseTick', 'Delta base tick must precede server tick.');
  }
  validatePhase(required(record, 'phase', '$'), '$.phase');
  tickAt(required(record, 'phaseEndsAtTick', '$'), '$.phaseEndsAtTick');
  const local = validateLocalReconciliation(
    required(record, 'localReconciliation', '$'),
    '$.localReconciliation',
    serverTick,
  );
  const entities = validateEntities(required(record, 'entities', '$'), '$.entities');
  const removed = validateStringIds(required(record, 'removedEntityIds', '$'), '$.removedEntityIds', PROTOCOL_LIMITS.maxRemovedEntitiesPerDelta);
  assertUnique(removed, '$.removedEntityIds');
  const updatedIds = new Set(entities.map((entity) => entity.id));
  if (removed.some((id) => updatedIds.has(id))) {
    fail('PROTOCOL_DUPLICATE_ID', '$.removedEntityIds', 'A delta cannot update and remove the same entity.');
  }
  if (removed.includes(local.player.id)) {
    fail('PROTOCOL_INVALID_FIELD_VALUE', '$.removedEntityIds', 'A delta cannot remove its local reconciliation player.');
  }
  assertLocalEntityProjection(entities, local, '$.entities', false);
  if (Object.hasOwn(record, 'combat')) validateCombatSnapshot(record.combat, '$.combat');
  return record as unknown as ServerMessage;
}

function validatePresentationVector(value: unknown, path: string): void {
  const record = recordAt(value, path);
  exactKeys(record, path, ['x', 'y', 'z']);
  for (const axis of ['x', 'y', 'z'] as const) {
    numberAt(required(record, axis, path), `${path}.${axis}`, {
      integer: true,
      min: -PROTOCOL_LIMITS.maxCoordinateMillimeters,
      max: PROTOCOL_LIMITS.maxCoordinateMillimeters,
    });
  }
}

function validatePresentationVelocity(value: unknown, path: string): void {
  const record = recordAt(value, path);
  exactKeys(record, path, ['x', 'y', 'z']);
  for (const axis of ['x', 'y', 'z'] as const) {
    numberAt(required(record, axis, path), `${path}.${axis}`, {
      integer: true,
      min: -PROTOCOL_LIMITS.maxVelocityMillimetersPerSecond,
      max: PROTOCOL_LIMITS.maxVelocityMillimetersPerSecond,
    });
  }
}

function validateCombatPresentationReliableEvent(
  value: unknown,
  path: string,
): CombatPresentationReliableEventV1 {
  const record = recordAt(value, path);
  const kind = stringAt(required(record, 'kind', path), `${path}.kind`, {
    allowed: [
      'damage_applied',
      'weapon_attack_accepted',
      'weapon_projectile_spawned',
      'weapon_projectile_detonated',
      'weapon_melee_contact',
      'impulse_grenade_throw_accepted',
      'impulse_grenade_collision',
      'impulse_grenade_detonated',
      'impulse_grenade_impulse_applied',
      'throwable_ability_event',
      'teleport_resource_confirmed',
      'teleport_resource_rejected',
      'world_portal_traversed',
    ],
  });
  if (kind === 'damage_applied') {
    exactKeys(record, path, [
      'schemaVersion', 'kind', 'eventId', 'eventSequence', 'authorityTick', 'causeId',
      'sourcePlayerId', 'targetPlayerId', 'shieldDamagePoints', 'healthDamagePoints',
      'shieldPointsAfter', 'healthPointsAfter', 'hitRegion',
    ]);
    numberAt(required(record, 'schemaVersion', path), `${path}.schemaVersion`, {
      integer: true, min: 1, max: 1,
    });
    idAt(required(record, 'eventId', path), `${path}.eventId`);
    numberAt(required(record, 'eventSequence', path), `${path}.eventSequence`, {
      integer: true, min: 0, max: PROTOCOL_LIMITS.maxSequence,
    });
    tickAt(required(record, 'authorityTick', path), `${path}.authorityTick`);
    idAt(required(record, 'causeId', path), `${path}.causeId`);
    nullableIdAt(required(record, 'sourcePlayerId', path), `${path}.sourcePlayerId`);
    idAt(required(record, 'targetPlayerId', path), `${path}.targetPlayerId`);
    for (const field of [
      'shieldDamagePoints', 'healthDamagePoints', 'shieldPointsAfter', 'healthPointsAfter',
    ] as const) {
      numberAt(required(record, field, path), `${path}.${field}`, {
        integer: true, min: 0, max: PROTOCOL_LIMITS.maxHealthValue,
      });
    }
    if (
      record.hitRegion !== undefined
      && record.hitRegion !== null
      && record.hitRegion !== 'head'
      && record.hitRegion !== 'torso'
      && record.hitRegion !== 'limb'
    ) {
      fail(
        'PROTOCOL_INVALID_FIELD_VALUE',
        `${path}.hitRegion`,
        'Damage hit region must be head, torso, limb, null, or omitted for legacy events.',
      );
    }
    return record as unknown as CombatPresentationReliableEventV1;
  }
  if (kind === 'weapon_attack_accepted') {
    exactKeys(record, path, [
      'schemaVersion', 'kind', 'eventId', 'authorityTick', 'playerId', 'weaponId',
      'family', 'attackModel', 'attackOrdinal', 'referenceDamagePoints',
      'magazineRoundsAfter', 'reserveRoundsAfter', 'nextAttackAtTick', 'ballistics',
    ]);
    numberAt(required(record, 'schemaVersion', path), `${path}.schemaVersion`, {
      integer: true, min: 1, max: 1,
    });
    idAt(required(record, 'eventId', path), `${path}.eventId`);
    tickAt(required(record, 'authorityTick', path), `${path}.authorityTick`);
    idAt(required(record, 'playerId', path), `${path}.playerId`);
    const weaponId = stringAt(required(record, 'weaponId', path), `${path}.weaponId`, {
      allowed: [
        'vertical_rifle_v1', 'kyx_sidearm_v1', 'kyx_scattergun_v1', 'kyx_longshot_v1',
        'kyx_breach_rocket_v1', 'kyx_edge_v1',
      ],
    });
    const family = stringAt(required(record, 'family', path), `${path}.family`, {
      allowed: ['rifle', 'pistol', 'shotgun', 'sniper', 'rocket', 'melee'],
    });
    const attackModel = stringAt(required(record, 'attackModel', path), `${path}.attackModel`, {
      allowed: ['hitscan', 'pellet_hitscan', 'projectile', 'melee_contact'],
    });
    const weaponProfile = COMBAT_WEAPON_PROFILE_BY_ID[
      weaponId as keyof typeof COMBAT_WEAPON_PROFILE_BY_ID
    ];
    if (
      weaponProfile === undefined
      || family !== weaponProfile.family
      || attackModel !== weaponProfile.attackModel
    ) {
      fail(
        'PROTOCOL_INVALID_FIELD_VALUE',
        path,
        'Accepted weapon attack must match its authoritative profile.',
      );
    }
    for (const field of ['attackOrdinal', 'referenceDamagePoints'] as const) {
      numberAt(required(record, field, path), `${path}.${field}`, {
        integer: true, min: 1, max: PROTOCOL_LIMITS.maxSequence,
      });
    }
    for (const field of ['magazineRoundsAfter', 'reserveRoundsAfter'] as const) {
      numberAt(required(record, field, path), `${path}.${field}`, {
        integer: true, min: 0, max: PROTOCOL_LIMITS.maxSequence, nullable: true,
      });
    }
    tickAt(required(record, 'nextAttackAtTick', path), `${path}.nextAttackAtTick`);
    const ballistics = arrayAt(required(record, 'ballistics', path), `${path}.ballistics`, 8);
    if (ballistics.length !== weaponProfile.pellets) {
      fail(
        'PROTOCOL_INVALID_FIELD_VALUE',
        `${path}.ballistics`,
        'Accepted weapon attack ballistics count does not match its authoritative profile.',
      );
    }
    const pelletIndexes = ballistics.map((sampleValue, index) => {
      const samplePath = `${path}.ballistics[${index}]`;
      const sample = recordAt(sampleValue, samplePath);
      exactKeys(sample, samplePath, [
        'pelletIndex', 'spreadRadiusMilliDegrees', 'spreadPitchMilliDegrees',
        'spreadYawMilliDegrees',
      ]);
      const pelletIndex = numberAt(
        required(sample, 'pelletIndex', samplePath),
        `${samplePath}.pelletIndex`,
        {
        integer: true, min: 0, max: 7,
        },
      );
      numberAt(
        required(sample, 'spreadRadiusMilliDegrees', samplePath),
        `${samplePath}.spreadRadiusMilliDegrees`,
        { integer: true, min: 0, max: 180_000 },
      );
      for (const field of ['spreadPitchMilliDegrees', 'spreadYawMilliDegrees'] as const) {
        numberAt(required(sample, field, samplePath), `${samplePath}.${field}`, {
          integer: true, min: -180_000, max: 180_000,
        });
      }
      return String(pelletIndex);
    });
    assertUnique(pelletIndexes, `${path}.ballistics.pelletIndex`);
    return record as unknown as CombatPresentationReliableEventV1;
  }
  if (kind === 'weapon_projectile_spawned') {
    exactKeys(record, path, [
      'schemaVersion', 'kind', 'eventId', 'authorityTick', 'projectileId',
      'ownerPlayerId', 'ownerTeamId', 'weaponId', 'spawnTick', 'expiresAtTick',
      'positionMillimeters', 'velocityMillimetersPerSecond', 'radiusMillimeters',
      'splashRadiusMillimeters',
    ]);
    numberAt(required(record, 'schemaVersion', path), `${path}.schemaVersion`, {
      integer: true, min: 1, max: 1,
    });
    idAt(required(record, 'eventId', path), `${path}.eventId`);
    tickAt(required(record, 'authorityTick', path), `${path}.authorityTick`);
    idAt(required(record, 'projectileId', path), `${path}.projectileId`);
    idAt(required(record, 'ownerPlayerId', path), `${path}.ownerPlayerId`);
    nullableIdAt(required(record, 'ownerTeamId', path), `${path}.ownerTeamId`);
    stringAt(required(record, 'weaponId', path), `${path}.weaponId`, {
      allowed: ['kyx_breach_rocket_v1'],
    });
    tickAt(required(record, 'spawnTick', path), `${path}.spawnTick`);
    tickAt(required(record, 'expiresAtTick', path), `${path}.expiresAtTick`);
    validatePresentationVector(
      required(record, 'positionMillimeters', path),
      `${path}.positionMillimeters`,
    );
    validatePresentationVelocity(
      required(record, 'velocityMillimetersPerSecond', path),
      `${path}.velocityMillimetersPerSecond`,
    );
    for (const field of ['radiusMillimeters', 'splashRadiusMillimeters'] as const) {
      numberAt(required(record, field, path), `${path}.${field}`, {
        integer: true, min: 1, max: PROTOCOL_LIMITS.maxCoordinateMillimeters,
      });
    }
    return record as unknown as CombatPresentationReliableEventV1;
  }
  if (kind === 'weapon_projectile_detonated') {
    exactKeys(record, path, [
      'schemaVersion', 'kind', 'eventId', 'authorityTick', 'projectileId',
      'ownerPlayerId', 'ownerTeamId', 'weaponId', 'positionMillimeters',
      'referenceDamagePoints', 'splashRadiusMillimeters', 'colliderId', 'reason',
    ]);
    numberAt(required(record, 'schemaVersion', path), `${path}.schemaVersion`, {
      integer: true, min: 1, max: 1,
    });
    idAt(required(record, 'eventId', path), `${path}.eventId`);
    tickAt(required(record, 'authorityTick', path), `${path}.authorityTick`);
    idAt(required(record, 'projectileId', path), `${path}.projectileId`);
    idAt(required(record, 'ownerPlayerId', path), `${path}.ownerPlayerId`);
    nullableIdAt(required(record, 'ownerTeamId', path), `${path}.ownerTeamId`);
    stringAt(required(record, 'weaponId', path), `${path}.weaponId`, {
      allowed: ['kyx_breach_rocket_v1'],
    });
    validatePresentationVector(
      required(record, 'positionMillimeters', path),
      `${path}.positionMillimeters`,
    );
    for (const field of ['referenceDamagePoints', 'splashRadiusMillimeters'] as const) {
      numberAt(required(record, field, path), `${path}.${field}`, {
        integer: true, min: 1, max: PROTOCOL_LIMITS.maxCoordinateMillimeters,
      });
    }
    nullableIdAt(required(record, 'colliderId', path), `${path}.colliderId`);
    stringAt(required(record, 'reason', path), `${path}.reason`, {
      allowed: ['collision', 'lifetime'],
    });
    return record as unknown as CombatPresentationReliableEventV1;
  }
  if (kind === 'weapon_melee_contact') {
    exactKeys(record, path, [
      'schemaVersion', 'kind', 'eventId', 'authorityTick', 'playerId', 'weaponId',
      'attackOrdinal', 'outcome', 'reason', 'targetPlayerId', 'distanceMillimeters',
      'damagePoints', 'contactPointMillimeters',
    ]);
    numberAt(required(record, 'schemaVersion', path), `${path}.schemaVersion`, {
      integer: true, min: 1, max: 1,
    });
    idAt(required(record, 'eventId', path), `${path}.eventId`);
    tickAt(required(record, 'authorityTick', path), `${path}.authorityTick`);
    idAt(required(record, 'playerId', path), `${path}.playerId`);
    stringAt(required(record, 'weaponId', path), `${path}.weaponId`, {
      allowed: ['kyx_edge_v1'],
    });
    numberAt(required(record, 'attackOrdinal', path), `${path}.attackOrdinal`, {
      integer: true, min: 1, max: PROTOCOL_LIMITS.maxSequence,
    });
    stringAt(required(record, 'outcome', path), `${path}.outcome`, {
      allowed: ['contact', 'miss'],
    });
    const reason = required(record, 'reason', path);
    if (reason !== null) {
      stringAt(reason, `${path}.reason`, { allowed: ['no_target', 'world_occluded'] });
    }
    nullableIdAt(required(record, 'targetPlayerId', path), `${path}.targetPlayerId`);
    numberAt(required(record, 'distanceMillimeters', path), `${path}.distanceMillimeters`, {
      integer: true,
      min: 0,
      max: PROTOCOL_LIMITS.maxCoordinateMillimeters,
      nullable: true,
    });
    numberAt(required(record, 'damagePoints', path), `${path}.damagePoints`, {
      integer: true, min: 0, max: PROTOCOL_LIMITS.maxHealthValue,
    });
    const contactPoint = required(record, 'contactPointMillimeters', path);
    if (contactPoint !== null) {
      validatePresentationVector(contactPoint, `${path}.contactPointMillimeters`);
    }
    return record as unknown as CombatPresentationReliableEventV1;
  }
  if (kind === 'impulse_grenade_throw_accepted') {
    exactKeys(record, path, [
      'schemaVersion', 'kind', 'eventId', 'authorityTick', 'playerId', 'abilityId',
      'throwOrdinal', 'projectileId', 'cooldownEndsAtTick',
    ]);
    numberAt(required(record, 'schemaVersion', path), `${path}.schemaVersion`, {
      integer: true, min: 1, max: 1,
    });
    idAt(required(record, 'eventId', path), `${path}.eventId`);
    tickAt(required(record, 'authorityTick', path), `${path}.authorityTick`);
    idAt(required(record, 'playerId', path), `${path}.playerId`);
    stringAt(required(record, 'abilityId', path), `${path}.abilityId`, {
      allowed: ['vertical_impulse_grenade_v1'],
    });
    numberAt(required(record, 'throwOrdinal', path), `${path}.throwOrdinal`, {
      integer: true, min: 1, max: PROTOCOL_LIMITS.maxSequence,
    });
    idAt(required(record, 'projectileId', path), `${path}.projectileId`);
    tickAt(required(record, 'cooldownEndsAtTick', path), `${path}.cooldownEndsAtTick`);
    return record as unknown as CombatPresentationReliableEventV1;
  }
  if (kind === 'impulse_grenade_collision') {
    exactKeys(record, path, [
      'schemaVersion', 'kind', 'eventId', 'authorityTick', 'projectileId',
      'ownerPlayerId', 'colliderId', 'layer', 'playerId', 'timeOfImpactPermille',
      'bounceCount', 'fuseStartedAtTick', 'detonatesAtTick', 'settled',
    ]);
    numberAt(required(record, 'schemaVersion', path), `${path}.schemaVersion`, {
      integer: true, min: 1, max: 1,
    });
    idAt(required(record, 'eventId', path), `${path}.eventId`);
    tickAt(required(record, 'authorityTick', path), `${path}.authorityTick`);
    idAt(required(record, 'projectileId', path), `${path}.projectileId`);
    idAt(required(record, 'ownerPlayerId', path), `${path}.ownerPlayerId`);
    idAt(required(record, 'colliderId', path), `${path}.colliderId`);
    stringAt(required(record, 'layer', path), `${path}.layer`, {
      allowed: [
        'world_static', 'dynamic_platform', 'player_body', 'door', 'spawn_barrier',
        'deployable', 'projectile', 'trigger',
      ],
    });
    nullableIdAt(required(record, 'playerId', path), `${path}.playerId`);
    numberAt(required(record, 'timeOfImpactPermille', path), `${path}.timeOfImpactPermille`, {
      integer: true, min: 0, max: 1_000,
    });
    numberAt(required(record, 'bounceCount', path), `${path}.bounceCount`, {
      integer: true, min: 0, max: PROTOCOL_LIMITS.maxSequence,
    });
    tickAt(required(record, 'fuseStartedAtTick', path), `${path}.fuseStartedAtTick`);
    tickAt(required(record, 'detonatesAtTick', path), `${path}.detonatesAtTick`);
    booleanAt(required(record, 'settled', path), `${path}.settled`);
    return record as unknown as CombatPresentationReliableEventV1;
  }
  if (kind === 'impulse_grenade_detonated') {
    exactKeys(record, path, [
      'schemaVersion', 'kind', 'eventId', 'authorityTick', 'projectileId',
      'ownerPlayerId', 'ownerTeamId', 'reason', 'positionMillimeters',
      'areaRadiusMillimeters', 'damageHealthPoints',
    ]);
    numberAt(required(record, 'schemaVersion', path), `${path}.schemaVersion`, {
      integer: true, min: 1, max: 1,
    });
    idAt(required(record, 'eventId', path), `${path}.eventId`);
    tickAt(required(record, 'authorityTick', path), `${path}.authorityTick`);
    idAt(required(record, 'projectileId', path), `${path}.projectileId`);
    idAt(required(record, 'ownerPlayerId', path), `${path}.ownerPlayerId`);
    nullableIdAt(required(record, 'ownerTeamId', path), `${path}.ownerTeamId`);
    stringAt(required(record, 'reason', path), `${path}.reason`, {
      allowed: ['fuse', 'lifetime'],
    });
    validatePresentationVector(
      required(record, 'positionMillimeters', path),
      `${path}.positionMillimeters`,
    );
    if (required(record, 'areaRadiusMillimeters', path) !== 11_000) {
      fail(
        'PROTOCOL_INVALID_FIELD_VALUE',
        `${path}.areaRadiusMillimeters`,
        'The accepted Impulse Grenade profile requires an 11,000 mm radius.',
      );
    }
    if (required(record, 'damageHealthPoints', path) !== 0) {
      fail(
        'PROTOCOL_INVALID_FIELD_VALUE',
        `${path}.damageHealthPoints`,
        'The Impulse Grenade is displacement-only and cannot carry damage.',
      );
    }
    return record as unknown as CombatPresentationReliableEventV1;
  }
  if (kind === 'impulse_grenade_impulse_applied') {
    exactKeys(record, path, [
      'schemaVersion', 'kind', 'eventId', 'authorityTick', 'projectileId',
      'ownerPlayerId', 'targetPlayerId', 'relation', 'distanceMillimeters',
      'falloffPermille', 'requestedImpulseMillimetersPerSecond',
      'appliedImpulseMillimetersPerSecond', 'damageHealthPoints',
    ]);
    numberAt(required(record, 'schemaVersion', path), `${path}.schemaVersion`, {
      integer: true, min: 1, max: 1,
    });
    idAt(required(record, 'eventId', path), `${path}.eventId`);
    tickAt(required(record, 'authorityTick', path), `${path}.authorityTick`);
    idAt(required(record, 'projectileId', path), `${path}.projectileId`);
    idAt(required(record, 'ownerPlayerId', path), `${path}.ownerPlayerId`);
    idAt(required(record, 'targetPlayerId', path), `${path}.targetPlayerId`);
    stringAt(required(record, 'relation', path), `${path}.relation`, {
      allowed: ['self', 'enemy'],
    });
    numberAt(required(record, 'distanceMillimeters', path), `${path}.distanceMillimeters`, {
      integer: true, min: 0, max: PROTOCOL_LIMITS.maxCoordinateMillimeters,
    });
    numberAt(required(record, 'falloffPermille', path), `${path}.falloffPermille`, {
      integer: true, min: 0, max: 1_000,
    });
    validatePresentationVelocity(
      required(record, 'requestedImpulseMillimetersPerSecond', path),
      `${path}.requestedImpulseMillimetersPerSecond`,
    );
    validatePresentationVelocity(
      required(record, 'appliedImpulseMillimetersPerSecond', path),
      `${path}.appliedImpulseMillimetersPerSecond`,
    );
    if (required(record, 'damageHealthPoints', path) !== 0) {
      fail(
        'PROTOCOL_INVALID_FIELD_VALUE',
        `${path}.damageHealthPoints`,
        'The Impulse Grenade is displacement-only and cannot carry damage.',
      );
    }
    return record as unknown as CombatPresentationReliableEventV1;
  }
  if (kind === 'throwable_ability_event') {
    exactKeys(record, path, [
      'schemaVersion', 'kind', 'eventId', 'authorityTick', 'phase', 'playerId',
      'abilityId', 'projectileId', 'targetPlayerId', 'cooldownEndsAtTick',
      'positionMillimeters', 'areaRadiusMillimeters', 'reason',
    ]);
    numberAt(required(record, 'schemaVersion', path), `${path}.schemaVersion`, {
      integer: true, min: 1, max: 1,
    });
    idAt(required(record, 'eventId', path), `${path}.eventId`);
    tickAt(required(record, 'authorityTick', path), `${path}.authorityTick`);
    stringAt(required(record, 'phase', path), `${path}.phase`, {
      allowed: ['activated', 'rejected', 'collision', 'detonated', 'flash_applied'],
    });
    idAt(required(record, 'playerId', path), `${path}.playerId`);
    stringAt(required(record, 'abilityId', path), `${path}.abilityId`, {
      allowed: [
        'vertical_impulse_grenade_v1', 'frag_grenade_v1', 'smoke_grenade_v1',
        'sticky_grenade_v1', 'flash_grenade_v1',
      ],
    });
    nullableIdAt(required(record, 'projectileId', path), `${path}.projectileId`);
    nullableIdAt(required(record, 'targetPlayerId', path), `${path}.targetPlayerId`);
    nullableTickAt(required(record, 'cooldownEndsAtTick', path), `${path}.cooldownEndsAtTick`);
    const position = required(record, 'positionMillimeters', path);
    if (position !== null) validatePresentationVector(position, `${path}.positionMillimeters`);
    numberAt(
      required(record, 'areaRadiusMillimeters', path),
      `${path}.areaRadiusMillimeters`,
      {
        integer: true,
        min: 1,
        max: PROTOCOL_LIMITS.maxCoordinateMillimeters,
        nullable: true,
      },
    );
    stringAt(required(record, 'reason', path), `${path}.reason`, {
      maxBytes: PROTOCOL_LIMITS.maxNoticeBytes,
      nullable: true,
    });
    return record as unknown as CombatPresentationReliableEventV1;
  }
  if (kind === 'teleport_resource_confirmed') {
    exactKeys(record, path, [
      'schemaVersion', 'kind', 'eventId', 'authorityTick', 'playerId', 'abilityId',
      'outcome', 'from', 'to', 'cooldownTicksRemaining', 'weaponRecoveryTicks',
      'combatStatePolicy',
    ]);
    numberAt(required(record, 'schemaVersion', path), `${path}.schemaVersion`, {
      integer: true, min: 1, max: 1,
    });
    idAt(required(record, 'eventId', path), `${path}.eventId`);
    tickAt(required(record, 'authorityTick', path), `${path}.authorityTick`);
    idAt(required(record, 'playerId', path), `${path}.playerId`);
    idAt(required(record, 'abilityId', path), `${path}.abilityId`);
    stringAt(required(record, 'outcome', path), `${path}.outcome`, {
      allowed: ['full', 'partial'],
    });
    validatePresentationVector(required(record, 'from', path), `${path}.from`);
    validatePresentationVector(required(record, 'to', path), `${path}.to`);
    numberAt(required(record, 'cooldownTicksRemaining', path), `${path}.cooldownTicksRemaining`, {
      integer: true, min: 0, max: PROTOCOL_LIMITS.maxAuthorityTick,
    });
    numberAt(required(record, 'weaponRecoveryTicks', path), `${path}.weaponRecoveryTicks`, {
      integer: true, min: 0, max: PROTOCOL_LIMITS.maxAuthorityTick,
    });
    idAt(required(record, 'combatStatePolicy', path), `${path}.combatStatePolicy`);
    return record as unknown as CombatPresentationReliableEventV1;
  }
  if (kind === 'world_portal_traversed') {
    exactKeys(record, path, [
      'schemaVersion', 'kind', 'eventId', 'authorityTick', 'playerId',
      'capabilityId', 'endpointId', 'partnerEndpointId', 'from', 'to',
      'departureAudioHook', 'arrivalAudioHook', 'departureVfxHook',
      'arrivalVfxHook',
    ]);
    numberAt(required(record, 'schemaVersion', path), `${path}.schemaVersion`, {
      integer: true, min: 1, max: 1,
    });
    idAt(required(record, 'eventId', path), `${path}.eventId`);
    tickAt(required(record, 'authorityTick', path), `${path}.authorityTick`);
    for (const field of [
      'playerId', 'capabilityId', 'endpointId', 'partnerEndpointId',
      'departureAudioHook', 'arrivalAudioHook', 'departureVfxHook',
      'arrivalVfxHook',
    ] as const) {
      idAt(required(record, field, path), `${path}.${field}`);
    }
    validatePresentationVector(required(record, 'from', path), `${path}.from`);
    validatePresentationVector(required(record, 'to', path), `${path}.to`);
    return record as unknown as CombatPresentationReliableEventV1;
  }
  exactKeys(record, path, [
    'schemaVersion', 'kind', 'eventId', 'authorityTick', 'playerId', 'abilityId',
    'reason', 'cooldownTicksRemaining', 'cooldownConsumedByFailure',
  ]);
  numberAt(required(record, 'schemaVersion', path), `${path}.schemaVersion`, {
    integer: true, min: 1, max: 1,
  });
  idAt(required(record, 'eventId', path), `${path}.eventId`);
  tickAt(required(record, 'authorityTick', path), `${path}.authorityTick`);
  idAt(required(record, 'playerId', path), `${path}.playerId`);
  idAt(required(record, 'abilityId', path), `${path}.abilityId`);
  stringAt(required(record, 'reason', path), `${path}.reason`, {
    allowed: ['cooldown', 'blocked', 'forbidden_volume', 'kill_volume', 'no_ground'],
  });
  numberAt(required(record, 'cooldownTicksRemaining', path), `${path}.cooldownTicksRemaining`, {
    integer: true, min: 0, max: PROTOCOL_LIMITS.maxAuthorityTick,
  });
  if (booleanAt(required(
    record,
    'cooldownConsumedByFailure',
    path,
  ), `${path}.cooldownConsumedByFailure`) !== false) {
    fail(
      'PROTOCOL_INVALID_FIELD_VALUE',
      `${path}.cooldownConsumedByFailure`,
      'The accepted teleport profile does not consume cooldown on rejection.',
    );
  }
  return record as unknown as CombatPresentationReliableEventV1;
}

function validateReliableEvent(value: unknown, path: string): ReliableEvent {
  const record = recordAt(value, path);
  exactKeys(record, path, [
    'id', 'serverTick', 'kind', 'subjectId', 'actorId', 'targetId',
    'amountHealthPoints', 'presentation',
  ]);
  reliableEventIdAt(required(record, 'id', path), `${path}.id`);
  tickAt(required(record, 'serverTick', path), `${path}.serverTick`);
  const kind = stringAt(required(record, 'kind', path), `${path}.kind`, {
    allowed: ['shotAccepted', 'weaponAttackAccepted', 'meleeContact', 'projectileSpawned', 'projectileCollided', 'projectileDetonated', 'impulseApplied', 'damageApplied', 'playerKilled', 'abilityActivated', 'abilityRejected', 'worldPortalTraversed', 'cooldownStarted', 'deployableSpawned', 'loadoutAccepted', 'playerJoined', 'playerLeft'],
  });
  idAt(required(record, 'subjectId', path), `${path}.subjectId`);
  nullableIdAt(required(record, 'actorId', path), `${path}.actorId`);
  nullableIdAt(required(record, 'targetId', path), `${path}.targetId`);
  const amount = numberAt(required(record, 'amountHealthPoints', path), `${path}.amountHealthPoints`, { min: 0, max: PROTOCOL_LIMITS.maxHealthValue, nullable: true });
  if (kind === 'damageApplied' && amount === null) {
    fail('PROTOCOL_INVALID_FIELD_VALUE', `${path}.amountHealthPoints`, 'damageApplied events require an authoritative amount.');
  }
  if (kind !== 'damageApplied' && amount !== null) {
    fail('PROTOCOL_INVALID_FIELD_VALUE', `${path}.amountHealthPoints`, 'Only damageApplied events carry an amount.');
  }
  if (Object.hasOwn(record, 'presentation')) {
    const presentation = validateCombatPresentationReliableEvent(
      record.presentation,
      `${path}.presentation`,
    );
    if (presentation.authorityTick !== record.serverTick) {
      fail(
        'PROTOCOL_INVALID_FIELD_VALUE',
        `${path}.presentation.authorityTick`,
        'Presentation event tick must match its reliable transport event.',
      );
    }
    if (presentation.kind === 'damage_applied' && kind !== 'damageApplied') {
      fail(
        'PROTOCOL_INVALID_FIELD_VALUE',
        `${path}.presentation.kind`,
        'Damage presentation requires a damageApplied reliable event.',
      );
    }
    const weaponProjection = {
      weapon_attack_accepted: 'weaponAttackAccepted',
      weapon_projectile_spawned: 'projectileSpawned',
      weapon_projectile_detonated: 'projectileDetonated',
      weapon_melee_contact: 'meleeContact',
    } as const;
    if (
      presentation.kind in weaponProjection
      && kind !== weaponProjection[presentation.kind as keyof typeof weaponProjection]
    ) {
      fail(
        'PROTOCOL_INVALID_FIELD_VALUE',
        `${path}.presentation.kind`,
        'Weapon presentation requires its exact reliable projection kind.',
      );
    }
    const grenadeProjection = {
      impulse_grenade_throw_accepted: 'projectileSpawned',
      impulse_grenade_collision: 'projectileCollided',
      impulse_grenade_detonated: 'projectileDetonated',
      impulse_grenade_impulse_applied: 'impulseApplied',
    } as const;
    if (
      presentation.kind in grenadeProjection
      && kind !== grenadeProjection[presentation.kind as keyof typeof grenadeProjection]
    ) {
      fail(
        'PROTOCOL_INVALID_FIELD_VALUE',
        `${path}.presentation.kind`,
        'Impulse Grenade presentation requires its exact reliable projection kind.',
      );
    }
    if (presentation.kind === 'throwable_ability_event') {
      const abilityProjection = {
        activated: 'projectileSpawned',
        rejected: 'abilityRejected',
        collision: 'projectileCollided',
        detonated: 'projectileDetonated',
        flash_applied: 'abilityActivated',
      } as const;
      if (kind !== abilityProjection[presentation.phase]) {
        fail(
          'PROTOCOL_INVALID_FIELD_VALUE',
          `${path}.presentation.kind`,
          'Throwable ability presentation requires its exact reliable projection kind.',
        );
      }
    }
    if (
      presentation.kind === 'teleport_resource_confirmed'
      && kind !== 'abilityActivated'
    ) {
      fail(
        'PROTOCOL_INVALID_FIELD_VALUE',
        `${path}.presentation.kind`,
        'Teleport presentation requires an abilityActivated reliable event.',
      );
    }
    if (
      presentation.kind === 'teleport_resource_rejected'
      && kind !== 'abilityRejected'
    ) {
      fail(
        'PROTOCOL_INVALID_FIELD_VALUE',
        `${path}.presentation.kind`,
        'Rejected teleport presentation requires an abilityRejected reliable event.',
      );
    }
    if (
      presentation.kind === 'world_portal_traversed'
      && kind !== 'worldPortalTraversed'
    ) {
      fail(
        'PROTOCOL_INVALID_FIELD_VALUE',
        `${path}.presentation.kind`,
        'World portal presentation requires a worldPortalTraversed reliable event.',
      );
    }
  }
  return record as unknown as ReliableEvent;
}

function validateReliableEventBatch(record: UnknownRecord): ServerMessage {
  exactKeys(record, '$', [
    'protocolVersion',
    'type',
    'reliableEventStreamVersion',
    'matchId',
    'events',
  ]);
  if (required(record, 'reliableEventStreamVersion', '$') !== 1) {
    fail('PROTOCOL_INVALID_FIELD_VALUE', '$.reliableEventStreamVersion', 'Unsupported reliable-event stream version.');
  }
  idAt(required(record, 'matchId', '$'), '$.matchId');
  const events = arrayAt(required(record, 'events', '$'), '$.events', PROTOCOL_LIMITS.maxEventsPerBatch).map((event, index) =>
    validateReliableEvent(event, `$.events[${index}]`),
  );
  assertUnique(events.map((event) => event.id), '$.events');
  return record as unknown as ServerMessage;
}

function validateInputAck(record: UnknownRecord): ServerMessage {
  exactKeys(record, '$', ['protocolVersion', 'type', 'serverTick', 'lastProcessedInputSequence']);
  tickAt(required(record, 'serverTick', '$'), '$.serverTick');
  processedSequenceAt(required(record, 'lastProcessedInputSequence', '$'), '$.lastProcessedInputSequence');
  return record as unknown as ServerMessage;
}

function validateMatchState(record: UnknownRecord): ServerMessage {
  exactKeys(record, '$', [
    'protocolVersion',
    'type',
    'matchId',
    'serverTick',
    'phase',
    'phaseEndsAtTick',
    'simulationIdentity',
  ]);
  idAt(required(record, 'matchId', '$'), '$.matchId');
  tickAt(required(record, 'serverTick', '$'), '$.serverTick');
  validatePhase(required(record, 'phase', '$'), '$.phase');
  tickAt(required(record, 'phaseEndsAtTick', '$'), '$.phaseEndsAtTick');
  validateSimulationIdentity(required(record, 'simulationIdentity', '$'), '$.simulationIdentity');
  return record as unknown as ServerMessage;
}

function validateServerNotice(record: UnknownRecord): ServerMessage {
  exactKeys(record, '$', ['protocolVersion', 'type', 'code', 'message']);
  stringAt(required(record, 'code', '$'), '$.code', { code: true, maxBytes: PROTOCOL_LIMITS.maxIdBytes });
  stringAt(required(record, 'message', '$'), '$.message', { maxBytes: PROTOCOL_LIMITS.maxNoticeBytes });
  return record as unknown as ServerMessage;
}

function validateError(record: UnknownRecord): ServerMessage {
  exactKeys(record, '$', ['protocolVersion', 'type', 'code', 'detail', 'requestId']);
  stringAt(required(record, 'code', '$'), '$.code', { code: true, maxBytes: PROTOCOL_LIMITS.maxIdBytes });
  stringAt(required(record, 'detail', '$'), '$.detail', { nullable: true, maxBytes: PROTOCOL_LIMITS.maxErrorDetailBytes });
  nullableIdAt(required(record, 'requestId', '$'), '$.requestId');
  return record as unknown as ServerMessage;
}

function validatePong(record: UnknownRecord): ServerMessage {
  exactKeys(record, '$', ['protocolVersion', 'type', 'nonce', 'serverTick']);
  numberAt(required(record, 'nonce', '$'), '$.nonce', { integer: true, min: 0, max: 0xffff_ffff });
  tickAt(required(record, 'serverTick', '$'), '$.serverTick');
  return record as unknown as ServerMessage;
}

function runValidation<T>(validation: () => T): ProtocolValidationResult<T> {
  try {
    return { ok: true, value: deepFreezeProtocolValue(validation()) };
  } catch (error) {
    if (error instanceof ValidationAbort) {
      return { ok: false, error: error.failure };
    }
    throw error;
  }
}

function deepFreezeProtocolValue<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  for (const nested of Object.values(value)) deepFreezeProtocolValue(nested);
  if (!Object.isFrozen(value)) Object.freeze(value);
  return value;
}

export function validateClientMessage(input: unknown): ProtocolValidationResult<ClientMessage> {
  return runValidation(() => {
    const snapshot = snapshotProtocolValue(input, '$', new Set(), 0);
    const { record, type } = envelope(snapshot);
    if ((SERVER_MESSAGE_TYPES as readonly string[]).includes(type)) {
      fail('PROTOCOL_DIRECTION_MISMATCH', '$.type', 'Server messages are not accepted on the client-to-room path.');
    }
    switch (type) {
      case 'hello': return validateHello(record);
      case 'authenticate': return validateAuthenticate(record);
      case 'joinRoom': return validateJoinRoom(record);
      case 'resumeRoom': return validateResumeRoom(record);
      case 'requestFullSnapshot': return validateRequestFullSnapshot(record);
      case 'inputBatch': return validateInputBatch(record);
      case 'loadoutRequest': return validateLoadoutRequest(record);
      case 'ping': return validatePing(record);
      case 'ack': return validateAck(record);
      default: {
        const normalized = type.replace(/[^A-Za-z]/g, '').toLowerCase();
        if ((FORBIDDEN_CLIENT_COMMAND_TYPES as readonly string[]).includes(normalized)) {
          fail('PROTOCOL_FORBIDDEN_COMMAND', '$.type', 'Client messages may request intent, never authoritative facts.');
        }
        fail('PROTOCOL_TYPE_UNSUPPORTED', '$.type', 'Unsupported client message type.');
      }
    }
  });
}

export function validateServerMessage(input: unknown): ProtocolValidationResult<ServerMessage> {
  return runValidation(() => {
    const snapshot = snapshotProtocolValue(input, '$', new Set(), 0);
    const { record, type } = envelope(snapshot);
    if ((CLIENT_MESSAGE_TYPES as readonly string[]).includes(type)) {
      fail('PROTOCOL_DIRECTION_MISMATCH', '$.type', 'Client messages are not accepted on the room-to-client path.');
    }
    switch (type) {
      case 'welcome': return validateWelcome(record);
      case 'joinAccepted': return validateJoinAccepted(record);
      case 'joinRejected': return validateJoinRejected(record);
      case 'fullSnapshot': return validateFullSnapshot(record);
      case 'deltaSnapshot': return validateDeltaSnapshot(record);
      case 'reliableEventBatch': return validateReliableEventBatch(record);
      case 'inputAck': return validateInputAck(record);
      case 'matchState': return validateMatchState(record);
      case 'serverNotice': return validateServerNotice(record);
      case 'error': return validateError(record);
      case 'pong': return validatePong(record);
      default: fail('PROTOCOL_TYPE_UNSUPPORTED', '$.type', 'Unsupported server message type.');
    }
  });
}

export function validateProtocolMessage(input: unknown): ProtocolValidationResult<ProtocolMessage> {
  const clientResult = validateClientMessage(input);
  if (clientResult.ok) return clientResult;
  if (clientResult.error.code !== 'PROTOCOL_DIRECTION_MISMATCH') return clientResult;
  return validateServerMessage(input);
}

export function isClientMessageType(type: string): type is ClientMessage['type'] {
  return (CLIENT_MESSAGE_TYPES as readonly string[]).includes(type);
}

export function isServerMessageType(type: string): type is ServerMessage['type'] {
  return (SERVER_MESSAGE_TYPES as readonly string[]).includes(type);
}
