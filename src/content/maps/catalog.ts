import inkfallFoundryV1 from '../../../assets/source/maps/inkfall-foundry/runtime/map.package.v1.json' with { type: 'json' };
import inkfallFoundryV2 from '../../../assets/source/maps/inkfall-foundry/runtime/map.package.v2.json' with { type: 'json' };
import inkfallFoundryV3 from '../../../assets/source/maps/inkfall-foundry/runtime/map.package.v3.json' with { type: 'json' };
import inkfallFoundryV4 from '../../../assets/source/maps/inkfall-foundry/runtime/map.package.v4.json' with { type: 'json' };

import {
  DEFAULT_MAP_ID,
  DEFAULT_MAP_REVISION,
  LOCKED_GRAYBOX_MAP_REVISION,
} from './constants';

export {
  DEFAULT_MAP_ID,
  DEFAULT_MAP_REVISION,
  LOCKED_GRAYBOX_MAP_REVISION,
} from './constants';

interface BundledMapEntry {
  readonly currentRevision: number;
  readonly lockedGrayboxRevision: number;
  readonly revisions: ReadonlyMap<number, unknown>;
}

const MAP_CATALOG: ReadonlyMap<string, BundledMapEntry> = new Map([
  [DEFAULT_MAP_ID, {
    currentRevision: DEFAULT_MAP_REVISION,
    lockedGrayboxRevision: LOCKED_GRAYBOX_MAP_REVISION,
    revisions: new Map([
      [1, inkfallFoundryV1],
      [2, inkfallFoundryV2],
      [3, inkfallFoundryV3],
      [4, inkfallFoundryV4],
    ]),
  }],
]);

export function getBundledMapPackageSource(id: string, revision?: number): unknown | undefined {
  const entry = MAP_CATALOG.get(id);
  if (!entry) return undefined;
  return entry.revisions.get(revision ?? entry.currentRevision);
}

export function listBundledMapIds(): readonly string[] {
  return Object.freeze([...MAP_CATALOG.keys()]);
}

export function listBundledMapRevisions(id: string): readonly number[] {
  const entry = MAP_CATALOG.get(id);
  if (!entry) return Object.freeze([]);
  return Object.freeze([...entry.revisions.keys()].sort((left, right) => left - right));
}

export function getBundledGrayboxLockRevision(id: string): number | undefined {
  return MAP_CATALOG.get(id)?.lockedGrayboxRevision;
}

export function getBundledLockedGrayboxPackageSource(id: string): unknown | undefined {
  const entry = MAP_CATALOG.get(id);
  if (!entry) return undefined;
  return entry.revisions.get(entry.lockedGrayboxRevision);
}
