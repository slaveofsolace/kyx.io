import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const ASSET_KINDS = new Map([
  ['.glb', 'model'],
  ['.gltf', 'model'],
  ['.png', 'image'],
  ['.jpg', 'image'],
  ['.jpeg', 'image'],
  ['.webp', 'image'],
  ['.gif', 'image'],
  ['.svg', 'image'],
  ['.mp3', 'audio'],
  ['.ogg', 'audio'],
  ['.wav', 'audio'],
  ['.m4a', 'audio'],
  ['.flac', 'audio'],
]);

function option(name, fallback) {
  const prefix = `--${name}=`;
  const entry = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : fallback;
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await walk(entryPath));
    else if (entry.isFile()) paths.push(entryPath);
  }
  return paths;
}

function parseGlb(buffer) {
  if (buffer.length < 20) throw new Error('File is too small to be a GLB');
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) throw new Error('Invalid GLB magic');
  const version = buffer.readUInt32LE(4);
  const declaredLength = buffer.readUInt32LE(8);
  if (declaredLength !== buffer.length) {
    throw new Error(`Declared length ${declaredLength} differs from ${buffer.length}`);
  }

  let offset = 12;
  let json;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (end > buffer.length) throw new Error('Chunk exceeds file bounds');
    if (type === JSON_CHUNK) {
      json = JSON.parse(buffer.subarray(start, end).toString('utf8').trim());
    }
    offset = end;
  }
  if (!json) throw new Error('GLB contains no JSON chunk');
  return { version, json };
}

function primitiveTriangles(primitive, accessors) {
  const indexCount = primitive.indices === undefined ? null : accessors[primitive.indices]?.count;
  const positionAccessor = primitive.attributes?.POSITION;
  const vertexCount = positionAccessor === undefined ? null : accessors[positionAccessor]?.count;
  const count = indexCount ?? vertexCount ?? 0;
  const mode = primitive.mode ?? 4;
  if (mode === 4) return Math.floor(count / 3);
  if (mode === 5 || mode === 6) return Math.max(0, count - 2);
  return 0;
}

function animationDuration(animation, accessors) {
  let maximum = 0;
  for (const sampler of animation.samplers ?? []) {
    const value = accessors[sampler.input]?.max?.[0];
    if (Number.isFinite(value)) maximum = Math.max(maximum, value);
  }
  return maximum;
}

function inspectGlb(buffer) {
  const { version, json } = parseGlb(buffer);
  const accessors = json.accessors ?? [];
  const meshes = json.meshes ?? [];
  const primitives = meshes.flatMap((mesh) => mesh.primitives ?? []);
  const skins = json.skins ?? [];
  const uniqueJoints = new Set(skins.flatMap((skin) => skin.joints ?? []));
  return {
    glbVersion: version,
    scenes: json.scenes?.length ?? 0,
    nodes: json.nodes?.length ?? 0,
    meshes: meshes.length,
    primitives: primitives.length,
    trianglesEstimated: primitives.reduce(
      (total, primitive) => total + primitiveTriangles(primitive, accessors),
      0,
    ),
    materials: json.materials?.length ?? 0,
    textures: json.textures?.length ?? 0,
    images: json.images?.length ?? 0,
    skins: skins.length,
    uniqueJoints: uniqueJoints.size,
    animations: (json.animations ?? []).map((animation, index) => ({
      name: animation.name ?? `animation_${index}`,
      durationSeconds: Number(animationDuration(animation, accessors).toFixed(4)),
      channels: animation.channels?.length ?? 0,
      samplers: animation.samplers?.length ?? 0,
    })),
    extensionsUsed: json.extensionsUsed ?? [],
    extensionsRequired: json.extensionsRequired ?? [],
  };
}

function inspectImage(buffer, extension) {
  if (extension === '.png') {
    const signature = buffer.subarray(0, 8).toString('hex');
    if (signature !== '89504e470d0a1a0a' || buffer.length < 24) {
      throw new Error('Invalid PNG header');
    }
    return {
      format: 'png',
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }
  return { format: extension.slice(1), width: null, height: null };
}

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const inputDirectory = path.resolve(repositoryRoot, option('input', 'public'));
const outputPath = option('output', null);
const files = await walk(inputDirectory);
const assets = [];

for (const filePath of files) {
  const extension = path.extname(filePath).toLowerCase();
  const kind = ASSET_KINDS.get(extension);
  if (!kind) continue;

  const buffer = await readFile(filePath);
  const fileStats = await stat(filePath);
  const record = {
    path: path.relative(repositoryRoot, filePath).replaceAll(path.sep, '/'),
    kind,
    extension,
    bytes: fileStats.size,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    ok: true,
  };

  try {
    if (extension === '.glb') record.inspection = inspectGlb(buffer);
    else if (kind === 'image') record.inspection = inspectImage(buffer, extension);
  } catch (error) {
    record.ok = false;
    record.error = error instanceof Error ? error.message : String(error);
  }
  assets.push(record);
}

const report = {
  schemaVersion: 1,
  auditedAt: new Date().toISOString(),
  inputDirectory: path.relative(repositoryRoot, inputDirectory).replaceAll(path.sep, '/'),
  summary: {
    assets: assets.length,
    bytes: assets.reduce((total, asset) => total + asset.bytes, 0),
    models: assets.filter((asset) => asset.kind === 'model').length,
    images: assets.filter((asset) => asset.kind === 'image').length,
    audio: assets.filter((asset) => asset.kind === 'audio').length,
    failures: assets.filter((asset) => !asset.ok).length,
  },
  assets,
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;

if (outputPath) {
  const resolvedOutput = path.resolve(repositoryRoot, outputPath);
  await mkdir(path.dirname(resolvedOutput), { recursive: true });
  await writeFile(resolvedOutput, serialized);
}
process.stdout.write(serialized);

if (report.summary.failures) process.exitCode = 1;
