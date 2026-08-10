import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const distributionRoot = path.join(repositoryRoot, 'dist');
const reviewArtifact = path.join(
  repositoryRoot,
  'assets',
  'source',
  'maps',
  'inkfall-foundry',
  'art-kit',
  'press-archive-rev5',
  'rev5',
  'export',
  'inkfall_foundry_rev5_geometry_portal.render-only-modules.glb',
);
const bindingSource = path.join(
  repositoryRoot,
  'src',
  'app',
  'inkfallRev5CandidateBinding.ts',
);
const weaponReviewArtifacts = [
  {
    artifact: path.join(
      repositoryRoot,
      'assets',
      'review',
      'runtime-candidates',
      'kyx-vlr7-quaternius-rev1',
      'kyx-vlr7-quaternius-rev1.glb',
    ),
    binding: path.join(
      repositoryRoot,
      'src',
      'weapons',
      'KyxArmorySelectedAssets.ts',
    ),
  },
  ...[
    'kyx-k9-quaternius-rev1.glb',
    'kyx-sg4-quaternius-rev1.glb',
    'kyx-longbow12-quaternius-rev1.glb',
    'kyx-br6-quaternius-rev1.glb',
  ].map((name) => ({
    artifact: path.join(
      repositoryRoot,
      'assets',
      'review',
      'runtime-candidates',
      'kyx-quaternius-armory-rev1',
      name,
    ),
    binding: path.join(
      repositoryRoot,
      'src',
      'weapons',
      'KyxArmorySelectedAssets.ts',
    ),
  })),
];
const characterReviewArtifacts = [
  {
    artifact: path.join(
      repositoryRoot,
      'assets',
      'review',
      'runtime-candidates',
      'g6-rev30-cc0-donor',
      'character-lod0.glb',
    ),
    binding: path.join(
      repositoryRoot,
      'src',
      'dev',
      'installKyxAssaultRev39ArmoredReview.ts',
    ),
  },
  ...['character-lod0.glb', 'character-lod1.glb', 'character-lod2.glb'].map(
    (name) => ({
      artifact: path.join(
        repositoryRoot,
        'assets',
        'review',
        'runtime-candidates',
        'g6-assault-rev40-cc0',
        name,
      ),
      binding: path.join(
        repositoryRoot,
        'src',
        'dev',
        'installKyxAssaultRev40Cc0Review.ts',
      ),
    }),
  ),
  ...['character-lod0.glb', 'character-lod1.glb', 'character-lod2.glb'].map(
    (name) => ({
      artifact: path.join(
        repositoryRoot,
        'assets',
        'review',
        'runtime-candidates',
        'g6-assault-rev40-cc0-weapon-ready-v4',
        name,
      ),
      binding: path.join(
        repositoryRoot,
        'src',
        'dev',
        'installKyxAssaultRev40Cc0Review.ts',
      ),
    }),
  ),
];
const localStagingEnvironment = path.join(repositoryRoot, '.env.staging');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function walkFiles(root) {
  const files = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile()) files.push(target);
    }
  }
  return files;
}

const sourceBytes = await readFile(reviewArtifact);
const expectedBytes = sourceBytes.byteLength;
const expectedSha256 = sha256(sourceBytes);
const bindingText = await readFile(bindingSource, 'utf8');
if (
  !bindingText.includes(`bytes: ${expectedBytes.toLocaleString('en-US').replaceAll(',', '_')}`)
  || !bindingText.includes(`sha256: '${expectedSha256}'`)
) {
  throw new Error(
    'STAGING_REVIEW_SOURCE_BINDING_MISMATCH: generated GLB does not match '
      + 'INKFALL_REV5_CANDIDATE_ART',
  );
}
const weaponArtifacts = await Promise.all(weaponReviewArtifacts.map(
  async ({ artifact, binding }) => {
    const bytes = await readFile(artifact);
    const expected = Object.freeze({
      source: artifact,
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
    });
    const bindingText = await readFile(binding, 'utf8');
    if (
      !bindingText.includes(
        `bytes: ${expected.bytes.toLocaleString('en-US').replaceAll(',', '_')}`,
      )
      || !bindingText.includes(`sha256: '${expected.sha256}'`)
    ) {
      throw new Error(
        'STAGING_REVIEW_WEAPON_BINDING_MISMATCH '
          + `artifact=${path.basename(artifact)}`,
      );
    }
    return expected;
  },
));
const characterArtifacts = await Promise.all(characterReviewArtifacts.map(
  async ({ artifact, binding }) => {
    const bytes = await readFile(artifact);
    const expected = Object.freeze({
      source: artifact,
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
    });
    const characterBindingText = await readFile(binding, 'utf8');
    if (
      !characterBindingText.includes(
        `bytes: ${expected.bytes.toLocaleString('en-US').replaceAll(',', '_')}`,
      )
      || !characterBindingText.includes(`sha256: '${expected.sha256}'`)
    ) {
      throw new Error(
        'STAGING_REVIEW_CHARACTER_BINDING_MISMATCH '
          + `artifact=${path.relative(repositoryRoot, artifact)}`,
      );
    }
    return expected;
  },
));

const distributedFiles = await walkFiles(distributionRoot);
const matches = [];
const weaponMatches = weaponArtifacts.map(() => []);
const characterMatches = characterArtifacts.map(() => []);
let usesSameOriginAuthority = false;
const forbiddenAuthorityOriginFiles = [];
let localStagingAuthorityOrigin = '';
try {
  const localEnvironment = await readFile(localStagingEnvironment, 'utf8');
  localStagingAuthorityOrigin = localEnvironment
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.startsWith('VITE_KYX_AUTHORITY_ORIGIN='))
    ?.slice('VITE_KYX_AUTHORITY_ORIGIN='.length) ?? '';
} catch {
  // Local staging configuration is optional and never part of the package.
}
for (const file of distributedFiles) {
  const fileStat = await stat(file);
  const bytes = await readFile(file);
  if (fileStat.size === expectedBytes && sha256(bytes) === expectedSha256) {
    matches.push(path.relative(distributionRoot, file).replaceAll('\\', '/'));
  }
  for (const [index, artifact] of weaponArtifacts.entries()) {
    if (fileStat.size === artifact.bytes && sha256(bytes) === artifact.sha256) {
      weaponMatches[index].push(
        path.relative(distributionRoot, file).replaceAll('\\', '/'),
      );
    }
  }
  for (const [index, artifact] of characterArtifacts.entries()) {
    if (fileStat.size === artifact.bytes && sha256(bytes) === artifact.sha256) {
      characterMatches[index].push(
        path.relative(distributionRoot, file).replaceAll('\\', '/'),
      );
    }
  }
  if (path.extname(file).toLowerCase() !== '.js') continue;
  const script = bytes.toString('utf8');
  if (script.includes('location.origin')) usesSameOriginAuthority = true;
  if (
    /https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?/iu.test(script)
    || /\.workers\.dev/iu.test(script)
    || (
      localStagingAuthorityOrigin.length > 0
      && script.includes(localStagingAuthorityOrigin)
    )
  ) {
    forbiddenAuthorityOriginFiles.push(
      path.relative(distributionRoot, file).replaceAll('\\', '/'),
    );
  }
}

if (matches.length !== 0) {
  throw new Error(
    'STAGING_REVIEW_RETIRED_MAP_ARTIFACT_PACKAGED '
      + `expected=0 actual=${matches.length}`,
  );
}
for (const [index, artifactMatches] of weaponMatches.entries()) {
  if (artifactMatches.length !== 1) {
    throw new Error(
      'STAGING_REVIEW_WEAPON_PACKAGE_MISMATCH '
        + `artifact=${path.basename(weaponArtifacts[index].source)} `
        + `expected=1 actual=${artifactMatches.length}`,
    );
  }
}
for (const [index, artifactMatches] of characterMatches.entries()) {
  if (artifactMatches.length !== 1) {
    throw new Error(
      'STAGING_REVIEW_CHARACTER_PACKAGE_MISMATCH '
        + `artifact=${path.basename(characterArtifacts[index].source)} `
        + `expected=1 actual=${artifactMatches.length}`,
    );
  }
}
if (!usesSameOriginAuthority || forbiddenAuthorityOriginFiles.length > 0) {
  throw new Error(
    'STAGING_REVIEW_AUTHORITY_ORIGIN_MISMATCH '
      + `sameOrigin=${usesSameOriginAuthority} `
      + `forbiddenFiles=${forbiddenAuthorityOriginFiles.length}`,
  );
}

console.log(JSON.stringify({
  status: 'STAGING_REVIEW_PACKAGE_VERIFIED',
  retiredMapArtifactPackaged: false,
  retiredMapArtifactSourceBytes: expectedBytes,
  retiredMapArtifactSourceSha256: expectedSha256,
  weaponArtifact: weaponMatches[0][0],
  weaponBytes: weaponArtifacts[0].bytes,
  weaponSha256: weaponArtifacts[0].sha256,
  weaponArtifacts: weaponArtifacts.map((artifact, index) => ({
    artifact: weaponMatches[index][0],
    bytes: artifact.bytes,
    sha256: artifact.sha256,
  })),
  characterArtifacts: characterArtifacts.map((artifact, index) => ({
    artifact: characterMatches[index][0],
    bytes: artifact.bytes,
    sha256: artifact.sha256,
  })),
  authorityTransport: 'same_origin_pages_service_binding',
}, null, 2));
