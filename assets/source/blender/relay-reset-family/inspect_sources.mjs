import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const files = [
  'assets/review/runtime-candidates/g6-assault-rev40-cc0-weapon-ready-v4/character-lod0.glb',
  'assets/review/runtime-candidates/g6-assault-rev40-cc0-weapon-ready-v4/character-lod1.glb',
  'assets/review/runtime-candidates/g6-assault-rev40-cc0-weapon-ready-v4/character-lod2.glb',
  'assets/review/runtime-candidates/g6-rev17/first-person.glb',
  'assets/review/runtime-candidates/kyx-vlr7-quaternius-rev1/kyx-vlr7-quaternius-rev1.glb',
];
const report = files.map((file) => {
  const bytes = fs.readFileSync(path.join(root, file));
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2
      || bytes.readUInt32LE(8) !== bytes.length) throw new Error(`Invalid GLB: ${file}`);
  const length = bytes.readUInt32LE(12);
  const doc = JSON.parse(bytes.toString('utf8', 20, 20 + length));
  const nodes = doc.nodes ?? [];
  const parents = new Map(nodes.flatMap((n, i) => (n.children ?? []).map((j) => [j, i])));
  const primitives = (doc.meshes ?? []).flatMap((m) => m.primitives);
  return {
    file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    asset: doc.asset, meshes: doc.meshes?.length ?? 0, primitiveCount: primitives.length,
    triangles: primitives.reduce((sum, p) => sum + (doc.accessors[p.indices ?? p.attributes.POSITION].count / 3), 0),
    materials: doc.materials, images: (doc.images ?? []).map(({ name, mimeType, uri, bufferView }) => ({ name, mimeType, uri, bufferView })),
    skins: (doc.skins ?? []).map((s) => ({ name: s.name, skeleton: s.skeleton, joints: s.joints.map((i) => nodes[i].name) })),
    animations: (doc.animations ?? []).map((a) => ({ name: a.name, channels: a.channels.length,
      duration: Math.max(...a.samplers.map((s) => doc.accessors[s.input].max?.[0] ?? 0)),
      targets: [...new Set(a.channels.map((c) => nodes[c.target.node]?.name))] })),
    nodes: nodes.map((n, i) => ({ index: i, name: n.name, parent: parents.has(i) ? nodes[parents.get(i)].name : null,
      mesh: n.mesh, translation: n.translation, rotation: n.rotation, scale: n.scale,
      bounds: n.mesh === undefined ? undefined : doc.meshes[n.mesh].primitives.map((p) => ({ min: doc.accessors[p.attributes.POSITION].min, max: doc.accessors[p.attributes.POSITION].max })),
    })),
    externalUris: [...(doc.buffers ?? []), ...(doc.images ?? [])].map((v) => v.uri).filter(Boolean),
    extensions: doc.extensionsUsed ?? [],
  };
});
const destination = path.join(root, 'assets/source/blender/relay-reset-family/source-inspection.json');
fs.writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`);
for (const entry of report) console.log(JSON.stringify({ file: entry.file, bytes: entry.bytes,
  sha256: entry.sha256, triangles: entry.triangles, meshes: entry.meshes, primitives: entry.primitiveCount,
  materialNames: entry.materials.map((m) => m.name), bones: entry.skins[0]?.joints,
  clips: entry.animations.map((a) => [a.name, a.duration]), externalUris: entry.externalUris,
  rootNodes: entry.nodes.filter((n) => n.parent === null),
  sockets: entry.nodes.filter((n) => /socket|hand|grip|muzzle|magazine/i.test(n.name ?? '')),
}));
