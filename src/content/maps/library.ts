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
    }
  | {
      readonly kind: 'inspect_local_evmap';
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

export const RELAY_LOCAL_PRACTICE_HREF = '/practice' as const;

const MAP_LIBRARY_SECTIONS: readonly MapLibrarySection[] = Object.freeze([
  Object.freeze({
    id: 'original_maps',
    label: 'Original maps',
    description: 'KYX arenas authored for the current authority and movement contracts.',
    entries: Object.freeze([
      Object.freeze({
        id: 'relay_visual_candidate',
        sectionId: 'original_maps',
        displayName: 'Relay',
        maker: 'KYX',
        availability: 'playable',
        statusLabel: 'Playable visual candidate',
        description:
          'Open-sky communications campus with readable upper, court, and lower routes. Local practice now runs Relay\'s own collision, spawns, weapons, abilities, and bots; online and portal rollout remain gated behind map approval.',
        modes: Object.freeze(['Team deathmatch', 'Deathmatch']),
        action: Object.freeze({
          kind: 'open_local_authority_practice',
          href: RELAY_LOCAL_PRACTICE_HREF,
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
        id: 'local_evmap_inspection',
        sectionId: 'external_legacy',
        displayName: 'Local .evmap file',
        maker: 'Private file on this device',
        availability: 'review_only',
        statusLabel: 'Local inspection',
        description:
          'Inspect a map file locally without uploading it. KYX records its fingerprint and container shape, but will not claim play compatibility until a lawful renderer adapter is verified.',
        modes: Object.freeze(['No upload', 'Inspection only']),
        action: Object.freeze({
          kind: 'inspect_local_evmap',
        }),
      }),
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
