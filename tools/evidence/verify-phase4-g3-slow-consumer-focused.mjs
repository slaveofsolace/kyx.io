import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCE_ROOT = path.join(
  REPO_ROOT,
  'evidence/2026-07-22/phase-4-g3-slow-consumer-focused',
);
const RUNS_ROOT = path.join(EVIDENCE_ROOT, 'runs');
const SOURCE_FILES = Object.freeze([
  'worker/transport-limits.json',
  'worker/security.ts',
  'worker/room.ts',
  'tests/unit/worker/security.test.ts',
  'tests/worker/slowConsumerBackpressure.test.ts',
  'vitest.worker.config.ts',
  'package-lock.json',
]);
const UNIT_ARGUMENTS = Object.freeze([
  'node_modules/vitest/vitest.mjs',
  'run',
  'tests/unit/worker/security.test.ts',
  '--reporter=json',
]);
const WORKER_ISOLATE_ARGUMENTS = Object.freeze([
  'node_modules/vitest/vitest.mjs',
  'run',
  'tests/worker/slowConsumerBackpressure.test.ts',
  '--config',
  'vitest.worker.config.ts',
  '--maxWorkers=1',
  '--no-isolate',
  '--reporter=json',
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

  const evidencePath = path.join(runRoot, 'slow-consumer-focused.json');
  const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
  const unitReport = JSON.parse(await readFile(path.join(runRoot, 'logs/unit-vitest.json'), 'utf8'));
  const workerReport = JSON.parse(await readFile(
    path.join(runRoot, 'logs/worker-isolate-vitest.json'),
    'utf8',
  ));
  const sourceActual = await Promise.all(SOURCE_FILES.map((relative) => (
    fileRecord(path.join(REPO_ROOT, relative))
  )));
  const artifactsActual = await Promise.all(evidence.artifactInventory.map(({ path: relative }) => (
    fileRecord(path.join(REPO_ROOT, relative))
  )));
  const runPrefix = `${path.relative(REPO_ROOT, runRoot).replaceAll('\\', '/')}/`;
  const checks = {
    focusedStatusPassed: evidence.status === 'FOCUSED_SLOW_CONSUMER_ISOLATE_EVIDENCE_PASS',
    exactEvidenceIdentity:
      evidence.evidenceId === 'phase-4-g3-slow-consumer-focused-local-v1-2026-07-22',
    gateRemainsUnaccepted: evidence.gateDecision === 'NONE'
      && evidence.gateClaim === 'G3_NOT_ACCEPTED',
    noDeploymentPerformed: evidence.deploymentPerformed === false,
    exactSourceHashesAndSizes: sameJson(sourceActual, evidence.sourceInventory),
    artifactHashesAndSizesMatch: sameJson(artifactsActual, evidence.artifactInventory),
    artifactPathsScopedToRun: evidence.artifactInventory.every(({ path: relative }) => (
      relative.startsWith(runPrefix)
    )),
    deterministicPolicyRawReportPassed: unitReport.success === true
      && unitReport.numTotalTestSuites >= 1
      && unitReport.numPassedTestSuites === unitReport.numTotalTestSuites
      && unitReport.numFailedTestSuites === 0
      && unitReport.numTotalTests === 5
      && unitReport.numPassedTests === 5
      && unitReport.numFailedTests === 0
      && unitReport.testResults?.length === 1
      && typeof unitReport.testResults[0].name === 'string'
      && unitReport.testResults[0].name.replaceAll('\\', '/')
        .endsWith('/tests/unit/worker/security.test.ts'),
    workerIsolateRawReportPassed: workerReport.success === true
      && workerReport.numTotalTestSuites >= 1
      && workerReport.numPassedTestSuites === workerReport.numTotalTestSuites
      && workerReport.numFailedTestSuites === 0
      && workerReport.numTotalTests === 3
      && workerReport.numPassedTests === 3
      && workerReport.numFailedTests === 0
      && workerReport.testResults?.length === 1
      && typeof workerReport.testResults[0].name === 'string'
      && workerReport.testResults[0].name.replaceAll('\\', '/')
        .endsWith('/tests/worker/slowConsumerBackpressure.test.ts'),
    exactFocusedCommands: sameJson(
      evidence.probes.deterministicPolicy.command.slice(1),
      UNIT_ARGUMENTS,
    ) && sameJson(
      evidence.probes.workerIsolate.command.slice(1),
      WORKER_ISOLATE_ARGUMENTS,
    ),
    rawReportsMatchEmbedded: sameJson(unitReport, evidence.probes.deterministicPolicy.report)
      && sameJson(workerReport, evidence.probes.workerIsolate.report),
    captureChecksPassed: everyTrue(evidence.checks),
    deterministicOnlyBoundaryDeclared: evidence.scopeBoundary.some((value) => (
      value.includes('deterministic policy tests')
        && value.includes('Worker-isolate tests only')
    )),
    realNetworkNonClaimDeclared: evidence.scopeBoundary.some((value) => (
      value.includes('does not simulate a real slow network socket')
        && value.includes('socket-buffer saturation')
    )),
    operationalBoundaryDeclared: evidence.scopeBoundary.some((value) => (
      value.includes('Multiple slow clients')
        && value.includes('staging WSS')
        && value.includes('resource behavior')
    )),
  };
  const result = {
    schemaVersion: 1,
    verifiedAt: new Date().toISOString(),
    evidencePath: path.relative(REPO_ROOT, evidencePath).replaceAll('\\', '/'),
    status: everyTrue(checks)
      ? 'INDEPENDENT_FOCUSED_SLOW_CONSUMER_VERIFICATION_PASS'
      : 'INDEPENDENT_FOCUSED_SLOW_CONSUMER_VERIFICATION_FAIL',
    gateClaim: 'G3_NOT_ACCEPTED',
    checks,
  };
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${result.status}\n`);
  if (result.status.endsWith('_FAIL')) process.exitCode = 1;
}

await main();
