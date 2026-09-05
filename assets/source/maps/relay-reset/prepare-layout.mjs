import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const result = await build({
  stdin: {
    contents: `import { RELAY_AUTHORITY_FIXTURE, RELAY_AUTHORITY_FIXTURE_HASH, RELAY_AUTHORITY_SPAWNS, RELAY_AUTHORITY_ZONES } from './src/authority/relayAuthority.ts'; export { RELAY_AUTHORITY_FIXTURE, RELAY_AUTHORITY_FIXTURE_HASH, RELAY_AUTHORITY_SPAWNS, RELAY_AUTHORITY_ZONES };`,
    resolveDir: root,
    sourcefile: 'relay-reset-fixture-export.ts',
    loader: 'ts',
  },
  bundle: true,
  format: 'cjs',
  platform: 'node',
  packages: 'external',
  write: false,
  logLevel: 'silent',
});
const module = { exports: {} };
new Function('module', 'exports', 'require', result.outputFiles[0].text)(
  module,
  module.exports,
  createRequire(import.meta.url),
);
const values = module.exports;
const fixture = values.RELAY_AUTHORITY_FIXTURE;
const packet = {
  schemaVersion: 1,
  sourceHead: '373e9de6bff25e5ceae1c0af15839654273af6e1',
  sourceSha256: createHash('sha256')
    .update(readFileSync(resolve(root, 'src/authority/relayAuthority.ts')))
    .digest('hex'),
  fixtureHash: values.RELAY_AUTHORITY_FIXTURE_HASH,
  fixture,
  spawns: values.RELAY_AUTHORITY_SPAWNS,
  zones: values.RELAY_AUTHORITY_ZONES,
  comparison: {
    authorityFeetMm: [-29000, 0, 0],
    yawMilliDegrees: 90000,
    pitchMilliDegrees: 0,
    eyeHeightMeters: 1.7,
    verticalFovDegrees: 78,
    viewport: [1707, 863],
  },
};
writeFileSync(new URL('layout.json', import.meta.url), JSON.stringify(packet, null, 2) + '\n');
console.log(JSON.stringify({ fixtureHash: packet.fixtureHash, solidCount: fixture.solids.length, spawns: packet.spawns.length }));
