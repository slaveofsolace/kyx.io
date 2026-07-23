import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

const root = new URL('../../', import.meta.url);
const output = new URL(
  '../../assets/source/maps/inkfall-foundry/runtime/combat-authority-fixture.g5-revision3.v1.json',
  import.meta.url,
);

const server = await createServer({
  root: fileURLToPath(root),
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false },
  logLevel: 'error',
});

try {
  const module = await server.ssrLoadModule(
    '/tools/assets/build-inkfall-revision3-combat-fixture.module.ts',
  );
  const snapshot = await module.buildInkfallRevision3CombatFixtureSnapshot();
  await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  process.stdout.write(`${fileURLToPath(output)}\n`);
} finally {
  await server.close();
}
