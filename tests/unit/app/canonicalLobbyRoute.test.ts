import { describe, expect, it } from 'vitest';

import { canonicalLobbyPrimaryPlay } from '../../../src/app/canonicalLobbyRoute';

describe('canonical lobby primary play', () => {
  it('allocates the product Relay authority profile when online is configured', () => {
    expect(canonicalLobbyPrimaryPlay({
      kind: 'configured',
      origin: 'https://authority.example.test',
    })).toEqual({
      kind: 'online_authority',
      href: '/online?mode=create&profile=relay-revision-1-authority-v1',
      label: 'Quick Match',
      detail: 'Online',
    });
  });

  it('retains the authority Practice route when online is unavailable or invalid', () => {
    expect(canonicalLobbyPrimaryPlay({ kind: 'unconfigured' }, '?g6Candidate=rev40&preset=recon')).toEqual({
      kind: 'local_authority_practice',
      href: '/practice?g6Candidate=rev40',
      label: 'Enter Relay',
      detail: 'Practice',
    });
    expect(canonicalLobbyPrimaryPlay({ kind: 'invalid', reason: 'bad origin' })).toMatchObject({
      kind: 'local_authority_practice',
      href: '/practice',
    });
  });
});
