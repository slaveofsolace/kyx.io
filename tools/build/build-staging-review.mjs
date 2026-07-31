import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const viteEntrypoint = path.join(
  repositoryRoot,
  'node_modules',
  'vite',
  'bin',
  'vite.js',
);

const result = spawnSync(
  process.execPath,
  [viteEntrypoint, 'build', '--mode', 'staging-review'],
  {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      VITE_KYX_AUTHORITY_ORIGIN: '',
    },
    stdio: 'inherit',
  },
);

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`STAGING_REVIEW_BUILD_FAILED status=${result.status}`);
}
