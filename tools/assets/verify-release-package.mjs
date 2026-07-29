#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  KNOWN_EXTENSIONLESS_TEXT_RELEASE_FILES,
  TEXT_RELEASE_EXTENSIONS,
  isProvenanceBearingReleaseFile,
} from './release-package-policy.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const distRoot = join(root, 'dist');
const manifestRoot = join(root, 'assets/manifests');
const ledger = JSON.parse(readFileSync(
  join(root, 'assets/provenance/shipped-assets.g9.json'),
  'utf8',
));
const failures = [];

function normalize(path) {
  return path.replaceAll('\\', '/');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function walkProvenanceBearingFiles(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkProvenanceBearingFiles(absolutePath));
    } else if (
      entry.isFile()
      && isProvenanceBearingReleaseFile(normalize(relative(distRoot, absolutePath)))
    ) {
      files.push(normalize(relative(distRoot, absolutePath)));
    }
  }
  return files.sort();
}

function fail(code, details) {
  failures.push({ code, details });
}

const manifestNames = readdirSync(manifestRoot)
  .filter((name) => name.endsWith('.asset.json'))
  .sort();
const manifests = manifestNames.map((name) => ({
  name,
  value: JSON.parse(readFileSync(join(manifestRoot, name), 'utf8')),
}));
const manifestsByAssetId = new Map(
  manifests.map((entry) => [entry.value.assetId, entry]),
);

const expectedPackagePaths = ledger.assets.map((asset) => {
  if (!asset.path.startsWith('public/')) {
    fail('LEDGER_PATH_OUTSIDE_PUBLIC', { assetId: asset.assetId, path: asset.path });
    return null;
  }
  return asset.path.slice('public/'.length);
}).filter(Boolean).sort();
const actualPackagePaths = walkProvenanceBearingFiles(distRoot);

if (!existsSync(distRoot)) {
  fail('DIST_NOT_FOUND', { path: 'dist' });
}
if (ledger.scope?.expectedAssetCount !== ledger.assets.length) {
  fail('LEDGER_EXPECTED_COUNT_MISMATCH', {
    expected: ledger.scope?.expectedAssetCount ?? null,
    actual: ledger.assets.length,
  });
}
if (new Set(expectedPackagePaths).size !== expectedPackagePaths.length) {
  fail('LEDGER_DUPLICATE_PACKAGE_PATH', { expectedPackagePaths });
}
if (JSON.stringify(actualPackagePaths) !== JSON.stringify(expectedPackagePaths)) {
  fail('DIST_BINARY_INVENTORY_MISMATCH', {
    actualPackagePaths,
    expectedPackagePaths,
    unledgered: actualPackagePaths.filter(
      (path) => !expectedPackagePaths.includes(path),
    ),
    absent: expectedPackagePaths.filter(
      (path) => !actualPackagePaths.includes(path),
    ),
  });
}
if (manifests.length !== ledger.assets.length) {
  fail('ACTIVE_MANIFEST_COUNT_MISMATCH', {
    activeManifestCount: manifests.length,
    ledgerAssetCount: ledger.assets.length,
  });
}

for (const asset of ledger.assets) {
  const manifestEntry = manifestsByAssetId.get(asset.assetId);
  if (manifestEntry === undefined) {
    fail('ACTIVE_MANIFEST_MISSING', { assetId: asset.assetId });
    continue;
  }
  const manifest = manifestEntry.value;
  const manifestEligible = manifest.releaseEligible === true
    && manifest.disposition === 'approved'
    && manifest.sourceHashKind === 'canonical_source'
    && manifest.provenance?.status === 'verified'
    && manifest.validation?.structuralStatus === 'passed'
    && (
      !manifest.runtime?.uri?.toLowerCase().endsWith('.glb')
      || (
        manifest.validation?.externalGltfValidator === 'passed'
        && manifest.validation?.externalGltfReport !== undefined
      )
    );
  if (!manifestEligible) {
    fail('ACTIVE_MANIFEST_NOT_RELEASE_APPROVED', {
      assetId: asset.assetId,
      manifest: manifestEntry.name,
    });
  }
  if (
    manifest.runtime?.uri !== asset.path
    || manifest.runtime?.hash !== asset.sha256
    || manifest.runtime?.bytes !== asset.bytes
  ) {
    fail('ACTIVE_MANIFEST_LEDGER_MISMATCH', {
      assetId: asset.assetId,
      manifest: manifestEntry.name,
    });
  }
  if (asset.releaseEligible !== true) {
    fail('LEDGER_ASSET_NOT_RELEASE_ELIGIBLE', { assetId: asset.assetId });
  }

  const packagePath = asset.path.slice('public/'.length);
  const absolutePath = join(distRoot, packagePath);
  if (!existsSync(absolutePath)) continue;
  const bytes = readFileSync(absolutePath);
  if (bytes.length !== asset.bytes || sha256(bytes) !== asset.sha256) {
    fail('DIST_BINARY_INTEGRITY_MISMATCH', {
      assetId: asset.assetId,
      packagePath,
      expectedBytes: asset.bytes,
      actualBytes: bytes.length,
      expectedSha256: asset.sha256,
      actualSha256: sha256(bytes),
    });
  }
}

for (const entry of manifests) {
  if (!ledger.assets.some((asset) => asset.assetId === entry.value.assetId)) {
    fail('ACTIVE_MANIFEST_NOT_IN_LEDGER', {
      assetId: entry.value.assetId,
      manifest: entry.name,
    });
  }
}

const report = {
  schema: 'kyx-release-package-closed-world-verifier-v2',
  status: failures.length === 0 ? 'PASS' : 'FAIL',
  distRoot: 'dist',
  policy: 'known text/build files are allowlisted; every other file requires provenance',
  textExtensionAllowlist: [...TEXT_RELEASE_EXTENSIONS].sort(),
  extensionlessTextFileAllowlist:
    [...KNOWN_EXTENSIONLESS_TEXT_RELEASE_FILES].sort(),
  provenanceBearingArtifactCount: actualPackagePaths.length,
  ledgerAssetCount: ledger.assets.length,
  activeManifestCount: manifests.length,
  actualPackagePaths,
  failures,
  nonClaims: [
    'This verifier does not select a project license.',
    'This verifier does not grant human visual acceptance.',
    'This verifier proves exact non-text and unknown-extension package closure for the built dist directory.',
  ],
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (failures.length > 0) process.exitCode = 1;
