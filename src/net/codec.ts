import {
  PROTOCOL_LIMITS,
  type ClientMessage,
  type ProtocolFailure,
  type ProtocolMessage,
  type ProtocolValidationResult,
  type ServerMessage,
} from './protocol';
import {
  validateClientMessage,
  validateProtocolMessage,
  validateServerMessage,
} from './schemas';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });

export type ProtocolDecodeResult<T> =
  | { readonly ok: true; readonly value: T; readonly byteLength: number }
  | { readonly ok: false; readonly error: ProtocolFailure };

export type ProtocolEncodeResult<T> =
  | {
      readonly ok: true;
      readonly value: T;
      readonly json: string;
      readonly bytes: Uint8Array;
      readonly byteLength: number;
    }
  | { readonly ok: false; readonly error: ProtocolFailure };

type Validator<T> = (input: unknown) => ProtocolValidationResult<T>;

function failure(code: ProtocolFailure['code'], path: string, message: string): ProtocolFailure {
  return { code, path, message };
}

function payloadToJson(payload: string | Uint8Array):
  | { readonly ok: true; readonly json: string; readonly byteLength: number }
  | { readonly ok: false; readonly error: ProtocolFailure } {
  const byteLength = typeof payload === 'string'
    ? encoder.encode(payload).byteLength
    : payload.byteLength;

  if (byteLength > PROTOCOL_LIMITS.maxMessageBytes) {
    return {
      ok: false,
      error: failure(
        'PROTOCOL_MESSAGE_TOO_LARGE',
        '$',
        `Message exceeds ${PROTOCOL_LIMITS.maxMessageBytes} UTF-8 bytes.`,
      ),
    };
  }

  if (typeof payload === 'string') {
    return { ok: true, json: payload, byteLength };
  }

  try {
    return { ok: true, json: decoder.decode(payload), byteLength };
  } catch {
    return {
      ok: false,
      error: failure('PROTOCOL_INVALID_UTF8', '$', 'Message is not valid UTF-8.'),
    };
  }
}

function decodeWith<T>(
  payload: string | Uint8Array,
  validator: Validator<T>,
): ProtocolDecodeResult<T> {
  const decoded = payloadToJson(payload);
  if (!decoded.ok) return decoded;

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded.json) as unknown;
  } catch {
    return {
      ok: false,
      error: failure('PROTOCOL_INVALID_JSON', '$', 'Message JSON could not be parsed.'),
    };
  }

  const validated = validator(parsed);
  if (!validated.ok) return validated;
  return { ok: true, value: validated.value, byteLength: decoded.byteLength };
}

function encodeWith<T>(input: unknown, validator: Validator<T>): ProtocolEncodeResult<T> {
  const validated = validator(input);
  if (!validated.ok) return validated;

  let json: string;
  try {
    json = JSON.stringify(validated.value);
  } catch {
    return {
      ok: false,
      error: failure('PROTOCOL_SERIALIZATION_FAILED', '$', 'Message could not be serialized.'),
    };
  }

  const bytes = encoder.encode(json);
  if (bytes.byteLength > PROTOCOL_LIMITS.maxMessageBytes) {
    return {
      ok: false,
      error: failure(
        'PROTOCOL_MESSAGE_TOO_LARGE',
        '$',
        `Message exceeds ${PROTOCOL_LIMITS.maxMessageBytes} UTF-8 bytes.`,
      ),
    };
  }

  return {
    ok: true,
    value: validated.value,
    json,
    bytes,
    byteLength: bytes.byteLength,
  };
}

export function decodeClientMessage(payload: string | Uint8Array): ProtocolDecodeResult<ClientMessage> {
  return decodeWith(payload, validateClientMessage);
}

export function decodeServerMessage(payload: string | Uint8Array): ProtocolDecodeResult<ServerMessage> {
  return decodeWith(payload, validateServerMessage);
}

export function decodeProtocolMessage(payload: string | Uint8Array): ProtocolDecodeResult<ProtocolMessage> {
  return decodeWith(payload, validateProtocolMessage);
}

export function encodeClientMessage(input: unknown): ProtocolEncodeResult<ClientMessage> {
  return encodeWith(input, validateClientMessage);
}

export function encodeServerMessage(input: unknown): ProtocolEncodeResult<ServerMessage> {
  return encodeWith(input, validateServerMessage);
}

export function encodeProtocolMessage(input: unknown): ProtocolEncodeResult<ProtocolMessage> {
  return encodeWith(input, validateProtocolMessage);
}
