import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  auditCurrentSourceClosure,
  COMMAND_RESULTS_PATH,
  jsonBytes,
  PROVENANCE_BASELINE_PATH,
  PROVENANCE_COMMANDS_PATH,
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

const commandResultsPath = argumentValue('--output', COMMAND_RESULTS_PATH);
const baselinePath = argumentValue('--baseline-output', PROVENANCE_BASELINE_PATH);
const baselineOnly = process.argv.includes('--baseline-only');

const focusedSuite = Object.freeze([
  'tests/integration/movement/inkfallAuthoritativeTraversalMatrix.test.ts',
  'tests/integration/movement/inkfallCanonicalTraversalSnag.test.ts',
  'tests/integration/authority/inkfallAuthorityPlaytestRevision2.test.ts',
  'tests/integration/authority/inkfallAuthorityPlaytest.test.ts',
  'tests/integration/physics/inkfallMapRuntime.test.ts',
  'tests/integration/movement/rapierController.test.ts',
  'tests/unit/physics/rapierWorld.test.ts',
]);

const lintTargets = Object.freeze([
  'tools/evidence/capture-phase6-g5-authoritative-traversal-matrix.mjs',
  'tools/evidence/capture-phase6-g5-authoritative-traversal-matrix.module.ts',
  'tools/evidence/capture-phase6-g5-authoritative-traversal-matrix.provenance.mjs',
  'tools/evidence/capture-phase6-g5-authoritative-traversal-matrix-command-results.mjs',
  'tools/evidence/verify-phase6-g5-authoritative-traversal-matrix.mjs',
  'tests/integration/movement/inkfallAuthoritativeTraversalMatrix.test.ts',
]);

const commands = Object.freeze([
  {
    id: 'capture_dry_run',
    executable: process.execPath,
    args: [
      'tools/evidence/capture-phase6-g5-authoritative-traversal-matrix.mjs',
      '--dry-run',
    ],
  },
  {
    id: 'provenance_verifier_stdout_only',
    executable: process.execPath,
    args: [
      'tools/evidence/verify-phase6-g5-authoritative-traversal-matrix.mjs',
      '--proof',
      PROVENANCE_PROOF_PATH,
      '--source-closure',
      SOURCE_CLOSURE_PATH,
      '--stdout-only',
    ],
  },
  {
    id: 'focused_70_test_matrix',
    executable: process.execPath,
    args: [
      'node_modules/vitest/vitest.mjs',
      'run',
      ...focusedSuite,
      '--maxWorkers=1',
    ],
  },
  {
    id: 'application_typecheck',
    executable: process.execPath,
    args: [
      'node_modules/typescript/bin/tsc',
      '--noEmit',
      '--pretty',
      'false',
      '-p',
      'tsconfig.json',
    ],
  },
  {
    id: 'simulation_source_typecheck',
    executable: process.execPath,
    args: [
      'node_modules/typescript/bin/tsc',
      '--noEmit',
      '--pretty',
      'false',
      '-p',
      'tsconfig.sim-source.json',
    ],
  },
  {
    id: 'simulation_typecheck',
    executable: process.execPath,
    args: [
      'node_modules/typescript/bin/tsc',
      '--noEmit',
      '--pretty',
      'false',
      '-p',
      'tsconfig.sim.json',
    ],
  },
  {
    id: 'focused_lint',
    executable: process.execPath,
    args: [
      'node_modules/eslint/bin/eslint.js',
      ...lintTargets,
    ],
  },
  {
    id: 'asset_manifest_validation',
    executable: process.execPath,
    args: ['tools/assets/validate-manifests.mjs'],
  },
]);

function normalizedExecutable(executable) {
  return executable.replaceAll('\\', '/');
}

function runCommand(definition) {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const result = spawnSync(definition.executable, definition.args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
  });
  const completedAt = new Date().toISOString();
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  return Object.freeze({
    id: definition.id,
    executable: normalizedExecutable(definition.executable),
    args: definition.args,
    startedAt,
    completedAt,
    durationMilliseconds: Math.round(performance.now() - started),
    exitCode: result.status,
    signal: result.signal,
    spawnError: result.error?.message ?? null,
    stdout,
    stdoutBytes: Buffer.byteLength(stdout, 'utf8'),
    stdoutSha256: sha256(Buffer.from(stdout, 'utf8')),
    stderr,
    stderrBytes: Buffer.byteLength(stderr, 'utf8'),
    stderrSha256: sha256(Buffer.from(stderr, 'utf8')),
  });
}

async function evidenceEntry(path) {
  const absolutePath = resolve(REPO_ROOT, path);
  const [bytes, metadata] = await Promise.all([
    readFile(absolutePath),
    stat(absolutePath),
  ]);
  return Object.freeze({
    path: path.slice(path.lastIndexOf('/') + 1),
    repositoryPath: path,
    bytes: metadata.size,
    sha256: sha256(bytes),
  });
}

async function writeBaselineManifest() {
  const files = [
    PROVENANCE_PROOF_PATH,
    SOURCE_CLOSURE_PATH,
    PROVENANCE_VERIFICATION_PATH,
    COMMAND_RESULTS_PATH,
    PROVENANCE_COMMANDS_PATH,
    `${SOURCE_CLOSURE_PATH.slice(0, SOURCE_CLOSURE_PATH.lastIndexOf('/'))}/README.md`,
  ];
  const entries = [];
  for (const path of files) entries.push(await evidenceEntry(path));
  const baseline = {
    schemaVersion: 2,
    kind: 'g5_authoritative_traversal_provenance_evidence_baseline',
    status: 'BOUNDED_EVIDENCE_BASELINE_NOT_G5',
    generatedAt: new Date().toISOString(),
    root: SOURCE_CLOSURE_PATH.slice(0, SOURCE_CLOSURE_PATH.lastIndexOf('/')),
    files: entries.length,
    bytes: entries.reduce((total, entry) => total + entry.bytes, 0),
    entries,
    selfExclusion:
      'this baseline manifest does not hash itself; its path is stable and every substantive evidence artifact is closed above',
    nonClaims: [
      'EVIDENCE_BASELINE_IS_NOT_PRODUCT_BROWSER_PROOF',
      'EVIDENCE_BASELINE_IS_NOT_HUMAN_PLAYTEST_PROOF',
      'G5_NOT_PASSED',
    ],
  };
  await writeFile(resolve(REPO_ROOT, baselinePath), jsonBytes(baseline), {
    flag: 'wx',
  });
  process.stdout.write(`${JSON.stringify({
    status: baseline.status,
    baselinePath,
    baselineSha256: sha256(jsonBytes(baseline)),
    files: baseline.files,
    bytes: baseline.bytes,
  }, null, 2)}\n`);
}

if (baselineOnly) {
  await writeBaselineManifest();
} else {
  const sourceClosureBytes = await readFile(resolve(REPO_ROOT, SOURCE_CLOSURE_PATH));
  const sourceClosure = JSON.parse(sourceClosureBytes.toString('utf8'));
  const proofBytes = await readFile(resolve(REPO_ROOT, PROVENANCE_PROOF_PATH));
  const stateBefore = await auditCurrentSourceClosure(sourceClosure);
  const startedAt = new Date().toISOString();
  const results = commands.map(runCommand);
  const completedAt = new Date().toISOString();
  const stateAfter = await auditCurrentSourceClosure(sourceClosure);
  const allCommandsPassed = results.every((result) => (
    result.exitCode === 0
    && result.signal === null
    && result.spawnError === null
  ));
  const exactRepositoryStateStayedClosed = (
    stateBefore.repositoryStateMatches
    && stateAfter.repositoryStateMatches
    && stateBefore.currentRepositoryStateDigestSha256
      === stateAfter.currentRepositoryStateDigestSha256
  );
  const criticalSourcesStayedClosed = (
    stateBefore.criticalSourcesMatch
    && stateAfter.criticalSourcesMatch
  );
  const commandResults = {
    schemaVersion: 2,
    kind: 'g5_authoritative_traversal_raw_command_results',
    status: allCommandsPassed && criticalSourcesStayedClosed
      ? 'BOUNDED_COMMAND_MATRIX_PASS_NOT_G5'
      : 'BOUNDED_COMMAND_MATRIX_FAILED_NOT_G5',
    startedAt,
    completedAt,
    workingDirectory: '.',
    sourceClosurePath: SOURCE_CLOSURE_PATH,
    sourceClosureSha256: sha256(sourceClosureBytes),
    proofPath: PROVENANCE_PROOF_PATH,
    proofSha256: sha256(proofBytes),
    recordedRepositoryStateDigestSha256:
      sourceClosure.repository.repositoryStateDigestSha256,
    repositoryStateBeforeSha256:
      stateBefore.currentRepositoryStateDigestSha256,
    repositoryStateAfterSha256:
      stateAfter.currentRepositoryStateDigestSha256,
    exactRepositoryStateStayedClosed,
    criticalSourcesStayedClosed,
    repositoryStateDriftSemantics:
      'full-tree drift is disclosed but does not invalidate command results when every critical G5 source byte remains closed',
    rawOutputEncoding: 'utf8',
    results,
    passedCommands: results.filter(({ exitCode }) => exitCode === 0).length,
    totalCommands: results.length,
    nonClaims: [
      'RAW_COMMAND_RESULTS_DO_NOT_PROVE_PRODUCT_BROWSER_REVISION_3',
      'RAW_COMMAND_RESULTS_DO_NOT_PROVE_HUMAN_2_4_8_PLAYTEST',
      'RAW_COMMAND_RESULTS_DO_NOT_PROVE_FINAL_ART_OR_PERFORMANCE',
      'G5_NOT_PASSED',
    ],
  };
  await writeFile(resolve(REPO_ROOT, commandResultsPath), jsonBytes(commandResults), {
    flag: 'wx',
  });
  process.stdout.write(`${JSON.stringify({
    status: commandResults.status,
    commandResultsPath,
    commandResultsSha256: sha256(jsonBytes(commandResults)),
    exactRepositoryStateStayedClosed,
    criticalSourcesStayedClosed,
    passedCommands: commandResults.passedCommands,
    totalCommands: commandResults.totalCommands,
  }, null, 2)}\n`);
  if (!allCommandsPassed || !criticalSourcesStayedClosed) process.exitCode = 1;
}
