export type MapLibrarySectionId =
  | 'original_maps'
  | 'kyx_legacy'
  | 'external_legacy';

export type MapLibraryAvailability =
  | 'playable'
  | 'review_only'
  | 'rights_blocked';

export type MapLibraryAction =
  | {
      readonly kind: 'start_local_practice';
      readonly modeId: 'deathmatch';
    }
  | {
      readonly kind: 'open_local_authority_practice';
      readonly href: '/practice';
    }
  | {
      readonly kind: 'open_review_route';
      readonly href: string;
    }
  | {
      readonly kind: 'external_reference';
      readonly href: string;
    };

export interface MapLibraryEntry {
  readonly id: string;
  readonly sectionId: MapLibrarySectionId;
  readonly displayName: string;
  readonly maker: string;
  readonly availability: MapLibraryAvailability;
  readonly statusLabel: string;
  readonly description: string;
  readonly modes: readonly string[];
  readonly action: MapLibraryAction;
}

export interface MapLibrarySection {
  readonly id: MapLibrarySectionId;
  readonly label: string;
  readonly description: string;
  readonly entries: readonly MapLibraryEntry[];
}

export const INKFALL_REV5_LOCAL_PRACTICE_HREF = '/practice' as const;

const MAP_LIBRARY_SECTIONS: readonly MapLibrarySection[] = Object.freeze([
  Object.freeze({
    id: 'original_maps',
    label: 'Original maps',
    description: 'KYX arenas authored for the current authority and movement contracts.',
    entries: Object.freeze([
      Object.freeze({
        id: 'inkfall_foundry_rev5',
        sectionId: 'original_maps',
        displayName: 'Inkfall Foundry',
        maker: 'KYX',
        availability: 'playable',
        statusLabel: 'Playable authority review',
        description:
          'Vertical combat arena with shared local/online collision, spawns, zones, weapons, abilities, bots, and linked portals. Manual map/play review remains open.',
        modes: Object.freeze(['Team deathmatch', 'Deathmatch']),
        action: Object.freeze({
          kind: 'open_local_authority_practice',
          href: INKFALL_REV5_LOCAL_PRACTICE_HREF,
        }),
      }),
    ]),
  }),
  Object.freeze({
    id: 'kyx_legacy',
    label: 'KYX legacy',
    description: 'Earlier local arenas retained as playable history.',
    entries: Object.freeze([
      Object.freeze({
        id: 'iron_bastion',
        sectionId: 'kyx_legacy',
        displayName: 'Iron Bastion',
        maker: 'KYX',
        availability: 'playable',
        statusLabel: 'Playable offline',
        description:
          'The original local practice arena with seven labeled bots and the legacy simulation.',
        modes: Object.freeze(['Deathmatch']),
        action: Object.freeze({
          kind: 'start_local_practice',
          modeId: 'deathmatch',
        }),
      }),
    ]),
  }),
  Object.freeze({
    id: 'external_legacy',
    label: 'Legacy maps',
    description:
      'External map families remain outside the KYX package until their owners grant written redistribution and adaptation rights.',
    entries: Object.freeze([
      Object.freeze({
        id: 'evio_legacy_library',
        sectionId: 'external_legacy',
        displayName: 'ev.io map library',
        maker: 'Enthusiast Gaming and community creators',
        availability: 'rights_blocked',
        statusLabel: 'Permission required',
        description:
          'Public .evmap downloads are documented, but public access is not a redistribution license. No ev.io map files, geometry, textures, audio, or layouts are bundled here.',
        modes: Object.freeze(['External library']),
        action: Object.freeze({
          kind: 'external_reference',
          href: 'https://ev.io/maps',
        }),
      }),
    ]),
  }),
]);

export function listMapLibrarySections(): readonly MapLibrarySection[] {
  return MAP_LIBRARY_SECTIONS;
}

export function getMapLibraryEntry(id: string): MapLibraryEntry | undefined {
  for (const section of MAP_LIBRARY_SECTIONS) {
    const entry = section.entries.find((candidate) => candidate.id === id);
    if (entry) return entry;
  }
  return undefined;
}
