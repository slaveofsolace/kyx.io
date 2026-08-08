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
const weaponReviewArtifact = path.join(
  repositoryRoot,
  'assets',
  'review',
  'runtime-candidates',
  'kyx-vlr7-quaternius-rev1',
  'kyx-vlr7-quaternius-rev1.glb',
);
const weaponBindingSource = path.join(
  repositoryRoot,
  'src',
  'dev',
  'loadKyxVlr7QuaterniusReview.ts',
);
const characterReviewArtifacts = [
  'kyx-v6b-assault-rev38-fitted-v1-lod0.glb',
  'kyx-v6b-assault-rev38-fitted-v1-lod1.glb',
  'kyx-v6b-assault-rev38-fitted-v1-lod2.glb',
].map((name) => path.join(
  repositoryRoot,
  'assets',
  'review',
  'runtime-candidates',
  'g6-assault-rev38-fitted-v1',
  name,
));
const characterBindingSource = path.join(
  repositoryRoot,
  'src',
  'dev',
  'installKyxAssaultRev38Review.ts',
);
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
const weaponSourceBytes = await readFile(weaponReviewArtifact);
const expectedWeaponBytes = weaponSourceBytes.byteLength;
const expectedWeaponSha256 = sha256(weaponSourceBytes);
const weaponBindingText = await readFile(weaponBindingSource, 'utf8');
if (
  !weaponBindingText.includes(
    `bytes: ${expectedWeaponBytes.toLocaleString('en-US').replaceAll(',', '_')}`,
  )
  || !weaponBindingText.includes(`sha256: '${expectedWeaponSha256}'`)
) {
  throw new Error(
    'STAGING_REVIEW_WEAPON_BINDING_MISMATCH: generated GLB does not match '
    + 'KYX_VLR7_QUATERNIUS_REVIEW',
  );
}
const characterBindingText = await readFile(characterBindingSource, 'utf8');
const characterArtifacts = await Promise.all(characterReviewArtifacts.map(
  async (artifact) => {
    const bytes = await readFile(artifact);
    const expected = Object.freeze({
      source: artifact,
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
    });
    if (
      !characterBindingText.includes(
        `bytes: ${expected.bytes.toLocaleString('en-US').replaceAll(',', '_')}`,
      )
      || !characterBindingText.includes(`sha256: '${expected.sha256}'`)
    ) {
      throw new Error(
        'STAGING_REVIEW_CHARACTER_BINDING_MISMATCH '
          + `artifact=${path.basename(artifact)}`,
      );
    }
    return expected;
  },
));

const distributedFiles = await walkFiles(distributionRoot);
const matches = [];
const weaponMatches = [];
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
  if (
    fileStat.size === expectedWeaponBytes
    && sha256(bytes) === expectedWeaponSha256
  ) {
    weaponMatches.push(
      path.relative(distributionRoot, file).replaceAll('\\', '/'),
    );
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
if (weaponMatches.length !== 1) {
  throw new Error(
    `STAGING_REVIEW_WEAPON_PACKAGE_MISMATCH expected=1 actual=${weaponMatches.length}`,
  );
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
  weaponArtifact: weaponMatches[0],
  weaponBytes: expectedWeaponBytes,
  weaponSha256: expectedWeaponSha256,
  characterArtifacts: characterArtifacts.map((artifact, index) => ({
    artifact: characterMatches[index][0],
    bytes: artifact.bytes,
    sha256: artifact.sha256,
  })),
  authorityTransport: 'same_origin_pages_service_binding',
}, null, 2));
