const QUERY_KEY = 'g6Candidate';
const POPULATION_QUERY_KEY = 'g6Population';
const REVIEW_POPULATIONS = new Set([2, 4, 8]);
const SUPPORT_HAND_IK_POLICIES = new Set([
  'runtime-ccd',
  'authored-contact-monitor-only',
]);
const DISABLED_ASSETS = Object.freeze({
  lod0: null,
  lod1: null,
  lod2: null,
  firstPerson: null,
});

function defaultSearch() {
  return typeof window === 'undefined' ? '' : window.location.search;
}

function selectedPopulation(search) {
  const value = Number(
    new URLSearchParams(search).get(POPULATION_QUERY_KEY),
  );
  return REVIEW_POPULATIONS.has(value) ? value : null;
}

export function resolveG6CharacterCandidate(search = defaultSearch()) {
  const params = new URLSearchParams(search);
  const requestedRevision = params.get(QUERY_KEY);

  return Object.freeze({
    enabled: false,
    default: false,
    revision: null,
    defaultRevision: null,
    requestedRevision,
    selection: requestedRevision
      ? 'review-only-request-rejected'
      : 'project-authored-procedural-fallback',
    queryKey: QUERY_KEY,
    query: null,
    legacyFallbackQuery: null,
    population: selectedPopulation(search),
    populationQueryKey: POPULATION_QUERY_KEY,
    provenanceSafeDefaultAsset: null,
    thirdPersonAssetPolicy: 'project-authored-procedural-fallback',
    firstPersonRevision: null,
    supportHandIkPolicy: 'runtime-ccd',
    thirdPersonContactProfiles: null,
    assets: DISABLED_ASSETS,
    reviewWorkspace: 'assets/review/runtime-candidates',
    releasePackagePolicy: 'accepted-ledgered-assets-only',
  });
}

export let G6_CHARACTER_CANDIDATE = resolveG6CharacterCandidate();

function requireReviewAssetUrl(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`G6_REVIEW_CANDIDATE_ASSET_MISSING field=${label}`);
  }
  return value;
}

function finitePoint(value, label, nullable = false) {
  if (nullable && value === null) return null;
  if (
    !Array.isArray(value)
    || value.length !== 3
    || value.some((component) => !Number.isFinite(component))
  ) {
    throw new Error(`G6_REVIEW_CONTACT_PROFILE_INVALID field=${label}`);
  }
  return Object.freeze(value.map(Number));
}

function normalizeThirdPersonContactProfiles(profiles) {
  if (profiles == null) return null;
  if (typeof profiles !== 'object' || Array.isArray(profiles)) {
    throw new Error('G6_REVIEW_CONTACT_PROFILE_INVALID field=profiles');
  }
  const normalized = Object.create(null);
  for (const [weaponId, profile] of Object.entries(profiles)) {
    if (
      weaponId.length === 0
      || profile == null
      || typeof profile !== 'object'
      || Array.isArray(profile)
      || !Number.isFinite(profile.uniformScale)
      || profile.uniformScale <= 0
    ) {
      throw new Error(
        `G6_REVIEW_CONTACT_PROFILE_INVALID field=${weaponId}`,
      );
    }
    normalized[weaponId] = Object.freeze({
      uniformScale: Number(profile.uniformScale),
      gripPoint: finitePoint(profile.gripPoint, `${weaponId}.gripPoint`),
      supportPoint: finitePoint(
        profile.supportPoint,
        `${weaponId}.supportPoint`,
        true,
      ),
    });
  }
  return Object.freeze(normalized);
}

/**
 * Install an isolated visual-review candidate before Game/HumanSoldier modules
 * are imported. Normal production never calls this seam, so unaccepted GLBs
 * remain outside both the default runtime and the release asset ledger.
 */
export function installG6CharacterReviewCandidate(candidate) {
  const supportHandIkPolicy = candidate?.supportHandIkPolicy ?? 'runtime-ccd';
  if (
    !candidate
    || candidate.enabled !== true
    || candidate.default !== false
    || candidate.releaseEligible !== false
    || candidate.humanAccepted !== false
    || candidate.runtimeScope !== 'development-or-staging-review'
    || typeof candidate.revision !== 'string'
    || candidate.revision.length === 0
    || !SUPPORT_HAND_IK_POLICIES.has(supportHandIkPolicy)
  ) {
    throw new Error('G6_REVIEW_CANDIDATE_POLICY_MISMATCH');
  }

  const thirdPersonContactProfiles = normalizeThirdPersonContactProfiles(
    candidate.thirdPersonContactProfiles,
  );
  if (
    supportHandIkPolicy === 'authored-contact-monitor-only'
    && (
      thirdPersonContactProfiles === null
      || Object.keys(thirdPersonContactProfiles).length === 0
    )
  ) {
    throw new Error(
      'G6_REVIEW_CONTACT_PROFILE_INVALID field=authored-contact-monitor-only',
    );
  }

  const previous = G6_CHARACTER_CANDIDATE;
  const installed = Object.freeze({
    ...candidate,
    supportHandIkPolicy,
    thirdPersonContactProfiles,
    assets: Object.freeze({
      lod0: requireReviewAssetUrl(candidate.assets?.lod0, 'lod0'),
      lod1: requireReviewAssetUrl(candidate.assets?.lod1, 'lod1'),
      lod2: requireReviewAssetUrl(candidate.assets?.lod2, 'lod2'),
      firstPerson: candidate.assets?.firstPerson ?? null,
    }),
    reviewWorkspace: 'assets/review/runtime-candidates',
    releasePackagePolicy: 'staging-review-only-excluded-from-production',
  });
  G6_CHARACTER_CANDIDATE = installed;

  return () => {
    if (G6_CHARACTER_CANDIDATE === installed) {
      G6_CHARACTER_CANDIDATE = previous;
    }
  };
}

export function isG6CharacterCandidateEnabled() {
  return G6_CHARACTER_CANDIDATE.enabled === true;
}

// Compatibility helper for the legacy selection API. Non-release files must
// never be fetched by the browser or copied into a release package.
export function isG6Rev17CharacterCandidateEnabled() {
  return G6_CHARACTER_CANDIDATE.enabled === true
    && typeof G6_CHARACTER_CANDIDATE.assets.firstPerson === 'string';
}

export function isG6Rev17ThirdPersonFallbackSelected() {
  return false;
}
