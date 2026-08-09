export type KyxSelectedGunAuthorityWeaponId =
  | 'vertical_rifle_v1'
  | 'kyx_sidearm_v1'
  | 'kyx_scattergun_v1'
  | 'kyx_longshot_v1'
  | 'kyx_breach_rocket_v1';

export type KyxSelectedGunLoadoutRole =
  | 'assault_rifle'
  | 'compact_sidearm'
  | 'breacher_shotgun'
  | 'recon_sniper'
  | 'siege_launcher';

export type KyxReviewMaterialTreatment = Readonly<{
  version: string;
  accent: number;
  armor: number;
  minimumRoughness: number;
  maximumMetalness: number;
  maximumEmissiveIntensity: number;
}>;

export interface KyxSelectedGunAssetProfile {
  readonly candidateId: string;
  readonly authorityWeaponId: KyxSelectedGunAuthorityWeaponId;
  readonly offlineWeaponId: string;
  readonly loadoutRole: KyxSelectedGunLoadoutRole;
  readonly assetRelativePath: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly runtimeMeshCount: number;
  readonly triangleCount: number;
  readonly rootNode: string;
  readonly muzzleNode: string;
  readonly magazineNode?: string;
  readonly firstPersonScaleMultiplier: number;
  readonly firstPersonScalePivot: readonly [number, number, number];
  readonly materialTreatment: KyxReviewMaterialTreatment;
  readonly sourceCredit: 'Sci-Fi Gun Pack by Quaternius';
  readonly sourceLicense: 'CC0-1.0';
  readonly reviewOnly: true;
  readonly releaseEligible: false;
  readonly humanAccepted: false;
}

const commonMaterialLimits = Object.freeze({
  minimumRoughness: 0.48,
  maximumMetalness: 0.5,
  maximumEmissiveIntensity: 0.18,
});

export const KYX_SELECTED_QUATERNIUS_GUN_ASSETS = Object.freeze({
  vertical_rifle_v1: Object.freeze({
    candidateId: 'kyx-vlr7-quaternius-rev1',
    authorityWeaponId: 'vertical_rifle_v1',
    offlineWeaponId: 'm4',
    loadoutRole: 'assault_rifle',
    assetRelativePath:
      'assets/review/runtime-candidates/kyx-vlr7-quaternius-rev1/kyx-vlr7-quaternius-rev1.glb',
    bytes: 132_052,
    sha256: '46de2380ac08810524d7bb4bb67d8621bb436a4f559b4d672d5c2026a075dd79',
    runtimeMeshCount: 28,
    triangleCount: 2_384,
    rootNode: 'KYX_VLR7_QUATERNIUS_REV1',
    muzzleNode: 'KYX_VLR7_REVIEW_MUZZLE_REFERENCE',
    magazineNode: 'KYX_VLR7_REVIEW_MAGAZINE',
    firstPersonScaleMultiplier: 1,
    firstPersonScalePivot: Object.freeze([0, 0.105, -0.73] as const),
    materialTreatment: Object.freeze({
      version: 'kyx_dark_alloy_cyan_retone_v2',
      accent: 0x58f4ff,
      armor: 0x3d474f,
      ...commonMaterialLimits,
    }),
    sourceCredit: 'Sci-Fi Gun Pack by Quaternius',
    sourceLicense: 'CC0-1.0',
    reviewOnly: true,
    releaseEligible: false,
    humanAccepted: false,
  }),
  kyx_sidearm_v1: Object.freeze({
    candidateId: 'kyx-k9-quaternius-rev1',
    authorityWeaponId: 'kyx_sidearm_v1',
    offlineWeaponId: 'sidearm',
    loadoutRole: 'compact_sidearm',
    assetRelativePath:
      'assets/review/runtime-candidates/kyx-quaternius-armory-rev1/kyx-k9-quaternius-rev1.glb',
    bytes: 233_708,
    sha256: '4b72710b6071bd120195ddd80673ec47cc5a3f394430bb6d614df04dcf42b339',
    runtimeMeshCount: 5,
    triangleCount: 7_048,
    rootNode: 'KYX_K9_QUATERNIUS_REV1',
    muzzleNode: 'KYX_K9_QUATERNIUS_REV1_MUZZLE_REFERENCE',
    firstPersonScaleMultiplier: 0.72,
    firstPersonScalePivot: Object.freeze([0, 0.2434, -0.507405] as const),
    materialTreatment: Object.freeze({
      version: 'kyx_dark_alloy_amber_retone_v2',
      accent: 0xffca5c,
      armor: 0x303941,
      ...commonMaterialLimits,
    }),
    sourceCredit: 'Sci-Fi Gun Pack by Quaternius',
    sourceLicense: 'CC0-1.0',
    reviewOnly: true,
    releaseEligible: false,
    humanAccepted: false,
  }),
  kyx_scattergun_v1: Object.freeze({
    candidateId: 'kyx-sg4-quaternius-rev1',
    authorityWeaponId: 'kyx_scattergun_v1',
    offlineWeaponId: 'energyshotgun',
    loadoutRole: 'breacher_shotgun',
    assetRelativePath:
      'assets/review/runtime-candidates/kyx-quaternius-armory-rev1/kyx-sg4-quaternius-rev1.glb',
    bytes: 510_624,
    sha256: 'd04629199f582dfcb2dce89bf534f295ee8689fa6cead04854c8a2e2a0bafd4b',
    runtimeMeshCount: 4,
    triangleCount: 10_006,
    rootNode: 'KYX_SG4_QUATERNIUS_REV1',
    muzzleNode: 'KYX_SG4_QUATERNIUS_REV1_MUZZLE_REFERENCE',
    firstPersonScaleMultiplier: 0.76,
    firstPersonScalePivot: Object.freeze([0, 0.11723, -0.647033] as const),
    materialTreatment: Object.freeze({
      version: 'kyx_dark_alloy_breach_retone_v2',
      accent: 0xff8c5a,
      armor: 0x26343a,
      ...commonMaterialLimits,
    }),
    sourceCredit: 'Sci-Fi Gun Pack by Quaternius',
    sourceLicense: 'CC0-1.0',
    reviewOnly: true,
    releaseEligible: false,
    humanAccepted: false,
  }),
  kyx_longshot_v1: Object.freeze({
    candidateId: 'kyx-longbow12-quaternius-rev1',
    authorityWeaponId: 'kyx_longshot_v1',
    offlineWeaponId: 'boltsniper',
    loadoutRole: 'recon_sniper',
    assetRelativePath:
      'assets/review/runtime-candidates/kyx-quaternius-armory-rev1/kyx-longbow12-quaternius-rev1.glb',
    bytes: 285_500,
    sha256: 'af4a907b60c1b482cf9e7d7339c884905dd5ae4d792a1ecc94bbd1a2da227b55',
    runtimeMeshCount: 4,
    triangleCount: 7_440,
    rootNode: 'KYX_LONGBOW12_QUATERNIUS_REV1',
    muzzleNode: 'KYX_LONGBOW12_QUATERNIUS_REV1_MUZZLE_REFERENCE',
    firstPersonScaleMultiplier: 0.66,
    firstPersonScalePivot: Object.freeze([0, 0.43746, -1.587662] as const),
    materialTreatment: Object.freeze({
      version: 'kyx_dark_alloy_recon_retone_v2',
      accent: 0xd5f4ff,
      armor: 0x33434b,
      ...commonMaterialLimits,
    }),
    sourceCredit: 'Sci-Fi Gun Pack by Quaternius',
    sourceLicense: 'CC0-1.0',
    reviewOnly: true,
    releaseEligible: false,
    humanAccepted: false,
  }),
  kyx_breach_rocket_v1: Object.freeze({
    candidateId: 'kyx-br6-quaternius-rev1',
    authorityWeaponId: 'kyx_breach_rocket_v1',
    offlineWeaponId: 'rpg',
    loadoutRole: 'siege_launcher',
    assetRelativePath:
      'assets/review/runtime-candidates/kyx-quaternius-armory-rev1/kyx-br6-quaternius-rev1.glb',
    bytes: 482_632,
    sha256: '6eb88285056f83b064cbbf82c7b123a8453d1deec61c4a4c2e47b081409b735b',
    runtimeMeshCount: 4,
    triangleCount: 12_135,
    rootNode: 'KYX_BR6_QUATERNIUS_REV1',
    muzzleNode: 'KYX_BR6_QUATERNIUS_REV1_MUZZLE_REFERENCE',
    firstPersonScaleMultiplier: 0.62,
    firstPersonScalePivot: Object.freeze([-0.001, 0.72668, -1.103082] as const),
    materialTreatment: Object.freeze({
      version: 'kyx_dark_alloy_siege_retone_v2',
      accent: 0xff6042,
      armor: 0x3a302e,
      ...commonMaterialLimits,
    }),
    sourceCredit: 'Sci-Fi Gun Pack by Quaternius',
    sourceLicense: 'CC0-1.0',
    reviewOnly: true,
    releaseEligible: false,
    humanAccepted: false,
  }),
} as const satisfies Readonly<
  Record<KyxSelectedGunAuthorityWeaponId, KyxSelectedGunAssetProfile>
>);

export const KYX_AUTHORITY_ID_BY_OFFLINE_ID = Object.freeze(
  Object.fromEntries(
    Object.values(KYX_SELECTED_QUATERNIUS_GUN_ASSETS).map((profile) => [
      profile.offlineWeaponId,
      profile.authorityWeaponId,
    ]),
  ) as Readonly<Record<string, KyxSelectedGunAuthorityWeaponId>>,
);
