import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const manifestPath = path.resolve(process.argv[2] ?? '');
const outputFlagIndex = process.argv.indexOf('--output');
const outputPath = outputFlagIndex >= 0
  ? path.resolve(process.argv[outputFlagIndex + 1] ?? '')
  : null;

if (!process.argv[2] || !manifestPath.endsWith('.json')) {
  throw new Error('Usage: node tools/evidence/verify-manifest.mjs <manifest.json> [--output <outside-root.json>]');
}

const rootDirectory = path.dirname(manifestPath);
if (outputPath) {
  const relativeOutput = path.relative(rootDirectory, outputPath);
  if (relativeOutput === '' || (!relativeOutput.startsWith('..') && !path.isAbsolute(relativeOutput))) {
    throw new Error('Verification output must be outside the sealed manifest root.');
  }
}

async function walk(currentDirectory) {
  const entries = await readdir(currentDirectory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name === '.raw') continue;
    const entryPath = path.join(currentDirectory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(entryPath));
    else if (entry.isFile() && entryPath !== manifestPath) files.push(entryPath);
  }
  return files;
}

const manifestBuffer = await readFile(manifestPath);
const manifest = JSON.parse(manifestBuffer.toString('utf8'));
const failures = [];
if (manifest.schemaVersion !== 1) failures.push('schemaVersion must equal 1');
if (manifest.root !== path.basename(rootDirectory)) failures.push('manifest root does not match its directory');
if (!Array.isArray(manifest.entries)) failures.push('entries must be an array');

const declaredEntries = Array.isArray(manifest.entries) ? manifest.entries : [];
const declaredByPath = new Map();
for (const [index, entry] of declaredEntries.entries()) {
  const label = `entries[${index}]`;
  if (!entry || typeof entry !== 'object') {
    failures.push(`${label} must be an object`);
    continue;
  }
  if (typeof entry.path !== 'string'
    || entry.path.length === 0
    || entry.path.includes('\\')
    || path.posix.isAbsolute(entry.path)
    || entry.path.split('/').includes('..')) {
    failures.push(`${label}.path is not a safe relative POSIX path`);
    continue;
  }
  if (declaredByPath.has(entry.path)) failures.push(`duplicate entry: ${entry.path}`);
  if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0) failures.push(`${label}.bytes is invalid`);
  if (typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(entry.sha256)) {
    failures.push(`${label}.sha256 is invalid`);
  }
  declaredByPath.set(entry.path, entry);
}

const actualFiles = await walk(rootDirectory);
const actualPaths = actualFiles.map((filePath) => path.relative(rootDirectory, filePath).replaceAll(path.sep, '/'));
const actualPathSet = new Set(actualPaths);
if (JSON.stringify([...declaredByPath.keys()]) !== JSON.stringify(actualPaths)) {
  failures.push('manifest entry order does not match the deterministic directory walk');
}
for (const declaredPath of declaredByPath.keys()) {
  if (!actualPathSet.has(declaredPath)) failures.push(`missing file: ${declaredPath}`);
}
for (const actualPath of actualPaths) {
  if (!declaredByPath.has(actualPath)) failures.push(`extra file: ${actualPath}`);
}

let actualBytes = 0;
for (const [index, filePath] of actualFiles.entries()) {
  const relativePath = actualPaths[index];
  const entry = declaredByPath.get(relativePath);
  const [buffer, fileStats] = await Promise.all([readFile(filePath), stat(filePath)]);
  actualBytes += fileStats.size;
  if (!entry) continue;
  if (entry.bytes !== fileStats.size) failures.push(`size mismatch: ${relativePath}`);
  const digest = createHash('sha256').update(buffer).digest('hex');
  if (entry.sha256 !== digest) failures.push(`hash mismatch: ${relativePath}`);
}

if (manifest.files !== actualFiles.length) failures.push('manifest files count does not match disk');
if (manifest.bytes !== actualBytes) failures.push('manifest byte total does not match disk');

const result = {
  schemaVersion: 1,
  checkedAt: new Date().toISOString(),
  manifest: path.relative(process.cwd(), manifestPath).replaceAll(path.sep, '/'),
  manifestSha256: createHash('sha256').update(manifestBuffer).digest('hex'),
  filesChecked: actualFiles.length,
  bytesChecked: actualBytes,
  failures,
  ok: failures.length === 0,
};

if (outputPath) await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exitCode = 1;
