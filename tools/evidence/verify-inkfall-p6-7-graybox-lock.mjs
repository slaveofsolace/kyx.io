import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const evidenceRoot = 'evidence/2026-07-22/phase-6-p6-7-graybox-lock';
const summaryPath = `${evidenceRoot}/p6-7-summary.json`;
const verificationPath = process.argv[2] ?? `${evidenceRoot}/p6-7-verification.json`;

async function json(relativePath) {
  return JSON.parse(await readFile(resolve(repoRoot, relativePath), 'utf8'));
}

async function sha256(relativePath) {
  return createHash('sha256')
    .update(await readFile(resolve(repoRoot, relativePath)))
    .digest('hex');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

function canonicalSha256(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function moduleById(artKit, id) {
  return artKit.moduleFamilies.flatMap(({ modules }) => modules)
    .find((module) => module.id === id);
}

const summary = await json(summaryPath);
const lock = await json('assets/source/maps/inkfall-foundry/runtime/graybox-lock.p6-7.v1.json');
const artKit = await json(
  'assets/source/maps/inkfall-foundry/art-kit/graybox-dimensions.p6-7.v1.json',
);
const seed = await json('assets/source/maps/inkfall-foundry/inkfall-foundry.layout-seed.v1.json');
const mapPackage = await json('assets/source/maps/inkfall-foundry/runtime/map.package.v2.json');
const tape = await json('assets/source/maps/inkfall-foundry/runtime/playtest-tapes.p6-6.v2.json');
const raw = await json(
  'evidence/2026-07-22/phase-6-p6-6b-residual-correction/corrected/authority-playtest-raw.json',
);
const revision2Sweep = await json(`${evidenceRoot}/adjacent/p6-2-revision2-lock-rerun-pass.json`);
const revision2FailedSweep = await json(
  `${evidenceRoot}/adjacent/p6-2-revision2-lock-rerun.json`,
);
const revision1Sweep = await json(`${evidenceRoot}/adjacent/p6-2-revision1-regression.json`);
const validation = await json(`${evidenceRoot}/validation-results.json`);
const catalogSource = await readFile(resolve(repoRoot, 'src/content/maps/catalog.ts'), 'utf8');

const hashChecks = [];
for (const [kind, inventory] of [
  ['source', summary.sourceInventory],
  ['evidence', summary.evidenceInventory],
]) {
  for (const [path, expectedSha256] of Object.entries(inventory)) {
    const actualSha256 = await sha256(path);
    hashChecks.push({
      kind,
      path,
      expectedSha256,
      actualSha256,
      matches: actualSha256 === expectedSha256,
    });
  }
}

const sourceSetChecks = [];
for (const source of lock.frozenSourceSet) {
  const actualSha256 = await sha256(source.path);
  sourceSetChecks.push({
    role: source.role,
    path: source.path,
    expectedSha256: source.sha256,
    actualSha256,
    matches: actualSha256 === source.sha256,
  });
}

const projections = {
  topology: {
    boundsMm: seed.boundsMm,
    verticalTiers: seed.verticalTiers,
    zones: seed.zones,
    nodes: seed.nodes,
    links: seed.links,
    strongPositions: seed.strongPositions,
    movementFeatures: seed.movementFeatures,
  },
  zones: seed.zones,
  nodes: seed.nodes,
  links: seed.links,
  strongPositions: seed.strongPositions,
  runtimeSpawns: mapPackage.spawns,
  seedSpawns: seed.spawnCandidates,
  routeMetrics: seed.routeMetrics,
  authorityTapeScenarios: tape.scenarios,
  movementSizing: seed.movementSizing,
  coordinateAndGrid: {
    units: seed.units,
    coordinateSystem: seed.coordinateSystem,
    grid: seed.grid,
  },
  seedArtModules: seed.coverAndClearance.modules,
  runtimeFunctionalPackage: {
    boundsMm: mapPackage.boundsMm,
    zones: mapPackage.zones,
    spawns: mapPackage.spawns,
    pickups: mapPackage.pickups,
    triggers: mapPackage.triggers,
    authorityVolumes: mapPackage.authorityVolumes,
    authority: mapPackage.authority,
  },
};
const fingerprintChecks = Object.entries(projections).map(([name, projection]) => ({
  name,
  expectedSha256: lock.frozenContractFingerprints[name]?.sha256,
  actualSha256: canonicalSha256(projection),
  matches: canonicalSha256(projection) === lock.frozenContractFingerprints[name]?.sha256,
}));

const requiredFamilies = [
  'structural_bays',
  'walls',
  'corners',
  'columns',
  'floors',
  'ramps',
  'stairs',
  'platforms',
  'rails',
  'door_frames',
  'cover',
  'vents_and_crouch_tunnels',
  'ink_conduits',
  'garden_fragments',
  'trims_and_decals',
  'landmark_hero_pieces',
];
const familyIds = artKit.moduleFamilies.map(({ id }) => id);
const materialIds = new Set(artKit.materialSlots.map(({ id }) => id));
const modules = artKit.moduleFamilies.flatMap((family) => (
  family.modules.map((module) => ({ family, module }))
));
const moduleIds = modules.map(({ module }) => module.id);
const moduleContractsValid = modules.every(({ family, module }) => {
  const dimensions = Object.values(module.dimensionsMm);
  const gridSize = family.id === 'trims_and_decals'
    ? artKit.grid.decorativeDetailMm
    : artKit.grid.fineAdjustmentMm;
  const gridValid = module.gridException === 'frozen_seed_clearance_interface'
    || dimensions.every((value) => value % gridSize === 0);
  return family.authorityPolicy.length > 0
    && module.pivot.length > 0
    && dimensions.every((value) => Number.isInteger(value) && value > 0)
    && module.materialSlots.every((slot) => materialIds.has(slot))
    && gridValid;
});
const rampsValid = artKit.moduleFamilies.find(({ id }) => id === 'ramps')?.modules
  .every(({ slopeAngleMilliDegrees }) => slopeAngleMilliDegrees <= 20_000);
const stairsValid = artKit.moduleFamilies.find(({ id }) => id === 'stairs')?.modules
  .every(({ stepRiseMm, stepRunMm }) => stepRiseMm <= 250 && stepRunMm >= 500);
const seedDimensions = new Map(
  seed.coverAndClearance.modules.map((module) => [module.id, module.dimensionsMm]),
);
const seedParityValid = artKit.frozenSeedModuleParity.length === seedDimensions.size
  && artKit.frozenSeedModuleParity.every((parity) => (
    same(parity.dimensionsMm, seedDimensions.get(parity.seedId))
      && Boolean(moduleById(artKit, parity.contractModuleId))
  ));

const checks = [
  ['all summary source and evidence hashes recompute',
    hashChecks.every(({ matches }) => matches)],
  ['all twelve frozen graybox source hashes recompute',
    sourceSetChecks.length === 12 && sourceSetChecks.every(({ matches }) => matches)],
  ['all thirteen topology/spawn/route/movement fingerprints recompute',
    fingerprintChecks.length === 13
      && fingerprintChecks.every(({ matches }) => matches)
      && Object.keys(lock.frozenContractFingerprints).length === 13],
  ['revision 2 is promoted only to a non-default graybox lock',
    lock.status === 'graybox_locked_non_default'
      && lock.binding.mapRevision === 2
      && lock.promotion.to === 'locked_graybox_revision_2'
      && lock.promotion.catalogDefaultRevision === 1
      && lock.promotion.catalogLockedGrayboxRevision === 2
      && lock.promotion.explicitRevisionSelectionRequired === true
      && lock.promotion.productSelectable === false
      && lock.promotion.shippingDefault === false
      && lock.promotion.deploymentAuthorized === false
      && /DEFAULT_MAP_REVISION\s*=\s*1\s+as const/u.test(catalogSource)
      && /LOCKED_GRAYBOX_MAP_REVISION\s*=\s*2\s+as const/u.test(catalogSource)],
  ['native map, movement, physics, and artifact identity is exact', same(lock.binding, {
    mapId: 'inkfall_foundry',
    mapRevision: 2,
    packageDigest: '77a7b6c41416f9caaf615f3af5dacda1153cee65a239c04f2004e30fc1663520',
    fixtureHash: 'bf85e42731fd088e',
    renderSha256: '90a9450491355ac6fe007a8ac337c7838df107d775c269366aaf7fc01ce4c634',
    collisionSha256: 'cd661c12534dd7d2362c862f4ff9f9177cb9f8ef0cea85d14a3b18e3dfb1380e',
    movementProfileId: 'phase3_hypothesis_v1',
    movementProfileRevision: 1,
    movementProfileHash: '8ab4ed437a4393c0',
    canonicalMovementHash: '66fcaf19c3fd94ad',
    physicsAdapterVersion: '0.19.3',
    authorityRateHz: 20,
  })],
  ['frozen counts remain 9/19/27/12/12 with 339 solids and two volumes',
    same(lock.frozenCounts, {
      zones: 9,
      nodes: 19,
      links: 27,
      routeMetrics: 12,
      spawns: 12,
      strongPositions: 3,
      movementFeatures: 5,
      authorityPlaytestScenarios: 3,
      renderMeshNodes: 346,
      authorityCollisionSolids: 339,
      authorityVolumes: 2,
    })],
  ['corrected 2/4/8 authority result remains exact and defect-free',
    lock.acceptedAutomatedResult.claim === 'P6_6_CORRECTED_AUTOMATED_TAPES_PASS'
      && same(lock.acceptedAutomatedResult.scenarioStatuses, ['PASS', 'PASS', 'PASS'])
      && lock.acceptedAutomatedResult.issueCount === 0
      && lock.acceptedAutomatedResult.suiteHash === '143d09532b9c2b24'
      && raw.suiteHash === lock.acceptedAutomatedResult.suiteHash
      && raw.issueCount === 0
      && Object.values(lock.acceptedAutomatedResult.zeroDefects).every((value) => value === 0)],
  ['locked route timing bands remain exact with 3950 ms teleport and 3300 ms drop',
    lock.acceptedAutomatedResult.inkTeleportFlankMilliseconds === 3950
      && same(lock.acceptedAutomatedResult.inkTeleportFlankBandMilliseconds, [1800, 4000])
      && lock.acceptedAutomatedResult.archiveDropFlankMilliseconds === 3300
      && same(lock.acceptedAutomatedResult.archiveDropFlankBandMilliseconds, [2500, 5000])],
  ['art-kit contract contains all sixteen required families and thirty-seven unique modules',
    same(familyIds, requiredFamilies)
      && new Set(familyIds).size === 16
      && modules.length === 37
      && new Set(moduleIds).size === 37
      && moduleContractsValid],
  ['art-kit ramp, stair, door, slide, and seed interfaces remain bounded',
    rampsValid === true
      && stairsValid === true
      && same(moduleById(artKit, 'door_main')?.clearOpeningMm, { x: 2400, y: 3000, z: 500 })
      && same(moduleById(artKit, 'door_flank')?.clearOpeningMm, { x: 1400, y: 2400, z: 500 })
      && same(moduleById(artKit, 'slide_gate_shell')?.clearOpeningMm, {
        x: 1400, y: 1350, z: 4800,
      })
      && seedParityValid],
  ['locked revision-2 and preserved revision-1 Blender sweeps pass',
    revision2Sweep.result === 'PASS'
      && same(revision2Sweep.assertionSummary, { failed: 0, passed: 15, total: 15 })
      && revision2Sweep.capsule.totalCompletedSamples === 1646
      && revision1Sweep.result === 'PASS'
      && same(revision1Sweep.assertionSummary, { failed: 0, passed: 14, total: 14 })
      && revision1Sweep.capsule.totalCompletedSamples === 1653],
  ['the command-contract Blender failure remains preserved and classified',
    revision2FailedSweep.result === 'FAIL'
      && same(revision2FailedSweep.assertions.filter(({ passed }) => !passed)
        .map(({ id }) => id), ['artifact_validator_passed'])
      && validation.preservedFailures.includes(
        'P6_2_REVISION2_WRONG_EXPECTED_ARTIFACT_STATUS',
      )],
  ['focused and adjacent validation is complete',
    validation.status === 'P6_7_GRAYBOX_LOCK_VALIDATION_COMPLETE'
      && validation.lockSuite.filesPassed === 1
      && validation.lockSuite.filesTotal === 1
      && validation.lockSuite.testsPassed === 7
      && validation.lockSuite.testsTotal === 7
      && validation.adjacentInkfallMatrix.filesPassed === 8
      && validation.adjacentInkfallMatrix.filesTotal === 8
      && validation.adjacentInkfallMatrix.testsPassed === 58
      && validation.adjacentInkfallMatrix.testsTotal === 58
      && validation.typescript.application === 'PASS'
      && validation.typescript.worker === 'PASS'
      && validation.typescript.simulationSource === 'PASS'
      && validation.typescript.simulation === 'PASS'
      && validation.lint.focused === 'PASS'
      && validation.lint.repository === 'PASS'
      && validation.productionBuild.result === 'PASS'],
  ['summary carries only the P6.7 lock claim',
    summary.claim === 'P6_7_GRAYBOX_LOCK_PASS'
      && summary.lockStatus === 'graybox_locked_non_default'],
  ['human, visual, final-art, performance, product, shipping, and deployment claims stay open',
    same(summary.nonClaims, [
      'G5_NOT_PASSED',
      'HUMAN_FUN_OR_READABILITY_NOT_ACCEPTED',
      'VISUAL_ACCEPTANCE_NOT_PASSED',
      'FINAL_ART_NOT_COMPLETE',
      'PERFORMANCE_NOT_ACCEPTED',
      'PRODUCT_INTEGRATION_NOT_COMPLETE',
      'REVISION_2_NOT_DEFAULT_OR_SHIPPING',
      'DEPLOYMENT_NOT_AUTHORIZED',
    ]) && same(lock.nonClaims, summary.nonClaims)],
].map(([name, passed]) => ({ name, passed: Boolean(passed) }));

const verification = {
  schemaVersion: 1,
  status: checks.every(({ passed }) => passed)
    && hashChecks.every(({ matches }) => matches)
    && sourceSetChecks.every(({ matches }) => matches)
    && fingerprintChecks.every(({ matches }) => matches)
    ? 'P6_7_GRAYBOX_LOCK_EVIDENCE_VERIFIED'
    : 'P6_7_GRAYBOX_LOCK_EVIDENCE_VERIFICATION_FAILED',
  summaryPath,
  hashChecks,
  sourceSetChecks,
  fingerprintChecks,
  checks,
  passedChecks: checks.filter(({ passed }) => passed).length,
  totalChecks: checks.length,
  nonClaims: summary.nonClaims,
};

await writeFile(resolve(repoRoot, verificationPath), `${JSON.stringify(verification, null, 2)}\n`, {
  flag: 'wx',
});
if (verification.status !== 'P6_7_GRAYBOX_LOCK_EVIDENCE_VERIFIED') process.exitCode = 1;
console.log(JSON.stringify({
  status: verification.status,
  passedChecks: verification.passedChecks,
  totalChecks: verification.totalChecks,
  hashChecks: verification.hashChecks.length,
  sourceSetChecks: verification.sourceSetChecks.length,
  fingerprintChecks: verification.fingerprintChecks.length,
  output: verificationPath,
}));
