import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const directory = path.resolve(process.argv[2] ?? 'evidence');
const outputName = process.argv[3] ?? 'baseline-manifest.json';
if (path.basename(outputName) !== outputName || !outputName.endsWith('.json')) {
  throw new Error('Manifest output name must be a JSON filename without directory segments.');
}
const outputPath = path.join(directory, outputName);

async function walk(currentDirectory) {
  const entries = await readdir(currentDirectory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name === '.raw') continue;
    const entryPath = path.join(currentDirectory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(entryPath));
    else if (entry.isFile() && entryPath !== outputPath) files.push(entryPath);
  }
  return files;
}

const files = await walk(directory);
const entries = [];
for (const filePath of files) {
  const [buffer, fileStats] = await Promise.all([readFile(filePath), stat(filePath)]);
  entries.push({
    path: path.relative(directory, filePath).replaceAll(path.sep, '/'),
    bytes: fileStats.size,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  });
}

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  root: path.basename(directory),
  files: entries.length,
  bytes: entries.reduce((total, entry) => total + entry.bytes, 0),
  entries,
};
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, files: manifest.files, bytes: manifest.bytes }, null, 2));
