import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  lstat,
  readFile,
  readlink,
} from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const EVIDENCE_ROOT =
  'evidence/2026-07-25/phase-6-g5-authoritative-traversal-matrix-v1';
export const PROVENANCE_PROOF_PATH =
  `${EVIDENCE_ROOT}/authoritative-traversal-matrix.provenance-v2.json`;
export const SOURCE_CLOSURE_PATH =
  `${EVIDENCE_ROOT}/source-closure.provenance-v2.json`;
export const PROVENANCE_VERIFICATION_PATH =
  `${EVIDENCE_ROOT}/verification.provenance-v2.json`;
export const COMMAND_RESULTS_PATH =
  `${EVIDENCE_ROOT}/command-results.provenance-v2.json`;
export const PROVENANCE_COMMANDS_PATH =
  `${EVIDENCE_ROOT}/commands.provenance-v2.txt`;
export const PROVENANCE_BASELINE_PATH =
  `${EVIDENCE_ROOT}/baseline-manifest.provenance-v2.json`;

const EVIDENCE_EXCLUSION = `:(exclude)${EVIDENCE_ROOT}/**`;
const REPOSITORY_PATHSPEC = Object.freeze(['--', '.', EVIDENCE_EXCLUSION]);

export const CRITICAL_SOURCE_PATHS = Object.freeze([
  {
    path: 'tools/evidence/capture-phase6-g5-authoritative-traversal-matrix.mjs',
    role: 'capture_runner',
  },
  {
    path: 'tools/evidence/capture-phase6-g5-authoritative-traversal-matrix.module.ts',
    role: 'capture_runtime_matrix',
  },
  {
    path: 'tools/evidence/capture-phase6-g5-authoritative-traversal-matrix.provenance.mjs',
    role: 'source_closure_builder',
  },
  {
    path:
      'tools/evidence/capture-phase6-g5-authoritative-traversal-matrix-command-results.mjs',
    role: 'raw_command_result_recorder',
  },
  {
    path: 'tools/evidence/verify-phase6-g5-authoritative-traversal-matrix.mjs',
    role: 'independent_consistency_verifier',
  },
  {
    path: 'tests/integration/movement/inkfallAuthoritativeTraversalMatrix.test.ts',
    role: 'focused_matrix_regression',
  },
  {
    path: 'tests/integration/movement/inkfallCanonicalTraversalSnag.test.ts',
    role: 'collision_glb_fixture_rebuild_regression',
  },
  {
    path: 'tools/evidence/capture-phase6-g5-revision3-snag-repair.module.ts',
    role: 'canonical_revision3_probe_dependency',
  },
  {
    path: 'src/authority/playtest/inkfallAuthorityPlaytest.ts',
    role: 'authority_playtest_runtime',
  },
  {
    path: 'src/physics/mapColliderLoader.ts',
    role: 'collision_fixture_converter',
  },
  {
    path: 'src/physics/rapier/world.ts',
    role: 'authoritative_movement_adapter',
  },
  {
    path: 'src/sim/movement/profile.ts',
    role: 'accepted_movement_profile',
  },
  {
    path:
      'assets/source/maps/inkfall-foundry/revisions/revision-2/export/collision.authority.glb',
    role: 'revision2_authority_collision',
  },
  {
    path:
      'assets/source/maps/inkfall-foundry/revisions/revision-2/export/render.graybox.glb',
    role: 'revision2_render_package_input',
  },
  {
    path:
      'assets/source/maps/inkfall-foundry/runtime/combat-authority-fixture.p5-10.v1.json',
    role: 'revision2_canonical_probe_fixture',
  },
  {
    path: 'assets/source/maps/inkfall-foundry/runtime/map.package.v2.json',
    role: 'revision2_runtime_manifest',
  },
  {
    path:
      'assets/source/maps/inkfall-foundry/revisions/revision-2/runtime/map.package.v2.json',
    role: 'revision2_revision_manifest_copy',
  },
  {
    path:
      'assets/source/maps/inkfall-foundry/revisions/revision-3/export/collision.authority.glb',
    role: 'revision3_authority_collision',
  },
  {
    path:
      'assets/source/maps/inkfall-foundry/revisions/revision-3/export/render.graybox.glb',
    role: 'revision3_render_package_input',
  },
  {
    path:
      'assets/source/maps/inkfall-foundry/runtime/combat-authority-fixture.g5-revision3.v1.json',
    role: 'revision3_fixture_snapshot',
  },
  {
    path: 'assets/source/maps/inkfall-foundry/runtime/map.package.v3.json',
    role: 'revision3_runtime_manifest',
  },
  {
    path:
      'assets/source/maps/inkfall-foundry/revisions/revision-3/runtime/map.package.v3.json',
    role: 'revision3_revision_manifest_copy',
  },
  {
    path:
      'assets/source/maps/inkfall-foundry/runtime/playtest-tapes.p6-6.v2.json',
    role: 'revision2_authority_route_tapes',
  },
  {
    path:
      'assets/source/maps/inkfall-foundry/runtime/spawn-fixtures.p6-4.v2.json',
    role: 'revision2_spawn_fixture_input',
  },
  {
    path: 'assets/source/maps/inkfall-foundry/inkfall-foundry.layout-seed.v1.json',
    role: 'topology_seed_input',
  },
  { path: 'package.json', role: 'package_manifest' },
  { path: 'package-lock.json', role: 'dependency_lock' },
  { path: 'tsconfig.json', role: 'application_typecheck_config' },
  { path: 'tsconfig.sim-source.json', role: 'simulation_source_typecheck_config' },
  { path: 'tsconfig.sim.json', role: 'simulation_typecheck_config' },
  { path: 'eslint.config.mjs', role: 'lint_config' },
]);

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function canonicalJsonSha256(value) {
  return sha256(Buffer.from(JSON.stringify(value), 'utf8'));
}

function gitBytes(args) {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: null,
    maxBuffer: 128 * 1024 * 1024,
  });
}

function gitText(args) {
  return gitBytes(args).toString('utf8').trim();
}

function decodeNullSeparated(bytes) {
  const text = bytes.toString('utf8');
  const values = text.split('\0');
  if (values.at(-1) === '') values.pop();
  return values;
}

function repositoryRelativePath(absolutePath) {
  return relative(REPO_ROOT, absolutePath).replaceAll('\\', '/');
}

async function workingTreeFileRecord(path) {
  const absolutePath = resolve(REPO_ROOT, path);
  try {
    const metadata = await lstat(absolutePath);
    if (metadata.isSymbolicLink()) {
      const target = await readlink(absolutePath);
      const bytes = Buffer.from(target, 'utf8');
      return Object.freeze({
        path,
        kind: 'symbolic_link',
        bytes: bytes.byteLength,
        sha256: sha256(bytes),
        target,
      });
    }
    if (!metadata.isFile()) {
      return Object.freeze({
        path,
        kind: 'other',
        bytes: null,
        sha256: null,
      });
    }
    const bytes = await readFile(absolutePath);
    return Object.freeze({
      path,
      kind: 'file',
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
    });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return Object.freeze({
        path,
        kind: 'missing',
        bytes: null,
        sha256: null,
      });
    }
    throw error;
  }
}

export async function captureCriticalSourceEntries() {
  const entries = [];
  for (const definition of CRITICAL_SOURCE_PATHS) {
    const absolutePath = resolve(REPO_ROOT, definition.path);
    const bytes = await readFile(absolutePath);
    entries.push(Object.freeze({
      ...definition,
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
    }));
  }
  return Object.freeze(entries);
}

export async function captureRepositoryState() {
  const head = gitText(['rev-parse', 'HEAD']);
  let branch = null;
  try {
    branch = gitText(['symbolic-ref', '--quiet', '--short', 'HEAD']);
  } catch {
    branch = null;
  }

  const statusBytes = gitBytes([
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
    ...REPOSITORY_PATHSPEC,
  ]);
  const statusShort = gitText([
    'status',
    '--short',
    '--untracked-files=all',
    ...REPOSITORY_PATHSPEC,
  ]).split(/\r?\n/u).filter(Boolean);
  const trackedDiff = gitBytes([
    'diff',
    '--binary',
    '--no-ext-diff',
    ...REPOSITORY_PATHSPEC,
  ]);
  const stagedDiff = gitBytes([
    'diff',
    '--cached',
    '--binary',
    '--no-ext-diff',
    ...REPOSITORY_PATHSPEC,
  ]);
  const trackedPaths = decodeNullSeparated(gitBytes([
    'diff',
    '--name-only',
    '-z',
    ...REPOSITORY_PATHSPEC,
  ]));
  const stagedPaths = decodeNullSeparated(gitBytes([
    'diff',
    '--cached',
    '--name-only',
    '-z',
    ...REPOSITORY_PATHSPEC,
  ]));
  const untrackedPaths = decodeNullSeparated(gitBytes([
    'ls-files',
    '--others',
    '--exclude-standard',
    '-z',
    ...REPOSITORY_PATHSPEC,
  ]));
  const dirtyPaths = [...new Set([
    ...trackedPaths,
    ...stagedPaths,
    ...untrackedPaths,
  ])].sort(compareCodeUnits);
  const workingTreeFiles = [];
  for (const path of dirtyPaths) {
    workingTreeFiles.push(await workingTreeFileRecord(path));
  }

  const stateCore = Object.freeze({
    head,
    branch,
    scope: Object.freeze({
      includes: 'complete_repository_worktree_and_index',
      excludes: Object.freeze([`${EVIDENCE_ROOT}/**`]),
      exclusionReason:
        'generated evidence is excluded to avoid a circular manifest; artifacts are closed by the evidence baseline manifest',
    }),
    statusPorcelainV1ZSha256: sha256(statusBytes),
    statusPorcelainV1ZBytes: statusBytes.byteLength,
    trackedDiffSha256: sha256(trackedDiff),
    trackedDiffBytes: trackedDiff.byteLength,
    stagedDiffSha256: sha256(stagedDiff),
    stagedDiffBytes: stagedDiff.byteLength,
    workingTreeFiles: Object.freeze(workingTreeFiles),
  });

  return Object.freeze({
    ...stateCore,
    statusShort: Object.freeze(statusShort),
    statusPorcelainV1ZBase64: statusBytes.toString('base64'),
    repositoryStateDigestSha256: canonicalJsonSha256(stateCore),
  });
}

export async function buildG5SourceClosure() {
  const [criticalSources, repository] = await Promise.all([
    captureCriticalSourceEntries(),
    captureRepositoryState(),
  ]);
  const core = Object.freeze({
    schemaVersion: 1,
    kind: 'g5_authoritative_traversal_source_closure',
    status: 'BOUNDED_SOURCE_CLOSURE_NOT_G5',
    repositoryRoot: repositoryRelativePath(REPO_ROOT) || '.',
    criticalSources,
    criticalSourcesDigestSha256: canonicalJsonSha256(criticalSources),
    repository,
    provenanceSemantics: Object.freeze({
      criticalSources:
        'byte hashes close the capture, verifier, focused tests, governing runtime sources, map inputs, manifests, and toolchain locks',
      repository:
        'HEAD plus full dirty index/worktree content is closed except for the generated evidence directory',
      generatedEvidence:
        'proof, verification, raw command results, README, and commands are closed separately by the evidence baseline manifest',
    }),
    nonClaims: Object.freeze([
      'SOURCE_CLOSURE_IS_NOT_PRODUCT_BROWSER_PROOF',
      'SOURCE_CLOSURE_IS_NOT_HUMAN_PLAYTEST_PROOF',
      'SOURCE_CLOSURE_DOES_NOT_PROMOTE_REVISION_3',
      'G5_NOT_PASSED',
    ]),
  });
  return Object.freeze({
    ...core,
    capturedAt: new Date().toISOString(),
    closureCoreSha256: canonicalJsonSha256(core),
  });
}

export async function auditCurrentSourceClosure(sourceClosure) {
  const currentCriticalSources = await captureCriticalSourceEntries();
  const requiredPaths = CRITICAL_SOURCE_PATHS.map(({ path }) => path);
  const recordedPaths = sourceClosure.criticalSources.map(({ path }) => path);
  const criticalSourcesMatch = (
    JSON.stringify(currentCriticalSources) === JSON.stringify(sourceClosure.criticalSources)
  );
  const criticalSourcePathClosureExact = (
    JSON.stringify(recordedPaths) === JSON.stringify(requiredPaths)
  );
  const criticalSourcesDigestMatches = (
    canonicalJsonSha256(sourceClosure.criticalSources)
      === sourceClosure.criticalSourcesDigestSha256
  );

  const currentRepository = await captureRepositoryState();
  const repositoryStateMatches = (
    currentRepository.repositoryStateDigestSha256
      === sourceClosure.repository.repositoryStateDigestSha256
  );

  const closureCore = Object.fromEntries(
    Object.entries(sourceClosure).filter(([key]) => (
      key !== 'capturedAt' && key !== 'closureCoreSha256'
    )),
  );
  const closureCoreDigestMatches = (
    canonicalJsonSha256(closureCore) === sourceClosure.closureCoreSha256
  );

  return Object.freeze({
    closureCoreDigestMatches,
    criticalSourcePathClosureExact,
    criticalSourcesDigestMatches,
    criticalSourcesMatch,
    recordedRepositoryStateDigestSha256:
      sourceClosure.repository.repositoryStateDigestSha256,
    currentRepositoryStateDigestSha256:
      currentRepository.repositoryStateDigestSha256,
    repositoryStateMatches,
    currentRepository,
  });
}
