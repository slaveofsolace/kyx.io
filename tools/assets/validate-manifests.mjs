import { createHash } from 'node:crypto';
import {
  lstat,
  readFile,
  readdir,
  realpath,
  stat,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const WAIVER_ID_PATTERN = /^waiver-[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RELEASE_MODE = process.argv.includes('--release');
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifestDirectory = path.join(repositoryRoot, 'assets', 'manifests');

const KINDS = new Set([
  'character',
  'first_person_arms',
  'weapon_world',
  'weapon_viewmodel',
  'map',
  'prop',
  'vfx',
  'audio',
  'ui',
]);

const DISPOSITIONS = new Set([
  'legacy_proxy_replace',
  'temporary_diagnostic_only_then_replace',
  'audit_then_replace',
  'candidate',
  'approved',
]);

// This phase only has structural inspectors for these exact runtime pairs.
// Adding an extension here requires adding a real parser below first.
const SUPPORTED_RUNTIME_EXTENSIONS = Object.freeze({
  character: new Set(['.glb']),
  first_person_arms: new Set(['.glb']),
  weapon_world: new Set(['.glb', '.png']),
  weapon_viewmodel: new Set(['.glb', '.png']),
  map: new Set(['.glb']),
  prop: new Set(['.glb']),
  vfx: new Set(['.glb', '.png']),
  audio: new Set(),
  ui: new Set(['.png']),
});

const BUDGET_LIMITS = Object.freeze({
  character: { triangles: 45_000, primitives: 3 },
  first_person_arms: { triangles: 30_000, primitives: 2 },
  weapon_world: { triangles: 12_000, primitives: 2 },
  weapon_viewmodel: { triangles: 35_000, primitives: 3 },
  map: { triangles: 1_500_000, primitives: 500 },
  prop: { triangles: 5_000, primitives: 1 },
  vfx: { triangles: 50_000, primitives: 16 },
  audio: { triangles: 0, primitives: 0 },
  ui: { triangles: 0, primitives: 0 },
});

const REQUIRED_BUDGET_FIELDS = Object.freeze([
  'triangles',
  'primitives',
  'materials',
  'nodes',
  'bones',
  'clips',
  'textures',
]);

const VALIDATION_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const SUPPORTED_RUNTIME_FILE_EXTENSIONS = new Set(
  Object.values(SUPPORTED_RUNTIME_EXTENSIONS).flatMap((extensions) => [...extensions]),
);

const issues = [];
const loaded = [];

function addIssue(level, code, manifestName, assetId, message) {
  issues.push({ level, code, manifestName, assetId: assetId ?? 'unknown', message });
}

function error(code, manifestName, assetId, message) {
  addIssue('error', code, manifestName, assetId, message);
}

function warning(code, manifestName, assetId, message) {
  addIssue('warning', code, manifestName, assetId, message);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function supportsRuntimeKindExtension(kind, extension) {
  if (typeof kind !== 'string'
    || typeof extension !== 'string'
    || !Object.hasOwn(SUPPORTED_RUNTIME_EXTENSIONS, kind)) return false;
  return SUPPORTED_RUNTIME_EXTENSIONS[kind].has(extension.toLowerCase());
}

function normalizeRepositoryUri(uri) {
  return uri.replaceAll('\\', '/').toLowerCase();
}

function isPathWithin(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative.length > 0
    && relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

export function findUnmanifestedRuntimeUris(discoveredUris, manifestUris) {
  const registered = new Set(manifestUris.map(normalizeRepositoryUri));
  return discoveredUris
    .filter((uri) => !registered.has(normalizeRepositoryUri(uri)))
    .sort((left, right) => left.localeCompare(right));
}

export function auditExternalGltfIssues(value) {
  if (!isRecord(value)) return { ok: false, reason: 'issues must be an object' };
  const declaredFields = ['numErrors', 'numWarnings', 'numInfos', 'numHints'];
  for (const field of declaredFields) {
    if (!Number.isSafeInteger(value[field]) || value[field] < 0) {
      return { ok: false, reason: `${field} must be a non-negative integer` };
    }
  }
  if (!Array.isArray(value.messages)) {
    return { ok: false, reason: 'messages must be an array' };
  }
  if (value.truncated !== undefined && value.truncated !== false) {
    return { ok: false, reason: 'truncated reports are not complete release evidence' };
  }

  const measured = [0, 0, 0, 0];
  for (const message of value.messages) {
    if (!isRecord(message)
      || !Number.isSafeInteger(message.severity)
      || message.severity < 0
      || message.severity > 3
      || !isNonEmptyString(message.code)
      || !isNonEmptyString(message.message)) {
      return {
        ok: false,
        reason: 'every message requires severity 0-3 plus non-empty code and message',
      };
    }
    measured[message.severity] += 1;
  }

  const declared = declaredFields.map((field) => value[field]);
  if (measured.some((count, severity) => count !== declared[severity])) {
    return {
      ok: false,
      reason: `declared issue counts ${declared.join('/')} do not match messages ${measured.join('/')}`,
    };
  }
  return {
    ok: true,
    counts: Object.freeze({
      errors: measured[0],
      warnings: measured[1],
      infos: measured[2],
      hints: measured[3],
    }),
  };
}

function rejectUnknownFields(record, allowedFields, pathLabel, manifestName, assetId) {
  if (!isRecord(record)) return;
  const allowed = new Set(allowedFields);
  for (const field of Object.keys(record)) {
    if (!allowed.has(field)) {
      error('ASSET_UNKNOWN_FIELD', manifestName, assetId, `${pathLabel}.${field} is not supported`);
    }
  }
}

function validateShape(manifest, manifestName) {
  const assetId = isNonEmptyString(manifest.assetId) ? manifest.assetId : null;
  rejectUnknownFields(manifest, [
    'schemaVersion', 'assetId', 'kind', 'releaseEligible', 'sourceHash',
    'sourceHashKind', 'runtime', 'budgets', 'validation', 'provenance', 'disposition',
  ], '$', manifestName, assetId);
  if (manifest.schemaVersion !== 1) {
    error('ASSET_SCHEMA_VERSION', manifestName, assetId, 'schemaVersion must equal 1');
  }
  if (!assetId || !ID_PATTERN.test(assetId)) {
    error('ASSET_ID_INVALID', manifestName, assetId, 'assetId must use lowercase semantic ID syntax');
  }
  if (!KINDS.has(manifest.kind)) {
    error('ASSET_KIND_INVALID', manifestName, assetId, 'kind is not supported');
  }
  if (typeof manifest.releaseEligible !== 'boolean') {
    error('ASSET_RELEASE_FLAG_INVALID', manifestName, assetId, 'releaseEligible must be boolean');
  }
  if (!HASH_PATTERN.test(manifest.sourceHash ?? '')) {
    error('ASSET_SOURCE_HASH_INVALID', manifestName, assetId, 'sourceHash must be lowercase SHA-256');
  }
  if (!['canonical_source', 'runtime_snapshot'].includes(manifest.sourceHashKind)) {
    error('ASSET_SOURCE_HASH_KIND_INVALID', manifestName, assetId, 'sourceHashKind is invalid');
  }

  if (!isRecord(manifest.runtime)) {
    error('ASSET_RUNTIME_INVALID', manifestName, assetId, 'runtime must be an object');
  } else {
    rejectUnknownFields(manifest.runtime, ['uri', 'hash', 'bytes'], '$.runtime', manifestName, assetId);
    if (!isNonEmptyString(manifest.runtime.uri) || !manifest.runtime.uri.startsWith('public/')) {
      error('ASSET_RUNTIME_URI_INVALID', manifestName, assetId, 'runtime.uri must be a public/ path');
    }
    if (!HASH_PATTERN.test(manifest.runtime.hash ?? '')) {
      error('ASSET_RUNTIME_HASH_INVALID', manifestName, assetId, 'runtime.hash must be lowercase SHA-256');
    }
    if (!Number.isSafeInteger(manifest.runtime.bytes) || manifest.runtime.bytes <= 0) {
      error('ASSET_RUNTIME_BYTES_INVALID', manifestName, assetId, 'runtime.bytes must be a positive integer');
    }
  }

  if (!isRecord(manifest.budgets)) {
    error('ASSET_BUDGETS_INVALID', manifestName, assetId, 'budgets must be an object');
  } else {
    rejectUnknownFields(
      manifest.budgets,
      [...REQUIRED_BUDGET_FIELDS, 'estimatedTextureBytes', 'waiverId'],
      '$.budgets',
      manifestName,
      assetId,
    );
    for (const field of REQUIRED_BUDGET_FIELDS) {
      if (!Number.isSafeInteger(manifest.budgets[field]) || manifest.budgets[field] < 0) {
        error('ASSET_BUDGET_VALUE_INVALID', manifestName, assetId, `budgets.${field} must be a non-negative integer`);
      }
    }
    if (manifest.budgets.estimatedTextureBytes !== null
      && (!Number.isSafeInteger(manifest.budgets.estimatedTextureBytes)
        || manifest.budgets.estimatedTextureBytes < 0)) {
      error(
        'ASSET_BUDGET_VALUE_INVALID',
        manifestName,
        assetId,
        'budgets.estimatedTextureBytes must be null (unmeasured) or a non-negative integer',
      );
    }
    if (manifest.budgets.waiverId !== null
      && (!isNonEmptyString(manifest.budgets.waiverId)
        || !WAIVER_ID_PATTERN.test(manifest.budgets.waiverId))) {
      error('ASSET_WAIVER_INVALID', manifestName, assetId, 'budgets.waiverId must be null or a waiver-* semantic ID');
    }
  }

  if (!isRecord(manifest.validation)) {
    error('ASSET_VALIDATION_RECORD_INVALID', manifestName, assetId, 'validation must be an object');
  } else {
    rejectUnknownFields(
      manifest.validation,
      [
        'structuralInspector',
        'structuralStatus',
        'externalGltfValidator',
        'externalGltfReport',
        'errors',
        'warnings',
      ],
      '$.validation',
      manifestName,
      assetId,
    );
    if (manifest.validation.structuralInspector !== 'kyx_binary_inspector_v1') {
      error('ASSET_INSPECTOR_INVALID', manifestName, assetId, 'validation.structuralInspector is unsupported');
    }
    if (!['passed', 'failed'].includes(manifest.validation.structuralStatus)) {
      error('ASSET_STRUCTURAL_STATUS_INVALID', manifestName, assetId, 'validation.structuralStatus is invalid');
    }
    if (!['not_run', 'passed', 'failed', 'not_applicable'].includes(manifest.validation.externalGltfValidator)) {
      error('ASSET_EXTERNAL_VALIDATOR_STATUS_INVALID', manifestName, assetId, 'validation.externalGltfValidator is invalid');
    }
    const report = manifest.validation.externalGltfReport;
    if (report !== null && !isRecord(report)) {
      error('ASSET_EXTERNAL_REPORT_INVALID', manifestName, assetId, 'validation.externalGltfReport must be null or an object');
    } else if (isRecord(report)) {
      rejectUnknownFields(
        report,
        ['uri', 'hash', 'bytes', 'assetHash'],
        '$.validation.externalGltfReport',
        manifestName,
        assetId,
      );
      if (!isNonEmptyString(report.uri) || !report.uri.startsWith('evidence/')) {
        error('ASSET_EXTERNAL_REPORT_URI_INVALID', manifestName, assetId, 'external report uri must be an evidence/ path');
      }
      if (!HASH_PATTERN.test(report.hash ?? '')) {
        error('ASSET_EXTERNAL_REPORT_HASH_INVALID', manifestName, assetId, 'external report hash must be lowercase SHA-256');
      }
      if (!Number.isSafeInteger(report.bytes) || report.bytes <= 0) {
        error('ASSET_EXTERNAL_REPORT_BYTES_INVALID', manifestName, assetId, 'external report bytes must be a positive integer');
      }
      if (!HASH_PATTERN.test(report.assetHash ?? '')) {
        error('ASSET_EXTERNAL_REPORT_ASSET_HASH_INVALID', manifestName, assetId, 'external report assetHash must be lowercase SHA-256');
      }
    }
    for (const field of ['errors', 'warnings']) {
      const codes = manifest.validation[field];
      if (!Array.isArray(codes)
        || codes.some((code) => typeof code !== 'string' || !VALIDATION_CODE_PATTERN.test(code))
        || new Set(codes).size !== codes.length) {
        error('ASSET_VALIDATION_CODES_INVALID', manifestName, assetId, `validation.${field} must contain unique stable codes`);
      }
    }
  }

  if (!isRecord(manifest.provenance)) {
    error('ASSET_PROVENANCE_INVALID', manifestName, assetId, 'provenance must be an object');
  } else {
    rejectUnknownFields(
      manifest.provenance,
      ['status', 'creator', 'source', 'acquiredAt', 'license', 'licenseSnapshot', 'attribution', 'reviewer', 'notes'],
      '$.provenance',
      manifestName,
      assetId,
    );
    if (!['unresolved', 'verified'].includes(manifest.provenance.status)) {
      error('ASSET_PROVENANCE_STATUS_INVALID', manifestName, assetId, 'provenance.status is invalid');
    }
    for (const field of ['creator', 'source', 'license', 'licenseSnapshot', 'attribution', 'reviewer']) {
      const value = manifest.provenance[field];
      if (value !== null && !isNonEmptyString(value)) {
        error('ASSET_PROVENANCE_FIELD_INVALID', manifestName, assetId, `provenance.${field} must be null or non-empty`);
      }
    }
    if (manifest.provenance.acquiredAt !== null
      && (!isNonEmptyString(manifest.provenance.acquiredAt)
        || !DATE_PATTERN.test(manifest.provenance.acquiredAt))) {
      error('ASSET_PROVENANCE_DATE_INVALID', manifestName, assetId, 'provenance.acquiredAt must be null or YYYY-MM-DD');
    }
    if (typeof manifest.provenance.notes !== 'string') {
      error('ASSET_PROVENANCE_NOTES_INVALID', manifestName, assetId, 'provenance.notes must be a string');
    }
  }

  if (!DISPOSITIONS.has(manifest.disposition)) {
    error('ASSET_DISPOSITION_INVALID', manifestName, assetId, 'disposition is invalid');
  }
}

function parseGlb(buffer) {
  if (buffer.length < 20 || buffer.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error('invalid GLB header');
  }
  if (buffer.readUInt32LE(4) !== 2) {
    throw new Error('GLB version must equal 2');
  }
  if (buffer.readUInt32LE(8) !== buffer.length) {
    throw new Error('GLB declared byte length does not match the file');
  }
  let offset = 12;
  let document;
  let chunkIndex = 0;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    if (length % 4 !== 0) throw new Error('GLB chunk length must be 4-byte aligned');
    const start = offset + 8;
    const end = start + length;
    if (end > buffer.length) throw new Error('GLB chunk exceeds file bounds');
    if (type === JSON_CHUNK) {
      if (chunkIndex !== 0) throw new Error('GLB JSON chunk must be first');
      if (document) throw new Error('GLB contains multiple JSON chunks');
      document = JSON.parse(buffer.subarray(start, end).toString('utf8').trim());
    }
    offset = end;
    chunkIndex += 1;
  }
  if (offset !== buffer.length) throw new Error('GLB contains trailing bytes');
  if (!document) throw new Error('GLB has no JSON chunk');
  if (!isRecord(document.asset) || document.asset.version !== '2.0') {
    throw new Error('GLB JSON asset.version must equal 2.0');
  }
  return document;
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

export function inspectGlb(buffer) {
  const document = parseGlb(buffer);
  const accessors = document.accessors ?? [];
  const primitives = (document.meshes ?? []).flatMap((mesh) => mesh.primitives ?? []);
  const joints = new Set((document.skins ?? []).flatMap((skin) => skin.joints ?? []));
  return {
    triangles: primitives.reduce(
      (sum, primitive) => sum + primitiveTriangles(primitive, accessors),
      0,
    ),
    primitives: primitives.length,
    materials: document.materials?.length ?? 0,
    nodes: document.nodes?.length ?? 0,
    bones: joints.size,
    clips: document.animations?.length ?? 0,
    textures: document.textures?.length ?? 0,
  };
}

function pngCrc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function inspectPng(buffer) {
  if (buffer.length < 45 || buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error('invalid PNG header');
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let sawHeader = false;
  let sawImageData = false;
  let sawEnd = false;
  let chunkIndex = 0;

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const chunkEnd = dataStart + length + 4;
    if (chunkEnd > buffer.length) throw new Error('PNG chunk exceeds file bounds');
    const expectedCrc = buffer.readUInt32BE(dataStart + length);
    const actualCrc = pngCrc32(buffer.subarray(offset + 4, dataStart + length));
    if (actualCrc !== expectedCrc) throw new Error(`PNG ${type} chunk has an invalid CRC`);
    if (chunkIndex === 0 && (type !== 'IHDR' || length !== 13)) {
      throw new Error('PNG first chunk must be a 13-byte IHDR');
    }
    if (type === 'IHDR') {
      if (sawHeader || chunkIndex !== 0) throw new Error('PNG contains an invalid IHDR');
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      if (width === 0 || height === 0) throw new Error('PNG dimensions must be positive');
      if (buffer[dataStart + 10] !== 0 || buffer[dataStart + 11] !== 0) {
        throw new Error('PNG compression and filter methods must equal 0');
      }
      if (buffer[dataStart + 12] > 1) throw new Error('PNG interlace method is invalid');
      sawHeader = true;
    } else if (type === 'IDAT') {
      sawImageData = true;
    } else if (type === 'IEND') {
      if (length !== 0) throw new Error('PNG IEND chunk must be empty');
      sawEnd = true;
      offset = chunkEnd;
      break;
    }
    offset = chunkEnd;
    chunkIndex += 1;
  }
  if (!sawHeader || !sawImageData || !sawEnd || offset !== buffer.length) {
    throw new Error('PNG must contain IHDR, IDAT, and a terminal IEND');
  }
  const estimatedTextureBytes = width * height * 4;
  if (!Number.isSafeInteger(estimatedTextureBytes)) {
    throw new Error('PNG texture memory estimate exceeds the safe integer range');
  }
  return {
    triangles: 0,
    primitives: 0,
    materials: 0,
    nodes: 0,
    bones: 0,
    clips: 0,
    textures: 1,
    estimatedTextureBytes,
  };
}

async function validateExternalGltfReport(
  manifest,
  manifestName,
  runtimeExtension,
  actualRuntimeHash,
) {
  const assetId = manifest.assetId;
  const status = manifest.validation?.externalGltfValidator;
  const receipt = manifest.validation?.externalGltfReport;

  if (runtimeExtension !== '.glb') {
    if (status !== 'not_applicable') {
      error(
        'ASSET_EXTERNAL_VALIDATOR_NOT_APPLICABLE',
        manifestName,
        assetId,
        'non-GLB assets must record externalGltfValidator as not_applicable',
      );
    }
    if (receipt !== null) {
      error(
        'ASSET_EXTERNAL_REPORT_NOT_APPLICABLE',
        manifestName,
        assetId,
        'non-GLB assets must not attach a glTF validator report',
      );
    }
    return;
  }

  if (status === 'not_applicable') {
    error(
      'ASSET_EXTERNAL_VALIDATOR_STATUS_MISMATCH',
      manifestName,
      assetId,
      'GLB assets cannot mark external glTF validation not_applicable',
    );
  }
  if (!isRecord(receipt)) {
    if (status === 'passed' || status === 'failed') {
      error(
        'ASSET_EXTERNAL_GLTF_REPORT_REQUIRED',
        manifestName,
        assetId,
        `externalGltfValidator ${status} requires a hashed report receipt`,
      );
    }
    return;
  }
  if (status !== 'passed' && status !== 'failed') {
    error(
      'ASSET_EXTERNAL_VALIDATOR_STATUS_MISMATCH',
      manifestName,
      assetId,
      'an external glTF report requires passed or failed status',
    );
  }
  if (receipt.assetHash !== actualRuntimeHash) {
    error(
      'ASSET_EXTERNAL_REPORT_ASSET_MISMATCH',
      manifestName,
      assetId,
      'external report receipt is not bound to the current runtime SHA-256',
    );
  }
  if (!isNonEmptyString(receipt.uri) || !receipt.uri.startsWith('evidence/')) return;

  const reportPath = path.resolve(repositoryRoot, ...receipt.uri.split('/'));
  const evidenceRoot = `${path.resolve(repositoryRoot, 'evidence')}${path.sep}`;
  if (!reportPath.startsWith(evidenceRoot)) {
    error('ASSET_EXTERNAL_REPORT_PATH_ESCAPE', manifestName, assetId, 'external report uri escapes evidence/');
    return;
  }

  let reportBuffer;
  try {
    const [reportStats, reportRealPath, evidenceRealPath] = await Promise.all([
      lstat(reportPath),
      realpath(reportPath),
      realpath(path.resolve(repositoryRoot, 'evidence')),
    ]);
    if (reportStats.isSymbolicLink()) {
      error('ASSET_EXTERNAL_REPORT_SYMLINK_REJECTED', manifestName, assetId, 'external report must not be a symbolic link');
      return;
    }
    if (!reportStats.isFile()) {
      error('ASSET_EXTERNAL_REPORT_NOT_FILE', manifestName, assetId, 'external report must be a regular file');
      return;
    }
    if (!isPathWithin(evidenceRealPath, reportRealPath)) {
      error('ASSET_EXTERNAL_REPORT_REALPATH_ESCAPE', manifestName, assetId, 'external report resolves outside evidence/');
      return;
    }
    reportBuffer = await readFile(reportRealPath);
  } catch (cause) {
    error(
      'ASSET_EXTERNAL_REPORT_MISSING',
      manifestName,
      assetId,
      cause instanceof Error ? cause.message : String(cause),
    );
    return;
  }

  const actualReportHash = createHash('sha256').update(reportBuffer).digest('hex');
  if (receipt.bytes !== reportBuffer.length) {
    error(
      'ASSET_EXTERNAL_REPORT_SIZE_MISMATCH',
      manifestName,
      assetId,
      `${reportBuffer.length} bytes do not match receipt ${receipt.bytes}`,
    );
  }
  if (receipt.hash !== actualReportHash) {
    error(
      'ASSET_EXTERNAL_REPORT_HASH_MISMATCH',
      manifestName,
      assetId,
      'external report SHA-256 does not match the receipt',
    );
  }

  let report;
  try {
    report = JSON.parse(reportBuffer.toString('utf8'));
  } catch (cause) {
    error(
      'ASSET_EXTERNAL_REPORT_PARSE_FAILED',
      manifestName,
      assetId,
      cause instanceof Error ? cause.message : String(cause),
    );
    return;
  }
  if (!isRecord(report)) {
    error('ASSET_EXTERNAL_REPORT_FORMAT_INVALID', manifestName, assetId, 'external report root must be an object');
    return;
  }

  if (!isNonEmptyString(report.validatorVersion)) {
    error('ASSET_EXTERNAL_REPORT_FORMAT_INVALID', manifestName, assetId, 'external report requires validatorVersion');
  }
  if (!isNonEmptyString(report.validatedAt) || Number.isNaN(Date.parse(report.validatedAt))) {
    error('ASSET_EXTERNAL_REPORT_FORMAT_INVALID', manifestName, assetId, 'external report requires a valid validatedAt timestamp');
  }
  if (report.mimeType !== 'model/gltf-binary') {
    error('ASSET_EXTERNAL_REPORT_FORMAT_INVALID', manifestName, assetId, 'external report mimeType must be model/gltf-binary');
  }
  if (!isNonEmptyString(report.uri)
    || path.basename(report.uri).toLowerCase() !== path.basename(manifest.runtime.uri).toLowerCase()) {
    error('ASSET_EXTERNAL_REPORT_RUNTIME_MISMATCH', manifestName, assetId, 'external report uri must name the runtime GLB');
  }
  if (!isRecord(report.info)) {
    error('ASSET_EXTERNAL_REPORT_FORMAT_INVALID', manifestName, assetId, 'external report requires glTF info');
  }
  const issueAudit = auditExternalGltfIssues(report.issues);
  if (!issueAudit.ok) {
    error(
      'ASSET_EXTERNAL_REPORT_FORMAT_INVALID',
      manifestName,
      assetId,
      `external report issues are invalid: ${issueAudit.reason}`,
    );
    return;
  }
  if (status === 'passed' && issueAudit.counts.errors !== 0) {
    error('ASSET_EXTERNAL_REPORT_STATUS_MISMATCH', manifestName, assetId, 'passed report must contain zero errors');
  }
  if (status === 'failed' && issueAudit.counts.errors === 0) {
    error('ASSET_EXTERNAL_REPORT_STATUS_MISMATCH', manifestName, assetId, 'failed report must contain at least one error');
  }
}

async function validateRuntime(manifest, manifestName) {
  if (!isRecord(manifest.runtime) || !isNonEmptyString(manifest.runtime.uri)) return;
  const assetId = manifest.assetId;
  const runtimePath = path.resolve(repositoryRoot, ...manifest.runtime.uri.split('/'));
  const extension = path.extname(runtimePath).toLowerCase();
  const publicRoot = `${path.resolve(repositoryRoot, 'public')}${path.sep}`;
  if (!runtimePath.startsWith(publicRoot)) {
    error('ASSET_RUNTIME_PATH_ESCAPE', manifestName, assetId, 'runtime.uri escapes public/');
    return;
  }

  let buffer;
  try {
    const [runtimeStats, runtimeRealPath, publicRealPath] = await Promise.all([
      lstat(runtimePath),
      realpath(runtimePath),
      realpath(path.resolve(repositoryRoot, 'public')),
    ]);
    if (runtimeStats.isSymbolicLink()) {
      error('ASSET_RUNTIME_SYMLINK_REJECTED', manifestName, assetId, 'runtime asset must not be a symbolic link');
      return;
    }
    if (!runtimeStats.isFile()) {
      error('ASSET_RUNTIME_NOT_FILE', manifestName, assetId, 'runtime asset must be a regular file');
      return;
    }
    if (!isPathWithin(publicRealPath, runtimeRealPath)) {
      error('ASSET_RUNTIME_REALPATH_ESCAPE', manifestName, assetId, 'runtime asset resolves outside public/');
      return;
    }
    buffer = await readFile(runtimeRealPath);
  } catch (cause) {
    error('ASSET_RUNTIME_MISSING', manifestName, assetId, cause instanceof Error ? cause.message : String(cause));
    return;
  }

  const actualHash = createHash('sha256').update(buffer).digest('hex');
  if (manifest.runtime.bytes !== buffer.length) {
    error('ASSET_RUNTIME_SIZE_MISMATCH', manifestName, assetId, `${buffer.length} bytes do not match manifest ${manifest.runtime.bytes}`);
  }
  if (manifest.runtime.hash !== actualHash) {
    error('ASSET_RUNTIME_HASH_MISMATCH', manifestName, assetId, 'runtime SHA-256 does not match the manifest');
  }
  if (manifest.sourceHashKind === 'runtime_snapshot' && manifest.sourceHash !== actualHash) {
    error('ASSET_SNAPSHOT_HASH_MISMATCH', manifestName, assetId, 'runtime_snapshot sourceHash must equal runtime bytes');
  }

  const supportedExtensions = SUPPORTED_RUNTIME_EXTENSIONS[manifest.kind];
  if (!supportsRuntimeKindExtension(manifest.kind, extension)) {
    const expected = supportedExtensions && supportedExtensions.size > 0
      ? [...supportedExtensions].join(' or ')
      : 'no runtime extensions in this validator version';
    error(
      'ASSET_KIND_EXTENSION_UNSUPPORTED',
      manifestName,
      assetId,
      `${manifest.kind ?? 'unknown'} cannot use ${extension || '(no extension)'}; expected ${expected}`,
    );
  }

  let measured;
  try {
    if (extension === '.glb') measured = inspectGlb(buffer);
    else if (extension === '.png') measured = inspectPng(buffer);
  } catch (cause) {
    error('ASSET_RUNTIME_PARSE_FAILED', manifestName, assetId, cause instanceof Error ? cause.message : String(cause));
  }

  if (measured && isRecord(manifest.budgets)) {
    for (const [field, value] of Object.entries(measured)) {
      if (manifest.budgets[field] !== value) {
        error('ASSET_MEASUREMENT_MISMATCH', manifestName, assetId, `${field} measured ${value}, manifest records ${manifest.budgets[field]}`);
      }
    }
  }

  if (extension === '.glb') {
    if (manifest.budgets?.estimatedTextureBytes !== null) {
      error(
        'ASSET_TEXTURE_MEMORY_NOT_MEASURED',
        manifestName,
        assetId,
        'the current GLB inspector cannot substantiate estimatedTextureBytes; record null',
      );
    }
    warning(
      'ASSET_TEXTURE_MEMORY_UNMEASURED',
      manifestName,
      assetId,
      'GLB texture residency is unknown until a texture-memory measurement is attached',
    );
  }

  await validateExternalGltfReport(manifest, manifestName, extension, actualHash);
}

function validateDevelopmentDisposition(manifest, manifestName) {
  const assetId = manifest.assetId;
  if (manifest.sourceHashKind === 'runtime_snapshot') {
    warning('ASSET_CANONICAL_SOURCE_MISSING', manifestName, assetId, 'hash anchors runtime bytes, not a canonical source asset');
  }
  if (manifest.provenance?.status !== 'verified') {
    warning('ASSET_PROVENANCE_UNRESOLVED', manifestName, assetId, 'creator/source/license review is unresolved');
  }
  if (manifest.disposition !== 'approved') {
    warning('ASSET_NOT_APPROVED', manifestName, assetId, `disposition is ${manifest.disposition}`);
  }
  if (manifest.validation?.externalGltfValidator === 'not_run') {
    warning('ASSET_EXTERNAL_GLTF_VALIDATOR_NOT_RUN', manifestName, assetId, 'external glTF validation has not been run');
  }
  if (manifest.budgets?.waiverId) {
    warning(
      'ASSET_WAIVER_UNRESOLVED',
      manifestName,
      assetId,
      'waiver ID has no validator-supported owned rationale and follow-up evidence',
    );
  }

  const limits = BUDGET_LIMITS[manifest.kind];
  const budgets = manifest.budgets;
  if (limits && isRecord(budgets)) {
    if (budgets.triangles > limits.triangles) {
      warning('ASSET_TRIANGLE_BUDGET_EXCEEDED', manifestName, assetId, `${budgets.triangles} > ${limits.triangles}`);
    }
    if (budgets.primitives > limits.primitives) {
      warning('ASSET_PRIMITIVE_BUDGET_EXCEEDED', manifestName, assetId, `${budgets.primitives} > ${limits.primitives}`);
    }
  }
}

function validateRelease(manifest, manifestName) {
  if (!RELEASE_MODE) return;
  const assetId = manifest.assetId;
  if (manifest.releaseEligible !== true) {
    error('ASSET_RELEASE_INELIGIBLE', manifestName, assetId, 'releaseEligible must be true');
  }
  if (manifest.sourceHashKind !== 'canonical_source') {
    error('ASSET_CANONICAL_SOURCE_REQUIRED', manifestName, assetId, 'release requires a canonical source hash');
  }
  if (manifest.disposition !== 'approved') {
    error('ASSET_APPROVAL_REQUIRED', manifestName, assetId, 'release disposition must be approved');
  }
  if (manifest.provenance?.status !== 'verified') {
    error('ASSET_PROVENANCE_REQUIRED', manifestName, assetId, 'release provenance must be verified');
  } else {
    for (const field of ['creator', 'source', 'acquiredAt', 'license', 'licenseSnapshot', 'reviewer']) {
      if (!isNonEmptyString(manifest.provenance[field])) {
        error('ASSET_PROVENANCE_EVIDENCE_REQUIRED', manifestName, assetId, `release provenance.${field} is required`);
      }
    }
  }
  if (manifest.validation?.structuralStatus !== 'passed') {
    error('ASSET_STRUCTURAL_VALIDATION_REQUIRED', manifestName, assetId, 'release requires a passing structural inspection');
  }
  if (manifest.runtime?.uri?.toLowerCase().endsWith('.glb')
    && manifest.validation?.externalGltfValidator !== 'passed') {
    error('ASSET_EXTERNAL_GLTF_VALIDATION_REQUIRED', manifestName, assetId, 'release GLBs require a passing external glTF validator result');
  }
  if (manifest.runtime?.uri?.toLowerCase().endsWith('.glb')
    && !isRecord(manifest.validation?.externalGltfReport)) {
    error('ASSET_EXTERNAL_GLTF_REPORT_REQUIRED', manifestName, assetId, 'release GLBs require a hashed external validator report receipt');
  }
  if (!Number.isSafeInteger(manifest.budgets?.estimatedTextureBytes)
    || manifest.budgets.estimatedTextureBytes < 0) {
    error(
      'ASSET_TEXTURE_MEMORY_MEASUREMENT_REQUIRED',
      manifestName,
      assetId,
      'release requires a measured non-negative texture-memory value',
    );
  }
  if (manifest.budgets?.waiverId) {
    error(
      'ASSET_WAIVER_EVIDENCE_REQUIRED',
      manifestName,
      assetId,
      'release rejects unresolved waiver IDs until owned rationale and follow-up evidence are validated',
    );
  }
  if (Array.isArray(manifest.validation?.errors) && manifest.validation.errors.length > 0) {
    error('ASSET_VALIDATOR_ERRORS', manifestName, assetId, 'release requires zero recorded validation errors');
  }
  if (Array.isArray(manifest.validation?.warnings) && manifest.validation.warnings.length > 0) {
    error(
      'ASSET_VALIDATOR_WARNINGS',
      manifestName,
      assetId,
      'recorded validation warnings require a resolved evidence-backed waiver',
    );
  }

  const limits = BUDGET_LIMITS[manifest.kind];
  const budgets = manifest.budgets;
  if (limits && isRecord(budgets)) {
    if (budgets.triangles > limits.triangles) {
      error('ASSET_RELEASE_TRIANGLE_BUDGET', manifestName, assetId, `${budgets.triangles} > ${limits.triangles}`);
    }
    if (budgets.primitives > limits.primitives) {
      error('ASSET_RELEASE_PRIMITIVE_BUDGET', manifestName, assetId, `${budgets.primitives} > ${limits.primitives}`);
    }
  }
}

function inventoryPolicyIssue(code, runtimeUri, message) {
  const manifestName = '(public inventory)';
  if (RELEASE_MODE) error(code, manifestName, runtimeUri, message);
  else warning(code, manifestName, runtimeUri, message);
}

export async function discoverSupportedPublicRuntimeUris() {
  const publicDirectory = path.resolve(repositoryRoot, 'public');
  const discovered = [];

  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      const runtimeUri = path.relative(repositoryRoot, entryPath).split(path.sep).join('/');
      const extension = path.extname(entry.name).toLowerCase();
      if (entry.isSymbolicLink()) {
        let targetIsDirectory = false;
        try {
          targetIsDirectory = (await stat(entryPath)).isDirectory();
        } catch {
          // A broken supported-file link is still part of the inventory below.
        }
        if (targetIsDirectory) {
          inventoryPolicyIssue(
            'ASSET_PUBLIC_SYMLINK_UNSCANNABLE',
            runtimeUri,
            'public directory symlink cannot be recursively inventoried for runtime assets',
          );
        } else if (SUPPORTED_RUNTIME_FILE_EXTENSIONS.has(extension)) {
          discovered.push(runtimeUri);
          inventoryPolicyIssue(
            'ASSET_PUBLIC_RUNTIME_SYMLINK',
            runtimeUri,
            'supported runtime asset is a symbolic link and cannot enter release',
          );
        }
      } else if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (entry.isFile() && SUPPORTED_RUNTIME_FILE_EXTENSIONS.has(extension)) {
        discovered.push(runtimeUri);
      }
    }
  }

  await walk(publicDirectory);
  return discovered.sort((left, right) => left.localeCompare(right));
}

async function validatePublicInventory(manifests) {
  let discoveredUris;
  try {
    discoveredUris = await discoverSupportedPublicRuntimeUris();
  } catch (cause) {
    error(
      'ASSET_PUBLIC_INVENTORY_FAILED',
      '(public inventory)',
      'public',
      cause instanceof Error ? cause.message : String(cause),
    );
    return;
  }
  const manifestUris = manifests
    .map(({ manifest }) => manifest.runtime?.uri)
    .filter(isNonEmptyString);
  for (const runtimeUri of findUnmanifestedRuntimeUris(discoveredUris, manifestUris)) {
    inventoryPolicyIssue(
      'ASSET_PUBLIC_RUNTIME_UNMANIFESTED',
      runtimeUri,
      'supported public runtime asset has no manifest, provenance, or budget record',
    );
  }
}

async function main() {
  const manifestNames = (await readdir(manifestDirectory))
    .filter((name) => name.endsWith('.asset.json'))
    .sort((left, right) => left.localeCompare(right));

  for (const manifestName of manifestNames) {
    let manifest;
    try {
      manifest = JSON.parse(await readFile(path.join(manifestDirectory, manifestName), 'utf8'));
    } catch (cause) {
      error('ASSET_MANIFEST_PARSE_FAILED', manifestName, null, cause instanceof Error ? cause.message : String(cause));
      continue;
    }
    if (!isRecord(manifest)) {
      error('ASSET_MANIFEST_INVALID', manifestName, null, 'manifest root must be an object');
      continue;
    }
    loaded.push({ manifest, manifestName });
    validateShape(manifest, manifestName);
    await validateRuntime(manifest, manifestName);
    validateDevelopmentDisposition(manifest, manifestName);
    validateRelease(manifest, manifestName);
  }

  const identifiers = new Map();
  const runtimeUris = new Map();
  for (const { manifest, manifestName } of loaded) {
    for (const [value, registry, code] of [
      [manifest.assetId, identifiers, 'ASSET_ID_DUPLICATE'],
      [manifest.runtime?.uri, runtimeUris, 'ASSET_RUNTIME_URI_DUPLICATE'],
    ]) {
      if (!isNonEmptyString(value)) continue;
      const registryKey = registry === runtimeUris ? normalizeRepositoryUri(value) : value;
      const existing = registry.get(registryKey);
      if (existing) error(code, manifestName, manifest.assetId, `duplicates ${existing}`);
      else registry.set(registryKey, manifestName);
    }
  }

  await validatePublicInventory(loaded);

  issues.sort((left, right) => (
    left.level.localeCompare(right.level)
    || left.assetId.localeCompare(right.assetId)
    || left.code.localeCompare(right.code)
  ));

  const errors = issues.filter((issue) => issue.level === 'error');
  const warnings = issues.filter((issue) => issue.level === 'warning');
  process.stdout.write(`KYX asset manifest validator (${RELEASE_MODE ? 'release' : 'development'} mode)\n`);
  process.stdout.write(`Root: ${repositoryRoot}\n`);
  for (const issue of issues) {
    process.stdout.write(`${issue.level.toUpperCase()} ${issue.code} [${issue.assetId}] ${issue.message}\n`);
  }
  process.stdout.write(`Summary: ${loaded.length} manifests, ${errors.length} errors, ${warnings.length} warnings.\n`);

  if (errors.length > 0) process.exitCode = 1;
}

const isMainModule = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) await main();
