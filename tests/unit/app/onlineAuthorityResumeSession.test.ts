import { describe, expect, it } from 'vitest';

import {
  clearOnlineAuthorityResumeCredential,
  createOnlineAuthorityResumeBinding,
  onlineAuthorityResumeStorageKey,
  persistOnlineAuthorityResumeCredential,
  readOnlineAuthorityResumeCredential,
  type OnlineAuthorityResumeStorage,
} from '../../../src/app/onlineAuthorityResumeSession';

class MemoryStorage implements OnlineAuthorityResumeStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const binding = createOnlineAuthorityResumeBinding({
  authorityOrigin: 'https://authority.example.test/path-is-normalized',
  roomCode: 'KYX-234567',
  profileId: 'relay-revision-1-authority-v1',
  mapId: 'relay',
  fixtureHash: '95ec4f13a599892b',
});

const credential = Object.freeze({
  resumeToken: 'A'.repeat(43),
  matchId: 'match.relay.1',
  playerId: 'player.relay.1',
});

describe('online authority tab-scoped resume credential', () => {
  it('persists and restores only an opaque credential with the exact room binding', () => {
    const storage = new MemoryStorage();
    expect(binding.authorityOrigin).toBe('https://authority.example.test');
    expect(persistOnlineAuthorityResumeCredential(storage, binding, credential, 123_456)).toBe(true);
    expect(readOnlineAuthorityResumeCredential(storage, binding)).toEqual(credential);

    const key = onlineAuthorityResumeStorageKey(binding);
    expect(key).not.toContain(credential.resumeToken);
    expect(key).not.toContain(credential.playerId);

    const serialized = storage.getItem(key) ?? '';
    expect(serialized).toContain(credential.resumeToken);
    expect(serialized).not.toContain('displayName');
    expect(Object.isFrozen(readOnlineAuthorityResumeCredential(storage, binding))).toBe(true);

    clearOnlineAuthorityResumeCredential(storage, binding);
    expect(readOnlineAuthorityResumeCredential(storage, binding)).toBeNull();
  });

  it('fails closed and removes malformed or binding-drifted envelopes', () => {
    const storage = new MemoryStorage();
    expect(persistOnlineAuthorityResumeCredential(storage, binding, credential, 123_456)).toBe(true);
    const key = onlineAuthorityResumeStorageKey(binding);
    const envelope = JSON.parse(storage.getItem(key) ?? '{}') as Record<string, unknown>;
    storage.setItem(key, JSON.stringify({ ...envelope, fixtureHash: '0000000000000000' }));
    expect(readOnlineAuthorityResumeCredential(storage, binding)).toBeNull();
    expect(storage.getItem(key)).toBeNull();

    storage.setItem(key, JSON.stringify({ ...envelope, unexpected: true }));
    expect(readOnlineAuthorityResumeCredential(storage, binding)).toBeNull();
    expect(storage.getItem(key)).toBeNull();
  });

  it('does not throw or restore a token when browser storage is unavailable', () => {
    const unavailable: OnlineAuthorityResumeStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    expect(readOnlineAuthorityResumeCredential(unavailable, binding)).toBeNull();
    expect(persistOnlineAuthorityResumeCredential(unavailable, binding, credential)).toBe(false);
    expect(() => clearOnlineAuthorityResumeCredential(unavailable, binding)).not.toThrow();
  });
});
