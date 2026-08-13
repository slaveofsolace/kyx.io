export const ABILITY_PRESENTATION_AUTHORITY_HZ = 20 as const;

export const SMOKE_PRESENTATION_RULES = Object.freeze({
  expansionTicks: 27,
  puffCount: 10,
  reducedEffectsPuffCount: 5,
  baseOpacity: 0.44,
  alternateOpacityDelta: 0.04,
  reducedEffectsOpacityMultiplier: 0.55,
  verticalScale: 0.7,
  puffPhaseDelayRatio: 0.12,
  maximumPredictionLeadTicks: 1,
  maximumCatchUpMultiplier: 3,
});

export interface SmokePresentationProfile {
  readonly puffCount: number;
  readonly opacityMultiplier: number;
}

/**
 * Every authority cloud stays visible, while overlapping fields share one
 * bounded opacity budget. Reduced effects lowers both geometry and opacity;
 * neither mode changes authority radius, lifetime, or occlusion semantics.
 */
export function smokePresentationProfile(
  reducedEffects: boolean,
  activeFieldCount: number,
): SmokePresentationProfile {
  const fieldCount = Math.max(
    1,
    Math.min(4, Number.isSafeInteger(activeFieldCount) ? activeFieldCount : 1),
  );
  return Object.freeze({
    puffCount: reducedEffects
      ? SMOKE_PRESENTATION_RULES.reducedEffectsPuffCount
      : SMOKE_PRESENTATION_RULES.puffCount,
    opacityMultiplier: (
      reducedEffects ? SMOKE_PRESENTATION_RULES.reducedEffectsOpacityMultiplier : 1
    ) / Math.sqrt(fieldCount),
  });
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function smoothAbilityPresentationProgress(value: number): number {
  const progress = clampUnit(Number.isFinite(value) ? value : 0);
  return progress * progress * (3 - 2 * progress);
}

/**
 * One time-based smoke curve is consumed by the legacy local prediction and
 * the shared Practice/online Three presentation. `phase` staggers the authored
 * puffs without changing the Worker-owned effective radius or lifetime.
 */
export function smokePuffExpansion(
  ageTicks: number,
  phase: number,
): number {
  const finiteAge = Math.max(0, Number.isFinite(ageTicks) ? ageTicks : 0);
  const finitePhase = clampUnit(Number.isFinite(phase) ? phase : 0);
  return smoothAbilityPresentationProgress(
    finiteAge / SMOKE_PRESENTATION_RULES.expansionTicks
      - finitePhase * SMOKE_PRESENTATION_RULES.puffPhaseDelayRatio,
  );
}

/**
 * Advance between discrete authority samples at render time. Presentation may
 * predict at most one 20 Hz tick and catches up through bounded continuous
 * motion; it never rewinds a cloud or changes authority visibility semantics.
 */
export function advanceSmokePresentationAgeTicks(
  previousAgeTicks: number | null,
  authoritativeAgeTicks: number,
  deltaSeconds: number,
): number {
  const authorityAge = Math.max(
    0,
    Number.isFinite(authoritativeAgeTicks) ? authoritativeAgeTicks : 0,
  );
  if (previousAgeTicks === null || !Number.isFinite(previousAgeTicks)) {
    return authorityAge;
  }
  const previous = Math.max(0, previousAgeTicks);
  const elapsed = Math.max(
    0,
    Math.min(0.1, Number.isFinite(deltaSeconds) ? deltaSeconds : 0),
  );
  const ordinaryAdvance = elapsed * ABILITY_PRESENTATION_AUTHORITY_HZ;
  const lagBeyondOneTick = Math.max(0, authorityAge - previous - 1);
  const catchUp = Math.min(
    lagBeyondOneTick,
    ordinaryAdvance * (SMOKE_PRESENTATION_RULES.maximumCatchUpMultiplier - 1),
  );
  const predicted = previous + ordinaryAdvance + catchUp;
  const authorityCeiling = authorityAge
    + SMOKE_PRESENTATION_RULES.maximumPredictionLeadTicks;
  return Math.max(previous, Math.min(predicted, authorityCeiling));
}
