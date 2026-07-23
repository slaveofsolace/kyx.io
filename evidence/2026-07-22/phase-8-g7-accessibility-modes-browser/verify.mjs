import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const audit = JSON.parse(await readFile(join(root, 'audit.json'), 'utf8'));
const failures = [];

if (audit.schema !== 'kyxio.g7.accessibility_modes_browser.v1') failures.push('schema');
if (audit.gate_status !== 'G7_OPEN') failures.push('gate_status');
if (!audit.cases.forced_colors.active) failures.push('forced_colors');
if (audit.cases.forced_colors.overflow.some((value) => value !== 0)) failures.push('forced_overflow');
if (audit.cases.forced_colors.visible_redundant_cues.length < 10) failures.push('forced_redundancy');

const saved = audit.cases.saved_reduced_high_contrast;
for (const key of ['highContrast', 'reducedMotion', 'reducedFlash']) {
  if (saved.body[key] !== 'true') failures.push(`saved_${key}`);
}
if (saved.settings_button_transition_seconds > 0.000001) failures.push('saved_transition');
if (saved.damage_flash_opacity !== 0 || saved.teleport_flash_opacity !== 0) failures.push('saved_flash');

const os = audit.cases.os_reduced_motion;
if (!os.media_matches || os.saved_reduced_motion !== false) failures.push('os_mode');
if (os.settings_button_transition_seconds > 0.000001) failures.push('os_transition');
if (os.intro_lifecycle_end_state.display !== 'none') failures.push('intro_lifecycle');

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
  screenshots: audit.screenshots.length,
  failures,
}, null, 2));
if (failures.length) process.exitCode = 1;
