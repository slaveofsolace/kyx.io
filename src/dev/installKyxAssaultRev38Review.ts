import {
  installG6CharacterReviewCandidate,
} from '../config/g6CharacterCandidate.js';

const CANDIDATE_QUERY_KEY = 'g6Candidate';
const POPULATION_QUERY_KEY = 'g6Population';
const REVIEW_POPULATIONS = new Set([2, 4, 8]);

export const KYX_ASSAULT_REV38_REVIEW = Object.freeze({
  candidateId: 'rev38-fitted-v1',
  displayName: 'KYX Assault Rev38 fitted',
  rigBones: 66,
  animationClips: 16,
  embeddedWeapon: false,
  releaseEligible: false,
  humanAccepted: false,
  assets: Object.freeze({
    lod0: Object.freeze({
      bytes: 14_544_296,
      sha256: 'bf0daeee910ce0acf486df9918a1dafc301065fd2ac31ff304b6dee6901a3dcc',
      triangles: 3_134,
    }),
    lod1: Object.freeze({
      bytes: 14_506_216,
      sha256: '1141532d674cfd9ebd2ea4380b1485fef71e234cbffbd4adb2fc8741ade8a929',
      triangles: 2_318,
    }),
    lod2: Object.freeze({
      bytes: 14_473_100,
      sha256: '6258bbb1ee09c5dc4e46e0cccaa3dda826096a5add1d5948380c12dc23bcd7a3',
      triangles: 1_628,
    }),
  }),
} as const);

const lod0Url = new URL(
  '../../assets/review/runtime-candidates/g6-assault-rev38-fitted-v1/kyx-v6b-assault-rev38-fitted-v1-lod0.glb',
  import.meta.url,
).href;
const lod1Url = new URL(
  '../../assets/review/runtime-candidates/g6-assault-rev38-fitted-v1/kyx-v6b-assault-rev38-fitted-v1-lod1.glb',
  import.meta.url,
).href;
const lod2Url = new URL(
  '../../assets/review/runtime-candidates/g6-assault-rev38-fitted-v1/kyx-v6b-assault-rev38-fitted-v1-lod2.glb',
  import.meta.url,
).href;

function selectedPopulation(search: string): 2 | 4 | 8 | null {
  const value = Number(new URLSearchParams(search).get(POPULATION_QUERY_KEY));
  return REVIEW_POPULATIONS.has(value) ? value as 2 | 4 | 8 : null;
}

export function resolveKyxAssaultRev38ReviewRequest(
  search = typeof window === 'undefined' ? '' : window.location.search,
  mode = import.meta.env.MODE,
) {
  const requestedRevision = new URLSearchParams(search).get(CANDIDATE_QUERY_KEY);
  const stagingDefault = mode === 'staging-review' && requestedRevision === null;
  const explicitlySelected = requestedRevision === KYX_ASSAULT_REV38_REVIEW.candidateId;
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

export function installKyxAssaultRev38Review(
  search = typeof window === 'undefined' ? '' : window.location.search,
  mode = import.meta.env.MODE,
) {
  const request = resolveKyxAssaultRev38ReviewRequest(search, mode);
  if (!request.selected) return Object.freeze({ installed: false, ...request });

  const restore = installG6CharacterReviewCandidate(Object.freeze({
    enabled: true,
    default: false,
    revision: KYX_ASSAULT_REV38_REVIEW.candidateId,
    defaultRevision: null,
    requestedRevision: request.requestedRevision,
    selection: request.selection,
    queryKey: CANDIDATE_QUERY_KEY,
    query: `${CANDIDATE_QUERY_KEY}=${KYX_ASSAULT_REV38_REVIEW.candidateId}`,
    legacyFallbackQuery: null,
    population: request.population,
    populationQueryKey: POPULATION_QUERY_KEY,
    provenanceSafeDefaultAsset: null,
    thirdPersonAssetPolicy: 'staging-review-only-unaccepted-glb',
    firstPersonRevision: null,
    assets: Object.freeze({
      lod0: lod0Url,
      lod1: lod1Url,
      lod2: lod2Url,
      firstPerson: null,
    }),
    runtimeScope: 'development-or-staging-review',
    releaseEligible: false,
    humanAccepted: false,
    evidenceStatus: 'structural-pass-human-player-eye-required',
    sourceCandidate: KYX_ASSAULT_REV38_REVIEW,
  }));

  if (typeof document !== 'undefined') {
    document.body.dataset.g6Candidate = KYX_ASSAULT_REV38_REVIEW.candidateId;
    document.body.dataset.g6Review = 'human-required';
  }
  return Object.freeze({ installed: true, ...request, restore });
}
