import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

import {
  buildG5SourceClosure,
  EVIDENCE_ROOT,
  jsonBytes,
  PROVENANCE_PROOF_PATH,
  REPO_ROOT,
  sha256,
  SOURCE_CLOSURE_PATH,
} from './capture-phase6-g5-authoritative-traversal-matrix.provenance.mjs';

const root = new URL('../../', import.meta.url);
const dryRun = process.argv.includes('--dry-run');

function argumentValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${name}.`);
  }
  return value;
}

const proofPath = argumentValue('--proof-output', PROVENANCE_PROOF_PATH);
const sourceClosurePath = argumentValue('--source-closure-output', SOURCE_CLOSURE_PATH);
const proofOutput = resolve(REPO_ROOT, proofPath);
const sourceClosureOutput = resolve(REPO_ROOT, sourceClosurePath);

const server = await createServer({
  root: fileURLToPath(root),
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false },
  logLevel: 'error',
});

try {
  const module = await server.ssrLoadModule(
    '/tools/evidence/capture-phase6-g5-authoritative-traversal-matrix.module.ts',
  );
  const capture = await module.capturePhase6G5AuthoritativeTraversalMatrix();
  const sourceClosure = await buildG5SourceClosure();
  const sourceClosureFileBytes = jsonBytes(sourceClosure);
  const sourceClosureSha256 = sha256(sourceClosureFileBytes);
  const repository = Object.freeze({
    head: sourceClosure.repository.head,
    branch: sourceClosure.repository.branch,
    repositoryStateDigestSha256:
      sourceClosure.repository.repositoryStateDigestSha256,
    statusShort: sourceClosure.repository.statusShort,
    generatedEvidenceExclusion: `${EVIDENCE_ROOT}/**`,
  });
  const provenance = Object.freeze({
    schemaVersion: 1,
    sourceClosurePath,
    sourceClosureSha256,
    sourceClosureCoreSha256: sourceClosure.closureCoreSha256,
    criticalSourcesDigestSha256: sourceClosure.criticalSourcesDigestSha256,
    criticalSourceCount: sourceClosure.criticalSources.length,
    repositoryStateDigestSha256:
      sourceClosure.repository.repositoryStateDigestSha256,
    sourceClosureSemantics:
      'critical source bytes and the complete non-evidence dirty tree are closed independently of generated proof artifacts',
  });
  const proof = Object.freeze({ ...capture, repository, provenance });

  if (dryRun) {
    process.stdout.write(`${JSON.stringify({
      status: proof.status,
      deterministicCoreSha256: proof.deterministicCoreSha256,
      revision2Totals: proof.revision2AuthorityPlaytest.totals,
      revision3CanonicalResult: proof.revision3CanonicalPressJunction.result,
      revision3WestArchiveTotals: proof.revision3WestArchive.totals,
      repository,
      provenance,
    }, null, 2)}\n`);
  } else {
    await mkdir(resolve(REPO_ROOT, EVIDENCE_ROOT), { recursive: true });
    await writeFile(sourceClosureOutput, sourceClosureFileBytes, {
      flag: 'wx',
    });
    await writeFile(proofOutput, jsonBytes(proof), {
      encoding: 'utf8',
      flag: 'wx',
    });
    process.stdout.write(`${JSON.stringify({
      proofPath,
      proofSha256: sha256(jsonBytes(proof)),
      sourceClosurePath,
      sourceClosureSha256,
      repositoryStateDigestSha256:
        sourceClosure.repository.repositoryStateDigestSha256,
    }, null, 2)}\n`);
  }
} finally {
  await server.close();
}
