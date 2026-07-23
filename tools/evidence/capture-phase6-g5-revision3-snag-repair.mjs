import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

const root = new URL('../../', import.meta.url);
const outputDirectory = new URL(
  '../../evidence/2026-07-22/phase-6-g5-canonical-traversal-snag-repair/runtime-v1/',
  import.meta.url,
);
const output = new URL('g5-revision3-snag-repair-proof.json', outputDirectory);

const server = await createServer({
  root: fileURLToPath(root),
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false },
  logLevel: 'error',
});

try {
  const module = await server.ssrLoadModule(
    '/tools/evidence/capture-phase6-g5-revision3-snag-repair.module.ts',
  );
  const capture = await module.capturePhase6G5Revision3SnagRepair();
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(output, `${JSON.stringify(capture, null, 2)}\n`, 'utf8');
  process.stdout.write(`${fileURLToPath(output)}\n`);
} finally {
  await server.close();
}
