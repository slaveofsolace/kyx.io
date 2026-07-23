import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const checkpointRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(checkpointRoot, '../../..');
const checkpoint = JSON.parse(await readFile(resolve(checkpointRoot, 'checkpoint.json'), 'utf8'));
const failures = [];

const requireValue = (condition, message) => {
  if (!condition) failures.push(message);
};

requireValue(checkpoint.classification === 'INTEGRATED_BOUNDED_CHECKPOINT_PASS', 'unexpected classification');
requireValue(JSON.stringify(checkpoint.acceptedGates) === JSON.stringify(['G0', 'G1', 'G2']), 'accepted gates changed');
requireValue(JSON.stringify(checkpoint.openGates) === JSON.stringify(['G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9']), 'open gate set changed');

for (const artifact of checkpoint.artifacts ?? []) {
  const bytes = await readFile(resolve(repositoryRoot, artifact.path));
  requireValue(bytes.length === artifact.bytes, `${artifact.path}: byte count mismatch`);
  requireValue(
    createHash('sha256').update(bytes).digest('hex') === artifact.sha256,
    `${artifact.path}: sha256 mismatch`,
  );
}

const previous = JSON.parse(await readFile(resolve(repositoryRoot, checkpoint.artifacts[0].path), 'utf8'));
requireValue(JSON.stringify(previous.formal_gates_accepted) === JSON.stringify(['G0', 'G1', 'G2']), 'prior accepted baseline changed');

const p513 = JSON.parse(await readFile(resolve(repositoryRoot, 'evidence/2026-07-22/phase-5-p5-13/runtime-proof.json'), 'utf8'));
const p513Verification = JSON.parse(await readFile(resolve(repositoryRoot, 'evidence/2026-07-22/phase-5-p5-13/verification.json'), 'utf8'));
requireValue(p513.profile === 'p511-inkfall-foundry-revision-2-combat-v1', 'P5.13 profile mismatch');
requireValue(p513.twoClientEvictionParity?.status === 'PASS', 'P5.13 eviction parity missing');
requireValue(p513.twoClientEvictionParity?.samePersistedAuthorityTick === true, 'P5.13 authority tick mismatch');
requireValue(p513.failClosed?.status === 'PASS' && p513.failClosed?.partialAuthorityMutation === false, 'P5.13 fail-closed boundary missing');
requireValue(p513Verification.status === 'PASS' && p513Verification.matrix.every((entry) => entry.status === 'PASS'), 'P5.13 matrix not fully green');
requireValue(p513.gateClaims?.G4 === false && p513.gateClaims?.G5 === false, 'P5.13 overclaims a gate');

const press = JSON.parse(await readFile(resolve(repositoryRoot, 'evidence/2026-07-22/phase-6-g5-press-hall-material-export-v3-3/actual-loader-v4/verification.json'), 'utf8'));
requireValue(press.checkCount === 67 && press.passCount === 67 && press.failureCount === 0, 'Press Hall verification mismatch');
requireValue(press.status.includes('ASSET_ONLY_G5_G8_OPEN'), 'Press Hall boundary missing');

const rig = JSON.parse(await readFile(resolve(repositoryRoot, 'assets/source/blender/phase7-character-original-v6/evidence/v6-contact-first-rig-rev11b/contact-rig-foundation-seal.json'), 'utf8'));
requireValue(rig.status === 'CONTACT_RIG_FOUNDATION_ONLY_ACCEPTED', 'contact-rig foundation status mismatch');
requireValue(rig.scope?.v6bAccepted === false && rig.scope?.g6Accepted === false, 'contact-rig foundation overclaims V6-B/G6');
requireValue(rig.structuralAcceptance?.poseFailures === 0 && rig.structuralAcceptance?.zeroWeightVertices === 0, 'contact-rig structural failure');
requireValue(rig.visualDisposition?.contactInferredOnly === false, 'contact remains inferred only');

const strict = JSON.parse(await readFile(resolve(repositoryRoot, 'evidence/2026-07-22/phase-8-g7-strict-runtime/audit.json'), 'utf8'));
const pointer = JSON.parse(await readFile(resolve(repositoryRoot, 'evidence/2026-07-22/phase-8-g7-pointer-lock-escape/observation.json'), 'utf8'));
requireValue(strict.verification?.tests?.passed === 4 && strict.verification?.tests?.skipped === 0, 'strict G7 matrix mismatch');
requireValue(strict.gateStatus?.G7 === 'OPEN', 'strict G7 evidence overclaims closure');
requireValue(pointer.afterEscape?.pointerLocked === false && pointer.afterEscape?.pauseVisible === true && pointer.afterEscape?.activeElement === 'resume-btn', 'pointer-lock Escape lifecycle mismatch');

requireValue(checkpoint.nonClaims?.includes('NO_G3_THROUGH_G9_GATE_CLOSURE'), 'missing gate non-claim');
requireValue(checkpoint.nonClaims?.includes('NO_DEPLOY_OR_PUBLISH'), 'missing deployment non-claim');

if (failures.length > 0) {
  console.error(JSON.stringify({ classification: 'INTEGRATED_BOUNDED_CHECKPOINT_FAIL', failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    classification: checkpoint.classification,
    acceptedGates: checkpoint.acceptedGates,
    openGates: checkpoint.openGates,
    artifactHashes: checkpoint.artifacts.length,
    boundedResults: Object.keys(checkpoint.boundedResults)
  }, null, 2));
}
