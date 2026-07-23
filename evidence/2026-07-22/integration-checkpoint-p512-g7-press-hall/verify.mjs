import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const repo = resolve(root, '..', '..', '..');
const checkpoint = JSON.parse(await readFile(join(root, 'checkpoint.json'), 'utf8'));
const failures = [];

if (checkpoint.schema !== 'kyxio.integration_checkpoint.v1') failures.push('schema');
if (checkpoint.classification !== 'INTEGRATED_BOUNDED_CHECKPOINT_PASS') failures.push('classification');
if (checkpoint.formal_gates_accepted.join(',') !== 'G0,G1,G2') failures.push('accepted_gates');
if (!checkpoint.formal_gates_open.includes('G9')) failures.push('open_gates');
if (checkpoint.checks.app_tests !== 684 || checkpoint.checks.worker_tests !== 29) failures.push('test_counts');
if (checkpoint.checks.press_hall_chromium_passed !== 4) failures.push('browser_cases');
if (checkpoint.checks.g7_viewport_hud_passed !== 12) failures.push('g7_matrix');
if (!checkpoint.bounded_decisions.press_hall_asset.startsWith('NOT_G5_READY')) failures.push('press_hall_truth');

for (const entry of checkpoint.hashes) {
  const path = join(repo, entry.file);
  const bytes = await readFile(path);
  const info = await stat(path);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (info.size !== entry.bytes) failures.push(`bytes:${entry.file}`);
  if (sha256 !== entry.sha256) failures.push(`sha256:${entry.file}`);
}

console.log(JSON.stringify({
  status: failures.length ? 'FAIL' : 'PASS',
  classification: checkpoint.classification,
  accepted_gates: checkpoint.formal_gates_accepted,
  open_gates: checkpoint.formal_gates_open,
  hash_count: checkpoint.hashes.length,
  failures,
}, null, 2));
if (failures.length) process.exitCode = 1;
