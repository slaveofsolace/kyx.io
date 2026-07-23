import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCE_ROOT = path.join(
  REPO_ROOT,
  'evidence/2026-07-22/phase-4-g3-lobby-hibernation-focused',
);
const DEFAULT_RUN = path.join(EVIDENCE_ROOT, 'runs/local-v2');
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

function parseVitestReport(output) {
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error('Focused hibernation probe did not emit a JSON Vitest report.', { cause: error });
  }
}

function sameJson(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
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

async function sourceInventory() {
  return await Promise.all(SOURCE_FILES.map((relative) => fileRecord(path.join(REPO_ROOT, relative))));
}

async function walkFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) return await walkFiles(absolute);
    return entry.isFile() ? [absolute] : [];
  }));
  return nested.flat().sort((first, second) => first.localeCompare(second));
}

async function writeProbeLogs(logsRoot, name, probe) {
  await Promise.all([
    writeFile(path.join(logsRoot, `${name}-stdout.txt`), probe.stdout, 'utf8'),
    writeFile(path.join(logsRoot, `${name}-stderr.txt`), probe.stderr, 'utf8'),
  ]);
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
  const bundleRoot = path.join(runRoot, 'worker-dry-run');
  await Promise.all([
    mkdir(logsRoot, { recursive: true }),
    mkdir(bundleRoot, { recursive: true }),
  ]);

  const sourceBefore = await sourceInventory();
  const focused = await runProbe('worker-isolate-hibernation', VITEST_ARGUMENTS);
  const typecheck = await runProbe('worker-typecheck', TYPECHECK_ARGUMENTS);
  const lint = await runProbe('focused-eslint', LINT_ARGUMENTS);
  const bundleArguments = [
    'node_modules/wrangler/bin/wrangler.js',
    'deploy',
    '--dry-run',
    '--outdir',
    bundleRoot,
    '--env=',
  ];
  const bundle = await runProbe('worker-dry-run', bundleArguments);
  const sourceAfter = await sourceInventory();
  const focusedReport = parseVitestReport(focused.stdout);
  await Promise.all([
    writeProbeLogs(logsRoot, 'worker-isolate-hibernation', focused),
    writeProbeLogs(logsRoot, 'worker-typecheck', typecheck),
    writeProbeLogs(logsRoot, 'focused-eslint', lint),
    writeProbeLogs(logsRoot, 'worker-dry-run', bundle),
  ]);

  const passedTests = normalizedPassedTests(focusedReport);
  const checks = {
    sourceStableDuringCapture: sameJson(sourceBefore, sourceAfter),
    workerIsolateProcessPassed: focused.exitCode === 0 && focused.signal === null,
    exactHibernationTestsPassed: focusedReport.success === true
      && focusedReport.numTotalTestSuites === 2
      && focusedReport.numPassedTestSuites === 2
      && focusedReport.numFailedTestSuites === 0
      && focusedReport.numTotalTests === 6
      && focusedReport.numPassedTests === 3
      && focusedReport.numFailedTests === 0
      && focusedReport.numPendingTests === 3
      && sameJson(passedTests, [...EXPECTED_PASSED_TESTS].sort()),
    workerTypecheckPassed: typecheck.exitCode === 0 && typecheck.signal === null,
    focusedLintPassed: lint.exitCode === 0 && lint.signal === null,
    workerDryRunPassed: bundle.exitCode === 0
      && bundle.signal === null
      && bundle.stdout.includes('--dry-run: exiting now.'),
  };
  const result = {
    schemaVersion: 1,
    evidenceId: 'phase-4-g3-lobby-hibernation-focused-local-v2-2026-07-22',
    capturedAt: new Date().toISOString(),
    status: Object.values(checks).every((value) => value === true)
      ? 'FOCUSED_LOBBY_HIBERNATION_EVIDENCE_PASS'
      : 'FOCUSED_LOBBY_HIBERNATION_EVIDENCE_FAIL',
    gateDecision: 'NONE',
    gateClaim: 'G3_NOT_ACCEPTED',
    deploymentPerformed: false,
    runtime: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
    },
    exactInvocation: [process.execPath, ...process.argv.slice(1)],
    probes: {
      workerIsolateHibernation: {
        command: focused.command,
        exitCode: focused.exitCode,
        signal: focused.signal,
        startedAt: focused.startedAt,
        completedAt: focused.completedAt,
        durationMilliseconds: focused.durationMilliseconds,
        report: focusedReport,
      },
      workerTypecheck: {
        command: typecheck.command,
        exitCode: typecheck.exitCode,
        signal: typecheck.signal,
      },
      focusedLint: {
        command: lint.command,
        exitCode: lint.exitCode,
        signal: lint.signal,
      },
      workerDryRun: {
        command: bundle.command,
        exitCode: bundle.exitCode,
        signal: bundle.signal,
      },
    },
    sourceInventory: sourceAfter,
    checks,
    scopeBoundary: [
      'This record exercises Cloudflare Worker-isolate Durable Object eviction with hibernatable WebSockets, persisted lobby identity, connected and disconnected player reconstruction, resume-token rotation, full-snapshot resynchronization, active-match transition, and an idempotent durable expiry alarm.',
      'The eviction helper is a direct Worker test-runtime hibernation boundary; this is not an external workerd process restart, staging execution, or production runtime proof.',
      'Active warmup, match, and postmatch simulation deliberately remain awake and active_uncheckpointed; an active-object crash still fails closed.',
      'Real socket saturation, public authentication, staging WSS, load, resource, cost, physical-refresh, product-flow, final adjacent regression, and G3 acceptance remain separate work.',
      'No deployment or gate decision is performed by this focused evidence tool.',
    ],
  };
  const artifactFiles = [
    ...await walkFiles(logsRoot),
    ...await walkFiles(bundleRoot),
  ];
  result.artifactInventory = await Promise.all(artifactFiles.map(fileRecord));
  const evidencePath = path.join(runRoot, 'lobby-hibernation-focused.json');
  await writeFile(evidencePath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${result.status}\n`);
  if (result.status.endsWith('_FAIL')) process.exitCode = 1;
}

await main();
