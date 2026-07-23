import { describe, expect, it } from 'vitest';

import {
  CLIENT_MESSAGE_TYPES,
  FORBIDDEN_CLIENT_COMMAND_TYPES,
  PROTOCOL_LIMITS,
  PROTOCOL_VERSION,
  SNAPSHOT_BASELINE_VERSION,
  SERVER_MESSAGE_TYPES,
  decodeClientMessage,
  decodeServerMessage,
  encodeClientMessage,
  encodeServerMessage,
  validateClientMessage,
  validateServerMessage,
} from '../../../src/net';
import { INTENT_BUTTON_MASK, MAX_SELECTABLE_SLOT } from '../../../src/sim';
import { validClientMessages, validServerMessages } from '../../fixtures/protocol/validMessages';

describe('protocol v2 valid contracts', () => {
  it('keeps wire button and slot bounds aligned with the simulation contract', () => {
    expect(PROTOCOL_LIMITS.maxButtonBits).toBe(INTENT_BUTTON_MASK);
    expect(PROTOCOL_LIMITS.maxSelectedSlot).toBe(MAX_SELECTABLE_SLOT);
  });

  it('covers every declared client and server message family', () => {
    expect(validClientMessages.map(({ type }) => type)).toEqual(CLIENT_MESSAGE_TYPES);
    expect(validServerMessages.map(({ type }) => type)).toEqual(SERVER_MESSAGE_TYPES);
  });

  it.each(validClientMessages)('validates client message $type', (message) => {
    expect(validateClientMessage(message)).toEqual({ ok: true, value: message });
  });

  it.each(validServerMessages)('validates server message $type', (message) => {
    expect(validateServerMessage(message)).toEqual({ ok: true, value: message });
  });

  it.each(validClientMessages)('round-trips client message $type as bounded UTF-8 JSON', (message) => {
    const encoded = encodeClientMessage(message);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    expect(encoded.byteLength).toBeLessThanOrEqual(PROTOCOL_LIMITS.maxMessageBytes);

    const decoded = decodeClientMessage(encoded.bytes);
    expect(decoded).toEqual({ ok: true, value: message, byteLength: encoded.byteLength });
  });

  it.each(validServerMessages)('round-trips server message $type as bounded UTF-8 JSON', (message) => {
    const encoded = encodeServerMessage(message);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;

    const decoded = decodeServerMessage(encoded.json);
    expect(decoded).toEqual({ ok: true, value: message, byteLength: encoded.byteLength });
  });
});

describe('protocol v2 invalid-message rejection', () => {
  const hello = validClientMessages[0];

  it('fails closed on unsupported transport versions, missing baselines, and non-v1 event IDs', () => {
    const acknowledgement = validClientMessages.find(({ type }) => type === 'ack');
    const fullSnapshot = validServerMessages.find(({ type }) => type === 'fullSnapshot');
    const reliableBatch = validServerMessages.find(({ type }) => type === 'reliableEventBatch');
    expect(acknowledgement?.type).toBe('ack');
    expect(fullSnapshot?.type).toBe('fullSnapshot');
    expect(reliableBatch?.type).toBe('reliableEventBatch');
    if (
      acknowledgement?.type !== 'ack'
      || fullSnapshot?.type !== 'fullSnapshot'
      || reliableBatch?.type !== 'reliableEventBatch'
    ) return;

    const missingBaseline: Record<string, unknown> = { ...acknowledgement };
    delete missingBaseline.snapshotBaselineId;
    expect(validateClientMessage(missingBaseline)).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'PROTOCOL_REQUIRED_FIELD',
        path: '$.snapshotBaselineId',
      }),
    });
    expect(validateClientMessage({
      ...acknowledgement,
      snapshotBaselineVersion: SNAPSHOT_BASELINE_VERSION + 1,
    })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'PROTOCOL_INVALID_FIELD_VALUE',
        path: '$.snapshotBaselineVersion',
      }),
    });
    expect(validateServerMessage({
      ...fullSnapshot,
      reliableEventBaselineId: 'event.not-a-sequence',
    })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'PROTOCOL_INVALID_FIELD_VALUE',
        path: '$.reliableEventBaselineId',
      }),
    });
    expect(validateServerMessage({
      ...reliableBatch,
      events: [{ ...reliableBatch.events[0], id: 'event.not-a-sequence' }],
    })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'PROTOCOL_INVALID_FIELD_VALUE',
        path: '$.events[0].id',
      }),
    });
  });

  it('rejects oversized payloads before JSON parsing', () => {
    const result = decodeClientMessage('x'.repeat(PROTOCOL_LIMITS.maxMessageBytes + 1));

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'PROTOCOL_MESSAGE_TOO_LARGE', path: '$' }),
    });
  });

  it('rejects malformed UTF-8 and malformed JSON with distinct stable codes', () => {
    expect(decodeClientMessage(new Uint8Array([0xff]))).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'PROTOCOL_INVALID_UTF8' }),
    });
    expect(decodeClientMessage('{')).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'PROTOCOL_INVALID_JSON' }),
    });
  });

  it('requires the version and rejects incompatible versions', () => {
    const missingVersion: Record<string, unknown> = { ...hello };
    delete missingVersion.protocolVersion;
    expect(validateClientMessage(missingVersion)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'PROTOCOL_VERSION_REQUIRED', path: '$.protocolVersion' }),
    });
    expect(validateClientMessage({ ...hello, protocolVersion: PROTOCOL_VERSION + 1 })).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'PROTOCOL_VERSION_UNSUPPORTED', path: '$.protocolVersion' }),
    });
  });

  it('rejects unknown fields and wrong-direction messages', () => {
    expect(validateClientMessage({ ...hello, claimedScore: 9000 })).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'PROTOCOL_UNKNOWN_FIELD', path: '$.claimedScore' }),
    });
    expect(validateClientMessage(validServerMessages[0])).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'PROTOCOL_DIRECTION_MISMATCH', path: '$.type' }),
    });
    expect(validateServerMessage(hello)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'PROTOCOL_DIRECTION_MISMATCH', path: '$.type' }),
    });
  });

  it.each(['Kill', 'Damage', 'AwardCurrency', 'SetPosition', 'SetScore'])(
    'rejects forbidden authoritative client message %s',
    (type) => {
      expect(validateClientMessage({ protocolVersion: PROTOCOL_VERSION, type })).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'PROTOCOL_FORBIDDEN_COMMAND', path: '$.type' }),
      });
    },
  );

  it.each(['Kill', 'Damage', 'AwardCurrency', 'SetPosition', 'SetScore'])(
    'rejects forbidden authoritative command %s inside input batches',
    (type) => {
      expect(validateClientMessage({
        protocolVersion: PROTOCOL_VERSION,
        type: 'inputBatch',
        commands: [{ type, sequence: 1, clientTick: 1 }],
      })).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'PROTOCOL_FORBIDDEN_COMMAND', path: '$.commands[0].type' }),
      });
    },
  );

  it('exports only intent command names in the forbidden boundary', () => {
    expect(FORBIDDEN_CLIENT_COMMAND_TYPES).toEqual([
      'kill',
      'damage',
      'awardcurrency',
      'setposition',
      'setscore',
    ]);
  });

  it('enforces quantized numeric limits', () => {
    const message = structuredClone(validClientMessages[4]);
    const command = message.commands[0];
    if (command.type !== 'input') throw new Error('Fixture contract changed.');

    expect(validateClientMessage({
      ...message,
      commands: [{ ...command, moveX: PROTOCOL_LIMITS.maxAxisMagnitude + 1 }],
    })).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'PROTOCOL_NUMERIC_OUT_OF_RANGE', path: '$.commands[0].moveX' }),
    });
  });

  it('enforces coherent held, pressed, and released input edges', () => {
    const message = validClientMessages[4];
    const command = message.commands[0];

    expect(validateClientMessage({
      ...message,
      commands: [{ ...command, heldButtons: 1, pressedButtons: 1, releasedButtons: 1 }],
    })).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'PROTOCOL_INVALID_FIELD_VALUE', path: '$.commands[0].pressedButtons' }),
    });

    expect(validateClientMessage({
      ...message,
      commands: [{ ...command, selectedSlot: PROTOCOL_LIMITS.maxSelectedSlot + 1 }],
    })).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'PROTOCOL_NUMERIC_OUT_OF_RANGE', path: '$.commands[0].selectedSlot' }),
    });
  });

  it('enforces command-count and monotonic-sequence limits', () => {
    const base = validClientMessages[4].commands[0];
    expect(validateClientMessage({
      protocolVersion: PROTOCOL_VERSION,
      type: 'inputBatch',
      commands: Array.from({ length: PROTOCOL_LIMITS.maxCommandsPerBatch + 1 }, (_, index) => ({
        ...base,
        sequence: index,
      })),
    })).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'PROTOCOL_ARRAY_TOO_LONG', path: '$.commands' }),
    });

    expect(validateClientMessage({
      protocolVersion: PROTOCOL_VERSION,
      type: 'inputBatch',
      commands: [{ ...base, sequence: 7 }, { ...base, sequence: 7 }],
    })).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'PROTOCOL_SEQUENCE_INVALID', path: '$.commands[1].sequence' }),
    });
  });

  it('enforces exactly two unique damage ability choices', () => {
    const loadout = validClientMessages[5];
    expect(validateClientMessage({ ...loadout, damageAbilityIds: ['vertical_grenade_v1'] })).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'PROTOCOL_INVALID_FIELD_VALUE', path: '$.damageAbilityIds' }),
    });
    expect(validateClientMessage({
      ...loadout,
      damageAbilityIds: ['vertical_grenade_v1', 'vertical_grenade_v1'],
    })).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'PROTOCOL_DUPLICATE_ID', path: '$.damageAbilityIds' }),
    });
  });

  it('rejects duplicate snapshot IDs and contradictory delta lifecycle', () => {
    const snapshot = validServerMessages[3];
    expect(validateServerMessage({
      ...snapshot,
      entities: [snapshot.entities[0], snapshot.entities[0]],
    })).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'PROTOCOL_DUPLICATE_ID', path: '$.entities' }),
    });

    const delta = validServerMessages[4];
    expect(validateServerMessage({
      ...delta,
      removedEntityIds: [delta.entities[0].id],
    })).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'PROTOCOL_DUPLICATE_ID', path: '$.removedEntityIds' }),
    });
  });

  it('requires integer millimeter and milli-degree snapshot units', () => {
    const snapshot = validServerMessages[3];
    expect(validateServerMessage({
      ...snapshot,
      entities: [{ ...snapshot.entities[0], xMillimeters: 1.5 }],
    })).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'PROTOCOL_INVALID_FIELD_VALUE', path: '$.entities[0].xMillimeters' }),
    });
  });

  it('rejects inherited serialization behavior', () => {
    const customPrototype = {
      toJSON: () => ({ protocolVersion: PROTOCOL_VERSION, type: 'Kill' }),
    };
    const message = Object.assign(Object.create(customPrototype) as Record<string, unknown>, hello);

    expect(encodeClientMessage(message)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'PROTOCOL_INVALID_FIELD_VALUE', path: '$' }),
    });
  });

  it('rejects accessors before validation or serialization can observe changing values', () => {
    let getterReads = 0;
    const message: Record<string, unknown> = { ...hello };
    Object.defineProperty(message, 'protocolVersion', {
      enumerable: true,
      get: () => {
        getterReads += 1;
        return getterReads === 1 ? PROTOCOL_VERSION : 0xffff_ffff;
      },
    });

    expect(encodeClientMessage(message)).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'PROTOCOL_INVALID_FIELD_VALUE',
        path: '$.protocolVersion',
      }),
    });
    expect(getterReads).toBe(0);
  });

  it('returns an isolated recursively frozen protocol snapshot', () => {
    const input = structuredClone(validServerMessages[3]);
    const result = validateServerMessage(input);

    expect(result.ok).toBe(true);
    if (!result.ok || result.value.type !== 'fullSnapshot') return;
    expect(result.value).not.toBe(input);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.entities)).toBe(true);
    expect(Object.isFrozen(result.value.entities[0])).toBe(true);
    expect(Reflect.set(result.value.entities[0], 'xMillimeters', 99)).toBe(false);

    const mutableInput = input as unknown as {
      entities: Array<{ xMillimeters: number }>;
    };
    mutableInput.entities[0].xMillimeters = 99;
    expect(result.value.entities[0].xMillimeters).not.toBe(99);
  });

  it('rejects sparse protocol arrays with a stable path', () => {
    const commands = new Array(1) as unknown[];
    const message: Record<string, unknown> = {
      ...structuredClone(validClientMessages[4]),
      commands,
    };

    expect(validateClientMessage(message)).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'PROTOCOL_INVALID_FIELD_VALUE',
        path: '$.commands[0]',
      }),
    });
  });

  it('rejects non-finite server facts before JSON serialization can coerce them', () => {
    const pong = validServerMessages[10];
    expect(encodeServerMessage({ ...pong, serverTick: Number.NaN })).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'PROTOCOL_INVALID_FIELD_TYPE', path: '$.serverTick' }),
    });
  });
});
