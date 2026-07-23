import {
  DEFAULT_MAP_ID,
  getBundledMapPackageSource,
} from './catalog';
import type {
  MapPackageValidationIssue,
  MapPackageValidationResult,
  RuntimeMapPackageManifestV1,
} from './schema';
import {
  loadRuntimeMapPackageManifest,
  RuntimeMapPackageValidationError,
  validateRuntimeMapPackageManifest,
} from './validateMapPackage';

export function validateBundledMapPackage(
  id: string = DEFAULT_MAP_ID,
  revision?: number,
): MapPackageValidationResult<RuntimeMapPackageManifestV1> {
  const source = getBundledMapPackageSource(id, revision);
  if (source === undefined) {
    const address = revision === undefined ? id : `${id}@${revision}`;
    const issues: readonly MapPackageValidationIssue[] = Object.freeze([{
      code: 'MAP_REFERENCE_MISSING',
      path: '$',
      message: `Bundled map package not found: ${address}`,
    }]);
    return { ok: false, issues };
  }
  return validateRuntimeMapPackageManifest(source);
}

export async function requireBundledMapPackageManifest(
  id: string = DEFAULT_MAP_ID,
  revision?: number,
): Promise<RuntimeMapPackageManifestV1> {
  const source = getBundledMapPackageSource(id, revision);
  if (source === undefined) {
    throw new RuntimeMapPackageValidationError(Object.freeze([{
      code: 'MAP_REFERENCE_MISSING',
      path: '$',
      message: `Bundled map package not found: ${revision === undefined ? id : `${id}@${revision}`}`,
    }]));
  }
  return loadRuntimeMapPackageManifest(source);
}
