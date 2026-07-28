const QUERY_KEY = 'g6Candidate';
const DEFAULT_REVISION = 'rev30';
const LEGACY_REVISION = 'rev17';
const POPULATION_QUERY_KEY = 'g6Population';
const REVIEW_POPULATIONS = new Set([2, 4, 8]);
const REV30_THIRD_PERSON_ASSET =
  '/candidates/g6-rev30-cc0-donor/character-lod0.glb';

const REVISION_ASSETS = Object.freeze({
  rev30: Object.freeze({
    // Rev30 currently has one authored low-poly third-person export. The
    // loader's player (lod0) and enemy (lod1) slots deliberately share these
    // exact bytes; this is not a claim that a distinct Rev30 LOD1 exists.
    lod0: REV30_THIRD_PERSON_ASSET,
    lod1: REV30_THIRD_PERSON_ASSET,
    lod2: null,
    // Rev30 did not author a first-person derivative. Keep the provenance-safe
    // Rev17 viewmodel until that separate lane is accepted.
    firstPerson: '/candidates/g6-rev17/first-person.glb',
  }),
  rev17: Object.freeze({
    lod0: '/candidates/g6-rev17/character-lod0.glb',
    lod1: '/candidates/g6-rev17/character-lod1.glb',
    lod2: '/candidates/g6-rev17/character-lod2.glb',
    firstPerson: '/candidates/g6-rev17/first-person.glb',
  }),
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
  const revision = requestedRevision === LEGACY_REVISION
    ? LEGACY_REVISION
    : DEFAULT_REVISION;
  const selection = requestedRevision === LEGACY_REVISION
    ? 'legacy-query-fallback'
    : requestedRevision === DEFAULT_REVISION
      ? 'explicit-default'
      : requestedRevision
        ? 'unsupported-query-fell-back-to-default'
        : 'default';
  const assets = REVISION_ASSETS[revision];

  return Object.freeze({
    enabled: true,
    revision,
    defaultRevision: DEFAULT_REVISION,
    requestedRevision,
    selection,
    queryKey: QUERY_KEY,
    query: `?${QUERY_KEY}=${revision}`,
    legacyFallbackQuery: `?${QUERY_KEY}=${LEGACY_REVISION}`,
    population: selectedPopulation(search),
    populationQueryKey: POPULATION_QUERY_KEY,
    provenanceSafeDefaultAsset: REV30_THIRD_PERSON_ASSET,
    thirdPersonAssetPolicy: revision === DEFAULT_REVISION
      ? 'single-rev30-lod0-shared-by-player-and-enemy'
      : 'rev17-authored-lod-fallback',
    firstPersonRevision: LEGACY_REVISION,
    assets,
  });
}

export const G6_CHARACTER_CANDIDATE = resolveG6CharacterCandidate();

export function isG6CharacterCandidateEnabled() {
  return G6_CHARACTER_CANDIDATE.enabled;
}

// Backward-compatible pipeline helper. WeaponSystem uses this historical name
// to gate the retained Rev17 first-person viewmodel, so it must stay true while
// the mixed Rev30-third-person / Rev17-first-person pipeline is active.
export function isG6Rev17CharacterCandidateEnabled() {
  return G6_CHARACTER_CANDIDATE.enabled;
}

export function isG6Rev17ThirdPersonFallbackSelected() {
  return G6_CHARACTER_CANDIDATE.revision === LEGACY_REVISION;
}
