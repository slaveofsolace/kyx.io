export const METRICS_ACCESS_SCHEME = 'kyx-room-metrics-v1';
export const METRICS_ACCESS_CREDENTIAL_HEADER = 'x-kyx-metrics-credential';
export const INTERNAL_METRICS_ACCESS_DIGEST_HEADER =
  'x-kyx-internal-metrics-credential-digest';
export const INTERNAL_METRICS_ACCESS_EXPIRY_HEADER =
  'x-kyx-internal-metrics-credential-expires-at';
// Long enough for one bounded evidence capture; short enough to limit a leaked
// room-operator credential without introducing a refresh or long-lived secret.
export const METRICS_ACCESS_TTL_MILLISECONDS = 30 * 60 * 1_000;

const METRICS_ACCESS_CREDENTIAL_BYTES = 32;
const METRICS_ACCESS_CREDENTIAL_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/u;
const MAXIMUM_PROVISIONING_CLOCK_SKEW_MILLISECONDS = 5_000;

export interface IssuedMetricsAccessCredential {
  readonly scheme: typeof METRICS_ACCESS_SCHEME;
  readonly headerName: typeof METRICS_ACCESS_CREDENTIAL_HEADER;
  readonly credential: string;
  readonly credentialDigest: string;
  readonly expiresAt: number;
  readonly ttlMilliseconds: typeof METRICS_ACCESS_TTL_MILLISECONDS;
}

export interface MetricsAccessProvisioning {
  readonly credentialDigest: string;
  readonly expiresAt: number;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export function isMetricsAccessCredential(value: string | null): value is string {
  return value !== null && METRICS_ACCESS_CREDENTIAL_PATTERN.test(value);
}

export async function digestMetricsAccessCredential(
  roomCode: string,
  credential: string,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${METRICS_ACCESS_SCHEME}:${roomCode}:${credential}`),
  );
  return hex(digest);
}

export async function issueMetricsAccessCredential(
  roomCode: string,
  nowMilliseconds = Date.now(),
): Promise<IssuedMetricsAccessCredential> {
  const bytes = new Uint8Array(METRICS_ACCESS_CREDENTIAL_BYTES);
  crypto.getRandomValues(bytes);
  const credential = base64Url(bytes);
  if (!isMetricsAccessCredential(credential)) {
    throw new Error('METRICS_ACCESS_CREDENTIAL_GENERATION_FAILED');
  }
  return Object.freeze({
    scheme: METRICS_ACCESS_SCHEME,
    headerName: METRICS_ACCESS_CREDENTIAL_HEADER,
    credential,
    credentialDigest: await digestMetricsAccessCredential(roomCode, credential),
    expiresAt: nowMilliseconds + METRICS_ACCESS_TTL_MILLISECONDS,
    ttlMilliseconds: METRICS_ACCESS_TTL_MILLISECONDS,
  });
}

export function readMetricsAccessProvisioning(
  headers: Headers,
  nowMilliseconds = Date.now(),
): MetricsAccessProvisioning | null {
  const credentialDigest = headers.get(INTERNAL_METRICS_ACCESS_DIGEST_HEADER);
  const rawExpiry = headers.get(INTERNAL_METRICS_ACCESS_EXPIRY_HEADER);
  if (credentialDigest === null && rawExpiry === null) return null;
  if (
    credentialDigest === null
    || rawExpiry === null
    || !SHA256_HEX_PATTERN.test(credentialDigest)
    || !/^[0-9]{13}$/u.test(rawExpiry)
  ) {
    throw new Error('METRICS_ACCESS_PROVISIONING_INVALID');
  }
  const expiresAt = Number(rawExpiry);
  const minimumExpiry = nowMilliseconds - MAXIMUM_PROVISIONING_CLOCK_SKEW_MILLISECONDS;
  const maximumExpiry = nowMilliseconds
    + METRICS_ACCESS_TTL_MILLISECONDS
    + MAXIMUM_PROVISIONING_CLOCK_SKEW_MILLISECONDS;
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= minimumExpiry || expiresAt > maximumExpiry) {
    throw new Error('METRICS_ACCESS_PROVISIONING_INVALID');
  }
  return Object.freeze({ credentialDigest, expiresAt });
}

export function equalMetricsAccessDigests(left: string, right: string): boolean {
  if (!SHA256_HEX_PATTERN.test(left) || !SHA256_HEX_PATTERN.test(right)) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
