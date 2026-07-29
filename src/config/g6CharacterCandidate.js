const QUERY_KEY = 'g6Candidate';
const POPULATION_QUERY_KEY = 'g6Population';
const REVIEW_POPULATIONS = new Set([2, 4, 8]);
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
    assets: DISABLED_ASSETS,
    reviewWorkspace: 'assets/review/runtime-candidates',
    releasePackagePolicy: 'accepted-ledgered-assets-only',
  });
}

export const G6_CHARACTER_CANDIDATE = resolveG6CharacterCandidate();

export function isG6CharacterCandidateEnabled() {
  return false;
}

// Backward-compatible pipeline helper retained while callers migrate away from
// the rejected Rev17/Rev30 review assets. Review-only files must never be
// fetched by the browser or copied into a release package.
export function isG6Rev17CharacterCandidateEnabled() {
  return false;
}

export function isG6Rev17ThirdPersonFallbackSelected() {
  return false;
}
