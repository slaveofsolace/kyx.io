import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const audit = JSON.parse(await readFile(join(root, 'audit.json'), 'utf8'));
const failures = [];

if (audit.schema !== 'kyxio.g7.zoom_equivalent_browser.v1') failures.push('schema');
if (audit.gate_status !== 'G7_OPEN') failures.push('gate_status');
if (audit.cases.length !== 3) failures.push('case_count');
if (audit.screenshots.length !== 3) failures.push('screenshot_count');

const expected = new Map([[100, '1280x720'], [125, '1024x576'], [200, '640x360']]);
for (const row of audit.cases) {
  if (row.css_viewport.join('x') !== expected.get(row.zoom_percent)) failures.push(`viewport:${row.zoom_percent}`);
  if (row.overflow.some((value) => value !== 0)) failures.push(`overflow:${row.zoom_percent}`);
  if (row.outside.length !== 0) failures.push(`outside:${row.zoom_percent}`);
  if (row.visible_semantic !== 13) failures.push(`semantic:${row.zoom_percent}`);
  if (row.desktop_overlay_display !== 'none') failures.push(`desktop_overlay:${row.zoom_percent}`);
}

for (const shot of audit.screenshots) {
  const path = join(root, shot.file);
  const bytes = await readFile(path);
  const info = await stat(path);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (info.size !== shot.bytes) failures.push(`bytes:${shot.file}`);
  if (sha256 !== shot.sha256) failures.push(`sha256:${shot.file}`);
}

console.log(JSON.stringify({
  status: failures.length ? 'FAIL' : 'PASS',
  classification: audit.classification,
  gate_status: audit.gate_status,
  cases: audit.cases.length,
  screenshots: audit.screenshots.length,
  failures,
}, null, 2));
if (failures.length) process.exitCode = 1;
