import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const matrix = JSON.parse(await readFile(join(root, 'matrix.json'), 'utf8'));
const failures = [];

if (matrix.schema !== 'kyxio.g7.browser_matrix.v1') failures.push('schema');
if (matrix.gate_status !== 'G7_OPEN') failures.push('gate_status_must_remain_open');
if (matrix.cases.length !== 12) failures.push('case_count');
if (matrix.screenshots.length !== 12) failures.push('screenshot_count');

const expectedViewports = new Set(['1280x720', '1920x1080', '2560x1440', '3440x1440']);
const expectedScales = { minimum: 0.8, default: 1, maximum: 1.4 };
for (const [profile, scale] of Object.entries(expectedScales)) {
  const rows = matrix.cases.filter((row) => row.profile === profile);
  if (rows.length !== 4) failures.push(`${profile}_case_count`);
  const viewports = new Set(rows.map((row) => row.viewport.join('x')));
  if ([...expectedViewports].some((value) => !viewports.has(value))) failures.push(`${profile}_viewports`);
  if (rows.some((row) => row.hud_scale !== scale)) failures.push(`${profile}_scale`);
}

for (const row of matrix.cases) {
  if (row.overflow_x !== 0 || row.overflow_y !== 0) failures.push(`overflow:${row.profile}:${row.viewport.join('x')}`);
  if (row.outside.length !== 0) failures.push(`outside:${row.profile}:${row.viewport.join('x')}`);
  if (row.visible_semantic !== 13) failures.push(`semantic_count:${row.profile}:${row.viewport.join('x')}`);
}

for (const shot of matrix.screenshots) {
  const path = join(root, shot.file);
  const bytes = await readFile(path);
  const info = await stat(path);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (info.size !== shot.bytes) failures.push(`bytes:${shot.file}`);
  if (sha256 !== shot.sha256) failures.push(`sha256:${shot.file}`);
}

const result = {
  status: failures.length === 0 ? 'PASS' : 'FAIL',
  classification: matrix.classification,
  gate_status: matrix.gate_status,
  cases: matrix.cases.length,
  screenshots: matrix.screenshots.length,
  failures,
};
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
