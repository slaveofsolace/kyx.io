import { hashCanonicalSimulationState } from './canonical';
import type { BoundPlayerIntent } from './commands';
import { assertSimulationState, type SimulationState } from './state';
import {
  assertSimulationStepRules,
  stepSimulation,
  type SimulationEvent,
  type SimulationStepRules,
} from './step';
import { asSimulationTick, type SimulationTick } from './units';

export const SIMULATION_REPLAY_SCHEMA_VERSION = 1 as const;

export interface SimulationReplayFrame {
  readonly authorityTick: SimulationTick;
  readonly commands: readonly BoundPlayerIntent[];
}

export interface SimulationReplay {
  readonly schemaVersion: typeof SIMULATION_REPLAY_SCHEMA_VERSION;
  readonly frames: readonly SimulationReplayFrame[];
}

export interface ReplayResult {
  readonly finalState: SimulationState;
  readonly finalHash: string;
  readonly stateHashes: readonly string[];
  readonly events: readonly SimulationEvent[];
}

export function runSimulationReplay(
  initialState: SimulationState,
  replay: SimulationReplay,
  rules: SimulationStepRules,
): ReplayResult {
  assertSimulationState(initialState);
  assertSimulationStepRules(rules);
  if (initialState.simulationRateHz !== rules.simulationRateHz) {
    throw new RangeError(
      `initial state runs at ${initialState.simulationRateHz} Hz but replay rules run at ${rules.simulationRateHz} Hz`,
    );
  }
  if (replay.schemaVersion !== SIMULATION_REPLAY_SCHEMA_VERSION) {
    throw new RangeError(`unsupported replay schema: ${String(replay.schemaVersion)}`);
  }

  let state = initialState;
  const hashes: string[] = [hashCanonicalSimulationState(state)];
  const events: SimulationEvent[] = [];

  for (const frame of replay.frames) {
    asSimulationTick(frame.authorityTick);
    const expectedTick = asSimulationTick(state.tick + 1);
    if (frame.authorityTick !== expectedTick) {
      throw new RangeError(
        `replay tick ${frame.authorityTick} is not the expected next tick ${expectedTick}`,
      );
    }
    const result = stepSimulation(state, frame.commands, rules);
    state = result.state;
    hashes.push(hashCanonicalSimulationState(state));
    events.push(...result.events);
  }

  return {
    finalState: state,
    finalHash: hashes[hashes.length - 1],
    stateHashes: hashes,
    events,
  };
}
