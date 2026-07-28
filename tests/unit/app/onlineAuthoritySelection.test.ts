import { describe, expect, it } from 'vitest';

import {
  onlineCreatePath,
  onlineJoinPath,
  parseOnlineAuthorityRequest,
  protocolDisplayName,
  resolveOnlineAuthorityAvailability,
} from '../../../src/app/onlineAuthoritySelection';
import {
  ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID,
  ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID,
} from '../../../src/app/onlineAuthorityProfiles';

describe('resolveOnlineAuthorityAvailability', () => {
  it('keeps an empty deployment explicitly unavailable', () => {
    expect(resolveOnlineAuthorityAvailability('', { isDevelopment: false })).toEqual({
      kind: 'unconfigured',
    });
  });

  it('accepts an HTTPS authority origin and canonicalizes it', () => {
    expect(resolveOnlineAuthorityAvailability(
      'https://authority.example.test/',
      { isDevelopment: false },
    )).toEqual({ kind: 'configured', origin: 'https://authority.example.test' });
  });

  it('allows HTTP only for loopback development', () => {
    expect(resolveOnlineAuthorityAvailability(
      'http://127.0.0.1:8787',
      { isDevelopment: true },
    )).toEqual({ kind: 'configured', origin: 'http://127.0.0.1:8787' });
    expect(resolveOnlineAuthorityAvailability(
      'http://authority.example.test',
      { isDevelopment: true },
    ).kind).toBe('invalid');
    expect(resolveOnlineAuthorityAvailability(
      'http://127.0.0.1:8787',
      { isDevelopment: false },
    ).kind).toBe('invalid');
  });

  it('rejects credentials, paths, query strings, and fragments', () => {
    for (const value of [
      'https://user:secret@authority.example.test',
      'https://authority.example.test/api',
      'https://authority.example.test/?token=secret',
      'https://authority.example.test/#rooms',
    ]) {
      expect(resolveOnlineAuthorityAvailability(value, { isDevelopment: false }).kind).toBe('invalid');
    }
  });
});

describe('parseOnlineAuthorityRequest', () => {
  it('distinguishes the lobby, room creation, and normalized room join', () => {
    expect(parseOnlineAuthorityRequest('')).toEqual({ kind: 'landing' });
    expect(parseOnlineAuthorityRequest('?mode=create')).toEqual({ kind: 'create' });
    expect(parseOnlineAuthorityRequest('?mode=join&room=kyx-abc234')).toEqual({
      kind: 'join',
      roomCode: 'KYX-ABC234',
    });
  });

  it('parses the exact Inkfall revision-2 opt-in without changing default request shapes', () => {
    expect(parseOnlineAuthorityRequest('?mode=create')).toEqual({ kind: 'create' });
    expect(parseOnlineAuthorityRequest(
      `?mode=create&profile=${ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID}`,
    )).toEqual({
      kind: 'create',
      profile: ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID,
    });
    expect(parseOnlineAuthorityRequest(
      `?mode=join&room=kyx-abc234&profile=${ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID}`,
    )).toEqual({
      kind: 'join',
      roomCode: 'KYX-ABC234',
      profile: ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID,
    });
  });

  it('parses the exact Rev4 presentation / Rev3 authority opt-in', () => {
    expect(parseOnlineAuthorityRequest(
      `?mode=create&profile=${ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID}`,
    )).toEqual({
      kind: 'create',
      profile: ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID,
    });
    expect(parseOnlineAuthorityRequest(
      `?mode=join&room=kyx-rv4234&profile=${ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID}`,
    )).toEqual({
      kind: 'join',
      roomCode: 'KYX-RV4234',
      profile: ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID,
    });
  });

  it('fails closed for malformed, repeated, or unknown options', () => {
    for (const value of [
      '?mode=join',
      '?mode=create&room=KYX-ABC234',
      '?mode=join&room=bad',
      '?mode=join&mode=create&room=KYX-ABC234',
      '?mode=join&room=KYX-ABC234&authorityUrl=https://attacker.test',
      '?mode=create&profile=unknown-map',
      `?mode=create&profile=${ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID}&profile=${ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID}`,
    ]) {
      expect(parseOnlineAuthorityRequest(value).kind).toBe('invalid');
    }
  });
});

describe('online URL and display-name boundaries', () => {
  it('builds a canonical join path', () => {
    expect(onlineCreatePath()).toBe('/online?mode=create');
    expect(onlineJoinPath('kyx-abc234')).toBe('/online?mode=join&room=KYX-ABC234');
    expect(onlineCreatePath(ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID)).toBe(
      `/online?mode=create&profile=${ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID}`,
    );
    expect(onlineJoinPath('kyx-abc234', ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID)).toBe(
      `/online?mode=join&room=KYX-ABC234&profile=${ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID}`,
    );
    expect(onlineCreatePath(ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID)).toBe(
      `/online?mode=create&profile=${ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID}`,
    );
    expect(() => onlineJoinPath('not-a-room')).toThrow(/invalid/u);
  });

  it('fits a local Unicode profile name within the protocol byte budget', () => {
    expect(protocolDisplayName('  Recruit  ')).toBe('Recruit');
    const fitted = protocolDisplayName('🛰️'.repeat(24));
    expect(new TextEncoder().encode(fitted).byteLength).toBeLessThanOrEqual(48);
    expect(fitted.length).toBeGreaterThan(0);
  });
});
