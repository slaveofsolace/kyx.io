import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function option(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function fingerprint(targetPath) {
  const bytes = await readFile(targetPath);
  return { bytes: bytes.byteLength, sha256: sha256(bytes) };
}

const evidenceDirectory = path.resolve(
  repositoryRoot,
  option(
    'evidence-dir',
    'evidence/2026-07-22/phase-9-g8-runtime-instrumentation/smoke-v1',
  ),
);
const summaryPath = path.join(evidenceDirectory, 'runtime-instrumentation.json');
const outputPath = path.join(evidenceDirectory, 'independent-verification.json');
const capture = JSON.parse(await readFile(summaryPath, 'utf8'));
const report = {
  schemaVersion: 1,
  verifiedAt: new Date().toISOString(),
  artifactScope: 'PHASE_9_G8_RUNTIME_INSTRUMENTATION_VERIFICATION',
  g8Status: 'OPEN',
  summaryPath,
  summaryFingerprint: await fingerprint(summaryPath),
  checks: [],
  failures: [],
  ok: false,
};

function check(id, passed, details = {}) {
  const record = { id, passed: Boolean(passed), details };
  report.checks.push(record);
  if (!record.passed) report.failures.push(record);
}

check('contract.schema', capture.schemaVersion === 1, { schemaVersion: capture.schemaVersion });
check('contract.scope', capture.artifactScope === 'PHASE_9_G8_RUNTIME_INSTRUMENTATION', {
  artifactScope: capture.artifactScope,
});
check('contract.g8_remains_open', capture.g8Status === 'OPEN', { g8Status: capture.g8Status });
check('contract.no_visual_claim', capture.visualApproval === 'NOT_PERFORMED_OR_CLAIMED', {
  visualApproval: capture.visualApproval,
});
check('contract.non_claims_present', Array.isArray(capture.nonClaims) && capture.nonClaims.length >= 3);
check('capture.self_checks_pass', capture.ok === true && capture.failures.length === 0, {
  ok: capture.ok,
  failures: capture.failures,
});
check('capture.samples_present', (
  Array.isArray(capture.samples)
  && capture.samples.length >= 2
  && capture.aggregate?.sampleCount === capture.samples.length
), {
  sampleCount: capture.samples?.length ?? null,
  aggregateSampleCount: capture.aggregate?.sampleCount ?? null,
});
check('capture.frame_distribution_present', capture.aggregate?.frameTimes?.count > 0, {
  frameTimes: capture.aggregate?.frameTimes ?? null,
});
check('capture.long_task_distribution_present', capture.aggregate?.longTasks?.count >= 0, {
  longTasks: capture.aggregate?.longTasks ?? null,
});
check('capture.label_matches_candidate_contract', (
  capture.requested.qualifyingCandidate === true
    ? (
      capture.evidenceLabel === 'SOAK_INPUT_REQUIRES_FINAL_GATE_REVIEW'
      && capture.requested.durationMs >= capture.requested.minimumQualifyingSoakMs
      && capture.aggregate?.qualifyingSoakInput === true
    )
    : (
    capture.evidenceLabel === 'NON_QUALIFYING_INSTRUMENTATION_SMOKE'
      && capture.aggregate?.qualifyingSoakInput === false
    )
), {
  qualifyingCandidate: capture.requested.qualifyingCandidate,
  durationMs: capture.requested.durationMs,
  minimumQualifyingSoakMs: capture.requested.minimumQualifyingSoakMs,
  evidenceLabel: capture.evidenceLabel,
  qualifyingSoakDuration: capture.aggregate?.qualifyingSoakDuration,
  qualifyingSoakInput: capture.aggregate?.qualifyingSoakInput,
});
check('capture.warmup_recorded', (
  capture.product?.warmup?.requestedDurationMs === capture.requested.warmupMs
  && capture.product?.warmup?.actualDurationMs >= capture.requested.warmupMs
  && capture.product?.warmup?.activitySteps > 0
  && capture.product?.warmup?.aggregate?.frameTimes?.count > 0
), { warmup: capture.product?.warmup ?? null });
check('capture.resource_ranges_present', (
  capture.aggregate?.resourceRanges?.renderCalls?.count > 0
  && capture.aggregate?.resourceRanges?.renderTriangles?.count > 0
  && capture.aggregate?.resourceRanges?.sceneObjects?.count > 0
), { resourceRanges: capture.aggregate?.resourceRanges ?? null });
check('capture.memory_trends_present', (
  capture.aggregate?.trendsPerMinute
  && Object.hasOwn(capture.aggregate.trendsPerMinute, 'jsHeapUsedBytes')
  && Object.hasOwn(capture.aggregate.trendsPerMinute, 'nodes')
  && Object.hasOwn(capture.aggregate.trendsPerMinute, 'jsEventListeners')
), { trendsPerMinute: capture.aggregate?.trendsPerMinute ?? null });
check('capture.interval_work_is_labeled', (
  typeof capture.aggregate?.chromiumIntervals?.note === 'string'
  && capture.aggregate.chromiumIntervals.note.includes('not per-frame')
), { chromiumIntervals: capture.aggregate?.chromiumIntervals ?? null });
check('capture.assessment_remains_nonclaiming', (
  capture.assessment?.gateDecision === 'G8_OPEN_REQUIRES_FINAL_INTEGRATED_REVIEW'
  && Array.isArray(capture.assessment?.unavailableOrSeparateEvidence)
  && capture.assessment.unavailableOrSeparateEvidence.length >= 3
), { assessment: capture.assessment ?? null });

if (capture.requested.qualifyingCandidate === true) {
  check('candidate.strict_prerequisites', (
    capture.requested.headed === true
    && capture.requested.softwareRenderer === false
    && capture.requested.finalIntegratedBuild === true
    && capture.requested.playerCount + capture.requested.botCount >= 8
    && capture.requested.warmupMs >= 60_000
    && capture.host?.missingMachineMetadata?.length === 0
    && capture.assessment?.detectedSoftwareRenderer === false
    && capture.assessment?.eligibleSoakInput === true
  )
  , {
    requested: capture.requested,
    host: capture.host,
    assessment: capture.assessment,
  });
}

for (const artifact of capture.artifacts ?? []) {
  const targetPath = path.resolve(evidenceDirectory, artifact.path);
  const current = await fingerprint(targetPath);
  check(`artifact.${artifact.id}.fingerprint`, (
    current.bytes === artifact.bytes && current.sha256 === artifact.sha256
  ), { recorded: artifact, current });
}

const sourcePaths = {
  captureScript: path.join(repositoryRoot, 'tools', 'evidence', 'capture-phase9-g8-runtime-instrumentation.mjs'),
  debugMetrics: path.join(repositoryRoot, 'src', 'render', 'debugMetrics.ts'),
  world: path.join(repositoryRoot, 'src', 'world', 'World.js'),
  game: path.join(repositoryRoot, 'src', 'core', 'Game.js'),
  main: path.join(repositoryRoot, 'src', 'main.js'),
  packageLock: path.join(repositoryRoot, 'package-lock.json'),
};
for (const [id, targetPath] of Object.entries(sourcePaths)) {
  const current = await fingerprint(targetPath);
  const recorded = capture.sources?.[id] ?? null;
  check(`source.${id}.fingerprint`, (
    recorded !== null
    && current.bytes === recorded.bytes
    && current.sha256 === recorded.sha256
  ), { targetPath, recorded, current });
}

check('output.directory_exists', (await stat(evidenceDirectory)).isDirectory(), { evidenceDirectory });
report.ok = report.failures.length === 0;
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({
  ok: report.ok,
  g8Status: report.g8Status,
  outputPath,
  checks: report.checks.length,
  failures: report.failures.map((failure) => failure.id),
}, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;
