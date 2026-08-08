import { describe, expect, it } from 'vitest';

import {
  getMapLibraryEntry,
  RELAY_LOCAL_PRACTICE_HREF,
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

  it('exposes Relay authority Practice and legacy Iron Bastion as distinct playable routes', () => {
    const entries = listMapLibrarySections().flatMap((section) => section.entries);
    expect(entries.filter((entry) => entry.availability === 'playable')).toEqual([
      expect.objectContaining({
        id: 'relay_visual_candidate',
        action: {
          kind: 'open_local_authority_practice',
          href: RELAY_LOCAL_PRACTICE_HREF,
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

  it('routes playable Relay to the shared local authority Practice slice', () => {
    expect(getMapLibraryEntry('relay_visual_candidate')).toEqual(
      expect.objectContaining({
        availability: 'playable',
        statusLabel: 'Playable visual candidate',
        action: {
          kind: 'open_local_authority_practice',
          href: RELAY_LOCAL_PRACTICE_HREF,
        },
      }),
    );
    expect(getMapLibraryEntry('inkfall_foundry_rev5')).toBeUndefined();
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

  it('offers a local-only evmap inspection seam without claiming play support', () => {
    expect(getMapLibraryEntry('local_evmap_inspection')).toEqual(
      expect.objectContaining({
        availability: 'review_only',
        action: { kind: 'inspect_local_evmap' },
        modes: ['No upload', 'Inspection only'],
      }),
    );
  });
});
