export const INKFALL_AUTHORITY_MAP_ID = 'inkfall_foundry' as const;

export interface InkfallAuthorityMapIdentity {
  readonly mapId: typeof INKFALL_AUTHORITY_MAP_ID;
  readonly mapRevision: 1 | 2 | 3 | 4;
  readonly packageDigest: string;
  readonly fixtureHash: string;
  readonly colliderCardinality: number;
}

export const INKFALL_AUTHORITY_MAP_IDENTITY_V1 = Object.freeze({
  mapId: INKFALL_AUTHORITY_MAP_ID,
  mapRevision: 1,
  packageDigest: 'a593ad82b2e9f713a4a8d775002c1583c0fb3dfd3acdf004ba7bd6b144173267',
  fixtureHash: '2a0a446a0b152395',
  colliderCardinality: 346,
} as const satisfies InkfallAuthorityMapIdentity);

export const INKFALL_AUTHORITY_MAP_IDENTITY_V2 = Object.freeze({
  mapId: INKFALL_AUTHORITY_MAP_ID,
  mapRevision: 2,
  packageDigest: '77a7b6c41416f9caaf615f3af5dacda1153cee65a239c04f2004e30fc1663520',
  fixtureHash: 'bf85e42731fd088e',
  colliderCardinality: 339,
} as const satisfies InkfallAuthorityMapIdentity);

export const INKFALL_AUTHORITY_MAP_IDENTITY_V3 = Object.freeze({
  mapId: INKFALL_AUTHORITY_MAP_ID,
  mapRevision: 3,
  packageDigest: '4027934730af7c855b0abcee1b36cc256294e3e5c22a6ffb8aa02a77f71d196a',
  fixtureHash: '97eb7772ac59dc95',
  colliderCardinality: 339,
} as const satisfies InkfallAuthorityMapIdentity);

export const INKFALL_AUTHORITY_MAP_IDENTITY_V4 = Object.freeze({
  mapId: INKFALL_AUTHORITY_MAP_ID,
  mapRevision: 4,
  packageDigest: '65c6c315d9bc0ba27e7ddec1fd2712752b0fa91c4f865f4b2a055e778158c9cf',
  fixtureHash: 'b24d002179389621',
  colliderCardinality: 339,
} as const satisfies InkfallAuthorityMapIdentity);

export const INKFALL_AUTHORITY_MAP_IDENTITIES = Object.freeze([
  INKFALL_AUTHORITY_MAP_IDENTITY_V1,
  INKFALL_AUTHORITY_MAP_IDENTITY_V2,
  INKFALL_AUTHORITY_MAP_IDENTITY_V3,
  INKFALL_AUTHORITY_MAP_IDENTITY_V4,
] as const);

export function findInkfallAuthorityMapIdentity(
  mapRevision: number,
): InkfallAuthorityMapIdentity | undefined {
  return INKFALL_AUTHORITY_MAP_IDENTITIES.find((identity) => (
    identity.mapRevision === mapRevision
  ));
}
