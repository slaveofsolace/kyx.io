import {
  INTENT_BUTTON,
  bindPlayerIntent,
  type PlayerIntentCommand,
} from './commands';
import {
  SIMULATION_REPLAY_SCHEMA_VERSION,
  runSimulationReplay,
  type SimulationReplay,
} from './replay';
import { createSimulationEntity, createSimulationState } from './state';
import type { SimulationStepRules } from './step';
import { asQuantizedAxis, asSimulationTick } from './units';

export const FOUNDATION_REPLAY_SEED = 'kyx-phase2-foundation-v1' as const;

export const FOUNDATION_REPLAY_RULES: SimulationStepRules = Object.freeze({
  simulationRateHz: 20,
  walkSpeedMmPerSecond: 5_000,
  sprintSpeedMmPerSecond: 7_500,
});

function fixtureIntent(
  sequence: number,
  clientTick: number,
  overrides: Partial<Omit<PlayerIntentCommand, 'kind' | 'sequence' | 'clientTick'>> = {},
): PlayerIntentCommand {
  return {
    kind: 'player_intent',
    sequence,
    clientTick: asSimulationTick(clientTick),
    moveX: asQuantizedAxis(0),
    moveZ: asQuantizedAxis(0),
    lookYawDeltaMilliDegrees: 0,
    lookPitchDeltaMilliDegrees: 0,
    heldButtons: 0,
    pressedButtons: 0,
    releasedButtons: 0,
    ...overrides,
  };
}

export const FOUNDATION_REPLAY: SimulationReplay = Object.freeze({
  schemaVersion: SIMULATION_REPLAY_SCHEMA_VERSION,
  frames: Object.freeze([
    {
      authorityTick: asSimulationTick(1),
      commands: Object.freeze([
        bindPlayerIntent(
          'local-player',
          fixtureIntent(0, 0, {
            moveZ: asQuantizedAxis(127),
            lookYawDeltaMilliDegrees: 12_500,
          }),
        ),
        bindPlayerIntent(
          'practice-bot-01',
          fixtureIntent(0, 0, {
            moveX: asQuantizedAxis(-127),
            lookYawDeltaMilliDegrees: -8_000,
          }),
        ),
      ]),
    },
    {
      authorityTick: asSimulationTick(2),
      commands: Object.freeze([
        bindPlayerIntent(
          'local-player',
          fixtureIntent(1, 1, {
            moveX: asQuantizedAxis(127),
            moveZ: asQuantizedAxis(127),
            heldButtons: INTENT_BUTTON.sprint | INTENT_BUTTON.primaryFire,
            pressedButtons: INTENT_BUTTON.primaryFire,
            lookPitchDeltaMilliDegrees: -2_500,
          }),
        ),
      ]),
    },
    {
      authorityTick: asSimulationTick(3),
      commands: Object.freeze([]),
    },
    {
      authorityTick: asSimulationTick(4),
      commands: Object.freeze([
        bindPlayerIntent(
          'local-player',
          fixtureIntent(2, 3, {
            moveX: asQuantizedAxis(-64),
            moveZ: asQuantizedAxis(96),
            heldButtons: 0,
            releasedButtons: INTENT_BUTTON.sprint | INTENT_BUTTON.primaryFire,
            selectedSlot: 1,
          }),
        ),
      ]),
    },
    {
      authorityTick: asSimulationTick(5),
      commands: Object.freeze([
        bindPlayerIntent(
          'practice-bot-01',
          fixtureIntent(1, 4, {
            moveX: asQuantizedAxis(72),
            moveZ: asQuantizedAxis(-48),
            lookYawDeltaMilliDegrees: 3_250,
          }),
        ),
      ]),
    },
    {
      authorityTick: asSimulationTick(6),
      commands: Object.freeze([
        bindPlayerIntent('local-player', fixtureIntent(3, 5)),
      ]),
    },
  ]),
});

export function createFoundationReplayInitialState() {
  return createSimulationState({
    rulesetId: 'revamped_classic',
    simulationRateHz: FOUNDATION_REPLAY_RULES.simulationRateHz,
    matchSeed: FOUNDATION_REPLAY_SEED,
    entities: [
      createSimulationEntity({ id: 'practice-bot-01', positionMm: { x: 2_000, z: -1_000 } }),
      createSimulationEntity({ id: 'local-player' }),
    ],
  });
}

export interface FoundationReplaySummary {
  readonly finalTick: number;
  readonly finalStateHash: string;
  readonly entityCount: number;
  readonly eventCount: number;
}

export function runFoundationDeterministicReplay(): FoundationReplaySummary {
  const result = runSimulationReplay(
    createFoundationReplayInitialState(),
    FOUNDATION_REPLAY,
    FOUNDATION_REPLAY_RULES,
  );
  return {
    finalTick: result.finalState.tick,
    finalStateHash: result.finalHash,
    entityCount: Object.keys(result.finalState.entities).length,
    eventCount: result.events.length,
  };
}
