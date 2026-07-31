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

const distributedFiles = await walkFiles(distributionRoot);
const matches = [];
for (const file of distributedFiles) {
  const fileStat = await stat(file);
  if (fileStat.size !== expectedBytes) continue;
  const bytes = await readFile(file);
  if (sha256(bytes) === expectedSha256) {
    matches.push(path.relative(distributionRoot, file).replaceAll('\\', '/'));
  }
}

if (matches.length !== 1) {
  throw new Error(
    `STAGING_REVIEW_PACKAGE_MISMATCH expected=1 actual=${matches.length}`,
  );
}

console.log(JSON.stringify({
  status: 'STAGING_REVIEW_PACKAGE_VERIFIED',
  artifact: matches[0],
  bytes: expectedBytes,
  sha256: expectedSha256,
}, null, 2));
