export const RESUME_TOKEN_BYTES = 32 as const;
export const RESUME_TOKEN_LENGTH = 43 as const;
export const RESUME_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

const RESUME_TOKEN_DIGEST_DOMAIN = 'kyx.io/resume-token/v1\u0000';

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function bytesToHex(bytes: Uint8Array): string {
  let result = '';
  for (const byte of bytes) result += byte.toString(16).padStart(2, '0');
  return result;
}

export function isResumeToken(value: unknown): value is string {
  return typeof value === 'string'
    && value.length === RESUME_TOKEN_LENGTH
    && RESUME_TOKEN_PATTERN.test(value);
}

export function createResumeToken(
  randomValues: (bytes: Uint8Array) => Uint8Array = (bytes) => crypto.getRandomValues(bytes),
): string {
  const token = bytesToBase64Url(randomValues(new Uint8Array(RESUME_TOKEN_BYTES)));
  if (!isResumeToken(token)) throw new Error('RESUME_TOKEN_GENERATION_FAILED');
  return token;
}

export async function digestResumeToken(token: string): Promise<string> {
  if (!isResumeToken(token)) throw new RangeError('resume token is malformed');
  const encoded = new TextEncoder().encode(`${RESUME_TOKEN_DIGEST_DOMAIN}${token}`);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return bytesToHex(new Uint8Array(digest));
}
