import { describe, expect, it } from 'vitest';

import {
  getMapLibraryEntry,
  INKFALL_REV5_LOCAL_PRACTICE_HREF,
  listMapLibrarySections,
} from '../../../src/content/maps/library';

describe('map library truth contract', () => {
  it('separates original, KYX legacy, and external legacy entries', () => {
    expect(listMapLibrarySections().map((section) => section.id)).toEqual([
      'original_maps',
      'kyx_legacy',
      'external_legacy',
    ]);
  });

  it('exposes Inkfall authority Practice and legacy Iron Bastion as distinct playable routes', () => {
    const entries = listMapLibrarySections().flatMap((section) => section.entries);
    expect(entries.filter((entry) => entry.availability === 'playable')).toEqual([
      expect.objectContaining({
        id: 'inkfall_foundry_rev5',
        action: {
          kind: 'open_local_authority_practice',
          href: INKFALL_REV5_LOCAL_PRACTICE_HREF,
        },
      }),
      expect.objectContaining({
        id: 'iron_bastion',
        action: {
          kind: 'start_local_practice',
          modeId: 'deathmatch',
        },
      }),
    ]);
  });

  it('routes playable Inkfall Rev5 to the shared local authority Practice slice', () => {
    expect(getMapLibraryEntry('inkfall_foundry_rev5')).toEqual(
      expect.objectContaining({
        availability: 'playable',
        statusLabel: 'Playable authority review',
        action: {
          kind: 'open_local_authority_practice',
          href: INKFALL_REV5_LOCAL_PRACTICE_HREF,
        },
      }),
    );
  });

  it('never represents public ev.io downloads as cleared or bundled content', () => {
    const external = getMapLibraryEntry('evio_legacy_library');
    expect(external).toEqual(
      expect.objectContaining({
        availability: 'rights_blocked',
        action: {
          kind: 'external_reference',
          href: 'https://ev.io/maps',
        },
      }),
    );
    expect(external?.description).toContain('not a redistribution license');
    expect(external?.description).toContain('No ev.io map files');
  });
});
