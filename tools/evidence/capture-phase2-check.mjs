import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outputDirectory = path.join(
  repositoryRoot,
  'evidence',
  '2026-07-19',
  'phase-2-toolchain-contracts',
);
const pnpmCli = process.env.KYX_PNPM_CLI;
if (!pnpmCli) {
  throw new Error('Set KYX_PNPM_CLI to the bundled pnpm.mjs path.');
}

await mkdir(outputDirectory, { recursive: true });

async function run(label, executable, argumentsList, logName) {
  process.stdout.write(`\n=== ${label} ===\n`);
  const child = spawn(executable, argumentsList, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const chunks = [];
  child.stdout.on('data', (chunk) => {
    chunks.push(chunk);
    process.stdout.write(chunk);
  });
  child.stderr.on('data', (chunk) => {
    chunks.push(chunk);
    process.stderr.write(chunk);
  });
  const status = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  const output = Buffer.concat(chunks).toString('utf8');
  if (logName) {
    await writeFile(
      path.join(outputDirectory, logName),
      `COMMAND ${executable} ${argumentsList.join(' ')}\nEXIT ${JSON.stringify(status)}\n\n${output}`,
      'utf8',
    );
  }
  return { ...status, output };
}

const npmArguments = (...args) => [pnpmCli, 'dlx', 'npm@11.18.0', ...args];
const npmVersion = await run(
  'pinned npm version',
  process.execPath,
  npmArguments('--version'),
  'npm-version.log',
);
if (npmVersion.code !== 0 || npmVersion.output.trim().split(/\s+/u).at(-1) !== '11.18.0') {
  throw new Error('Pinned npm 11.18.0 was not available.');
}

const cleanInstall = await run(
  'clean package-lock install',
  process.execPath,
  npmArguments('ci', '--no-audit'),
  'npm-ci.log',
);
if (cleanInstall.code !== 0) throw new Error('npm ci failed; see npm-ci.log');

const fullCheck = await run(
  'aggregate Phase 2 check including browsers',
  process.execPath,
  npmArguments('run', 'check:full'),
  'check-full.log',
);
if (fullCheck.code !== 0) throw new Error('check:full failed; see check-full.log');

const expectedReleaseRejection = await run(
  'expected legacy-asset release rejection',
  process.execPath,
  npmArguments('run', 'validate:assets:release'),
  'asset-release-gate.log',
);
if (expectedReleaseRejection.code === 0) {
  throw new Error('Release asset gate unexpectedly accepted quarantined legacy assets.');
}
for (const code of [
  'ASSET_RELEASE_INELIGIBLE',
  'ASSET_PROVENANCE_REQUIRED',
  'ASSET_EXTERNAL_GLTF_VALIDATION_REQUIRED',
  'ASSET_EXTERNAL_GLTF_REPORT_REQUIRED',
  'ASSET_TEXTURE_MEMORY_MEASUREMENT_REQUIRED',
]) {
  if (!expectedReleaseRejection.output.includes(code)) {
    throw new Error(`Release asset gate did not report ${code}.`);
  }
}

const browserEvidence = await run(
  'Phase 2 browser evidence capture',
  process.execPath,
  ['tools/evidence/capture-phase2-browser.mjs'],
  'browser-evidence.log',
);
if (browserEvidence.code !== 0) throw new Error('Browser evidence capture failed.');

const browserSummary = JSON.parse(await readFile(
  path.join(outputDirectory, 'browser', 'phase2-browser-summary.json'),
  'utf8',
));
if (browserSummary.ok !== true) throw new Error('Browser evidence summary is not green.');

const keyFiles = [
  'package-lock.json',
  'src/sim/foundationFixture.ts',
  'src/content/rulesets/revamped_classic.v1.json',
  'src/net/protocol.ts',
  'assets/schemas/asset-manifest.schema.json',
];
const hashes = {};
for (const relativePath of keyFiles) {
  const buffer = await readFile(path.join(repositoryRoot, ...relativePath.split('/')));
  hashes[relativePath] = createHash('sha256').update(buffer).digest('hex');
}

const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));
const assertions = {
  cleanInstall: cleanInstall.code === 0,
  aggregateStages: /Aggregate check passed \(10\/10 stages\)\./u.test(fullCheck.output),
  vitest: /Tests\s+110 passed/u.test(fullCheck.output),
  relay: /Summary: 28 passed, 0 failed\./u.test(fullCheck.output),
  phase2Boundary: /Summary: 10 passed, 0 failed\./u.test(fullCheck.output),
  phase1Truth: /Summary: 54 passed, 0 failed\./u.test(fullCheck.output),
  browser: /6 passed/u.test(fullCheck.output),
  assetDevelopment: /Summary: 6 manifests, 0 errors, 33 warnings\./u.test(fullCheck.output),
  assetReleaseRejected: expectedReleaseRejection.code !== 0,
  browserEvidence: browserSummary.ok === true && browserSummary.failures.length === 0,
};
const failedAssertions = Object.entries(assertions)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

const summary = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  packageManager: 'npm@11.18.0 via bundled pnpm dlx',
  packageVersions: {
    typescript: packageJson.devDependencies.typescript,
    eslint: packageJson.devDependencies.eslint,
    typescriptEslint: packageJson.devDependencies['typescript-eslint'],
    vitest: packageJson.devDependencies.vitest,
    playwrightTest: packageJson.devDependencies['@playwright/test'],
    threeTypes: packageJson.devDependencies['@types/three'],
  },
  canonicalReplay: {
    rateHz: 20,
    tickDurationMs: 50,
    finalTick: 6,
    finalStateHash: 'd7201dfc006e72ee',
    entityCount: 2,
    eventCount: 6,
  },
  results: {
    aggregateStages: '10/10',
    vitest: '110/110',
    relayContainment: '28/28',
    phase2ProductionBoundary: '10/10',
    phase1Truth: '54/54',
    playwright: '6/6',
    assetDevelopment: '6 manifests, 0 errors, 33 warnings',
    assetRelease: 'expected rejection',
    browserEvidence: `${browserSummary.checks.length}/${browserSummary.checks.length}`,
  },
  assertions,
  failedAssertions,
  keyFileSha256: hashes,
  knownOpenGates: [
    'Production bundle retains the known 932.34 kB chunk warning.',
    'Legacy assets have unresolved provenance and external glTF validation has not run.',
    'Ruleset records remain contract_only with unresolved tuning intentionally null.',
    'Phase 2 does not yet implement collision, authoritative rooms, combat, final art, or production deployment.',
  ],
  productionDeploymentPerformed: false,
  ok: failedAssertions.length === 0,
};
await writeFile(
  path.join(outputDirectory, 'phase2-check-summary.json'),
  `${JSON.stringify(summary, null, 2)}\n`,
  'utf8',
);

const manifestBuild = await run(
  'sealed Phase 2 evidence manifest generation',
  process.execPath,
  ['tools/evidence/build-manifest.mjs', outputDirectory, 'phase2-manifest.json'],
  null,
);
if (manifestBuild.code !== 0) throw new Error('Phase 2 evidence manifest generation failed.');

const manifestVerificationPath = path.join(
  path.dirname(outputDirectory),
  'phase2-manifest-verification.json',
);
const manifestVerification = await run(
  'independent Phase 2 evidence manifest verification',
  process.execPath,
  [
    'tools/evidence/verify-manifest.mjs',
    path.join(outputDirectory, 'phase2-manifest.json'),
    '--output',
    manifestVerificationPath,
  ],
  null,
);
if (manifestVerification.code !== 0) {
  throw new Error('Phase 2 evidence manifest verification failed.');
}
process.stdout.write(`\n${JSON.stringify({
  ok: summary.ok,
  failedAssertions,
  outputDirectory,
  manifestVerificationPath,
}, null, 2)}\n`);
if (!summary.ok) process.exitCode = 1;
