export interface CombatConsequenceDigestV1 {
  readonly acceptedShotCount: number;
  readonly magazineRounds: number;
  readonly targetHealthPoints: number;
  readonly targetDeathOrdinal: number;
  readonly blueScore: number;
  readonly feedSequence: number;
  readonly eventCounts: Readonly<{
    readonly shotAccepted: number;
    readonly damageApplied: number;
    readonly playerKilled: number;
  }>;
}

function boundedCount(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new RangeError(`${label} must be an unsigned 32-bit integer`);
  }
  return value;
}

export function canonicalCombatConsequenceV1(value: CombatConsequenceDigestV1): string {
  return JSON.stringify({
    acceptedShotCount: boundedCount(value.acceptedShotCount, 'accepted shot count'),
    magazineRounds: boundedCount(value.magazineRounds, 'magazine rounds'),
    targetHealthPoints: boundedCount(value.targetHealthPoints, 'target health points'),
    targetDeathOrdinal: boundedCount(value.targetDeathOrdinal, 'target death ordinal'),
    blueScore: boundedCount(value.blueScore, 'blue score'),
    feedSequence: boundedCount(value.feedSequence, 'feed sequence'),
    eventCounts: {
      shotAccepted: boundedCount(value.eventCounts.shotAccepted, 'shot event count'),
      damageApplied: boundedCount(value.eventCounts.damageApplied, 'damage event count'),
      playerKilled: boundedCount(value.eventCounts.playerKilled, 'kill event count'),
    },
  });
}

/** Portable Node/Worker/browser FNV-1a digest over one fixed canonical shape. */
export function hashCombatConsequenceV1(value: CombatConsequenceDigestV1): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(canonicalCombatConsequenceV1(value))) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}
