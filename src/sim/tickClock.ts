import {
  AUTHORITY_RATE_HZ,
  EVALUATION_RATE_HZ,
  asSimulationTick,
  assertSimulationRateHz,
  tickDurationMilliseconds,
  ticksToMilliseconds,
  type SimulationRateHz,
  type SimulationTick,
} from './units';

export interface FixedTickProfile {
  readonly id: 'authority_20hz' | 'evaluation_40hz';
  readonly rateHz: SimulationRateHz;
  readonly durationMilliseconds: 50 | 25;
}

export const AUTHORITY_20_HZ: FixedTickProfile = Object.freeze({
  id: 'authority_20hz',
  rateHz: AUTHORITY_RATE_HZ,
  durationMilliseconds: tickDurationMilliseconds(AUTHORITY_RATE_HZ),
});

export const EVALUATION_40_HZ: FixedTickProfile = Object.freeze({
  id: 'evaluation_40hz',
  rateHz: EVALUATION_RATE_HZ,
  durationMilliseconds: tickDurationMilliseconds(EVALUATION_RATE_HZ),
});

export interface FixedTickClock {
  readonly profile: FixedTickProfile;
  readonly tick: SimulationTick;
}

export function fixedTickProfile(rateHz: SimulationRateHz): FixedTickProfile {
  assertSimulationRateHz(rateHz);
  return rateHz === AUTHORITY_RATE_HZ ? AUTHORITY_20_HZ : EVALUATION_40_HZ;
}

export function createFixedTickClock(
  profile: FixedTickProfile = AUTHORITY_20_HZ,
  initialTick: SimulationTick = asSimulationTick(0),
): FixedTickClock {
  assertSimulationRateHz(profile.rateHz);
  if (profile.durationMilliseconds !== tickDurationMilliseconds(profile.rateHz)) {
    throw new RangeError('fixed-tick profile duration does not match its rate');
  }
  if (
    (profile.rateHz === AUTHORITY_RATE_HZ && profile.id !== AUTHORITY_20_HZ.id) ||
    (profile.rateHz === EVALUATION_RATE_HZ && profile.id !== EVALUATION_40_HZ.id)
  ) {
    throw new RangeError('fixed-tick profile id does not match its rate');
  }
  return { profile, tick: asSimulationTick(initialTick) };
}

export function advanceFixedTickClock(
  clock: FixedTickClock,
  tickCount = 1,
): FixedTickClock {
  if (!Number.isSafeInteger(tickCount) || tickCount < 0) {
    throw new RangeError('tick count must be a non-negative safe integer');
  }

  return {
    profile: clock.profile,
    tick: asSimulationTick(clock.tick + tickCount),
  };
}

export function elapsedSimulationMilliseconds(clock: FixedTickClock): number {
  return ticksToMilliseconds(clock.tick, clock.profile.rateHz);
}
