import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const evidenceRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(evidenceRoot, '../../..');
const audit = JSON.parse(await readFile(resolve(evidenceRoot, 'audit.json'), 'utf8'));
const failures = [];

const requireValue = (condition, message) => {
  if (!condition) failures.push(message);
};

requireValue(audit.classification === 'BOUNDED_STRICT_G7_RUNTIME_PASS', 'unexpected classification');
requireValue(audit.gateStatus?.G7 === 'OPEN', 'G7 must remain OPEN');
requireValue(audit.verification?.tests?.passed === 4, 'expected four passing runtime tests');
requireValue(audit.verification?.tests?.failed === 0, 'runtime test failures must be zero');
requireValue(audit.verification?.tests?.skipped === 0, 'runtime test skips must be zero');
requireValue(audit.verification?.focusedLint === 'PASS', 'focused lint must pass');

const source = await readFile(resolve(repositoryRoot, audit.sourceCorrection.path));
requireValue(source.length === audit.sourceCorrection.bytes, 'source byte count mismatch');
requireValue(
  createHash('sha256').update(source).digest('hex') === audit.sourceCorrection.sha256,
  'source sha256 mismatch',
);

for (const screenshot of audit.screenshots ?? []) {
  const absolute = resolve(evidenceRoot, screenshot.path);
  const bytes = await readFile(absolute);
  const metadata = await stat(absolute);
  requireValue(metadata.size === screenshot.bytes, `${screenshot.path}: byte count mismatch`);
  requireValue(
    createHash('sha256').update(bytes).digest('hex') === screenshot.sha256,
    `${screenshot.path}: sha256 mismatch`,
  );
}

const output = await readFile(resolve(evidenceRoot, 'playwright-output.txt'), 'utf8');
requireValue(output.includes('4 passed'), 'missing passing Playwright summary');
requireValue(
  audit.browserZoomProbe?.result?.includes('not accepted as literal browser-zoom evidence'),
  'missing browser-zoom limitation',
);
requireValue(
  audit.limitations?.some((entry) => entry.includes('Human NVDA')),
  'missing human screen-reader limitation',
);

if (failures.length > 0) {
  console.error(JSON.stringify({ classification: 'BOUNDED_STRICT_G7_RUNTIME_FAIL', failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    classification: audit.classification,
    tests: audit.verification.tests,
    screenshots: audit.screenshots.length,
    gateStatus: audit.gateStatus
  }, null, 2));
}
