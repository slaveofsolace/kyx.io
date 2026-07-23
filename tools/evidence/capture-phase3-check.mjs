import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASELINE_COMMIT = '81aa1d02acce8e30ba411bb895901d2d2ac6694e';
const PHASE2_FOUNDATION_HASH = 'd7201dfc006e72ee';
const CANONICAL_MOVEMENT_HASH = '66fcaf19c3fd94ad';
const MOVEMENT_PROFILE_HASH = '8ab4ed437a4393c0';
const CANONICAL_TAPE_ID = 'flat_run_fixed_20hz_v1';
const EXPECTED_TAPES = 18;
const EXPECTED_TUNING_METRICS = 7;
const EXPECTED_BROWSER_CHECKS = 67;
const EXPECTED_SCREENSHOTS = Object.freeze([
  'fixture_lab',
  'driver_ready',
  'driver_run',
  'driver_jump',
  'driver_slide',
  'driver_teleport',
]);
const RELEASE_REJECTION_CODES = Object.freeze([
  'ASSET_RELEASE_INELIGIBLE',
  'ASSET_PROVENANCE_REQUIRED',
  'ASSET_EXTERNAL_GLTF_VALIDATION_REQUIRED',
  'ASSET_EXTERNAL_GLTF_REPORT_REQUIRED',
  'ASSET_TEXTURE_MEMORY_MEASUREMENT_REQUIRED',
]);
const PRODUCTION_FORBIDDEN_SIGNATURES = Object.freeze([
  'developmentFlatRunMovementDriver',
  '/__test__/movement',
  'HYPOTHESIS · FLAT_RUN · DEV ONLY',
  'movementDriver=flat_run',
]);

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const evidenceDateRoot = path.join(repositoryRoot, 'evidence', '2026-07-20');
const outputDirectory = path.join(evidenceDateRoot, 'phase-3-movement-collision');
const browserDirectory = path.join(outputDirectory, 'browser');
const tapePath = path.join(outputDirectory, 'movement-tapes.json');
const browserSummaryPath = path.join(browserDirectory, 'phase3-browser-summary.json');
const manifestPath = path.join(outputDirectory, 'phase3-manifest.json');
const manifestVerificationPath = path.join(
  evidenceDateRoot,
  'phase3-manifest-verification.json',
);
const baseUrl = new URL('http://127.0.0.1:5999/');
const pnpmCli = process.env.KYX_PNPM_CLI;

if (!pnpmCli) {
  throw new Error('Set KYX_PNPM_CLI to the bundled pnpm.mjs path.');
}

async function exists(targetPath) {
  return stat(targetPath).then(() => true).catch((error) => {
    if (error?.code === 'ENOENT') return false;
    throw error;
  });
}

if (await exists(outputDirectory)) {
  throw new Error(
    `Refusing to overwrite Phase 3 evidence: ${outputDirectory}. Preserve or move the existing run first.`,
  );
}
if (await exists(manifestVerificationPath)) {
  throw new Error(
    `Refusing to overwrite external manifest verification: ${manifestVerificationPath}`,
  );
}

const commandRecords = [];
function renderCommand(executable, argumentsList) {
  return [executable, ...argumentsList]
    .map((entry) => (/\s/u.test(entry) ? JSON.stringify(entry) : entry))
    .join(' ');
}

commandRecords.push({
  label: 'top-level Phase 3 seal reproduction (PowerShell)',
  command: `$env:KYX_PNPM_CLI = '${pnpmCli.replaceAll("'", "''")}'\n`
    + `& '${process.execPath.replaceAll("'", "''")}' tools/evidence/capture-phase3-check.mjs`,
});

function recordCommand(label, executable, argumentsList) {
  const command = renderCommand(executable, argumentsList);
  commandRecords.push({ label, command });
  return command;
}

async function capture(executable, argumentsList, options = {}) {
  const child = spawn(executable, argumentsList, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    ...options,
  });
  const stdoutChunks = [];
  const stderrChunks = [];
  child.stdout?.on('data', (chunk) => stdoutChunks.push(chunk));
  child.stderr?.on('data', (chunk) => stderrChunks.push(chunk));
  const status = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  return {
    ...status,
    stdout: Buffer.concat(stdoutChunks).toString('utf8'),
    stderr: Buffer.concat(stderrChunks).toString('utf8'),
  };
}

const gitHeadCommand = recordCommand('baseline HEAD', 'git', ['rev-parse', 'HEAD']);
const gitHead = await capture('git', ['rev-parse', 'HEAD']);
if (gitHead.code !== 0) throw new Error('Unable to read the repository HEAD.');
const head = gitHead.stdout.trim();
if (head !== BASELINE_COMMIT) {
  throw new Error(`Unexpected HEAD ${head}; expected preserved baseline ${BASELINE_COMMIT}.`);
}

const gitStatusCommand = recordCommand('pre-run dirty state', 'git', ['status', '--short']);
const gitStatus = await capture('git', ['status', '--short']);
if (gitStatus.code !== 0) throw new Error('Unable to capture the pre-run dirty state.');
const initialDirtyEntries = gitStatus.stdout.split(/\r?\n/u).filter(Boolean);

await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, 'git-head.log'),
  `COMMAND ${gitHeadCommand}\nEXIT ${JSON.stringify({ code: gitHead.code, signal: gitHead.signal })}\n\n${gitHead.stdout}${gitHead.stderr}`,
  'utf8',
);
await writeFile(
  path.join(outputDirectory, 'git-status.log'),
  `COMMAND ${gitStatusCommand}\nEXIT ${JSON.stringify({ code: gitStatus.code, signal: gitStatus.signal })}\n\n${gitStatus.stdout}${gitStatus.stderr}`,
  'utf8',
);

async function run(label, executable, argumentsList, logName, { record = true } = {}) {
  const command = record
    ? recordCommand(label, executable, argumentsList)
    : renderCommand(executable, argumentsList);
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
      `COMMAND ${command}\nEXIT ${JSON.stringify(status)}\n\n${output}`,
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
if (cleanInstall.code !== 0) throw new Error('npm ci failed; see npm-ci.log.');

const whitespaceCheck = await run(
  'repository whitespace check',
  'git',
  ['diff', '--check'],
  'git-diff-check.log',
);
if (whitespaceCheck.code !== 0) throw new Error('git diff --check failed.');

const fullCheck = await run(
  'aggregate Phase 3 check including browsers',
  process.execPath,
  npmArguments('run', 'check:full'),
  'check-full.log',
);
if (fullCheck.code !== 0) throw new Error('check:full failed; see check-full.log.');
const fullCheckPlainOutput = fullCheck.output.replace(
  new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'gu'),
  '',
);

const expectedReleaseRejection = await run(
  'expected legacy-asset release rejection',
  process.execPath,
  npmArguments('run', 'validate:assets:release'),
  'asset-release-gate.log',
);
if (expectedReleaseRejection.code === 0) {
  throw new Error('Release asset gate unexpectedly accepted quarantined legacy assets.');
}
for (const code of RELEASE_REJECTION_CODES) {
  if (!expectedReleaseRejection.output.includes(code)) {
    throw new Error(`Release asset gate did not report ${code}.`);
  }
}

async function walkFiles(currentDirectory) {
  const entries = await readdir(currentDirectory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(currentDirectory, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(entryPath));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

const distRoot = path.join(repositoryRoot, 'dist');
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.map', '.txt']);
const distTextFiles = (await walkFiles(distRoot))
  .filter((filePath) => textExtensions.has(path.extname(filePath).toLowerCase()));
const productionBoundaryMatches = [];
for (const filePath of distTextFiles) {
  const contents = await readFile(filePath, 'utf8');
  for (const signature of PRODUCTION_FORBIDDEN_SIGNATURES) {
    if (contents.includes(signature)) {
      productionBoundaryMatches.push({
        path: path.relative(repositoryRoot, filePath).replaceAll(path.sep, '/'),
        signature,
      });
    }
  }
}
const productionBoundary = {
  schemaVersion: 1,
  checkedAt: new Date().toISOString(),
  root: 'dist',
  textFilesChecked: distTextFiles.length,
  forbiddenSignatures: PRODUCTION_FORBIDDEN_SIGNATURES,
  matches: productionBoundaryMatches,
  ok: productionBoundaryMatches.length === 0,
};
await writeFile(
  path.join(outputDirectory, 'production-boundary.json'),
  `${JSON.stringify(productionBoundary, null, 2)}\n`,
  'utf8',
);
if (!productionBoundary.ok) {
  throw new Error('Production bundle contains a DEV-only movement surface.');
}

const tapeCapture = await run(
  'Phase 3 deterministic movement tape capture',
  process.execPath,
  [
    'tools/evidence/capture-phase3-tapes.mjs',
    `--repository-root=${repositoryRoot}`,
    `--output-dir=${outputDirectory}`,
  ],
  'movement-tapes.log',
);
if (tapeCapture.code !== 0) throw new Error('Phase 3 movement tape capture failed.');

const viteArguments = [
  'node_modules/vite/bin/vite.js',
  '--host',
  baseUrl.hostname,
  '--port',
  baseUrl.port,
  '--strictPort',
];
recordCommand('Phase 3 exact loopback Vite server', process.execPath, viteArguments);
const viteStdout = [];
const viteStderr = [];
const vite = spawn(process.execPath, viteArguments, {
  cwd: repositoryRoot,
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
vite.stdout.on('data', (chunk) => viteStdout.push(chunk));
vite.stderr.on('data', (chunk) => viteStderr.push(chunk));
const serverLifecycle = {
  host: baseUrl.hostname,
  port: Number(baseUrl.port),
  baseUrl: baseUrl.href,
  pid: vite.pid ?? null,
  ready: false,
  exactChildTerminationRequested: false,
  exitCode: null,
  signalCode: null,
  unreachableAfterStop: false,
};

async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (vite.exitCode !== null || vite.signalCode !== null) {
      throw new Error('The exact Vite child exited before readiness.');
    }
    const response = await fetch(baseUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(1_000),
    }).catch(() => null);
    if (response?.ok) {
      await response.body?.cancel().catch(() => {});
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Vite did not become ready at ${baseUrl.href}.`);
}

let browserEvidence;
try {
  await waitForServer();
  serverLifecycle.ready = true;
  browserEvidence = await run(
    'Phase 3 Chromium evidence capture',
    process.execPath,
    [
      'tools/evidence/capture-phase3-browser.mjs',
      `--base-url=${baseUrl.href}`,
      `--output-dir=${browserDirectory}`,
      `--node-evidence=${tapePath}`,
    ],
    'browser-evidence.log',
  );
} finally {
  if (vite.exitCode === null && vite.signalCode === null) {
    serverLifecycle.exactChildTerminationRequested = vite.kill('SIGTERM');
    await Promise.race([
      once(vite, 'exit'),
      new Promise((_, reject) => setTimeout(
        () => reject(new Error('The exact Vite child did not stop within five seconds.')),
        5_000,
      )),
    ]);
  }
  serverLifecycle.exitCode = vite.exitCode;
  serverLifecycle.signalCode = vite.signalCode;
  await writeFile(
    path.join(outputDirectory, 'vite.stdout.log'),
    Buffer.concat(viteStdout).toString('utf8'),
    'utf8',
  );
  await writeFile(
    path.join(outputDirectory, 'vite.stderr.log'),
    Buffer.concat(viteStderr).toString('utf8'),
    'utf8',
  );
}

for (let attempt = 0; attempt < 20; attempt += 1) {
  const response = await fetch(baseUrl, {
    cache: 'no-store',
    signal: AbortSignal.timeout(500),
  }).catch(() => null);
  if (!response) {
    serverLifecycle.unreachableAfterStop = true;
    break;
  }
  await response.body?.cancel().catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 100));
}
await writeFile(
  path.join(outputDirectory, 'server-lifecycle.json'),
  `${JSON.stringify(serverLifecycle, null, 2)}\n`,
  'utf8',
);
if (browserEvidence?.code !== 0) throw new Error('Phase 3 browser evidence capture failed.');
if (!serverLifecycle.unreachableAfterStop) {
  throw new Error('The Phase 3 loopback server remained reachable after exact-child termination.');
}

const [tapeEvidence, browserSummary, packageJson] = await Promise.all([
  readFile(tapePath, 'utf8').then(JSON.parse),
  readFile(browserSummaryPath, 'utf8').then(JSON.parse),
  readFile(path.join(repositoryRoot, 'package.json'), 'utf8').then(JSON.parse),
]);
const canonicalTape = tapeEvidence.tapes?.find((tape) => tape.id === CANONICAL_TAPE_ID);
const screenshotIds = browserSummary.screenshots?.map((artifact) => artifact.id) ?? [];
const browserArtifacts = [
  ...(browserSummary.screenshots ?? []),
  ...(browserSummary.videos ?? []),
];
const teleportAction = browserSummary.driver?.actions?.teleport;
const artifactChecks = [];
for (const artifact of browserArtifacts) {
  const artifactPath = path.join(browserDirectory, ...artifact.path.split('/'));
  const [bytes, fileStats] = await Promise.all([readFile(artifactPath), stat(artifactPath)]);
  artifactChecks.push({
    id: artifact.id,
    path: artifact.path,
    declaredBytes: artifact.bytes,
    actualBytes: fileStats.size,
    declaredSha256: artifact.sha256,
    actualSha256: createHash('sha256').update(bytes).digest('hex'),
    passed: artifact.bytes === fileStats.size
      && artifact.sha256 === createHash('sha256').update(bytes).digest('hex')
      && fileStats.size > 0,
  });
}

const assertions = {
  baselineHeadPreserved: head === BASELINE_COMMIT,
  cleanInstall: cleanInstall.code === 0,
  whitespace: whitespaceCheck.code === 0,
  aggregateStages: /Aggregate check passed \(10\/10 stages\)\./u.test(fullCheckPlainOutput),
  vitest: /Tests\s+323 passed/u.test(fullCheckPlainOutput),
  browserMatrix: /7 skipped\s+27 passed/u.test(fullCheckPlainOutput),
  assetReleaseRejected: expectedReleaseRejection.code !== 0
    && RELEASE_REJECTION_CODES.every((code) => expectedReleaseRejection.output.includes(code)),
  productionDevSurfacesExcluded: productionBoundary.ok,
  tapeCapture: tapeEvidence.ok === true && tapeEvidence.errors?.length === 0,
  tapeCount: tapeEvidence.tapes?.length === EXPECTED_TAPES,
  tapeRepeatAndRecordedParity: tapeEvidence.tapes?.every(
    (tape) => tape.repeatConfirmed === true && tape.recordedMatch === true,
  ) === true,
  canonicalMovementHash: canonicalTape?.recordedFinalHash === CANONICAL_MOVEMENT_HASH
    && canonicalTape?.firstFinalHash === CANONICAL_MOVEMENT_HASH
    && canonicalTape?.secondFinalHash === CANONICAL_MOVEMENT_HASH,
  movementProfileHash: tapeEvidence.movementProfile?.hash === MOVEMENT_PROFILE_HASH,
  phase2Foundation: tapeEvidence.phase2Foundation?.expectedHash === PHASE2_FOUNDATION_HASH
    && tapeEvidence.phase2Foundation?.firstHash === PHASE2_FOUNDATION_HASH
    && tapeEvidence.phase2Foundation?.secondHash === PHASE2_FOUNDATION_HASH
    && tapeEvidence.phase2Foundation?.repeatConfirmed === true,
  tuningMetrics: tapeEvidence.tuningWorksheet?.length === EXPECTED_TUNING_METRICS
    && tapeEvidence.tuningWorksheet.every((metric) => metric.passed === true),
  browserCapture: browserSummary.ok === true
    && browserSummary.failures?.length === 0
    && browserSummary.errors?.length === 0,
  browserCheckCount: browserSummary.checks?.length === EXPECTED_BROWSER_CHECKS
    && browserSummary.checks.every((check) => check.passed === true),
  browserScopeTruthful: browserSummary.g2Status === 'OPEN'
    && browserSummary.humanReviewStatus === 'PENDING_HUMAN_REVIEW'
    && browserSummary.visualApproval === 'NOT_PERFORMED_OR_CLAIMED',
  browserActions: browserSummary.driver?.actions?.slide?.locomotion === 'sliding'
    && browserSummary.driver?.actions?.slide?.stance === 'crouched'
    && teleportAction?.snapObserved === true
    && teleportAction?.authorityDistanceMm === 9000
    && teleportAction?.expectedRenderDistance === 9
    && Number.isFinite(teleportAction?.renderDistanceError)
    && Math.abs(teleportAction.renderDistanceError) <= Number.EPSILON * 32,
  browserNetwork: browserSummary.network?.externalRequests?.length === 0
    && browserSummary.network?.httpErrors?.length === 0
    && browserSummary.network?.failedRequests?.length === 0
    && browserSummary.network?.consoleErrors?.length === 0
    && browserSummary.network?.pageErrors?.length === 0
    && browserSummary.network?.applicationWebSockets?.length === 0,
  screenshots: JSON.stringify(screenshotIds) === JSON.stringify(EXPECTED_SCREENSHOTS),
  video: browserSummary.videos?.length === 1
    && browserSummary.videos[0].id === 'phase3_driver_session'
    && browserSummary.videos[0].bytes > 0,
  artifactHashes: artifactChecks.length === EXPECTED_SCREENSHOTS.length + 1
    && artifactChecks.every((artifact) => artifact.passed),
  exactServerLifecycle: serverLifecycle.ready === true
    && serverLifecycle.exactChildTerminationRequested === true
    && serverLifecycle.unreachableAfterStop === true,
};
const failedAssertions = Object.entries(assertions)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

async function installedPackageVersion(packageName) {
  const manifestPath = path.join(
    repositoryRoot,
    'node_modules',
    ...packageName.split('/'),
    'package.json',
  );
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  return manifest.version;
}

const packageVersions = {
  typescript: packageJson.devDependencies.typescript,
  eslint: packageJson.devDependencies.eslint,
  typescriptEslint: packageJson.devDependencies['typescript-eslint'],
  vitest: packageJson.devDependencies.vitest,
  playwrightTest: packageJson.devDependencies['@playwright/test'],
  vite: packageJson.devDependencies.vite,
  rapier: await installedPackageVersion('@dimforge/rapier3d-deterministic-compat'),
};
const startedAt = tapeEvidence.capturedAt;
const completedAt = new Date().toISOString();
const summary = {
  schemaVersion: 1,
  capturedAt: completedAt,
  artifactScope: 'PHASE3_G2_CLEAN_SEAL',
  g2Status: failedAssertions.length === 0
    ? 'TECHNICALLY_READY_PENDING_HUMAN_REVIEW'
    : 'OPEN_AUTOMATED_FAILURE',
  humanReviewStatus: 'PENDING_HUMAN_REVIEW',
  visualApproval: 'NOT_PERFORMED_OR_CLAIMED',
  evidenceLabel: 'HYPOTHESIS',
  productStatus: 'NON_PRODUCT_FIXTURE_EVIDENCE',
  baselineCommit: head,
  dirtyWorktreePreserved: true,
  initialDirtyEntries,
  runtime: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    packageManager: 'npm@11.18.0 via bundled pnpm dlx',
    packageVersions,
    browser: browserSummary.runtime,
    viewport: browserSummary.viewport,
    baseUrl: browserSummary.baseUrl,
  },
  results: {
    cleanInstall: 'passed',
    aggregateStages: '10/10',
    vitest: '323/323',
    browserTests: '27 passed, 7 intentionally skipped',
    assetRelease: 'expected rejection',
    productionBoundary: `${productionBoundary.textFilesChecked} text artifacts, 0 DEV-only signatures`,
    movementTapes: `${tapeEvidence.tapes.length}/${EXPECTED_TAPES}`,
    tuningMetrics: `${tapeEvidence.tuningWorksheet.length}/${EXPECTED_TUNING_METRICS}`,
    canonicalMovementHash: canonicalTape?.recordedFinalHash ?? null,
    movementProfileHash: tapeEvidence.movementProfile?.hash ?? null,
    phase2FoundationHash: tapeEvidence.phase2Foundation?.firstHash ?? null,
    browserChecks: `${browserSummary.checks.length}/${EXPECTED_BROWSER_CHECKS}`,
    screenshots: browserSummary.screenshots.length,
    videos: browserSummary.videos.length,
  },
  assertions,
  failedAssertions,
  artifactChecks,
  serverLifecycle,
  knownOpenGates: [
    'Human visual and playtest review is pending; no visual approval is claimed.',
    'The movement profile remains HYPOTHESIS and fixture_only until measured playtest acceptance.',
    'Legacy assets remain release-ineligible pending provenance and external glTF/texture reports.',
    'Rapier 0.19.3 emits its recorded upstream initialization deprecation warning.',
    'Authoritative rooms, wire-command adaptation, prediction, reconciliation, and two-client proof are Phase 4 / G3.',
    'No production deployment was performed or authorized.',
  ],
  productionDeploymentPerformed: false,
  startedAt,
  completedAt,
  ok: failedAssertions.length === 0,
};

const environment = {
  schemaVersion: 1,
  capturedAt: completedAt,
  repositoryRoot,
  baselineCommit: head,
  initialDirtyEntries,
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  packageManager: summary.runtime.packageManager,
  packageVersions,
  browser: browserSummary.runtime,
  viewport: browserSummary.viewport,
  baseUrl: browserSummary.baseUrl,
  fixture: browserSummary.fixtureLab?.identity ?? null,
  movementProfile: tapeEvidence.movementProfile,
};
await writeFile(
  path.join(outputDirectory, 'environment.json'),
  `${JSON.stringify(environment, null, 2)}\n`,
  'utf8',
);

recordCommand(
  'sealed Phase 3 evidence manifest generation',
  process.execPath,
  ['tools/evidence/build-manifest.mjs', outputDirectory, 'phase3-manifest.json'],
);
recordCommand(
  'independent Phase 3 evidence manifest verification',
  process.execPath,
  [
    'tools/evidence/verify-manifest.mjs',
    manifestPath,
    '--output',
    manifestVerificationPath,
  ],
);
await writeFile(
  path.join(outputDirectory, 'commands.txt'),
  `${commandRecords.map(({ label, command }) => `# ${label}\n${command}`).join('\n\n')}\n`,
  'utf8',
);

const readme = `# Phase 3 G2 movement/collision evidence\n\n`
  + `- Automated status: **${summary.g2Status}**\n`
  + '- Human review: **PENDING_HUMAN_REVIEW**\n'
  + '- Visual approval: **NOT_PERFORMED_OR_CLAIMED**\n'
  + `- Baseline HEAD: \`${head}\`\n`
  + `- Pre-run dirty entries preserved: ${initialDirtyEntries.length}\n`
  + '- Deployment: none performed or authorized\n\n'
  + '## Reproduce\n\n'
  + 'Run with the bundled Node executable and set `KYX_PNPM_CLI` to the bundled `pnpm.mjs`, then execute:\n\n'
  + '```text\nnode tools/evidence/capture-phase3-check.mjs\n```\n\n'
  + 'The harness refuses to overwrite this evidence root or its outside-root verification result. '
  + 'It performs a clean pinned install, the complete browser-enabled aggregate check, the expected '
  + 'legacy-asset release rejection, production DEV-surface scan, repeated Node tapes, exact Chromium '
  + 'fixture/driver capture, exact-child server shutdown, manifest generation, and independent manifest verification.\n\n'
  + '## Sealed results\n\n'
  + `- Aggregate checks: ${summary.results.aggregateStages}; Vitest ${summary.results.vitest}\n`
  + `- Browser test matrix: ${summary.results.browserTests}\n`
  + `- Movement tapes: ${summary.results.movementTapes}; tuning metrics ${summary.results.tuningMetrics}\n`
  + `- Canonical movement hash: \`${summary.results.canonicalMovementHash}\`\n`
  + `- Movement profile hash: \`${summary.results.movementProfileHash}\`\n`
  + `- Protected Phase 2 replay: \`${summary.results.phase2FoundationHash}\`\n`
  + `- Chromium evidence: ${summary.results.browserChecks}; ${summary.results.screenshots} screenshots; ${summary.results.videos} WebM\n`
  + `- Production boundary: ${summary.results.productionBoundary}\n`
  + '- Browser/network: no critical console, page, request, external-origin, or application-WebSocket failure\n\n'
  + '## Scope\n\n'
  + 'This is deterministic non-product fixture evidence. The profile is labeled `HYPOTHESIS` and '
  + '`fixture_only`; it does not claim ev.io parity, final playability, multiplayer authority, prediction, '
  + 'reconciliation, combat authority, final art, or deployment. Review the six screenshots and the WebM '
  + 'under `browser/` before any human acceptance decision.\n';
await writeFile(path.join(outputDirectory, 'README.md'), readme, 'utf8');

const knownIssues = `# Known issues and open gates\n\n`
  + '- Human visual/playtest review is pending. Automated capture deliberately says no visual approval is claimed.\n'
  + '- Movement tuning remains `HYPOTHESIS` / `fixture_only`; fixture success is not final feel approval.\n'
  + '- Rapier deterministic-compat 0.19.3 emits an upstream initialization deprecation warning; it is recorded, not hidden.\n'
  + '- Legacy assets remain release-ineligible until provenance, external glTF validation/reporting, and texture-memory measurement are complete.\n'
  + '- Dynamic-platform trajectory behavior is not claimed by Phase 3.\n'
  + '- Wire `moveY` to simulation `moveZ`, ordered fast-tap representation, authoritative rooms, prediction, reconciliation, and two-client proof are deferred to Phase 4 / G3.\n'
  + '- No production deployment was performed or authorized.\n';
await writeFile(path.join(outputDirectory, 'known-issues.md'), knownIssues, 'utf8');
await writeFile(
  path.join(outputDirectory, 'phase3-check-summary.json'),
  `${JSON.stringify(summary, null, 2)}\n`,
  'utf8',
);

if (!summary.ok) {
  throw new Error(`Phase 3 G2 automated assertions failed: ${failedAssertions.join(', ')}`);
}

const manifestBuild = await run(
  'sealed Phase 3 evidence manifest generation',
  process.execPath,
  ['tools/evidence/build-manifest.mjs', outputDirectory, 'phase3-manifest.json'],
  null,
  { record: false },
);
if (manifestBuild.code !== 0) throw new Error('Phase 3 evidence manifest generation failed.');

const manifestVerification = await run(
  'independent Phase 3 evidence manifest verification',
  process.execPath,
  [
    'tools/evidence/verify-manifest.mjs',
    manifestPath,
    '--output',
    manifestVerificationPath,
  ],
  null,
  { record: false },
);
if (manifestVerification.code !== 0) {
  throw new Error('Phase 3 evidence manifest verification failed.');
}
const verification = JSON.parse(await readFile(manifestVerificationPath, 'utf8'));
if (verification.ok !== true || verification.failures.length !== 0) {
  throw new Error('Outside-root Phase 3 manifest verification is not green.');
}

process.stdout.write(`\n${JSON.stringify({
  ok: summary.ok,
  g2Status: summary.g2Status,
  humanReviewStatus: summary.humanReviewStatus,
  failedAssertions,
  outputDirectory,
  manifestPath,
  manifestVerificationPath,
  manifestVerification: {
    ok: verification.ok,
    filesChecked: verification.filesChecked,
    bytesChecked: verification.bytesChecked,
    manifestSha256: verification.manifestSha256,
  },
}, null, 2)}\n`);
