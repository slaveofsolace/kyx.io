import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
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
  option('evidence-dir', 'evidence/2026-07-22/phase-9-g8-asset-preload/smoke-v1'),
);
const capturePath = path.join(evidenceDirectory, 'runtime-instrumentation.json');
const independentPath = path.join(evidenceDirectory, 'independent-verification.json');
const outputPath = path.join(evidenceDirectory, 'asset-preload-verification.json');
const capture = JSON.parse(await readFile(capturePath, 'utf8'));
const independent = JSON.parse(await readFile(independentPath, 'utf8'));
const gamePath = path.join(repositoryRoot, 'src', 'core', 'Game.js');
const currentGame = await fingerprint(gamePath);
const recordedGame = capture.sources?.game ?? null;
const glbRequests = (capture.network?.resources ?? [])
  .map((resource) => {
    try {
      const url = new URL(resource.url);
      return url.pathname.endsWith('.glb')
        ? { path: url.pathname, responseBodySize: resource.responseBodySize }
        : null;
    } catch {
      return null;
    }
  })
  .filter(Boolean);
const glbPaths = glbRequests.map((request) => request.path).sort();
const removedEagerPaths = ['/player.glb', '/spartan.glb', '/weapons.glb', '/zombie.glb'];

const report = {
  schemaVersion: 1,
  verifiedAt: new Date().toISOString(),
  artifactScope: 'PHASE_9_G8_DEFAULT_PATH_ASSET_PRELOAD_VERIFICATION',
  g8Status: 'OPEN',
  capturePath,
  captureFingerprint: await fingerprint(capturePath),
  glbRequests,
  checks: [],
  failures: [],
  ok: false,
};

function check(id, passed, details = {}) {
  const entry = { id, passed: passed === true, details };
  report.checks.push(entry);
  if (!entry.passed) report.failures.push(entry);
}

check('capture.is_non_qualifying_smoke', (
  capture.evidenceLabel === 'NON_QUALIFYING_INSTRUMENTATION_SMOKE'
  && capture.g8Status === 'OPEN'
  && capture.requested?.qualifyingCandidate === false
), {
  evidenceLabel: capture.evidenceLabel,
  g8Status: capture.g8Status,
  qualifyingCandidate: capture.requested?.qualifyingCandidate,
});
check('capture.completed_without_errors', (
  capture.ok === true
  && (capture.failures?.length ?? 0) === 0
  && (capture.errors?.length ?? 0) === 0
), { failures: capture.failures, errors: capture.errors });
check('general_independent_verification.passed', (
  independent.ok === true && (independent.failures?.length ?? 0) === 0
), { ok: independent.ok, failures: independent.failures });
check('default_path.requests_only_preferred_soldier_glb', (
  glbPaths.length === 1 && glbPaths[0] === '/soldier.glb'
), { glbRequests });
check('default_path.removed_eager_glbs_absent', (
  removedEagerPaths.every((removedPath) => !glbPaths.includes(removedPath))
), { removedEagerPaths, glbPaths });
check('default_path.soldier_body_size_recorded', (
  glbRequests[0]?.path === '/soldier.glb'
  && Number.isFinite(glbRequests[0]?.responseBodySize)
  && glbRequests[0].responseBodySize > 0
), { request: glbRequests[0] ?? null });
check('budget.first_playable_transfer_signal_passes', (
  capture.assessment?.budgetSignals?.firstPlayableTransfer?.passed === true
  && capture.network?.transferBytes <= 12_000_000
), {
  signal: capture.assessment?.budgetSignals?.firstPlayableTransfer ?? null,
  transferBytes: capture.network?.transferBytes ?? null,
});
check('source.game_fingerprint_present', recordedGame !== null, { recordedGame });
check('source.game_fingerprint_matches_current', (
  recordedGame !== null
  && recordedGame.bytes === currentGame.bytes
  && recordedGame.sha256 === currentGame.sha256
), { recordedGame, currentGame, gamePath });
check('g8.remains_open_for_other_budgets', (
  capture.assessment?.gateDecision === 'G8_OPEN_REQUIRES_FINAL_INTEGRATED_REVIEW'
  && capture.assessment?.budgetSignals?.drawCalls?.passed === false
), {
  gateDecision: capture.assessment?.gateDecision ?? null,
  drawCalls: capture.assessment?.budgetSignals?.drawCalls ?? null,
});

report.ok = report.failures.length === 0;
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({
  ok: report.ok,
  g8Status: report.g8Status,
  outputPath,
  checks: report.checks.length,
  failures: report.failures.map((failure) => failure.id),
  glbPaths,
  transferBytes: capture.network?.transferBytes ?? null,
}, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;

