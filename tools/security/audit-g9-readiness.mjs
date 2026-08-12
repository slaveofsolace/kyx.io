#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const ledgerPath = join(root, 'assets/provenance/shipped-assets.g9.json');
const publicRoot = join(root, 'public');
const binaryExtensions = new Set(['.glb', '.gltf', '.jpeg', '.jpg', '.png', '.webp']);
const textExtensions = new Set([
  '',
  '.cjs',
  '.css',
  '.env',
  '.html',
  '.js',
  '.json',
  '.jsonc',
  '.md',
  '.mjs',
  '.ps1',
  '.py',
  '.sh',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);
const outputArgument = process.argv.find((argument) => argument.startsWith('--output='));
const outputPath = outputArgument === undefined
  ? null
  : resolve(root, outputArgument.slice('--output='.length));
const checks = [];

function normalizedPath(path) {
  return path.replaceAll('\\', '/');
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function record(name, passed, details) {
  checks.push({
    name,
    status: passed ? 'PASS' : 'FAIL',
    details,
  });
}

function walkBinaryAssets(directory) {
  const assets = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      assets.push(...walkBinaryAssets(absolutePath));
      continue;
    }
    if (entry.isFile() && binaryExtensions.has(extname(entry.name).toLowerCase())) {
      assets.push(normalizedPath(relative(root, absolutePath)));
    }
  }
  return assets.sort();
}

function trackedPaths() {
  return execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard'],
    { cwd: root, encoding: 'utf8' },
  )
    .split(/\r?\n/u)
    .map((path) => path.trim())
    .filter((path) => path.length > 0);
}

function readTrackedText(path) {
  const absolutePath = join(root, path);
  if (existsSync(absolutePath) && statSync(absolutePath).isFile()) {
    return readFileSync(absolutePath, 'utf8');
  }
  return execFileSync('git', ['show', `:${path}`], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split('\n').length;
}

function scanTrackedFilesForProbableSecrets(paths) {
  const findings = [];
  const highConfidenceRules = [
    {
      id: 'private_key_material',
      expression: new RegExp(
        ['-----BEGIN ', '(?:RSA |EC |DSA |OPENSSH )?', 'PRIVATE KEY-----'].join(''),
        'gu',
      ),
    },
    {
      id: 'github_access_token',
      expression: new RegExp(['\\bgh', '[pousr]_', '[A-Za-z0-9]{30,}\\b'].join(''), 'gu'),
    },
    {
      id: 'aws_access_key',
      expression: new RegExp('\\b(?:AKIA|ASIA)[A-Z0-9]{16}\\b', 'gu'),
    },
  ];
  const credentialAssignment = /(?:^|["'\s{,])((?:CLOUDFLARE_)?API_TOKEN|API_KEY|CLIENT_SECRET|SECRET_ACCESS_KEY|ACCESS_TOKEN|PASSWORD|PRIVATE_KEY)["']?\s*[:=]\s*["']([^"'\r\n]{8,})["']/gimu;
  const placeholder = /(?:example|placeholder|replace|changeme|dummy|sample|your[_-]|<[^>]+>|\$\{)/iu;

  for (const path of paths) {
    if (
      path === 'tools/security/audit-g9-readiness.mjs'
      || path.startsWith('node_modules/')
      || path.startsWith('dist/')
      || path.startsWith('.wrangler/')
      || !textExtensions.has(extname(path).toLowerCase())
    ) {
      continue;
    }

    let text;
    try {
      text = readTrackedText(path);
    } catch {
      findings.push({
        ruleId: 'unreadable_tracked_text',
        file: path,
        line: null,
        identifier: null,
      });
      continue;
    }

    for (const rule of highConfidenceRules) {
      rule.expression.lastIndex = 0;
      for (const match of text.matchAll(rule.expression)) {
        findings.push({
          ruleId: rule.id,
          file: path,
          line: lineNumberAt(text, match.index ?? 0),
          identifier: null,
        });
      }
    }

    credentialAssignment.lastIndex = 0;
    for (const match of text.matchAll(credentialAssignment)) {
      const identifier = match[1]?.toUpperCase() ?? 'UNKNOWN_CREDENTIAL';
      const value = match[2] ?? '';
      if (placeholder.test(value)) continue;
      findings.push({
        ruleId: 'literal_credential_assignment',
        file: path,
        line: lineNumberAt(text, match.index ?? 0),
        identifier,
      });
    }
  }

  return findings;
}

const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
const packageManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const packageLock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
const wrangler = JSON.parse(readFileSync(join(root, 'wrangler.jsonc'), 'utf8'));
const pagesWrangler = JSON.parse(
  readFileSync(join(root, 'cloudflare/pages-preview/wrangler.jsonc'), 'utf8'),
);
const pagesRoutes = JSON.parse(readFileSync(join(root, 'public/_routes.json'), 'utf8'));
const publicHeaders = readFileSync(join(root, 'public/_headers'), 'utf8');
const tracked = trackedPaths();
const trackedSet = new Set(tracked);
const actualAssetPaths = walkBinaryAssets(publicRoot);
const ledgerAssetPaths = ledger.assets.map((asset) => asset.path).sort();
const uniqueLedgerPaths = new Set(ledgerAssetPaths);

record(
  'asset_ledger_exact_path_coverage',
  uniqueLedgerPaths.size === ledger.assets.length
    && JSON.stringify(actualAssetPaths) === JSON.stringify(ledgerAssetPaths),
  {
    actualCount: actualAssetPaths.length,
    ledgerCount: ledger.assets.length,
    missingFromLedger: actualAssetPaths.filter((path) => !uniqueLedgerPaths.has(path)),
    missingFromPublic: ledgerAssetPaths.filter((path) => !actualAssetPaths.includes(path)),
  },
);

const assetIntegrity = ledger.assets.map((asset) => {
  const bytes = readFileSync(join(root, asset.path));
  return {
    path: asset.path,
    expectedBytes: asset.bytes,
    actualBytes: bytes.length,
    expectedSha256: asset.sha256,
    actualSha256: sha256(bytes),
    passed: bytes.length === asset.bytes && sha256(bytes) === asset.sha256,
  };
});
record(
  'asset_ledger_hash_and_size_integrity',
  assetIntegrity.every((asset) => asset.passed),
  {
    checkedCount: assetIntegrity.length,
    failures: assetIntegrity.filter((asset) => !asset.passed),
  },
);

const allowedReleaseClearances = new Set([
  'CLEARED_PROJECT_ORIGINAL',
  'CLEARED_CC0_DONOR_ADAPTATION',
]);
const clearedAssets = ledger.assets.filter(
  (asset) => allowedReleaseClearances.has(asset.clearance?.status),
);
const blockedAssets = ledger.assets.filter(
  (asset) => asset.clearance?.status === 'BLOCKED_OWNER_ATTESTATION_OR_LICENSE',
);
record(
  'asset_clearance_classification',
  clearedAssets.length === ledger.assets.length
    && blockedAssets.length === 0
    && ledger.summary?.clearedProjectOriginals === ledger.assets.filter(
      (asset) => asset.clearance?.status === 'CLEARED_PROJECT_ORIGINAL',
    ).length
    && ledger.summary?.clearedCc0DonorAdaptations === ledger.assets.filter(
      (asset) => asset.clearance?.status === 'CLEARED_CC0_DONOR_ADAPTATION',
    ).length
    && ledger.summary?.quarantinedLegacyAssets === 6
    && ledger.assets.every((asset) => asset.releaseEligible === true),
  {
    releasePackagedAssetCount: ledger.assets.length,
    clearedReleaseAssets: clearedAssets.length,
    blockedLegacyAssets: blockedAssets.length,
    quarantinedLegacyAssets: ledger.summary?.quarantinedLegacyAssets ?? null,
    publicReleaseEligibleAssets: ledger.assets.filter((asset) => asset.releaseEligible).length,
  },
);

const missingEvidence = ledger.assets.flatMap((asset) => (
  (asset.clearance?.evidence ?? [])
    .filter((path) => !trackedSet.has(path))
    .map((path) => ({ assetId: asset.assetId, path }))
));
record(
  'asset_provenance_evidence_is_tracked',
  missingEvidence.length === 0,
  { missingEvidence },
);

const rootPackage = packageLock.packages?.[''];
const dependencyEntries = Object.entries(packageLock.packages ?? {})
  .filter(([path]) => path !== '');
const dependenciesWithoutLicense = dependencyEntries
  .filter(([, metadata]) => (
    typeof metadata.license !== 'string' || metadata.license.trim().length === 0
  ))
  .map(([path]) => path);
const dependencyLicenseCounts = Object.fromEntries(
  [...dependencyEntries.reduce((counts, [, metadata]) => {
    const license = typeof metadata.license === 'string' ? metadata.license : 'MISSING';
    counts.set(license, (counts.get(license) ?? 0) + 1);
    return counts;
  }, new Map())]
    .sort(([left], [right]) => left.localeCompare(right)),
);
record(
  'dependency_license_metadata_present',
  dependenciesWithoutLicense.length === 0,
  {
    dependencyPackageCount: dependencyEntries.length,
    missingCount: dependenciesWithoutLicense.length,
    missingPackages: dependenciesWithoutLicense,
    licenseCounts: dependencyLicenseCounts,
    limitation: 'Metadata presence is not a legal compatibility opinion.',
  },
);

const rootLicenseFiles = readdirSync(root)
  .filter((name) => /^(?:licen[cs]e|copying)(?:\.|$)/iu.test(name))
  .sort();
record(
  'project_unlicensed_metadata_consistency',
  packageManifest.license === 'UNLICENSED'
    && rootPackage?.license === 'UNLICENSED'
    && rootLicenseFiles.length === 0,
  {
    packageLicense: packageManifest.license,
    packageLockRootLicense: rootPackage?.license ?? null,
    rootLicenseFiles,
  },
);

const connectSource = publicHeaders.match(/connect-src\s+([^;]+);/iu)?.[1] ?? '';
const connectSourceTokens = connectSource.split(/\s+/u).filter(Boolean);
const originBoundedConnectSources = new Set(["'self'", 'blob:']);
const externalConnectSources = connectSourceTokens.filter(
  (source) => !originBoundedConnectSources.has(source),
);
record(
  'static_asset_csp_is_same_origin',
  connectSource.length > 0
    && connectSourceTokens.includes("'self'")
    && externalConnectSources.length === 0,
  {
    connectSourceTokens,
    originBoundedConnectSources: [...originBoundedConnectSources],
    externalConnectSources,
    blobSourcePurpose: 'Local object URLs used while decoding packaged model textures.',
  },
);

const staging = wrangler.env?.staging;
const stagingOrigins = (staging?.vars?.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const configuredStagingOriginsAreLoopback = stagingOrigins.every((origin) => {
  try {
    const url = new URL(origin);
    return url.protocol === 'http:'
      && (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]');
  } catch {
    return false;
  }
});
const stagingBindings = staging?.durable_objects?.bindings ?? [];
const expectedStagingBindings = new Map([
  ['KYX_ROOM', 'KyxRoom'],
  ['KYX_ALLOCATION_GUARD', 'KyxAllocationGuard'],
]);
const exactStagingBindings = stagingBindings.length === expectedStagingBindings.size
  && stagingBindings.every((binding) => (
    expectedStagingBindings.get(binding.name) === binding.class_name
  ))
  && new Set(stagingBindings.map((binding) => binding.name)).size
    === expectedStagingBindings.size;
const productionNamespaceReuseAbsent = stagingBindings.every(
  (binding) => binding.script_name === undefined,
);
record(
  'cloudflare_staging_environment_isolated',
  staging?.name === 'kyx-io-authority-staging'
    && staging?.name !== wrangler.name
    && staging?.workers_dev === true
    && exactStagingBindings
    && productionNamespaceReuseAbsent
    && configuredStagingOriginsAreLoopback,
  {
    productionWorkerName: wrangler.name,
    stagingWorkerName: staging?.name ?? null,
    stagingWorkersDevEnabled: staging?.workers_dev ?? null,
    stagingDurableObjectBindingCount: stagingBindings.length,
    stagingDurableObjectBindings: stagingBindings.map((binding) => ({
      name: binding.name,
      className: binding.class_name,
      scriptName: binding.script_name ?? null,
    })),
    exactIntendedBindingsPresent: exactStagingBindings,
    productionNamespaceReuseAbsent,
    configuredStagingOriginsAreLoopback,
    sameOriginDeploymentAccess: 'validated by Worker CORS tests',
  },
);

const pagesServiceBindings = pagesWrangler.services ?? [];
const exactPagesAuthorityBinding = pagesServiceBindings.length === 1
  && pagesServiceBindings[0]?.binding === 'KYX_AUTHORITY'
  && pagesServiceBindings[0]?.service === 'kyx-io-authority-staging'
  && pagesServiceBindings[0]?.environment === undefined;
const exactPagesFunctionRoutes = pagesRoutes.version === 1
  && JSON.stringify(pagesRoutes.include) === JSON.stringify(['/api/*', '/health'])
  && Array.isArray(pagesRoutes.exclude)
  && pagesRoutes.exclude.length === 0;
record(
  'cloudflare_pages_preview_is_staging_only_same_origin',
  pagesWrangler.name === 'kyx-io-preview'
    && pagesWrangler.pages_build_output_dir === '../../dist'
    && pagesWrangler.account_id === undefined
    && exactPagesAuthorityBinding
    && exactPagesFunctionRoutes,
  {
    pagesProjectName: pagesWrangler.name ?? null,
    pagesBuildOutputDirectory: pagesWrangler.pages_build_output_dir ?? null,
    accountIdAbsent: pagesWrangler.account_id === undefined,
    exactPrivateStagingAuthorityBinding: exactPagesAuthorityBinding,
    exactFunctionRoutes: exactPagesFunctionRoutes,
  },
);

const secretFindings = scanTrackedFilesForProbableSecrets(tracked);
record(
  'tracked_source_probable_secret_scan',
  secretFindings.length === 0,
  {
    scannedTrackedPathCount: tracked.length,
    findingCount: secretFindings.length,
    findings: secretFindings,
    privacy: 'Potential values are never included in this report.',
  },
);

const failedChecks = checks.filter((check) => check.status === 'FAIL');
const report = {
  schema: 'kyx-g9-security-legal-deployment-readiness-audit-v1',
  generatedAt: new Date().toISOString(),
  baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceState: 'current working tree and index over baseCommit',
  controlStatus: failedChecks.length === 0 ? 'PASS' : 'FAIL',
  releaseStatus: 'BLOCKED',
  knownReleaseBlockers: [
    {
      code: 'PROJECT_LICENSE_SELECTION_REQUIRED',
      affectedAssetCount: ledger.assets.length,
    },
    ...(blockedAssets.length === 0 ? [] : [{
      code: 'ASSET_ATTESTATION_OR_LICENSE_REQUIRED',
      affectedAssetCount: blockedAssets.length,
      affectedAssetIds: blockedAssets.map((asset) => asset.assetId),
    }]),
    {
      code: 'G6_ACCEPTED_RUNTIME_CHARACTER_REQUIRED',
      affectedAssetCount: 1,
    },
    {
      code: 'DISTRIBUTION_MODE_DECISION_REQUIRED',
      affectedAssetCount: ledger.assets.length,
    },
  ],
  checks,
};

const serializedReport = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath !== null) {
  mkdirSync(resolve(outputPath, '..'), { recursive: true });
  writeFileSync(outputPath, serializedReport, 'utf8');
}

process.stdout.write(serializedReport);
if (failedChecks.length > 0) process.exitCode = 1;
