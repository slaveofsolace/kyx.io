import { describe, expect, it, vi } from 'vitest';

import {
  ONLINE_COMBAT_PROFILE_HEADER,
  ONLINE_COMBAT_PROFILE_ID,
  createOnlineAuthorityRoom,
  createOnlineAuthorityMapCombatRoom,
  createOnlineCombatRoom,
  createOnlineInkfallRevision2CombatRoom,
  createOnlineInkfallRevision4CombatRoom,
  createOnlineInkfallRevision5CombatRoom,
  verifyOnlineAuthorityMapCombatRoom,
  verifyOnlineInkfallRevision2CombatRoom,
  verifyOnlineInkfallRevision4CombatRoom,
  verifyOnlineInkfallRevision5CombatRoom,
  type OnlineAuthorityFetch,
} from '../../../src/app/onlineAuthorityGateway';
import {
  ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID,
  ONLINE_INKFALL_REV2_MAP_BINDING,
  ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID,
  ONLINE_INKFALL_REV4_MAP_BINDING,
  ONLINE_INKFALL_REV5_COMBAT_PROFILE_ID,
  ONLINE_INKFALL_REV5_MAP_BINDING,
  ONLINE_RELAY_REV1_COMBAT_PROFILE_ID,
  ONLINE_RELAY_REV1_MAP_BINDING,
} from '../../../src/app/onlineAuthorityProfiles';

function response(status: number, payload: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

describe('createOnlineAuthorityRoom', () => {
  it('uses the deployment create endpoint and validates the authority room identity', async () => {
    const fetchRequest = vi.fn<OnlineAuthorityFetch>(async () => response(201, {
      ok: true,
      roomCode: 'KYX-ABC234',
    }));

    await expect(createOnlineAuthorityRoom(
      'https://authority.example.test',
      fetchRequest,
    )).resolves.toBe('KYX-ABC234');
    expect(fetchRequest).toHaveBeenCalledWith(
      'https://authority.example.test/api/rooms/create',
      {
        method: 'POST',
        headers: { Accept: 'application/json' },
      },
    );
  });

  it('makes one bounded retry for a transient server initialization failure', async () => {
    const fetchRequest = vi.fn<OnlineAuthorityFetch>()
      .mockResolvedValueOnce(response(503, { ok: false }))
      .mockResolvedValueOnce(response(201, { ok: true, roomCode: 'KYX-DEF567' }));

    await expect(createOnlineAuthorityRoom(
      'https://authority.example.test',
      fetchRequest,
    )).resolves.toBe('KYX-DEF567');
    expect(fetchRequest).toHaveBeenCalledTimes(2);
  });

  it('opts the production online combat route into the exact revision-3 room profile', async () => {
    const fetchRequest = vi.fn<OnlineAuthorityFetch>(async () => response(201, {
      ok: true,
      roomCode: 'KYX-GHJ678',
    }));

    await expect(createOnlineCombatRoom(
      'https://authority.example.test',
      fetchRequest,
    )).resolves.toBe('KYX-GHJ678');
    expect(fetchRequest).toHaveBeenCalledWith(
      'https://authority.example.test/api/rooms/create',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          [ONLINE_COMBAT_PROFILE_HEADER]: ONLINE_COMBAT_PROFILE_ID,
        },
      },
    );
  });

  it('creates and verifies the exact opt-in Inkfall revision-2 room binding', async () => {
    const payload = {
      ok: true,
      roomCode: 'KYX-NKF234',
      roomProfile: ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID,
      mapBinding: ONLINE_INKFALL_REV2_MAP_BINDING,
    };
    const createFetch = vi.fn<OnlineAuthorityFetch>(async () => response(201, payload));
    await expect(createOnlineInkfallRevision2CombatRoom(
      'https://authority.example.test',
      createFetch,
    )).resolves.toEqual({
      roomCode: 'KYX-NKF234',
      roomProfile: ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID,
      mapBinding: ONLINE_INKFALL_REV2_MAP_BINDING,
    });
    expect(createFetch).toHaveBeenCalledWith(
      'https://authority.example.test/api/rooms/create',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          [ONLINE_COMBAT_PROFILE_HEADER]: ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID,
        },
      },
    );

    const joinFetch = vi.fn<OnlineAuthorityFetch>(async () => response(201, payload));
    await expect(verifyOnlineInkfallRevision2CombatRoom(
      'https://authority.example.test',
      'kyx-nkf234',
      joinFetch,
    )).resolves.toEqual({
      roomCode: 'KYX-NKF234',
      roomProfile: ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID,
      mapBinding: ONLINE_INKFALL_REV2_MAP_BINDING,
    });
    expect(joinFetch).toHaveBeenCalledWith(
      'https://authority.example.test/api/rooms/KYX-NKF234',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          [ONLINE_COMBAT_PROFILE_HEADER]: ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID,
        },
      },
    );
  });

  it('creates and verifies the complete Rev4 presentation / Rev3 authority binding', async () => {
    const payload = {
      ok: true,
      roomCode: 'KYX-RV4234',
      roomProfile: ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID,
      mapBinding: ONLINE_INKFALL_REV4_MAP_BINDING,
    };
    const createFetch = vi.fn<OnlineAuthorityFetch>(async () => response(201, payload));
    await expect(createOnlineInkfallRevision4CombatRoom(
      'https://authority.example.test',
      createFetch,
    )).resolves.toEqual({
      roomCode: 'KYX-RV4234',
      roomProfile: ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID,
      mapBinding: ONLINE_INKFALL_REV4_MAP_BINDING,
    });
    expect(createFetch).toHaveBeenCalledWith(
      'https://authority.example.test/api/rooms/create',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          [ONLINE_COMBAT_PROFILE_HEADER]: ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID,
        },
      },
    );

    const joinFetch = vi.fn<OnlineAuthorityFetch>(async () => response(201, payload));
    await expect(verifyOnlineInkfallRevision4CombatRoom(
      'https://authority.example.test',
      'kyx-rv4234',
      joinFetch,
    )).resolves.toEqual({
      roomCode: 'KYX-RV4234',
      roomProfile: ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID,
      mapBinding: ONLINE_INKFALL_REV4_MAP_BINDING,
    });

    const drifted = vi.fn<OnlineAuthorityFetch>(async () => response(201, {
      ...payload,
      mapBinding: {
        ...ONLINE_INKFALL_REV4_MAP_BINDING,
        render: {
          ...ONLINE_INKFALL_REV4_MAP_BINDING.render,
          renderMeshesMayBeAuthority: true,
        },
      },
    }));
    await expect(verifyOnlineInkfallRevision4CombatRoom(
      'https://authority.example.test',
      'KYX-RV4234',
      drifted,
    )).rejects.toThrow(ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID);
  });

  it('creates and verifies the Rev5 presentation / corrected Revision 4 authority binding', async () => {
    const payload = {
      ok: true,
      roomCode: 'KYX-RV5234',
      roomProfile: ONLINE_INKFALL_REV5_COMBAT_PROFILE_ID,
      mapBinding: ONLINE_INKFALL_REV5_MAP_BINDING,
    };
    const createFetch = vi.fn<OnlineAuthorityFetch>(async () => response(201, payload));
    await expect(createOnlineInkfallRevision5CombatRoom(
      'https://authority.example.test',
      createFetch,
    )).resolves.toEqual({
      roomCode: 'KYX-RV5234',
      roomProfile: ONLINE_INKFALL_REV5_COMBAT_PROFILE_ID,
      mapBinding: ONLINE_INKFALL_REV5_MAP_BINDING,
    });

    const joinFetch = vi.fn<OnlineAuthorityFetch>(async () => response(201, payload));
    await expect(verifyOnlineInkfallRevision5CombatRoom(
      'https://authority.example.test',
      'kyx-rv5234',
      joinFetch,
    )).resolves.toEqual({
      roomCode: 'KYX-RV5234',
      roomProfile: ONLINE_INKFALL_REV5_COMBAT_PROFILE_ID,
      mapBinding: ONLINE_INKFALL_REV5_MAP_BINDING,
    });
  });

  it('creates and verifies the exact Relay Revision 1 authority binding', async () => {
    const payload = {
      ok: true,
      roomCode: 'KYX-RLY234',
      roomProfile: ONLINE_RELAY_REV1_COMBAT_PROFILE_ID,
      mapBinding: ONLINE_RELAY_REV1_MAP_BINDING,
    };
    const createFetch = vi.fn<OnlineAuthorityFetch>(async () => response(201, payload));
    await expect(createOnlineAuthorityMapCombatRoom(
      'https://authority.example.test',
      ONLINE_RELAY_REV1_COMBAT_PROFILE_ID,
      createFetch,
    )).resolves.toEqual({
      roomCode: 'KYX-RLY234',
      roomProfile: ONLINE_RELAY_REV1_COMBAT_PROFILE_ID,
      mapBinding: ONLINE_RELAY_REV1_MAP_BINDING,
    });

    const joinFetch = vi.fn<OnlineAuthorityFetch>(async () => response(201, payload));
    await expect(verifyOnlineAuthorityMapCombatRoom(
      'https://authority.example.test',
      'kyx-rly234',
      ONLINE_RELAY_REV1_COMBAT_PROFILE_ID,
      joinFetch,
    )).resolves.toEqual({
      roomCode: 'KYX-RLY234',
      roomProfile: ONLINE_RELAY_REV1_COMBAT_PROFILE_ID,
      mapBinding: ONLINE_RELAY_REV1_MAP_BINDING,
    });
    expect(joinFetch).toHaveBeenCalledWith(
      'https://authority.example.test/api/rooms/KYX-RLY234',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          [ONLINE_COMBAT_PROFILE_HEADER]: ONLINE_RELAY_REV1_COMBAT_PROFILE_ID,
        },
      },
    );

    const drifted = vi.fn<OnlineAuthorityFetch>(async () => response(201, {
      ...payload,
      mapBinding: {
        ...ONLINE_RELAY_REV1_MAP_BINDING,
        fixtureHash: 'forged',
      },
    }));
    await expect(verifyOnlineAuthorityMapCombatRoom(
      'https://authority.example.test',
      'KYX-RLY234',
      ONLINE_RELAY_REV1_COMBAT_PROFILE_ID,
      drifted,
    )).rejects.toThrow(ONLINE_RELAY_REV1_COMBAT_PROFILE_ID);
  });

  it('fails closed on a missing profile, binding drift, or cross-room join response', async () => {
    const base = {
      ok: true,
      roomCode: 'KYX-NKF234',
      roomProfile: ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID,
      mapBinding: ONLINE_INKFALL_REV2_MAP_BINDING,
    };
    for (const payload of [
      { ...base, roomProfile: undefined },
      {
        ...base,
        mapBinding: { ...ONLINE_INKFALL_REV2_MAP_BINDING, fixtureHash: 'forged' },
      },
      { ...base, roomCode: 'KYX-WRG567' },
    ]) {
      const fetchRequest = vi.fn<OnlineAuthorityFetch>(async () => response(201, payload));
      await expect(verifyOnlineInkfallRevision2CombatRoom(
        'https://authority.example.test',
        'KYX-NKF234',
        fetchRequest,
      )).rejects.toThrow('invalid Inkfall Foundry revision-2 room binding');
    }
  });

  it('does not retry a client-side denial and rejects malformed success payloads', async () => {
    const denied = vi.fn<OnlineAuthorityFetch>(async () => response(403, { ok: false }));
    await expect(createOnlineAuthorityRoom('https://authority.example.test', denied))
      .rejects.toThrow('HTTP 403');
    expect(denied).toHaveBeenCalledTimes(1);

    const malformed = vi.fn<OnlineAuthorityFetch>(async () => response(201, {
      ok: true,
      roomCode: 'not-a-room',
    }));
    await expect(createOnlineAuthorityRoom('https://authority.example.test', malformed))
      .rejects.toThrow('invalid room identity');
  });
});
