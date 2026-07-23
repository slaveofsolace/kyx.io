import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCE_ROOT = path.join(
  REPO_ROOT,
  'evidence/2026-07-22/phase-4-g3-slow-consumer-focused',
);
const DEFAULT_RUN = path.join(EVIDENCE_ROOT, 'runs/local-v1');
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

function argument(name, fallback) {
  const indexes = process.argv.flatMap((value, index) => value === name ? [index] : []);
  if (indexes.length > 1) throw new Error(`${name} may be provided at most once.`);
  if (indexes.length === 0) return fallback;
  const value = process.argv[indexes[0] + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} requires a path.`);
  return value;
}

function containedRunPath(value) {
  const runsRoot = path.join(EVIDENCE_ROOT, 'runs');
  const resolved = path.resolve(REPO_ROOT, value);
  const relative = path.relative(runsRoot, resolved);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`--output must be a child of ${path.relative(REPO_ROOT, runsRoot)}.`);
  }
  return resolved;
}

function runProbe(label, argumentsList) {
  return new Promise((resolve, reject) => {
    const startedAt = new Date().toISOString();
    const startedMilliseconds = Date.now();
    const child = spawn(process.execPath, argumentsList, {
      cwd: REPO_ROOT,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.once('error', reject);
    child.once('close', (exitCode, signal) => resolve({
      label,
      command: [process.execPath, ...argumentsList],
      startedAt,
      completedAt: new Date().toISOString(),
      durationMilliseconds: Date.now() - startedMilliseconds,
      exitCode,
      signal,
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8'),
    }));
  });
}

function parseVitestReport(output, label) {
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error(`${label} did not emit a JSON Vitest report.`, { cause: error });
  }
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

async function sourceInventory() {
  return await Promise.all(SOURCE_FILES.map((relative) => fileRecord(path.join(REPO_ROOT, relative))));
}

async function artifactInventory(runRoot) {
  const logsRoot = path.join(runRoot, 'logs');
  const entries = await readdir(logsRoot, { withFileTypes: true });
  return await Promise.all(entries.filter((entry) => entry.isFile()).map(({ name }) => (
    fileRecord(path.join(logsRoot, name))
  )));
}

async function main() {
  const runRoot = containedRunPath(argument('--output', DEFAULT_RUN));
  const existing = await readdir(runRoot).catch((error) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  });
  if (existing.length > 0) {
    throw new Error('Focused evidence output is not empty; preserve it and select a fresh --output.');
  }
  const logsRoot = path.join(runRoot, 'logs');
  await mkdir(logsRoot, { recursive: true });
  const evidencePath = path.join(runRoot, 'slow-consumer-focused.json');

  const unit = await runProbe('deterministic-policy-unit', UNIT_ARGUMENTS);
  const workerIsolate = await runProbe('worker-isolate', WORKER_ISOLATE_ARGUMENTS);
  const unitReport = parseVitestReport(unit.stdout, unit.label);
  const workerIsolateReport = parseVitestReport(workerIsolate.stdout, workerIsolate.label);
  await Promise.all([
    writeFile(path.join(logsRoot, 'unit-vitest.json'), `${unit.stdout.trim()}\n`, 'utf8'),
    writeFile(path.join(logsRoot, 'unit-stderr.txt'), unit.stderr, 'utf8'),
    writeFile(
      path.join(logsRoot, 'worker-isolate-vitest.json'),
      `${workerIsolate.stdout.trim()}\n`,
      'utf8',
    ),
    writeFile(path.join(logsRoot, 'worker-isolate-stderr.txt'), workerIsolate.stderr, 'utf8'),
  ]);

  const checks = {
    deterministicPolicyProcessPassed: unit.exitCode === 0 && unit.signal === null,
    deterministicPolicyExactTestsPassed: unitReport.success === true
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
    workerIsolateProcessPassed: workerIsolate.exitCode === 0 && workerIsolate.signal === null,
    workerIsolateExactTestsPassed: workerIsolateReport.success === true
      && workerIsolateReport.numTotalTestSuites >= 1
      && workerIsolateReport.numPassedTestSuites === workerIsolateReport.numTotalTestSuites
      && workerIsolateReport.numFailedTestSuites === 0
      && workerIsolateReport.numTotalTests === 3
      && workerIsolateReport.numPassedTests === 3
      && workerIsolateReport.numFailedTests === 0
      && workerIsolateReport.testResults?.length === 1
      && typeof workerIsolateReport.testResults[0].name === 'string'
      && workerIsolateReport.testResults[0].name.replaceAll('\\', '/')
        .endsWith('/tests/worker/slowConsumerBackpressure.test.ts'),
  };
  const result = {
    schemaVersion: 1,
    evidenceId: 'phase-4-g3-slow-consumer-focused-local-v1-2026-07-22',
    capturedAt: new Date().toISOString(),
    status: Object.values(checks).every((value) => value === true)
      ? 'FOCUSED_SLOW_CONSUMER_ISOLATE_EVIDENCE_PASS'
      : 'FOCUSED_SLOW_CONSUMER_ISOLATE_EVIDENCE_FAIL',
    gateDecision: 'NONE',
    gateClaim: 'G3_NOT_ACCEPTED',
    deploymentPerformed: false,
    runtime: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
    },
    exactInvocation: [process.execPath, ...process.argv.slice(1)],
    probes: {
      deterministicPolicy: {
        command: unit.command,
        startedAt: unit.startedAt,
        completedAt: unit.completedAt,
        durationMilliseconds: unit.durationMilliseconds,
        exitCode: unit.exitCode,
        signal: unit.signal,
        report: unitReport,
      },
      workerIsolate: {
        command: workerIsolate.command,
        startedAt: workerIsolate.startedAt,
        completedAt: workerIsolate.completedAt,
        durationMilliseconds: workerIsolate.durationMilliseconds,
        exitCode: workerIsolate.exitCode,
        signal: workerIsolate.signal,
        report: workerIsolateReport,
      },
    },
    sourceInventory: await sourceInventory(),
    checks,
    scopeBoundary: [
      'This record covers deterministic policy tests and Cloudflare Worker-isolate tests only.',
      'It does not simulate a real slow network socket or prove runtime socket-buffer saturation.',
      'Multiple slow clients, staging WSS, eviction under real transport pressure, load, and resource behavior require separate operational evidence.',
      'No deployment or G3 acceptance decision is performed by this focused evidence tool.',
    ],
  };
  result.artifactInventory = await artifactInventory(runRoot);
  await writeFile(evidencePath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${result.status}\n`);
  if (result.status.endsWith('_FAIL')) process.exitCode = 1;
}

await main();
