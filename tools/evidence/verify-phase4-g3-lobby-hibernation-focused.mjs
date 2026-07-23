import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCE_ROOT = path.join(
  REPO_ROOT,
  'evidence/2026-07-22/phase-4-g3-lobby-hibernation-focused',
);
const RUNS_ROOT = path.join(EVIDENCE_ROOT, 'runs');
const TEST_PATTERN = [
  'rehydrates one connected lobby player',
  'rehydrates a disconnected lobby player',
  'expires an evicted reconnect-wait lobby',
].join('|');
const EXPECTED_PASSED_TESTS = Object.freeze([
  'rehydrates one connected lobby player across a real hibernatable-object eviction',
  'rehydrates a disconnected lobby player and rotates its resume token after eviction',
  'expires an evicted reconnect-wait lobby idempotently through its durable alarm',
]);
const SOURCE_FILES = Object.freeze([
  'worker/room.ts',
  'worker/resumeSessions.ts',
  'worker/resumeToken.ts',
  'worker/security.ts',
  'worker/worker.ts',
  'src/authority/room.ts',
  'tests/worker/protocolV2Socket.test.ts',
  'vitest.worker.config.ts',
  'tsconfig.worker.json',
  'wrangler.jsonc',
  'package-lock.json',
  'tools/evidence/capture-phase4-g3-lobby-hibernation-focused.mjs',
  'tools/evidence/verify-phase4-g3-lobby-hibernation-focused.mjs',
]);
const VITEST_ARGUMENTS = Object.freeze([
  'node_modules/vitest/vitest.mjs',
  'run',
  'tests/worker/protocolV2Socket.test.ts',
  '--config',
  'vitest.worker.config.ts',
  '--maxWorkers=1',
  '--no-isolate',
  '--reporter=json',
  '-t',
  TEST_PATTERN,
]);
const TYPECHECK_ARGUMENTS = Object.freeze([
  'node_modules/typescript/bin/tsc',
  '-p',
  'tsconfig.worker.json',
  '--noEmit',
]);
const LINT_ARGUMENTS = Object.freeze([
  'node_modules/eslint/bin/eslint.js',
  'worker/room.ts',
  'tests/worker/protocolV2Socket.test.ts',
]);

function requiredArgument(name) {
  const indexes = process.argv.flatMap((value, index) => value === name ? [index] : []);
  if (indexes.length !== 1) throw new Error(`${name} must be provided exactly once.`);
  const value = process.argv[indexes[0] + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} requires a path.`);
  return value;
}

function containedPath(value, root, label) {
  const resolved = path.resolve(REPO_ROOT, value);
  const relative = path.relative(root, resolved);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} must be a child path of ${path.relative(REPO_ROOT, root)}.`);
  }
  return resolved;
}

function sameJson(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function everyTrue(record) {
  return Object.values(record).every((value) => value === true);
}

function normalizedPassedTests(report) {
  return (report.testResults?.[0]?.assertionResults ?? [])
    .filter(({ status }) => status === 'passed')
    .map(({ title }) => title)
    .sort();
}

async function fileRecord(absolute) {
  const bytes = await readFile(absolute);
  const details = await stat(absolute);
  return {
    path: path.relative(REPO_ROOT, absolute).replaceAll('\\', '/'),
    bytes: details.size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

async function main() {
  const runRoot = containedPath(requiredArgument('--run'), RUNS_ROOT, '--run');
  const outputPath = containedPath(requiredArgument('--output'), EVIDENCE_ROOT, '--output');
  const relativeToRuns = path.relative(RUNS_ROOT, outputPath);
  if (!relativeToRuns.startsWith('..') && !path.isAbsolute(relativeToRuns)) {
    throw new Error('--output must remain outside immutable focused capture runs.');
  }
  if (path.extname(outputPath) !== '.json') throw new Error('--output must be a JSON file.');
  const outputExists = await stat(outputPath).then(() => true).catch((error) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  });
  if (outputExists) {
    throw new Error('Focused verification output exists; preserve it and choose a fresh path.');
  }

  const evidencePath = path.join(runRoot, 'lobby-hibernation-focused.json');
  const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
  const rawReport = JSON.parse(await readFile(
    path.join(runRoot, 'logs/worker-isolate-hibernation-stdout.txt'),
    'utf8',
  ));
  const sourceActual = await Promise.all(SOURCE_FILES.map((relative) => (
    fileRecord(path.join(REPO_ROOT, relative))
  )));
  const artifactsActual = await Promise.all(evidence.artifactInventory.map(({ path: relative }) => (
    fileRecord(path.join(REPO_ROOT, relative))
  )));
  const passedTests = normalizedPassedTests(rawReport);
  const runPrefix = `${path.relative(REPO_ROOT, runRoot).replaceAll('\\', '/')}/`;
  const bundleCommand = evidence.probes.workerDryRun.command.slice(1);
  const checks = {
    focusedStatusPassed: evidence.status === 'FOCUSED_LOBBY_HIBERNATION_EVIDENCE_PASS',
    exactEvidenceIdentity:
      evidence.evidenceId === 'phase-4-g3-lobby-hibernation-focused-local-v2-2026-07-22',
    gateRemainsUnaccepted: evidence.gateDecision === 'NONE'
      && evidence.gateClaim === 'G3_NOT_ACCEPTED',
    noDeploymentPerformed: evidence.deploymentPerformed === false,
    captureSourceStayedStable: evidence.checks.sourceStableDuringCapture === true,
    exactSourceHashesAndSizes: sameJson(sourceActual, evidence.sourceInventory),
    artifactHashesAndSizesMatch: sameJson(artifactsActual, evidence.artifactInventory),
    artifactPathsScopedToRun: evidence.artifactInventory.every(({ path: relative }) => (
      relative.startsWith(runPrefix)
    )),
    exactFocusedCommand: sameJson(
      evidence.probes.workerIsolateHibernation.command.slice(1),
      VITEST_ARGUMENTS,
    ),
    exactTypecheckCommand: sameJson(
      evidence.probes.workerTypecheck.command.slice(1),
      TYPECHECK_ARGUMENTS,
    ),
    exactLintCommand: sameJson(
      evidence.probes.focusedLint.command.slice(1),
      LINT_ARGUMENTS,
    ),
    workerDryRunCommandScoped: bundleCommand[0] === 'node_modules/wrangler/bin/wrangler.js'
      && bundleCommand[1] === 'deploy'
      && bundleCommand[2] === '--dry-run'
      && bundleCommand[3] === '--outdir'
      && path.resolve(bundleCommand[4]) === path.join(runRoot, 'worker-dry-run')
      && bundleCommand[5] === '--env=',
    exactRawHibernationTestsPassed: rawReport.success === true
      && rawReport.numTotalTestSuites === 2
      && rawReport.numPassedTestSuites === 2
      && rawReport.numFailedTestSuites === 0
      && rawReport.numTotalTests === 6
      && rawReport.numPassedTests === 3
      && rawReport.numFailedTests === 0
      && rawReport.numPendingTests === 3
      && sameJson(passedTests, [...EXPECTED_PASSED_TESTS].sort()),
    rawReportMatchesEmbedded: sameJson(rawReport, evidence.probes.workerIsolateHibernation.report),
    captureChecksPassed: everyTrue(evidence.checks),
    directIsolateBoundaryDeclared: evidence.scopeBoundary.some((value) => (
      value.includes('direct Worker test-runtime hibernation boundary')
        && value.includes('not an external workerd process restart')
    )),
    activeSimulationNonClaimDeclared: evidence.scopeBoundary.some((value) => (
      value.includes('Active warmup, match, and postmatch simulation')
        && value.includes('active-object crash still fails closed')
    )),
    operationalNonClaimsDeclared: evidence.scopeBoundary.some((value) => (
      value.includes('Real socket saturation')
        && value.includes('public authentication')
        && value.includes('load')
        && value.includes('G3 acceptance')
    )),
  };
  const result = {
    schemaVersion: 1,
    verifiedAt: new Date().toISOString(),
    evidencePath: path.relative(REPO_ROOT, evidencePath).replaceAll('\\', '/'),
    status: everyTrue(checks)
      ? 'INDEPENDENT_FOCUSED_LOBBY_HIBERNATION_VERIFICATION_PASS'
      : 'INDEPENDENT_FOCUSED_LOBBY_HIBERNATION_VERIFICATION_FAIL',
    gateClaim: 'G3_NOT_ACCEPTED',
    checks,
  };
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${result.status}\n`);
  if (result.status.endsWith('_FAIL')) process.exitCode = 1;
}

await main();
