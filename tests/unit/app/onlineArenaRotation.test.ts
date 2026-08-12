import { describe, expect, it } from 'vitest';

import {
  ONLINE_ARENA_ROTATION,
  isRotatingOnlineArenaProfile,
  nextOnlineArenaProfile,
} from '../../../src/app/onlineArenaRotation';
import {
  ONLINE_CROWNPOINT_REV1_COMBAT_PROFILE_ID,
  ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID,
  ONLINE_RELAY_REV1_COMBAT_PROFILE_ID,
  ONLINE_SWITCHYARD_REV1_COMBAT_PROFILE_ID,
} from '../../../src/app/onlineAuthorityProfiles';

describe('online arena rotation', () => {
  it('cycles through three original authority arenas in stable order', () => {
    expect(ONLINE_ARENA_ROTATION).toEqual([
      ONLINE_RELAY_REV1_COMBAT_PROFILE_ID,
      ONLINE_SWITCHYARD_REV1_COMBAT_PROFILE_ID,
      ONLINE_CROWNPOINT_REV1_COMBAT_PROFILE_ID,
    ]);
    expect(nextOnlineArenaProfile(ONLINE_RELAY_REV1_COMBAT_PROFILE_ID))
      .toBe(ONLINE_SWITCHYARD_REV1_COMBAT_PROFILE_ID);
    expect(nextOnlineArenaProfile(ONLINE_SWITCHYARD_REV1_COMBAT_PROFILE_ID))
      .toBe(ONLINE_CROWNPOINT_REV1_COMBAT_PROFILE_ID);
    expect(nextOnlineArenaProfile(ONLINE_CROWNPOINT_REV1_COMBAT_PROFILE_ID))
      .toBe(ONLINE_RELAY_REV1_COMBAT_PROFILE_ID);
  });

  it('does not silently rotate persisted legacy authority profiles', () => {
    expect(isRotatingOnlineArenaProfile(ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID))
      .toBe(false);
    expect(nextOnlineArenaProfile(ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID))
      .toBe(ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID);
  });
});
