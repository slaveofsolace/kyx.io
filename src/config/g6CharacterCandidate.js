const QUERY_KEY = 'g6Candidate';
const REVISION = 'rev17';
const POPULATION_QUERY_KEY = 'g6Population';
const REVIEW_POPULATIONS = new Set([2, 4, 8]);

function selectedRevision() {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(QUERY_KEY);
}

function selectedPopulation() {
  if (typeof window === 'undefined') return null;
  const value = Number(
    new URLSearchParams(window.location.search).get(POPULATION_QUERY_KEY),
  );
  return REVIEW_POPULATIONS.has(value) ? value : null;
}

export const G6_CHARACTER_CANDIDATE = Object.freeze({
  enabled: selectedRevision() === REVISION,
  revision: REVISION,
  query: `?${QUERY_KEY}=${REVISION}`,
  population: selectedPopulation(),
  populationQueryKey: POPULATION_QUERY_KEY,
  provenanceSafeDefaultAsset: '/candidates/g6-rev17/character-lod0.glb',
  assets: Object.freeze({
    lod0: '/candidates/g6-rev17/character-lod0.glb',
    lod1: '/candidates/g6-rev17/character-lod1.glb',
    lod2: '/candidates/g6-rev17/character-lod2.glb',
    firstPerson: '/candidates/g6-rev17/first-person.glb',
  }),
});

export function isG6Rev17CharacterCandidateEnabled() {
  return G6_CHARACTER_CANDIDATE.enabled;
}
