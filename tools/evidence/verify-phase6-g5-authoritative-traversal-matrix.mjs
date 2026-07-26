import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  auditCurrentSourceClosure,
  canonicalJsonSha256,
  jsonBytes,
  PROVENANCE_PROOF_PATH,
  PROVENANCE_VERIFICATION_PATH,
  REPO_ROOT,
  sha256,
  SOURCE_CLOSURE_PATH,
} from './capture-phase6-g5-authoritative-traversal-matrix.provenance.mjs';

function argumentValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${name}.`);
  }
  return value;
}

const proofPath = argumentValue('--proof', PROVENANCE_PROOF_PATH);
const sourceClosurePath = argumentValue('--source-closure', SOURCE_CLOSURE_PATH);
const legacyOutput = process.argv[2]?.startsWith('--') ? null : process.argv[2];
const verificationPath = argumentValue(
  '--output',
  legacyOutput ?? PROVENANCE_VERIFICATION_PATH,
);
const stdoutOnly = process.argv.includes('--stdout-only');
const requireCurrentRepositoryState = process.argv.includes(
  '--require-current-repository-state',
);

const sourcePaths = Object.freeze({
  revision2Collision:
    'assets/source/maps/inkfall-foundry/revisions/revision-2/export/collision.authority.glb',
  revision3Collision:
    'assets/source/maps/inkfall-foundry/revisions/revision-3/export/collision.authority.glb',
  revision3Fixture:
    'assets/source/maps/inkfall-foundry/runtime/combat-authority-fixture.g5-revision3.v1.json',
  playtestTapes:
    'assets/source/maps/inkfall-foundry/runtime/playtest-tapes.p6-6.v2.json',
  spawnFixtures:
    'assets/source/maps/inkfall-foundry/runtime/spawn-fixtures.p6-4.v2.json',
  topologySeed:
    'assets/source/maps/inkfall-foundry/inkfall-foundry.layout-seed.v1.json',
  revision2Manifest:
    'assets/source/maps/inkfall-foundry/runtime/map.package.v2.json',
  revision3Manifest:
    'assets/source/maps/inkfall-foundry/runtime/map.package.v3.json',
  packageManifest: 'package.json',
  dependencyLock: 'package-lock.json',
});

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function fileHash(relativePath) {
  return sha256(await readFile(resolve(REPO_ROOT, relativePath)));
}

const proofFileBytes = await readFile(resolve(REPO_ROOT, proofPath));
const proof = JSON.parse(proofFileBytes.toString('utf8'));
const sourceClosureFileBytes = await readFile(resolve(REPO_ROOT, sourceClosurePath));
const sourceClosure = JSON.parse(sourceClosureFileBytes.toString('utf8'));
const sourceClosureFileSha256 = sha256(sourceClosureFileBytes);
const sourceClosureAudit = await auditCurrentSourceClosure(sourceClosure);
const closureEntryByPath = new Map(
  sourceClosure.criticalSources.map((entry) => [entry.path, entry]),
);

const reconstructedDeterministicCore = {
  revision2AuthoritySuiteHash: proof.revision2AuthorityPlaytest.suiteHash,
  revision2ScenarioReplayHashes: proof.revision2AuthorityPlaytest.scenarios.map(
    ({ replayHash }) => replayHash,
  ),
  revision3SnagRepairResult: proof.revision3CanonicalPressJunction.result,
  revision3WestArchiveApproach: proof.revision3WestArchive.approach,
  revision3WestArchiveEscape: proof.revision3WestArchive.escape,
};
const reconstructedCoreSha256 = canonicalJsonSha256(reconstructedDeterministicCore);

const sourceHashChecks = [
  {
    path: sourcePaths.revision2Collision,
    expected: proof.bindings.revision2.collisionSha256,
  },
  {
    path: sourcePaths.revision3Collision,
    expected: proof.bindings.revision3.collisionSha256,
  },
  {
    path: sourcePaths.revision3Fixture,
    expected: proof.bindings.revision3.fixtureSnapshotSha256,
  },
  {
    path: sourcePaths.playtestTapes,
    expected: proof.bindings.revision2.playtestTapesSha256,
  },
  {
    path: sourcePaths.spawnFixtures,
    expected: proof.bindings.revision2.spawnFixturesSha256,
  },
  {
    path: sourcePaths.topologySeed,
    expected: proof.bindings.revision2.topologySeedSha256,
  },
  {
    path: sourcePaths.revision2Manifest,
    expected: closureEntryByPath.get(sourcePaths.revision2Manifest)?.sha256,
  },
  {
    path: sourcePaths.revision3Manifest,
    expected: closureEntryByPath.get(sourcePaths.revision3Manifest)?.sha256,
  },
  {
    path: sourcePaths.packageManifest,
    expected: closureEntryByPath.get(sourcePaths.packageManifest)?.sha256,
  },
  {
    path: sourcePaths.dependencyLock,
    expected: closureEntryByPath.get(sourcePaths.dependencyLock)?.sha256,
  },
];
for (const entry of sourceHashChecks) {
  entry.actual = await fileHash(entry.path);
  entry.matches = entry.actual === entry.expected;
}

const revision2Totals = {
  scenarioCount: 3,
  playerArrangements: [2, 4, 8],
  agentCount: 14,
  completedAgentCount: 14,
  routeTapeCount: 70,
  completedRouteTapeCount: 70,
  routeMetricCount: 20,
  routeMetricPassCount: 20,
  embedSamples: 0,
  snagEvents: 0,
  retainedBodyOverlapSamples: 0,
  recoveryEntries: 0,
  killEntries: 0,
};
const westArchiveTotals = {
  approachProbeCount: 9,
  approachPassCount: 9,
  approachSeededOverlapCount: 2,
  approachSuccessfulRecoveryCount: 2,
  approachFailedRecoveryCount: 0,
  approachStartingOverlapCount: 2,
  approachFinalOverlapCount: 0,
  escapeProbeCount: 4,
  escapePassCount: 4,
  escapeSuccessfulRecoveryCount: 0,
  escapeFailedRecoveryCount: 0,
  escapeFinalOverlapCount: 0,
};

const exactWestArchive = proof.revision3WestArchive.approach.find(
  ({ id }) => id === 'exact_runtime_v45_face',
);
const seededRecoveryProbes = proof.revision3WestArchive.approach.filter(
  ({ expectedStartingState }) => expectedStartingState === 'seeded_overlap_recovery',
);

const checks = [
  ['bounded status explicitly leaves G5 open',
    proof.status === 'BOUNDED_DETERMINISTIC_PASS_G5_OPEN'
      && proof.nonClaims.includes('G5_NOT_PASSED')],
  ['proof binds the exact standalone source closure',
    proof.provenance?.sourceClosurePath === sourceClosurePath
      && proof.provenance?.sourceClosureSha256 === sourceClosureFileSha256
      && proof.provenance?.sourceClosureCoreSha256 === sourceClosure.closureCoreSha256
      && proof.provenance?.criticalSourcesDigestSha256
        === sourceClosure.criticalSourcesDigestSha256
      && proof.provenance?.criticalSourceCount === sourceClosure.criticalSources.length
      && proof.provenance?.repositoryStateDigestSha256
        === sourceClosure.repository.repositoryStateDigestSha256],
  ['source-closure core and required path set are internally exact',
    sourceClosureAudit.closureCoreDigestMatches
      && sourceClosureAudit.criticalSourcePathClosureExact
      && sourceClosureAudit.criticalSourcesDigestMatches],
  ['all critical source bytes still match the captured closure',
    sourceClosureAudit.criticalSourcesMatch],
  ['current HEAD and dirty tree match when strict current-state audit is requested',
    !requireCurrentRepositoryState || sourceClosureAudit.repositoryStateMatches],
  ['movement and authority bindings are exact',
    proof.bindings.movementProfileId === 'phase3_hypothesis_v1'
      && proof.bindings.movementProfileRevision === 1
      && proof.bindings.physicsAdapterVersion === '0.19.3'
      && proof.bindings.authorityRateHz === 20],
  ['revision identities are separated and exact',
    proof.bindings.revision2.mapRevision === 2
      && proof.bindings.revision2.packageDigest
        === '77a7b6c41416f9caaf615f3af5dacda1153cee65a239c04f2004e30fc1663520'
      && proof.bindings.revision2.fixtureHash === 'bf85e42731fd088e'
      && proof.bindings.revision3.mapRevision === 3
      && proof.bindings.revision3.packageDigest
        === 'c769eba175a7d1bcef92167b9f997a6b72d0e50c29f3d171bd66ce911a9ea161'
      && proof.bindings.revision3.fixtureHash === '31fea7ee73a12b91'],
  ['all bound collision, fixture, manifest, and lock hashes recompute',
    sourceHashChecks.every(({ matches }) => matches)],
  ['deterministic core hash recomputes',
    reconstructedCoreSha256 === proof.deterministicCoreSha256],
  ['revision-2 authority suite repeated byte-identically',
    proof.revision2AuthorityPlaytest.repeatedReplayByteIdentical === true
      && proof.revision2AuthorityPlaytest.suiteHash === '143d09532b9c2b24'
      && same(
        proof.revision2AuthorityPlaytest.scenarios.map(({ replayHash }) => replayHash),
        ['92aa8378d2e0d27e', '2010f3a3d1897f31', '909814a9d725d187'],
      )],
  ['2/4/8 routes and metrics all complete without deterministic defects',
    same(proof.revision2AuthorityPlaytest.totals, revision2Totals)
      && proof.revision2AuthorityPlaytest.issueCount === 0
      && proof.revision2AuthorityPlaytest.allAutomatedThresholdsPassed === true
      && proof.revision2AuthorityPlaytest.scenarios.every((scenario) => (
        scenario.status === 'PASS'
        && scenario.agentCount === scenario.completedAgentCount
        && scenario.routeTapeCount === scenario.completedRouteTapeCount
        && scenario.routeMetricCount === scenario.routeMetricPassCount
        && scenario.embedSamples === 0
        && scenario.snagEvents === 0
        && scenario.retainedBodyOverlapSamples === 0
        && scenario.recoveryEntries === 0
        && scenario.killEntries === 0
      ))],
  ['recovery-volume, priority, and post-recovery escape probes all pass',
    proof.revision2AuthorityPlaytest.scenarios.every((scenario) => (
      scenario.recoveryProbePassed
      && scenario.killPriorityProbePassed
      && scenario.postRecoveryEscapePassed
    ))],
  ['old P5.15 revision-2 embed still fails closed',
    proof.revision3CanonicalPressJunction.exactRevision2.moveOutcome === 'ERROR'
      && proof.revision3CanonicalPressJunction.exactRevision2.error
        === 'PHYSICS_DEPENETRATION_FAILED'],
  ['revision-3 canonical junction and seven adjacent lanes are clear',
    proof.revision3CanonicalPressJunction.result.deterministicCandidatePass === true
      && proof.revision3CanonicalPressJunction.result.adjacentLaneCount === 7
      && proof.revision3CanonicalPressJunction.result.adjacentLaneRecoveryCount === 0
      && proof.revision3CanonicalPressJunction.result.adjacentLaneOverlapCount === 0],
  ['west-archive approach and inferred depenetration totals are exact',
    same(proof.revision3WestArchive.totals, westArchiveTotals)
      && proof.revision3WestArchive.recoveryCountSemantics
        === 'BOUNDED_INFERRED_OBSERVATION_FROM_STARTING_OVERLAP_AND_FINAL_CLEAR_NOT_PRODUCTION_TELEMETRY'
      && seededRecoveryProbes.length === 2
      && seededRecoveryProbes.every((probe) => (
        probe.startingOverlap.blockingColliderIds.length === 1
        && probe.successfulRecoveryCount === 1
        && probe.recoveryObservation
          === 'BOUNDED_INFERRED_START_OVERLAP_TO_FINAL_CLEAR'
        && probe.productionRecoveryTelemetryObserved === false
        && probe.outcome === 'PASS'
        && probe.finalOverlap.blockingColliderIds.length === 0
      ))],
  ['exact runtime-v45 face reconciles to the pinned clear position',
    exactWestArchive?.outcome === 'PASS'
      && same(exactWestArchive.move.appliedTranslation, { x: 66, y: 0, z: -22 })
      && same(exactWestArchive.finalFeet, { x: -23958, y: 37, z: 402 })
      && exactWestArchive.finalOverlap.blockingColliderIds.length === 0
      && exactWestArchive.move.contacts.length === 2
      && exactWestArchive.move.contacts.every(({ colliderId }) => (
        colliderId === 'map_collision_route_west_choice_archive_s00'
      ))],
  ['four west-archive escape vectors remain clear',
    proof.revision3WestArchive.escape.length === 4
      && proof.revision3WestArchive.escape.every((probe) => (
        probe.outcome === 'PASS'
        && probe.startingOverlap.blockingColliderIds.length === 0
        && probe.finalOverlap.blockingColliderIds.length === 0
        && probe.appliedDistanceMm >= 50
      ))],
  ['required product, human, and recovery-telemetry nonclaims remain explicit',
    [
      'SYNTHETIC_AUTOMATED_MATRIX_ONLY',
      'REVISION_3_NOT_DEFAULT_OR_PROMOTED',
      'EXACT_PRODUCT_BROWSER_ROUTE_NOT_REPLAYED',
      'HUMAN_2_4_8_PLAYTEST_NOT_RUN',
      'HUMAN_FUN_COUNTERPLAY_AND_READABILITY_NOT_ACCEPTED',
      'FINAL_ART_AND_PERFORMANCE_NOT_ACCEPTED',
      'RECOVERY_COUNTS_ARE_BOUNDED_INFERENCES_NOT_PRODUCTION_TELEMETRY',
      'G5_NOT_PASSED',
    ].every((nonClaim) => proof.nonClaims.includes(nonClaim))],
].map(([name, passed]) => ({ name, passed: Boolean(passed) }));

const verification = {
  schemaVersion: 2,
  status: checks.every(({ passed }) => passed)
    ? 'G5_PROVENANCE_CLOSED_TRAVERSAL_MATRIX_VERIFIED_G5_OPEN'
    : 'G5_PROVENANCE_CLOSED_TRAVERSAL_MATRIX_VERIFICATION_FAILED',
  proofPath,
  proofSha256: sha256(proofFileBytes),
  sourceClosurePath,
  sourceClosureSha256: sourceClosureFileSha256,
  sourceClosureCoreSha256: sourceClosure.closureCoreSha256,
  reconstructedCoreSha256,
  requireCurrentRepositoryState,
  sourceClosureAudit: {
    closureCoreDigestMatches: sourceClosureAudit.closureCoreDigestMatches,
    criticalSourcePathClosureExact:
      sourceClosureAudit.criticalSourcePathClosureExact,
    criticalSourcesDigestMatches:
      sourceClosureAudit.criticalSourcesDigestMatches,
    criticalSourcesMatch: sourceClosureAudit.criticalSourcesMatch,
    repositoryStateMatches: sourceClosureAudit.repositoryStateMatches,
    recordedRepositoryStateDigestSha256:
      sourceClosureAudit.recordedRepositoryStateDigestSha256,
    currentRepositoryStateDigestSha256:
      sourceClosureAudit.currentRepositoryStateDigestSha256,
  },
  sourceHashChecks,
  checks,
  passedChecks: checks.filter(({ passed }) => passed).length,
  totalChecks: checks.length,
  nonClaims: [
    'CONSISTENCY_VERIFIER_DOES_NOT_REPLACE_LIVE_SIMULATION_RERUN',
    'PRODUCT_BROWSER_REVISION_3_REPLAY_NOT_RUN',
    'HUMAN_2_4_8_PLAYTEST_NOT_RUN',
    'G5_NOT_PASSED',
  ],
};

if (!stdoutOnly) {
  await writeFile(resolve(REPO_ROOT, verificationPath), jsonBytes(verification), {
    flag: 'wx',
  });
}

if (verification.passedChecks !== verification.totalChecks) {
  process.stderr.write(`${JSON.stringify(verification, null, 2)}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify({
    status: verification.status,
    proofSha256: verification.proofSha256,
    sourceClosureSha256: verification.sourceClosureSha256,
    repositoryStateMatches:
      verification.sourceClosureAudit.repositoryStateMatches,
    passedChecks: verification.passedChecks,
    totalChecks: verification.totalChecks,
    stdoutOnly,
  }, null, 2)}\n`);
}
