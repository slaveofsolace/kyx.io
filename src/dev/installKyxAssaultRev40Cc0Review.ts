import {
  installG6CharacterReviewCandidate,
} from '../config/g6CharacterCandidate.js';

const CANDIDATE_QUERY_KEY = 'g6Candidate';
const POPULATION_QUERY_KEY = 'g6Population';
const REVIEW_POPULATIONS = new Set([2, 4, 8]);

export const KYX_ASSAULT_REV40_CC0_REVIEW = Object.freeze({
  candidateId: 'g6-assault-rev40-cc0',
  displayName: 'KYX Assault Rev40 CC0 mesh and motion candidate',
  sourceRevision: 'rev30-cc0-donor',
  sourceDisposition: 'ADAPT',
  rigBones: 66,
  animationClips: 12,
  embeddedDiagnosticWeapon: false,
  distinctAuthoredLods: true,
  releaseEligible: false,
  humanAccepted: false,
  package: Object.freeze({
    combinedBytes: 13_786_484,
    lods: Object.freeze([
      Object.freeze({
        id: 'lod0',
        bytes: 4_643_864,
        sha256: '55828c78aebf74b4cd4de8d63dff9dc2084ad25eda4f423b7ac468244bbba843',
        triangles: 3_392,
      }),
      Object.freeze({
        id: 'lod1',
        bytes: 4_588_760,
        sha256: '50836dd25902d7ee07e5f1b04dc32122f495e9634f799fd607e3e0c7a9c6b175',
        triangles: 1_914,
      }),
      Object.freeze({
        id: 'lod2',
        bytes: 4_553_860,
        sha256: 'eb072f25317bc66103a84a64102bc2ac6efdd95b4d7bbee80a60f746aa76d29c',
        triangles: 1_057,
      }),
    ]),
  }),
  provenance: Object.freeze({
    mesh: 'Sci-fi Soldier by Irondust, CC0-1.0',
    motion: 'Quaternius Universal Animation Library 1/2 Standard, CC0-1.0',
    registry: 'assets/review/resource-registry/g6-assault-rev40-source-candidates.json',
  }),
} as const);

export const KYX_ASSAULT_REV40_CC0_WEAPON_READY_V4_REVIEW = Object.freeze({
  candidateId: 'g6-assault-rev40-cc0-weapon-ready-v4',
  displayName: 'KYX Assault Rev40 CC0 weapon-ready v4 skin-repair candidate',
  sourceRevision: 'rev30-cc0-donor',
  sourceDisposition: 'ADAPT',
  rigBones: 66,
  animationClips: 12,
  embeddedDiagnosticWeapon: false,
  distinctAuthoredLods: true,
  authoredWeaponReadyUpperBody: true,
  unweightedVertexRepair: 'topology-neighbor-fail-closed',
  detachedPelvisOnlyVertices: 0,
  releaseEligible: false,
  humanAccepted: false,
  package: Object.freeze({
    combinedBytes: 13_699_796,
    lods: Object.freeze([
      Object.freeze({
        id: 'lod0',
        bytes: 4_614_968,
        sha256: 'e0e242e4751329ccde5051ab51cb6432dbd56880af1e4e3a8ce6c296a8b0ed9d',
        triangles: 3_392,
      }),
      Object.freeze({
        id: 'lod1',
        bytes: 4_559_864,
        sha256: '339a353686a2bc5cae82c3c2d18188d30b4cc9df8d75823221ac1dca5d3611df',
        triangles: 1_914,
      }),
      Object.freeze({
        id: 'lod2',
        bytes: 4_524_964,
        sha256: '931ff8cce4eef5ad14e663dc928480acaa57e75045f0421e8ec7b3d33db83db4',
        triangles: 1_057,
      }),
    ]),
  }),
  provenance: KYX_ASSAULT_REV40_CC0_REVIEW.provenance,
} as const);

const lod0Url = new URL(
  '../../assets/review/runtime-candidates/g6-assault-rev40-cc0/character-lod0.glb',
  import.meta.url,
).href;
const lod1Url = new URL(
  '../../assets/review/runtime-candidates/g6-assault-rev40-cc0/character-lod1.glb',
  import.meta.url,
).href;
const lod2Url = new URL(
  '../../assets/review/runtime-candidates/g6-assault-rev40-cc0/character-lod2.glb',
  import.meta.url,
).href;

const weaponReadyV4Lod0Url = new URL(
  '../../assets/review/runtime-candidates/g6-assault-rev40-cc0-weapon-ready-v4/character-lod0.glb',
  import.meta.url,
).href;
const weaponReadyV4Lod1Url = new URL(
  '../../assets/review/runtime-candidates/g6-assault-rev40-cc0-weapon-ready-v4/character-lod1.glb',
  import.meta.url,
).href;
const weaponReadyV4Lod2Url = new URL(
  '../../assets/review/runtime-candidates/g6-assault-rev40-cc0-weapon-ready-v4/character-lod2.glb',
  import.meta.url,
).href;

const BASE_REVIEW_VARIANT = Object.freeze({
  candidate: KYX_ASSAULT_REV40_CC0_REVIEW,
  evidenceStatus: 'source-export-complete-browser-player-eye-required' as const,
  assets: Object.freeze({ lod0: lod0Url, lod1: lod1Url, lod2: lod2Url }),
});
const WEAPON_READY_V4_REVIEW_VARIANT = Object.freeze({
  candidate: KYX_ASSAULT_REV40_CC0_WEAPON_READY_V4_REVIEW,
  evidenceStatus: 'source-deformation-pass-browser-weapon-contact-required' as const,
  assets: Object.freeze({
    lod0: weaponReadyV4Lod0Url,
    lod1: weaponReadyV4Lod1Url,
    lod2: weaponReadyV4Lod2Url,
  }),
});

function reviewVariantForRevision(requestedRevision: string | null) {
  if (requestedRevision === KYX_ASSAULT_REV40_CC0_REVIEW.candidateId) {
    return BASE_REVIEW_VARIANT;
  }
  if (
    requestedRevision
      === KYX_ASSAULT_REV40_CC0_WEAPON_READY_V4_REVIEW.candidateId
  ) {
    return WEAPON_READY_V4_REVIEW_VARIANT;
  }
  return null;
}

function selectedPopulation(search: string): 2 | 4 | 8 | null {
  const value = Number(new URLSearchParams(search).get(POPULATION_QUERY_KEY));
  return REVIEW_POPULATIONS.has(value) ? value as 2 | 4 | 8 : null;
}

export function resolveKyxAssaultRev40Cc0ReviewRequest(
  search = typeof window === 'undefined' ? '' : window.location.search,
  mode = import.meta.env.MODE,
) {
  const requestedRevision = new URLSearchParams(search).get(CANDIDATE_QUERY_KEY);
  const explicitlySelected = reviewVariantForRevision(requestedRevision) !== null;
  const allowedEnvironment = mode === 'staging-review' || mode === 'development';
  return Object.freeze({
    selected: allowedEnvironment && explicitlySelected,
    selection: explicitlySelected
      ? allowedEnvironment
        ? 'explicit-review-selection'
        : 'review-request-rejected-in-release'
      : requestedRevision === null
        ? 'not-requested'
        : 'unsupported-review-request',
    requestedRevision,
    population: selectedPopulation(search),
  });
}

export function installKyxAssaultRev40Cc0Review(
  search = typeof window === 'undefined' ? '' : window.location.search,
  mode = import.meta.env.MODE,
) {
  const request = resolveKyxAssaultRev40Cc0ReviewRequest(search, mode);
  if (!request.selected) return Object.freeze({ installed: false, ...request });
  const selectedVariant = reviewVariantForRevision(request.requestedRevision);
  if (selectedVariant === null) {
    throw new Error('KYX_ASSAULT_REV40_REVIEW_SELECTION_DRIFT');
  }
  const { candidate, assets } = selectedVariant;

  const restore = installG6CharacterReviewCandidate(Object.freeze({
    enabled: true,
    default: false,
    revision: candidate.candidateId,
    defaultRevision: null,
    requestedRevision: request.requestedRevision,
    selection: request.selection,
    queryKey: CANDIDATE_QUERY_KEY,
    query: `${CANDIDATE_QUERY_KEY}=${candidate.candidateId}`,
    legacyFallbackQuery: null,
    population: request.population,
    populationQueryKey: POPULATION_QUERY_KEY,
    provenanceSafeDefaultAsset: null,
    thirdPersonAssetPolicy: candidate.candidateId
      === KYX_ASSAULT_REV40_CC0_WEAPON_READY_V4_REVIEW.candidateId
      ? 'staging-review-qualified-cc0-rev40-weapon-ready-v4-candidate'
      : 'staging-review-qualified-cc0-rev40-candidate',
    firstPersonRevision: null,
    assets: Object.freeze({
      lod0: assets.lod0,
      lod1: assets.lod1,
      lod2: assets.lod2,
      firstPerson: null,
    }),
    runtimeScope: 'development-or-staging-review',
    releaseEligible: false,
    humanAccepted: false,
    evidenceStatus: selectedVariant.evidenceStatus,
    sourceCandidate: candidate,
  }));

  if (typeof document !== 'undefined') {
    document.body.dataset.g6Candidate = candidate.candidateId;
    document.body.dataset.g6Review = 'human-required';
  }
  return Object.freeze({ installed: true, ...request, restore });
}
