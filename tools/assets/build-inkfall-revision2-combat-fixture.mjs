import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

const root = new URL('../../', import.meta.url);
const output = new URL(
  '../../assets/source/maps/inkfall-foundry/runtime/combat-authority-fixture.p5-10.v1.json',
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
    '/tools/assets/build-inkfall-revision2-combat-fixture.module.ts',
  );
  const snapshot = await module.buildInkfallRevision2CombatFixtureSnapshot();
  await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  process.stdout.write(`${fileURLToPath(output)}\n`);
} finally {
  await server.close();
}
