import {
  installG6CharacterReviewCandidate,
} from '../config/g6CharacterCandidate.js';

const CANDIDATE_QUERY_KEY = 'g6Candidate';
const POPULATION_QUERY_KEY = 'g6Population';
const REVIEW_POPULATIONS = new Set([2, 4, 8]);

export const KYX_ASSAULT_REV39_ARMORED_REVIEW = Object.freeze({
  candidateId: 'rev39-armored-restore-v1',
  displayName: 'KYX Assault Rev39 armored restore',
  sourceRevision: 'rev30-cc0-donor',
  sourceDisposition: 'rejected-review-source',
  rigBones: 66,
  animationClips: 16,
  embeddedDiagnosticWeapon: 'hidden-by-runtime',
  distinctAuthoredLods: false,
  releaseEligible: false,
  humanAccepted: false,
  sourceAsset: Object.freeze({
    bytes: 15_025_320,
    sha256: '24e742efe1d596e0efcc4fed73fb527346049b29a7b0782a9b93b0719a2e49ed',
    triangles: 10_748,
    provenance: 'Sci-fi Soldier by Irondust, CC0-1.0',
  }),
} as const);

const sourceLod0Url = new URL(
  '../../assets/review/runtime-candidates/g6-rev30-cc0-donor/character-lod0.glb',
  import.meta.url,
).href;

function selectedPopulation(search: string): 2 | 4 | 8 | null {
  const value = Number(new URLSearchParams(search).get(POPULATION_QUERY_KEY));
  return REVIEW_POPULATIONS.has(value) ? value as 2 | 4 | 8 : null;
}

export function resolveKyxAssaultRev39ArmoredReviewRequest(
  search = typeof window === 'undefined' ? '' : window.location.search,
  mode = import.meta.env.MODE,
) {
  const requestedRevision = new URLSearchParams(search).get(CANDIDATE_QUERY_KEY);
  const stagingDefault = mode === 'staging-review' && requestedRevision === null;
  const explicitlySelected = requestedRevision
    === KYX_ASSAULT_REV39_ARMORED_REVIEW.candidateId;
  const allowedEnvironment = mode === 'staging-review' || mode === 'development';
  return Object.freeze({
    selected: allowedEnvironment && (stagingDefault || explicitlySelected),
    selection: stagingDefault
      ? 'staging-review-default'
      : explicitlySelected
        ? 'explicit-review-selection'
        : requestedRevision === null
          ? 'not-requested'
          : 'unsupported-review-request',
    requestedRevision,
    population: selectedPopulation(search),
  });
}

export function installKyxAssaultRev39ArmoredReview(
  search = typeof window === 'undefined' ? '' : window.location.search,
  mode = import.meta.env.MODE,
) {
  const request = resolveKyxAssaultRev39ArmoredReviewRequest(search, mode);
  if (!request.selected) return Object.freeze({ installed: false, ...request });

  const restore = installG6CharacterReviewCandidate(Object.freeze({
    enabled: true,
    default: false,
    revision: KYX_ASSAULT_REV39_ARMORED_REVIEW.candidateId,
    defaultRevision: null,
    requestedRevision: request.requestedRevision,
    selection: request.selection,
    queryKey: CANDIDATE_QUERY_KEY,
    query: `${CANDIDATE_QUERY_KEY}=${KYX_ASSAULT_REV39_ARMORED_REVIEW.candidateId}`,
    legacyFallbackQuery: null,
    population: request.population,
    populationQueryKey: POPULATION_QUERY_KEY,
    provenanceSafeDefaultAsset: null,
    thirdPersonAssetPolicy: 'staging-review-rejected-source-runtime-restoration',
    firstPersonRevision: null,
    assets: Object.freeze({
      // This bounded restoration intentionally reuses the one preserved source
      // LOD for both runtime distances. No distinct LOD1/LOD2 claim is made.
      lod0: sourceLod0Url,
      lod1: sourceLod0Url,
      lod2: sourceLod0Url,
      firstPerson: null,
    }),
    runtimeScope: 'development-or-staging-review',
    releaseEligible: false,
    humanAccepted: false,
    evidenceStatus: 'restored-armored-source-human-player-eye-required',
    sourceCandidate: KYX_ASSAULT_REV39_ARMORED_REVIEW,
  }));

  if (typeof document !== 'undefined') {
    document.body.dataset.g6Candidate = KYX_ASSAULT_REV39_ARMORED_REVIEW.candidateId;
    document.body.dataset.g6Review = 'human-required';
  }
  return Object.freeze({ installed: true, ...request, restore });
}
