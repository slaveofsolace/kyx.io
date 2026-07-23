import { spawnSync } from 'node:child_process';

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error('Run the aggregate check through the pinned package manager: npm run check');
}

const browserRequested = process.argv.includes('--browser');
const checks = [
  'typecheck',
  'typecheck:sim',
  'lint',
  'test',
  'validate:assets',
  'verify:legacy-relay',
  'build',
  'verify:phase2-boundaries',
  'verify:truth',
];

if (browserRequested) checks.push('test:browser');

for (const script of checks) {
  process.stdout.write(`\n=== npm run ${script} ===\n`);
  const result = spawnSync(process.execPath, [npmCli, 'run', '--silent', script], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(`\nAggregate check stopped: ${script} failed.\n`);
    process.exit(result.status ?? 1);
  }
}

process.stdout.write(`\nAggregate check passed (${checks.length}/${checks.length} stages).\n`);
if (!browserRequested) {
  process.stdout.write('Browser tests were not run; checkpoint evidence requires npm run check:full.\n');
}
