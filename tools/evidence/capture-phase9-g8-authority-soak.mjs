import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const evidenceArgument = process.argv.find((argument) => argument.startsWith('--evidence-dir='));
const evidenceDirectory = path.resolve(
  projectRoot,
  evidenceArgument?.slice('--evidence-dir='.length)
    ?? 'evidence/2026-08-12/kyx-clean-room-parity-v1/relay-authority-soak-v2',
);
const testArguments = [
  'node_modules/vitest/vitest.mjs',
  'run',
  '--config',
  'vitest.authority-soak.config.ts',
  'tests/worker/authorityFullOccupancySoak.test.ts',
  '--reporter=verbose',
];
const startedAt = new Date();

function stripAnsi(value) {
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/gu, '');
}

function gitText(arguments_) {
  const result = spawnSync(process.env.GIT_EXECUTABLE ?? 'git', arguments_, {
    cwd: projectRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

const sourceAtStart = Object.freeze({
  commit: gitText(['rev-parse', 'HEAD']),
  branch: gitText(['branch', '--show-current']),
  status: gitText(['status', '--short']),
});
await mkdir(evidenceDirectory, { recursive: true });
const test = spawnSync(process.execPath, testArguments, {
  cwd: projectRoot,
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
  timeout: 150_000,
  windowsHide: true,
});
const stdout = stripAnsi(test.stdout ?? '');
const stderr = stripAnsi(test.stderr ?? '');
await Promise.all([
  writeFile(path.join(evidenceDirectory, 'vitest.stdout.log'), stdout, 'utf8'),
  writeFile(path.join(evidenceDirectory, 'vitest.stderr.log'), stderr, 'utf8'),
]);

const resultLine = stdout.split(/\r?\n/u)
  .find((line) => line.includes('KYX_AUTHORITY_SOAK_RESULT='));
if (test.status !== 0 || resultLine === undefined) {
  process.stderr.write(stdout);
  process.stderr.write(stderr);
  throw new Error(
    `Authority soak failed or omitted its result marker (exit ${String(test.status)}).`,
  );
}
const marker = 'KYX_AUTHORITY_SOAK_RESULT=';
const runtimeResult = JSON.parse(resultLine.slice(resultLine.indexOf(marker) + marker.length));
const finishedAt = new Date();
const evidence = Object.freeze({
  schemaVersion: 1,
  gate: 'canonical Relay local full-occupancy authority runtime soak',
  capturedAt: finishedAt.toISOString(),
  durationMilliseconds: finishedAt.getTime() - startedAt.getTime(),
  source: sourceAtStart,
  command: [process.execPath, ...testArguments],
  testExitCode: test.status,
  runtimeResult,
  interpretation: {
    qualifyingSurface: [
      'Eight accepted WebSockets connected through SELF.fetch to the actual Worker entrypoint.',
      'KyxRoom ran its real setTimeout-based FixedTickScheduler and Durable Object storage.',
      'Wire cost is the exact UTF-8 byte count observed at the WebSocket client boundary.',
      'Resume exercised the opaque credential, identity preservation, token rotation, and full snapshot.',
      'Two clients traversed the canonical Relay spawn-to-center route with protocol-v2 movement, faced within the locked tolerance, and authored one live auto-rifle kill while all eight clients remained connected.',
    ],
    limitations: [
      'This is a short deterministic local Workers-runtime soak, not a 30-minute production-network soak.',
      'Tick execution duration is runtime work inside each authority tick; scheduler delay is reported separately by observed tick rate.',
      'Combat proves one live auto-rifle kill at the verified Relay centerline pair. It is not exhaustive weapon, projectile, multi-kill, route, or arbitrary sightline coverage.',
      'Local Vitest-pool timing and bandwidth are not Cloudflare production latency or billing measurements.',
      'The bounded in-memory timing window resets if the Durable Object isolate is evicted.',
    ],
  },
});

await writeFile(
  path.join(evidenceDirectory, 'authority-soak.json'),
  `${JSON.stringify(evidence, null, 2)}\n`,
  'utf8',
);
await writeFile(
  path.join(evidenceDirectory, 'README.md'),
  [
    '# Canonical Relay local full-occupancy authority soak',
    '',
    `- Captured: ${evidence.capturedAt}`,
    `- Source commit: ${evidence.source.commit ?? 'unavailable'}`,
    `- Runtime: ${runtimeResult.runtime}`,
    `- Clients: ${runtimeResult.clients}`,
    `- Soak window: ${runtimeResult.soakDurationMilliseconds} ms`,
    `- Observed authority rate: ${runtimeResult.observedTickRateHertz} Hz`,
    `- Authority tick p99: ${runtimeResult.authorityTickExecution.p99Milliseconds} ms`,
    `- Observed bidirectional bytes: ${runtimeResult.network.totalObservedBytes}`,
    `- Resume: ${runtimeResult.resume.connectionMode}, identity preserved ${String(runtimeResult.resume.preservedPlayerId)}`,
    `- Combat convergence: ${runtimeResult.combat.convergedClientCount}/${runtimeResult.clients} clients`,
    '',
    'This evidence is local Worker/Durable Object runtime proof. Read `authority-soak.json`',
    'for the exact counters and declared limitations; it is not production-network or',
    '30-minute soak evidence.',
    '',
  ].join('\n'),
  'utf8',
);

process.stdout.write(`${JSON.stringify({
  ok: true,
  evidenceDirectory,
  authorityTickP99Milliseconds: runtimeResult.authorityTickExecution.p99Milliseconds,
  observedBytes: runtimeResult.network.totalObservedBytes,
}, null, 2)}\n`);
