#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  lstat,
  readFile,
  readdir,
  stat,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const binaryExtensions = new Set(['.glb', '.gltf', '.jpeg', '.jpg', '.png', '.webp']);
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.jsonc', '.mjs', '.toml', '.ts']);

const quarantineRoot = 'assets/quarantine/legacy-unverified';
const blockedAssets = [
  {
    id: 'legacy.player',
    formerPublicPath: 'public/player.glb',
    quarantinePath: `${quarantineRoot}/runtime-snapshots/player.glb`,
    manifestPath: `${quarantineRoot}/manifests/legacy-player.asset.json`,
    bytes: 1363668,
    sha256: 'cdb9a8d694a132099e2b505f07957bb39683def8ec9356be304d79b6f6f92564',
  },
  {
    id: 'legacy.soldier',
    formerPublicPath: 'public/soldier.glb',
    quarantinePath: `${quarantineRoot}/runtime-snapshots/soldier.glb`,
    manifestPath: `${quarantineRoot}/manifests/legacy-soldier.asset.json`,
    bytes: 2159764,
    sha256: '5f75df0a1035956c5da3781dcdaa6e5bf06d27e913d3c428eef0da5d10ba7bde',
  },
  {
    id: 'legacy.spartan',
    formerPublicPath: 'public/spartan.glb',
    quarantinePath: `${quarantineRoot}/runtime-snapshots/spartan.glb`,
    manifestPath: `${quarantineRoot}/manifests/legacy-spartan.asset.json`,
    bytes: 256508,
    sha256: '377d6461d47c4324880832d9bff81d5a4bc8470ad3f2a4412a21c1e892dce43c',
  },
  {
    id: 'legacy.weapons',
    formerPublicPath: 'public/weapons.glb',
    quarantinePath: `${quarantineRoot}/runtime-snapshots/weapons.glb`,
    manifestPath: `${quarantineRoot}/manifests/legacy-weapons.asset.json`,
    bytes: 2019140,
    sha256: '3c0ded95defbb4ddc52e8b9a2bc22de233cdfdccbeb4e6cbcc548252f5d08ce8',
  },
  {
    id: 'legacy.zombie',
    formerPublicPath: 'public/zombie.glb',
    quarantinePath: `${quarantineRoot}/runtime-snapshots/zombie.glb`,
    manifestPath: `${quarantineRoot}/manifests/legacy-zombie.asset.json`,
    bytes: 234604,
    sha256: 'f67258d00882c787653f3996b7478e14b2a04211b83be2487a9f87346767d6ef',
  },
  {
    id: 'legacy.sakura-wrap',
    formerPublicPath: 'public/textures/sakura/wrap.png',
    quarantinePath: `${quarantineRoot}/runtime-snapshots/textures/sakura/wrap.png`,
    manifestPath: `${quarantineRoot}/manifests/legacy-sakura-wrap.asset.json`,
    bytes: 127881,
    sha256: '376c4a7688e0d76afc1308d91bf7deca0ccef48bcc2bc51cdc4438066dc7137c',
  },
];

const forbiddenRuntimeTokens = [
  '/player.glb',
  '/soldier.glb',
  '/spartan.glb',
  '/weapons.glb',
  '/zombie.glb',
  'textures/sakura/wrap.png',
];

function repositoryPath(absolutePath) {
  return path.relative(root, absolutePath).split(path.sep).join('/');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function exists(relativePath) {
  try {
    await stat(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function walk(directory, predicate) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...await walk(absolutePath, predicate));
    } else if (entry.isFile() && predicate(absolutePath)) {
      found.push(absolutePath);
    }
  }
  return found;
}

const publicBinaryPaths = (await walk(
  path.join(root, 'public'),
  (absolutePath) => binaryExtensions.has(path.extname(absolutePath).toLowerCase()),
)).map(repositoryPath).sort();

const ledger = JSON.parse(await readFile(
  path.join(root, 'assets/provenance/shipped-assets.g9.json'),
  'utf8',
));
const packageManifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const ledgerPaths = ledger.assets.map((asset) => asset.path).sort();

const activeManifestFiles = (await readdir(path.join(root, 'assets/manifests')))
  .filter((name) => name.endsWith('.asset.json'))
  .sort();
const activeManifests = await Promise.all(activeManifestFiles.map(async (name) => (
  JSON.parse(await readFile(path.join(root, 'assets/manifests', name), 'utf8'))
)));
const activeManifestPaths = activeManifests.map((manifest) => manifest.runtime?.uri).sort();
const allowedReleaseClearances = new Set([
  'CLEARED_PROJECT_ORIGINAL',
  'CLEARED_CC0_DONOR_ADAPTATION',
]);

const runtimeScanRoots = [
  'src',
  'public',
  'index.html',
  'login.html',
  'register.html',
  'vite.config.js',
  'package.json',
  'netlify.toml',
  'wrangler.jsonc',
  'build_player.py',
];
const runtimeTextFiles = [];
for (const relativePath of runtimeScanRoots) {
  const absolutePath = path.join(root, relativePath);
  const metadata = await stat(absolutePath);
  if (metadata.isDirectory()) {
    runtimeTextFiles.push(...await walk(
      absolutePath,
      (candidate) => textExtensions.has(path.extname(candidate).toLowerCase()),
    ));
  } else {
    runtimeTextFiles.push(absolutePath);
  }
}

const forbiddenRuntimeReferences = [];
for (const absolutePath of runtimeTextFiles) {
  const relativePath = repositoryPath(absolutePath);
  const lines = (await readFile(absolutePath, 'utf8')).split(/\r?\n/u);
  lines.forEach((line, index) => {
    if (line.includes(quarantineRoot)) return;
    for (const token of forbiddenRuntimeTokens) {
      if (line.includes(token)) {
        forbiddenRuntimeReferences.push({
          path: relativePath,
          line: index + 1,
          token,
        });
      }
    }
  });
}

const quarantineChecks = [];
for (const asset of blockedAssets) {
  const bytes = await readFile(path.join(root, asset.quarantinePath));
  const manifest = JSON.parse(await readFile(path.join(root, asset.manifestPath), 'utf8'));
  quarantineChecks.push({
    assetId: asset.id,
    formerPublicPathAbsent: !(await exists(asset.formerPublicPath)),
    snapshotIsRegularFile: (await lstat(path.join(root, asset.quarantinePath))).isFile(),
    bytesMatch: bytes.length === asset.bytes,
    sha256Match: sha256(bytes) === asset.sha256,
    manifestMatches:
      manifest.schemaVersion === 2
      && manifest.assetId === asset.id
      && manifest.releaseEligible === false
      && manifest.distributionStatus === 'quarantined_not_shipped'
      && manifest.quarantine?.path === asset.quarantinePath
      && manifest.quarantine?.bytes === asset.bytes
      && manifest.quarantine?.hash === asset.sha256
      && manifest.provenance?.status === 'unresolved',
  });
}

const checks = {
  blockedPublicPathsAbsent: quarantineChecks.every((entry) => entry.formerPublicPathAbsent),
  npmPublicationDisabled: packageManifest.private === true,
  quarantineSnapshotsExact: quarantineChecks.every((entry) => (
    entry.snapshotIsRegularFile
    && entry.bytesMatch
    && entry.sha256Match
    && entry.manifestMatches
  )),
  noRuntimeOrPackageReferences: forbiddenRuntimeReferences.length === 0,
  publicInventoryMatchesShippedLedger:
    ledger.scope?.expectedAssetCount === publicBinaryPaths.length
    && JSON.stringify(publicBinaryPaths) === JSON.stringify(ledgerPaths),
  activeManifestInventoryMatchesShippedLedger:
    activeManifests.length === ledger.assets.length
    && activeManifests.every((manifest) => (
      manifest.releaseEligible === true
      && manifest.disposition === 'approved'
      && manifest.provenance?.status === 'verified'
      && manifest.validation?.structuralStatus === 'passed'
    ))
    && JSON.stringify(activeManifestPaths) === JSON.stringify(ledgerPaths),
  shippedLedgerContainsNoBlockedClearance:
    ledger.assets.every((asset) => (
      asset.releaseEligible === true
      && allowedReleaseClearances.has(asset.clearance?.status)
    ))
    && ledger.summary?.blockedLegacyAssets === 0
    && ledger.summary?.quarantinedLegacyAssets === blockedAssets.length,
};

const passed = Object.values(checks).every(Boolean);
const report = {
  schema: 'kyx-release-provenance-cleanup-sentinel-v1',
  status: passed ? 'PASS' : 'FAIL',
  checks,
  publicBinaryPaths,
  activeManifestFiles,
  quarantinedAssetCount: quarantineChecks.length,
  quarantineFailures: quarantineChecks.filter((entry) => (
    !entry.formerPublicPathAbsent
    || !entry.snapshotIsRegularFile
    || !entry.bytesMatch
    || !entry.sha256Match
    || !entry.manifestMatches
  )),
  forbiddenRuntimeReferences,
  nonClaims: [
    'This sentinel does not select a project license.',
    'This sentinel does not grant G6 human visual acceptance.',
    'This sentinel does not run a build, broad regression suite, deploy, or release.',
  ],
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!passed) process.exitCode = 1;
