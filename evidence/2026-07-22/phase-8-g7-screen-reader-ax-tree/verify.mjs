import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const audit = JSON.parse(await readFile(resolve(root, 'audit.json'), 'utf8'));
const failures = [];

const requireValue = (condition, message) => {
  if (!condition) failures.push(message);
};

requireValue(audit.classification === 'BOUNDED_BROWSER_AX_TREE_PASS', 'unexpected classification');
requireValue(audit.gateStatus?.G7 === 'OPEN', 'G7 must remain OPEN');
requireValue(Array.isArray(audit.cases) && audit.cases.length === 3, 'expected exactly three AX cases');
requireValue(audit.cases.every((entry) => entry.pass === true), 'all bounded AX cases must pass');

const menu = audit.cases.find((entry) => entry.id === 'practice-menu');
requireValue(menu?.observed?.disabledControl?.disabled === true, 'online control must remain disabled');
requireValue(menu?.observed?.focusableControls?.includes('START OFFLINE PRACTICE'), 'missing start-practice control');
requireValue(menu?.observed?.focusableControls?.includes('INSPECT LOCKED INKFALL FOUNDRY @2'), 'missing Inkfall inspection link');

const hud = audit.cases.find((entry) => entry.id === 'paused-offline-practice-hud');
requireValue(hud?.observed?.dialog?.modal === true, 'pause dialog must be modal');
requireValue(hud?.observed?.assertiveAtomicPointerLockAlert === true, 'pointer-lock warning must be assertive and atomic');
requireValue(hud?.observed?.numericNames?.includes('Health 100 of 100'), 'missing numeric health name');
requireValue(hud?.observed?.abilityNames?.includes('Blink, Q, ready'), 'missing ability state name');

const live = audit.cases.find((entry) => entry.id === 'caption-and-critical-audio-live-regions');
for (const name of ['Subtitles', 'Critical sound indicators']) {
  const region = live?.observed?.regions?.find((entry) => entry.name === name);
  requireValue(region?.live === 'polite' && region?.atomic === true, `${name} must be polite and atomic`);
}
for (const text of ['ANNOUNCER', 'FRONT', 'Objective secured', 'GRENADE WARNING', 'REAR']) {
  requireValue(live?.observed?.announcedText?.includes(text), `missing announced text: ${text}`);
}

for (const screenshot of audit.screenshots ?? []) {
  const absolute = resolve(root, screenshot.path);
  const bytes = await readFile(absolute);
  const metadata = await stat(absolute);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  requireValue(metadata.size === screenshot.bytes, `${screenshot.path}: byte count mismatch`);
  requireValue(sha256 === screenshot.sha256, `${screenshot.path}: sha256 mismatch`);
}

requireValue(audit.limitations?.some((entry) => entry.includes('not human NVDA')), 'missing human screen-reader limitation');
requireValue(audit.limitations?.some((entry) => entry.includes('G7 remains open')), 'missing explicit G7-open limitation');

if (failures.length > 0) {
  console.error(JSON.stringify({ classification: 'BOUNDED_BROWSER_AX_TREE_FAIL', failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    classification: audit.classification,
    cases: audit.cases.length,
    screenshots: audit.screenshots.length,
    gateStatus: audit.gateStatus
  }, null, 2));
}
