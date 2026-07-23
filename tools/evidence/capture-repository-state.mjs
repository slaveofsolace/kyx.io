import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const root = path.resolve(process.argv[2] ?? '.');
const outputDirectory = path.resolve(process.argv[3] ?? 'evidence/2026-07-19/phase-0-baseline');

async function run(command, args, cwd = root) {
  const { stdout } = await execFile(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.trimEnd();
}

async function lockInventory(relativeDirectory) {
  const directory = path.join(root, relativeDirectory);
  const [packageText, lockText] = await Promise.all([
    readFile(path.join(directory, 'package.json'), 'utf8'),
    readFile(path.join(directory, 'package-lock.json'), 'utf8'),
  ]);
  const packageJson = JSON.parse(packageText);
  const lock = JSON.parse(lockText);
  const packages = Object.entries(lock.packages ?? {})
    .filter(([location]) => location)
    .map(([location, record]) => ({
      location: location.replaceAll('\\', '/'),
      version: record.version ?? null,
      resolved: record.resolved ?? null,
      integrity: record.integrity ?? null,
      dev: Boolean(record.dev),
      optional: Boolean(record.optional),
    }))
    .sort((left, right) => left.location.localeCompare(right.location));

  return {
    directory: relativeDirectory || '.',
    name: packageJson.name,
    version: packageJson.version,
    packageManager: packageJson.packageManager ?? null,
    declared: {
      dependencies: packageJson.dependencies ?? {},
      devDependencies: packageJson.devDependencies ?? {},
      optionalDependencies: packageJson.optionalDependencies ?? {},
    },
    lockfileVersion: lock.lockfileVersion,
    lockfileSha256: createHash('sha256').update(lockText).digest('hex'),
    installedPackageRecords: packages.length,
    packages,
  };
}

async function installedInventory(relativeDirectory) {
  if (!process.env.npm_execpath) return null;
  const directory = path.join(root, relativeDirectory);
  const output = await run(
    process.execPath,
    [process.env.npm_execpath, 'ls', '--all', '--json'],
    directory,
  );
  return JSON.parse(output);
}

const [
  status,
  branches,
  remotes,
  worktrees,
  submodules,
  head,
  headTree,
  rootDependencies,
  serverDependencies,
  rootInstalled,
  serverInstalled,
] = await Promise.all([
  run('git', ['status', '--porcelain=v2', '--branch']),
  run('git', ['branch', '--all', '--verbose', '--no-abbrev']),
  run('git', ['remote', '-v']),
  run('git', ['worktree', 'list', '--porcelain']),
  run('git', ['submodule', 'status', '--recursive']),
  run('git', ['rev-parse', 'HEAD']),
  run('git', ['ls-tree', '-r', '-l', 'HEAD']),
  lockInventory(''),
  lockInventory('server'),
  installedInventory(''),
  installedInventory('server'),
]);

const changedLines = status.split(/\r?\n/).filter((line) => line && !line.startsWith('#'));
const snapshot = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  repository: root.replaceAll('\\', '/'),
  head,
  dirtyAtCapture: changedLines.length > 0,
  status,
  branches,
  remotes,
  worktrees,
  submodules,
  headTree,
};
const dependencies = {
  schemaVersion: 1,
  capturedAt: snapshot.capturedAt,
  inventories: [rootDependencies, serverDependencies],
  installedTrees: [
    { directory: '.', tree: rootInstalled },
    { directory: 'server', tree: serverInstalled },
  ],
};

await Promise.all([
  writeFile(
    path.join(outputDirectory, 'repository-state.json'),
    `${JSON.stringify(snapshot, null, 2)}\n`,
  ),
  writeFile(
    path.join(outputDirectory, 'dependency-inventory.json'),
    `${JSON.stringify(dependencies, null, 2)}\n`,
  ),
]);

console.log(JSON.stringify({
  head,
  dirtyAtCapture: snapshot.dirtyAtCapture,
  trackedTreeLines: headTree.split(/\r?\n/).filter(Boolean).length,
  dependencyRecords: dependencies.inventories.map((inventory) => ({
    directory: inventory.directory,
    records: inventory.installedPackageRecords,
  })),
  installedTreesCaptured: dependencies.installedTrees.every(({ tree }) => tree !== null),
}, null, 2));
