import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const evidenceRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(evidenceRoot, '../../..');
const audit = JSON.parse(await readFile(resolve(evidenceRoot, 'audit.json'), 'utf8'));
const observation = JSON.parse(await readFile(resolve(evidenceRoot, audit.observation), 'utf8'));
const failures = [];

const requireValue = (condition, message) => {
  if (!condition) failures.push(message);
};

requireValue(audit.classification === 'BOUNDED_POINTER_LOCK_ESCAPE_PASS', 'unexpected classification');
requireValue(audit.gateStatus?.G7 === 'OPEN', 'G7 must remain OPEN');
requireValue(observation.before?.pointerLocked === false, 'unexpected initial pointer-lock state');
requireValue(observation.afterStart?.pointerLocked === true, 'pointer lock was not acquired');
requireValue(observation.afterStart?.activeElement === 'game-canvas', 'canvas did not own focus after start');
requireValue(observation.afterEscape?.pointerLocked === false, 'Escape did not release pointer lock');
requireValue(observation.afterEscape?.pauseVisible === true, 'pause menu was not visible after Escape');
requireValue(observation.afterEscape?.activeElement === 'resume-btn', 'Resume did not receive restored focus');

for (const source of audit.sources ?? []) {
  const bytes = await readFile(resolve(repositoryRoot, source.path));
  requireValue(bytes.length === source.bytes, `${source.path}: byte count mismatch`);
  requireValue(
    createHash('sha256').update(bytes).digest('hex') === source.sha256,
    `${source.path}: sha256 mismatch`,
  );
}

const screenshotPath = resolve(evidenceRoot, audit.screenshot.path);
const screenshot = await readFile(screenshotPath);
const screenshotStat = await stat(screenshotPath);
requireValue(screenshotStat.size === audit.screenshot.bytes, 'screenshot byte count mismatch');
requireValue(
  createHash('sha256').update(screenshot).digest('hex') === audit.screenshot.sha256,
  'screenshot sha256 mismatch',
);
requireValue(audit.verification?.combinedStrictBrowser?.includes('4 passed'), 'missing combined browser pass');
requireValue(audit.limitations?.some((entry) => entry.includes('does not close G7')), 'missing G7 limitation');

if (failures.length > 0) {
  console.error(JSON.stringify({ classification: 'BOUNDED_POINTER_LOCK_ESCAPE_FAIL', failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    classification: audit.classification,
    afterEscape: observation.afterEscape,
    sourceHashes: audit.sources.length,
    gateStatus: audit.gateStatus
  }, null, 2));
}
