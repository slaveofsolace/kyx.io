import {
  sha256Hex,
  validateRuntimeMapPackageManifest,
  verifyRuntimeMapPackageIdentity,
  type MapArtifactV1,
  type MapBoundsMillimeters,
  type MapPackageValidationIssue,
  type MapVector3Millimeters,
  type RuntimeMapPackageManifestV1,
} from '../content/maps';
import {
  hashPhysicsFixture,
  loadPhysicsFixture,
  MILLIMETERS_PER_RAPIER_UNIT,
  PHYSICS_FIXTURE_SCHEMA_VERSION,
  type FixtureRotationMilliDegrees,
  type FixtureSolidV1,
  type PhysicsFixtureV1,
} from './fixtureSchema';

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const GLB_JSON_CHUNK = 0x4e4f534a;
const GLB_BINARY_CHUNK = 0x004e4942;
const MAX_GLB_BYTES = 100_000_000;
const GLTF_DIMENSION_TOLERANCE_METERS = 0.000_01;
const QUATERNION_UNIT_TOLERANCE = 0.001;
const RADIANS_TO_MILLI_DEGREES = 180_000 / Math.PI;

type UnknownRecord = Record<string, unknown>;

interface ParsedGlb {
  readonly document: UnknownRecord;
  readonly binaryByteLength: number;
}

interface ParsedAuthorityNode {
  readonly solid: FixtureSolidV1;
  readonly sourceKind: string;
}

export interface RuntimeMapArtifactBytes {
  readonly render: Uint8Array;
  readonly collision: Uint8Array;
}

export interface LoadedRuntimeMapPackage {
  readonly schemaVersion: 1;
  readonly manifest: RuntimeMapPackageManifestV1;
  readonly identity: {
    readonly id: string;
    readonly revision: number;
    readonly displayName: string;
    readonly packageDigest: string;
    readonly boundsMm: MapBoundsMillimeters;
  };
  readonly presentation: {
    readonly renderPath: string;
    readonly renderSha256: string;
    readonly renderMeshNodeCount: number;
  };
  readonly authority: {
    readonly collisionPath: string;
    readonly collisionSha256: string;
    readonly collisionMeshNodeCount: number;
    readonly authorityVolumeCount: number;
    readonly totalColliderCount: number;
    readonly sourceKindCounts: Readonly<Record<string, number>>;
    readonly fixture: PhysicsFixtureV1;
    readonly fixtureHash: string;
  };
}

export class RuntimeMapPackageLoadError extends Error {
  readonly issues: readonly MapPackageValidationIssue[];

  constructor(issues: readonly MapPackageValidationIssue[]) {
    super(issues.map((issue) => `${issue.code} ${issue.path}: ${issue.message}`).join('\n'));
    this.name = 'RuntimeMapPackageLoadError';
    this.issues = issues;
  }
}

function fail(
  code: MapPackageValidationIssue['code'],
  path: string,
  message: string,
): never {
  throw new RuntimeMapPackageLoadError(Object.freeze([{ code, path, message }]));
}

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function recordAt(value: unknown, path: string): UnknownRecord {
  if (!isRecord(value)) fail('MAP_COLLISION_INVALID', path, 'Expected an object.');
  return value;
}

function arrayAt(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) fail('MAP_COLLISION_INVALID', path, 'Expected an array.');
  return value;
}

function finiteNumberAt(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('MAP_COLLISION_INVALID', path, 'Expected a finite number.');
  }
  return value;
}

function integerAt(value: unknown, path: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail('MAP_COLLISION_INVALID', path, `Expected a safe integer from ${minimum} to ${maximum}.`);
  }
  return value as number;
}

function stringAt(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 512) {
    fail('MAP_COLLISION_INVALID', path, 'Expected a bounded non-empty string.');
  }
  return value;
}

function assertOnlyKeys(record: UnknownRecord, allowed: readonly string[], path: string): void {
  const supported = new Set(allowed);
  const unknown = Object.keys(record).find((key) => !supported.has(key));
  if (unknown) fail('MAP_COLLISION_INVALID', `${path}.${unknown}`, 'Unsupported glTF field.');
}

function readLittleEndianUint32(view: DataView, offset: number, path: string): number {
  if (offset < 0 || offset + 4 > view.byteLength) {
    fail('MAP_COLLISION_INVALID', path, 'GLB header is truncated.');
  }
  return view.getUint32(offset, true);
}

function parseGlb(bytes: Uint8Array, path: string): ParsedGlb {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 28 || bytes.byteLength > MAX_GLB_BYTES) {
    fail('MAP_COLLISION_INVALID', path, 'Expected a bounded GLB byte array.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (readLittleEndianUint32(view, 0, path) !== GLB_MAGIC) {
    fail('MAP_COLLISION_INVALID', path, 'GLB magic is invalid.');
  }
  if (readLittleEndianUint32(view, 4, path) !== GLB_VERSION) {
    fail('MAP_COLLISION_INVALID', path, 'Only GLB 2.0 is supported.');
  }
  if (readLittleEndianUint32(view, 8, path) !== bytes.byteLength) {
    fail('MAP_COLLISION_INVALID', path, 'GLB declared length does not match the artifact.');
  }

  const jsonLength = readLittleEndianUint32(view, 12, path);
  const jsonType = readLittleEndianUint32(view, 16, path);
  if (jsonType !== GLB_JSON_CHUNK || jsonLength < 2 || jsonLength % 4 !== 0) {
    fail('MAP_COLLISION_INVALID', path, 'GLB must begin with one aligned JSON chunk.');
  }
  const jsonStart = 20;
  const jsonEnd = jsonStart + jsonLength;
  if (jsonEnd + 8 > bytes.byteLength) fail('MAP_COLLISION_INVALID', path, 'GLB JSON chunk is truncated.');
  const binaryLength = readLittleEndianUint32(view, jsonEnd, path);
  const binaryType = readLittleEndianUint32(view, jsonEnd + 4, path);
  if (binaryType !== GLB_BINARY_CHUNK || binaryLength < 1 || binaryLength % 4 !== 0) {
    fail('MAP_COLLISION_INVALID', path, 'GLB must contain one aligned binary chunk after JSON.');
  }
  if (jsonEnd + 8 + binaryLength !== bytes.byteLength) {
    fail('MAP_COLLISION_INVALID', path, 'GLB contains a truncated or unexpected extra chunk.');
  }

  let parsed: unknown;
  try {
    const jsonText = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false })
      .decode(bytes.subarray(jsonStart, jsonEnd))
      .replace(/[\u0000\u0020]+$/u, '');
    parsed = JSON.parse(jsonText) as unknown;
  } catch {
    fail('MAP_COLLISION_INVALID', path, 'GLB JSON could not be decoded.');
  }
  return Object.freeze({ document: recordAt(parsed, `${path}.json`), binaryByteLength: binaryLength });
}

function parseVector(value: unknown, path: string, length: number): readonly number[] {
  const values = arrayAt(value, path);
  if (values.length !== length) fail('MAP_COLLISION_INVALID', path, `Expected ${length} components.`);
  return Object.freeze(values.map((entry, index) => finiteNumberAt(entry, `${path}[${index}]`)));
}

function validateGlbShell(
  parsed: ParsedGlb,
  manifest: RuntimeMapPackageManifestV1,
  artifact: MapArtifactV1,
  path: string,
): {
  readonly nodes: readonly unknown[];
  readonly meshes: readonly unknown[];
  readonly accessors: readonly unknown[];
} {
  const document = parsed.document;
  assertOnlyKeys(
    document,
    ['asset', 'scene', 'scenes', 'nodes', 'materials', 'meshes', 'accessors', 'bufferViews', 'buffers'],
    `${path}.json`,
  );
  const asset = recordAt(document.asset, `${path}.json.asset`);
  assertOnlyKeys(asset, ['generator', 'version'], `${path}.json.asset`);
  if (asset.version !== '2.0') fail('MAP_COLLISION_INVALID', `${path}.json.asset.version`, 'Expected glTF 2.0.');
  if (document.scene !== 0) fail('MAP_COLLISION_INVALID', `${path}.json.scene`, 'Expected scene zero.');
  const scenes = arrayAt(document.scenes, `${path}.json.scenes`);
  if (scenes.length !== 1) fail('MAP_COLLISION_INVALID', `${path}.json.scenes`, 'Expected exactly one scene.');
  const scene = recordAt(scenes[0], `${path}.json.scenes[0]`);
  assertOnlyKeys(scene, ['extras', 'name', 'nodes'], `${path}.json.scenes[0]`);
  const sceneExtras = recordAt(scene.extras, `${path}.json.scenes[0].extras`);
  if (sceneExtras.kyx_seed_sha256 !== manifest.sourceSeed.sha256
    || sceneExtras.kyx_seed_map_id !== manifest.id) {
    fail('MAP_COLLISION_INVALID', `${path}.json.scenes[0].extras`, 'Scene seed identity does not match the map manifest.');
  }

  const nodes = arrayAt(document.nodes, `${path}.json.nodes`);
  const meshes = arrayAt(document.meshes, `${path}.json.meshes`);
  const accessors = arrayAt(document.accessors, `${path}.json.accessors`);
  if (nodes.length !== artifact.expectedMeshNodeCount || meshes.length !== artifact.expectedMeshNodeCount) {
    fail(
      'MAP_COLLISION_INVALID',
      path,
      `Expected ${artifact.expectedMeshNodeCount} mesh nodes; found ${nodes.length} nodes and ${meshes.length} meshes.`,
    );
  }
  const sceneNodes = arrayAt(scene.nodes, `${path}.json.scenes[0].nodes`);
  if (sceneNodes.length !== nodes.length) {
    fail('MAP_COLLISION_INVALID', `${path}.json.scenes[0].nodes`, 'Every mesh node must be a scene root.');
  }
  const sceneNodeSet = new Set(sceneNodes.map((entry, index) => integerAt(
    entry,
    `${path}.json.scenes[0].nodes[${index}]`,
    0,
    nodes.length - 1,
  )));
  if (sceneNodeSet.size !== nodes.length) {
    fail('MAP_COLLISION_INVALID', `${path}.json.scenes[0].nodes`, 'Scene node indexes must be unique and exhaustive.');
  }
  const buffers = arrayAt(document.buffers, `${path}.json.buffers`);
  if (buffers.length !== 1) fail('MAP_COLLISION_INVALID', `${path}.json.buffers`, 'Expected one embedded GLB buffer.');
  const buffer = recordAt(buffers[0], `${path}.json.buffers[0]`);
  assertOnlyKeys(buffer, ['byteLength'], `${path}.json.buffers[0]`);
  const declaredBinaryBytes = integerAt(buffer.byteLength, `${path}.json.buffers[0].byteLength`, 1, MAX_GLB_BYTES);
  if (declaredBinaryBytes > parsed.binaryByteLength || parsed.binaryByteLength - declaredBinaryBytes > 3) {
    fail('MAP_COLLISION_INVALID', `${path}.json.buffers[0].byteLength`, 'Embedded buffer length is inconsistent.');
  }
  return Object.freeze({ nodes, meshes, accessors });
}

function validateNodeRole(
  nodeValue: unknown,
  nodeIndex: number,
  expectedRole: 'render_graybox' | 'authoritative_collider',
  expectedPrefix: 'R_' | 'C_',
  manifest: RuntimeMapPackageManifestV1,
  meshCount: number,
  path: string,
): { readonly node: UnknownRecord; readonly extras: UnknownRecord; readonly meshIndex: number; readonly name: string } {
  const node = recordAt(nodeValue, `${path}.json.nodes[${nodeIndex}]`);
  assertOnlyKeys(node, ['extras', 'mesh', 'name', 'rotation', 'translation'], `${path}.json.nodes[${nodeIndex}]`);
  const name = stringAt(node.name, `${path}.json.nodes[${nodeIndex}].name`);
  if (!name.startsWith(expectedPrefix)) {
    fail(
      'MAP_RENDER_AUTHORITY_VIOLATION',
      `${path}.json.nodes[${nodeIndex}].name`,
      `Expected ${expectedPrefix} ${expectedRole} node.`,
    );
  }
  const extras = recordAt(node.extras, `${path}.json.nodes[${nodeIndex}].extras`);
  const unexpectedExtra = Object.keys(extras).find((key) => !key.startsWith('kyx_'));
  if (unexpectedExtra) {
    fail('MAP_COLLISION_INVALID', `${path}.json.nodes[${nodeIndex}].extras.${unexpectedExtra}`, 'Only KYX namespaced extras are allowed.');
  }
  if (extras.kyx_role !== expectedRole) {
    fail(
      'MAP_RENDER_AUTHORITY_VIOLATION',
      `${path}.json.nodes[${nodeIndex}].extras.kyx_role`,
      `Expected ${expectedRole}; render geometry cannot become authority.`,
    );
  }
  if (extras.kyx_seed_sha256 !== manifest.sourceSeed.sha256) {
    fail('MAP_COLLISION_INVALID', `${path}.json.nodes[${nodeIndex}].extras.kyx_seed_sha256`, 'Node seed hash mismatch.');
  }
  const meshIndex = integerAt(node.mesh, `${path}.json.nodes[${nodeIndex}].mesh`, 0, meshCount - 1);
  parseVector(node.translation, `${path}.json.nodes[${nodeIndex}].translation`, 3);
  if (node.rotation !== undefined) parseVector(node.rotation, `${path}.json.nodes[${nodeIndex}].rotation`, 4);
  return Object.freeze({ node, extras, meshIndex, name });
}

function validateRenderArtifact(
  manifest: RuntimeMapPackageManifestV1,
  bytes: Uint8Array,
): number {
  const path = '$artifacts.render';
  const parsed = parseGlb(bytes, path);
  const shell = validateGlbShell(parsed, manifest, manifest.artifacts.render, path);
  const usedMeshes = new Set<number>();
  shell.nodes.forEach((node, index) => {
    const validated = validateNodeRole(
      node,
      index,
      'render_graybox',
      'R_',
      manifest,
      shell.meshes.length,
      path,
    );
    if (usedMeshes.has(validated.meshIndex)) {
      fail('MAP_COLLISION_INVALID', `${path}.json.nodes[${index}].mesh`, 'Mesh indexes must be one-to-one with nodes.');
    }
    usedMeshes.add(validated.meshIndex);
  });
  return shell.nodes.length;
}

function parseJsonDimensions(value: unknown, path: string): readonly [number, number, number] {
  const encoded = stringAt(value, path);
  let parsed: unknown;
  try {
    parsed = JSON.parse(encoded) as unknown;
  } catch {
    fail('MAP_COLLISION_INVALID', path, 'Collider dimensions metadata is not JSON.');
  }
  const values = arrayAt(parsed, path);
  if (values.length !== 3) fail('MAP_COLLISION_INVALID', path, 'Collider dimensions require three values.');
  return Object.freeze(values.map((entry, index) => integerAt(
    entry,
    `${path}[${index}]`,
    1,
    200_000,
  ))) as readonly [number, number, number];
}

function normalizedQuaternion(value: readonly number[], path: string): readonly [number, number, number, number] {
  const magnitude = Math.hypot(value[0], value[1], value[2], value[3]);
  if (!Number.isFinite(magnitude) || Math.abs(magnitude - 1) > QUATERNION_UNIT_TOLERANCE) {
    fail('MAP_COLLISION_INVALID', path, 'Collider rotation quaternion is not unit length.');
  }
  return Object.freeze(value.map((entry) => entry / magnitude)) as readonly [number, number, number, number];
}

function roundWithoutNegativeZero(value: number): number {
  const rounded = Math.round(value);
  return Object.is(rounded, -0) ? 0 : rounded;
}

function gltfQuaternionToMap(value: readonly number[], path: string): readonly [number, number, number, number] {
  const [x, y, z, w] = normalizedQuaternion(value, path);
  // The GLB export is X east, Y up, -Z north. Reflecting Z transforms the
  // quaternion's axial vector by det(M)M => [-x, -y, z].
  return Object.freeze([-x, -y, z, w]);
}

function quaternionToRotationMilliDegrees(
  value: readonly [number, number, number, number],
): FixtureRotationMilliDegrees {
  const [x, y, z, w] = value;
  const rollX = Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y));
  const pitchTerm = Math.max(-1, Math.min(1, 2 * (w * y - z * x)));
  const pitchY = Math.asin(pitchTerm);
  const yawZ = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
  return Object.freeze({
    x: roundWithoutNegativeZero(rollX * RADIANS_TO_MILLI_DEGREES),
    y: roundWithoutNegativeZero(pitchY * RADIANS_TO_MILLI_DEGREES),
    z: roundWithoutNegativeZero(yawZ * RADIANS_TO_MILLI_DEGREES),
  });
}

function rotationMilliDegreesToQuaternion(
  rotation: FixtureRotationMilliDegrees,
): readonly [number, number, number, number] {
  const x = (rotation.x / RADIANS_TO_MILLI_DEGREES) * 0.5;
  const y = (rotation.y / RADIANS_TO_MILLI_DEGREES) * 0.5;
  const z = (rotation.z / RADIANS_TO_MILLI_DEGREES) * 0.5;
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cz = Math.cos(z);
  const sz = Math.sin(z);
  return Object.freeze([
    sx * cy * cz - cx * sy * sz,
    cx * sy * cz + sx * cy * sz,
    cx * cy * sz - sx * sy * cz,
    cx * cy * cz + sx * sy * sz,
  ]);
}

function worldHalfExtents(
  quaternion: readonly [number, number, number, number],
  halfExtents: MapVector3Millimeters,
): MapVector3Millimeters {
  const [x, y, z, w] = quaternion;
  const matrix = [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
  const values = [halfExtents.x, halfExtents.y, halfExtents.z];
  const component = (row: number) => Math.ceil(matrix[row].reduce(
    (sum, entry, column) => sum + Math.abs(entry) * values[column],
    0,
  ));
  return Object.freeze({ x: component(0), y: component(1), z: component(2) });
}

function assertColliderInsideBounds(
  center: MapVector3Millimeters,
  extents: MapVector3Millimeters,
  bounds: MapBoundsMillimeters,
  path: string,
): void {
  for (const axis of ['x', 'y', 'z'] as const) {
    if (center[axis] - extents[axis] < bounds.minimum[axis]
      || center[axis] + extents[axis] > bounds.maximum[axis]) {
      fail('MAP_COLLISION_OUT_OF_BOUNDS', path, `Collider exceeds ${axis}-axis map bounds after integer quantization.`);
    }
  }
}

function fixtureIdFromNodeName(name: string): string {
  const normalized = name.toLowerCase()
    .replace(/^c_/, '')
    .replace(/[^a-z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '');
  return `map_collision_${normalized}`;
}

function parseAuthorityNode(
  manifest: RuntimeMapPackageManifestV1,
  shell: ReturnType<typeof validateGlbShell>,
  nodeValue: unknown,
  nodeIndex: number,
  usedMeshes: Set<number>,
): ParsedAuthorityNode {
  const path = '$artifacts.collision';
  const validated = validateNodeRole(
    nodeValue,
    nodeIndex,
    'authoritative_collider',
    'C_',
    manifest,
    shell.meshes.length,
    path,
  );
  if (usedMeshes.has(validated.meshIndex)) {
    fail('MAP_COLLISION_INVALID', `${path}.json.nodes[${nodeIndex}].mesh`, 'Authority mesh indexes must be one-to-one with nodes.');
  }
  usedMeshes.add(validated.meshIndex);
  if (validated.extras.kyx_shape !== 'box') {
    fail('MAP_COLLISION_INVALID', `${path}.json.nodes[${nodeIndex}].extras.kyx_shape`, 'Authority collision supports boxes only.');
  }
  const dimensions = parseJsonDimensions(
    validated.extras.kyx_dimensions_mm,
    `${path}.json.nodes[${nodeIndex}].extras.kyx_dimensions_mm`,
  );
  const mesh = recordAt(shell.meshes[validated.meshIndex], `${path}.json.meshes[${validated.meshIndex}]`);
  assertOnlyKeys(mesh, ['name', 'primitives'], `${path}.json.meshes[${validated.meshIndex}]`);
  const primitives = arrayAt(mesh.primitives, `${path}.json.meshes[${validated.meshIndex}].primitives`);
  if (primitives.length !== 1) {
    fail('MAP_COLLISION_INVALID', `${path}.json.meshes[${validated.meshIndex}].primitives`, 'Each authority box requires one primitive.');
  }
  const primitive = recordAt(primitives[0], `${path}.json.meshes[${validated.meshIndex}].primitives[0]`);
  assertOnlyKeys(primitive, ['attributes', 'indices', 'material'], `${path}.json.meshes[${validated.meshIndex}].primitives[0]`);
  const attributes = recordAt(primitive.attributes, `${path}.json.meshes[${validated.meshIndex}].primitives[0].attributes`);
  assertOnlyKeys(attributes, ['POSITION', 'NORMAL'], `${path}.json.meshes[${validated.meshIndex}].primitives[0].attributes`);
  const positionAccessorIndex = integerAt(
    attributes.POSITION,
    `${path}.json.meshes[${validated.meshIndex}].primitives[0].attributes.POSITION`,
    0,
    shell.accessors.length - 1,
  );
  const accessor = recordAt(shell.accessors[positionAccessorIndex], `${path}.json.accessors[${positionAccessorIndex}]`);
  assertOnlyKeys(
    accessor,
    ['bufferView', 'componentType', 'count', 'max', 'min', 'type'],
    `${path}.json.accessors[${positionAccessorIndex}]`,
  );
  if (accessor.componentType !== 5126 || accessor.type !== 'VEC3'
    || integerAt(accessor.count, `${path}.json.accessors[${positionAccessorIndex}].count`, 1, 1_000_000) !== 24) {
    fail('MAP_COLLISION_INVALID', `${path}.json.accessors[${positionAccessorIndex}]`, 'Authority boxes require 24 float VEC3 position vertices.');
  }
  const minimum = parseVector(accessor.min, `${path}.json.accessors[${positionAccessorIndex}].min`, 3);
  const maximum = parseVector(accessor.max, `${path}.json.accessors[${positionAccessorIndex}].max`, 3);
  const gltfDimensions = maximum.map((entry, index) => entry - minimum[index]);
  const expectedGltfDimensions = [dimensions[0], dimensions[2], dimensions[1]].map((entry) => entry / 1_000);
  gltfDimensions.forEach((entry, index) => {
    if (Math.abs(entry - expectedGltfDimensions[index]) > GLTF_DIMENSION_TOLERANCE_METERS) {
      fail(
        'MAP_COLLISION_INVALID',
        `${path}.json.accessors[${positionAccessorIndex}]`,
        'Position accessor bounds do not match the authored collider dimensions.',
      );
    }
    if (Math.abs(maximum[index] + minimum[index]) > GLTF_DIMENSION_TOLERANCE_METERS) {
      fail('MAP_COLLISION_INVALID', `${path}.json.accessors[${positionAccessorIndex}]`, 'Authority box geometry is not centered on its node.');
    }
  });

  const translation = parseVector(validated.node.translation, `${path}.json.nodes[${nodeIndex}].translation`, 3);
  const centerMm = Object.freeze({
    x: roundWithoutNegativeZero(translation[0] * 1_000),
    y: roundWithoutNegativeZero(translation[1] * 1_000),
    z: roundWithoutNegativeZero(-translation[2] * 1_000),
  });
  const gltfRotation = validated.node.rotation === undefined
    ? Object.freeze([0, 0, 0, 1])
    : parseVector(validated.node.rotation, `${path}.json.nodes[${nodeIndex}].rotation`, 4);
  const mapQuaternion = gltfQuaternionToMap(
    gltfRotation,
    `${path}.json.nodes[${nodeIndex}].rotation`,
  );
  const rotationMilliDegrees = quaternionToRotationMilliDegrees(mapQuaternion);
  const halfExtentsMm = Object.freeze({
    x: Math.ceil(dimensions[0] / 2),
    y: Math.ceil(dimensions[2] / 2),
    z: Math.ceil(dimensions[1] / 2),
  });
  const quantizedQuaternion = rotationMilliDegreesToQuaternion(rotationMilliDegrees);
  assertColliderInsideBounds(
    centerMm,
    worldHalfExtents(quantizedQuaternion, halfExtentsMm),
    manifest.boundsMm,
    `${path}.json.nodes[${nodeIndex}]`,
  );
  const sourceKind = stringAt(
    validated.extras.kyx_source_kind,
    `${path}.json.nodes[${nodeIndex}].extras.kyx_source_kind`,
  );
  return Object.freeze({
    sourceKind,
    solid: Object.freeze({
      id: fixtureIdFromNodeName(validated.name),
      layer: manifest.authority.collisionLayer,
      body: 'fixed',
      centerMm,
      rotationMilliDegrees,
      velocityMmPerSecond: Object.freeze({ x: 0, y: 0, z: 0 }),
      shape: Object.freeze({ type: 'box', halfExtentsMm }),
    }),
  });
}

export function convertAuthorityCollisionGlbToFixture(
  manifest: RuntimeMapPackageManifestV1,
  collisionBytes: Uint8Array,
): {
  readonly fixture: PhysicsFixtureV1;
  readonly fixtureHash: string;
  readonly collisionMeshNodeCount: number;
  readonly sourceKindCounts: Readonly<Record<string, number>>;
} {
  if (manifest.authority.renderMeshesMayBeAuthority !== false) {
    fail('MAP_RENDER_AUTHORITY_VIOLATION', '$.authority.renderMeshesMayBeAuthority', 'Render geometry cannot be authoritative.');
  }
  const path = '$artifacts.collision';
  const parsed = parseGlb(collisionBytes, path);
  const shell = validateGlbShell(parsed, manifest, manifest.artifacts.collision, path);
  const usedMeshes = new Set<number>();
  const parsedNodes = shell.nodes.map((node, index) => parseAuthorityNode(
    manifest,
    shell,
    node,
    index,
    usedMeshes,
  ));
  const ids = new Set<string>();
  for (const { solid } of parsedNodes) {
    if (ids.has(solid.id)) fail('MAP_COLLISION_INVALID', path, `Duplicate converted collider ID ${solid.id}.`);
    ids.add(solid.id);
  }
  const defaultSpawn = manifest.spawns.find((spawn) => spawn.id === manifest.authority.defaultSpawnId);
  if (!defaultSpawn) fail('MAP_REFERENCE_MISSING', '$.authority.defaultSpawnId', 'Default spawn does not exist.');
  const fixtureResult = loadPhysicsFixture({
    schemaVersion: PHYSICS_FIXTURE_SCHEMA_VERSION,
    id: `${manifest.id}_map_collision`,
    revision: manifest.revision,
    millimetersPerRapierUnit: MILLIMETERS_PER_RAPIER_UNIT,
    spawn: {
      feetPositionMm: defaultSpawn.feetPositionMm,
      yawMilliDegrees: ((defaultSpawn.yawMilliDegrees % 360_000) + 360_000) % 360_000,
    },
    solids: parsedNodes.map(({ solid }) => solid),
    volumes: manifest.authorityVolumes.map((volume) => ({
      id: `map_volume_${volume.id}`,
      kind: volume.kind,
      layer: volume.kind === 'kill' ? 'kill_volume' : 'recovery_volume',
      centerMm: volume.centerMm,
      rotationMilliDegrees: { x: 0, y: 0, z: 0 },
      shape: { type: 'box', halfExtentsMm: volume.halfExtentsMm },
    })),
  });
  const sourceKindCounts: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const { sourceKind } of parsedNodes) sourceKindCounts[sourceKind] = (sourceKindCounts[sourceKind] ?? 0) + 1;
  return Object.freeze({
    fixture: fixtureResult,
    fixtureHash: hashPhysicsFixture(fixtureResult),
    collisionMeshNodeCount: parsedNodes.length,
    sourceKindCounts: Object.freeze(Object.fromEntries(Object.entries(sourceKindCounts).sort())),
  });
}

function copyArtifactBytes(value: Uint8Array, path: string): Uint8Array {
  if (!(value instanceof Uint8Array) || value.byteLength < 1 || value.byteLength > MAX_GLB_BYTES) {
    fail('MAP_INVALID_TYPE', path, 'Expected a bounded Uint8Array artifact.');
  }
  return new Uint8Array(value);
}

async function verifyArtifact(
  artifact: MapArtifactV1,
  bytes: Uint8Array,
  path: string,
): Promise<void> {
  if (bytes.byteLength !== artifact.bytes) {
    fail(
      'MAP_ARTIFACT_SIZE_MISMATCH',
      path,
      `Expected ${artifact.bytes} bytes; received ${bytes.byteLength}.`,
    );
  }
  const digest = await sha256Hex(bytes);
  if (digest !== artifact.sha256) {
    fail('MAP_ARTIFACT_HASH_MISMATCH', path, `Expected ${artifact.sha256}; computed ${digest}.`);
  }
}

export async function loadRuntimeMapPackage(
  manifestInput: unknown,
  artifactInput: RuntimeMapArtifactBytes,
): Promise<LoadedRuntimeMapPackage> {
  const validated = validateRuntimeMapPackageManifest(manifestInput);
  if (!validated.ok) throw new RuntimeMapPackageLoadError(validated.issues);
  const identity = await verifyRuntimeMapPackageIdentity(validated.value);
  if (!identity.ok) throw new RuntimeMapPackageLoadError(identity.issues);
  if (!artifactInput || typeof artifactInput !== 'object') {
    fail('MAP_INVALID_TYPE', '$artifacts', 'Runtime map artifacts are required.');
  }
  const renderBytes = copyArtifactBytes(artifactInput.render, '$artifacts.render');
  const collisionBytes = copyArtifactBytes(artifactInput.collision, '$artifacts.collision');
  await Promise.all([
    verifyArtifact(identity.value.artifacts.render, renderBytes, '$artifacts.render'),
    verifyArtifact(identity.value.artifacts.collision, collisionBytes, '$artifacts.collision'),
  ]);
  const renderMeshNodeCount = validateRenderArtifact(identity.value, renderBytes);
  const converted = convertAuthorityCollisionGlbToFixture(identity.value, collisionBytes);
  return Object.freeze({
    schemaVersion: 1,
    manifest: identity.value,
    identity: Object.freeze({
      id: identity.value.id,
      revision: identity.value.revision,
      displayName: identity.value.displayName,
      packageDigest: identity.value.identity.digest,
      boundsMm: identity.value.boundsMm,
    }),
    presentation: Object.freeze({
      renderPath: identity.value.artifacts.render.path,
      renderSha256: identity.value.artifacts.render.sha256,
      renderMeshNodeCount,
    }),
    authority: Object.freeze({
      collisionPath: identity.value.artifacts.collision.path,
      collisionSha256: identity.value.artifacts.collision.sha256,
      collisionMeshNodeCount: converted.collisionMeshNodeCount,
      authorityVolumeCount: identity.value.authorityVolumes.length,
      totalColliderCount: converted.collisionMeshNodeCount + identity.value.authorityVolumes.length,
      sourceKindCounts: converted.sourceKindCounts,
      fixture: converted.fixture,
      fixtureHash: converted.fixtureHash,
    }),
  });
}
