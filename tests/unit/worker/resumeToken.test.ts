import { describe, expect, it } from 'vitest';

import {
  RESUME_TOKEN_LENGTH,
  createResumeToken,
  digestResumeToken,
  isResumeToken,
} from '../../../worker/resumeToken';

describe('resume credential primitives', () => {
  it('encodes exactly 32 random bytes as strict unpadded base64url', () => {
    const token = createResumeToken((bytes) => {
      bytes.forEach((_value, index) => { bytes[index] = index; });
      return bytes;
    });

    expect(token).toBe('AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8');
    expect(token).toHaveLength(RESUME_TOKEN_LENGTH);
    expect(isResumeToken(token)).toBe(true);
    expect(token).not.toMatch(/[+/=]/u);
  });

  it('rejects malformed, padded, and wrong-length credentials', () => {
    expect(isResumeToken('A'.repeat(43))).toBe(true);
    expect(isResumeToken('A'.repeat(42))).toBe(false);
    expect(isResumeToken(`${'A'.repeat(42)}=`)).toBe(false);
    expect(isResumeToken(`${'A'.repeat(42)}+`)).toBe(false);
    expect(isResumeToken(null)).toBe(false);
  });

  it('uses a stable domain-separated SHA-256 digest without exposing the token', async () => {
    const token = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
    const digest = await digestResumeToken(token);

    expect(digest).toMatch(/^[a-f0-9]{64}$/u);
    expect(digest).toBe(await digestResumeToken(token));
    expect(digest).not.toContain(token);
    await expect(digestResumeToken(`${'A'.repeat(42)}=`)).rejects.toThrow(/malformed/u);
  });
});
