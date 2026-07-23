import revampedClassicV1 from './rulesets/revamped_classic.v1.json';
import revampedClassicV2 from './rulesets/revamped_classic.v2.json';
import revampedClassicV3 from './rulesets/revamped_classic.v3.json';

export const DEFAULT_RULESET_ID = 'revamped_classic' as const;
export const DEFAULT_RULESET_REVISION = 2 as const;

interface BundledRulesetEntry {
  readonly currentRevision: number;
  readonly revisions: ReadonlyMap<number, unknown>;
}

const RULESET_CATALOG: ReadonlyMap<string, BundledRulesetEntry> = new Map([
  [DEFAULT_RULESET_ID, {
    currentRevision: DEFAULT_RULESET_REVISION,
    revisions: new Map<number, unknown>([
      [1, revampedClassicV1],
      [DEFAULT_RULESET_REVISION, revampedClassicV2],
      [3, revampedClassicV3],
    ]),
  }],
]);

export function getBundledRulesetSource(id: string, revision?: number): unknown | undefined {
  const entry = RULESET_CATALOG.get(id);
  if (entry === undefined) return undefined;
  return entry.revisions.get(revision ?? entry.currentRevision);
}

export function listBundledRulesetIds(): readonly string[] {
  return Object.freeze([...RULESET_CATALOG.keys()]);
}

export function listBundledRulesetRevisions(id: string): readonly number[] {
  const entry = RULESET_CATALOG.get(id);
  if (entry === undefined) return Object.freeze([]);
  return Object.freeze([...entry.revisions.keys()].sort((left, right) => left - right));
}
