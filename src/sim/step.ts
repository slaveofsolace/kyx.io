import {
  INTENT_BUTTON,
  asEntityId,
  assertPlayerIntentCommand,
  compareBoundPlayerIntents,
  type BoundPlayerIntent,
  type EntityId,
} from './commands';
import {
  DEFAULT_PITCH_MAX_MILLI_DEGREES,
  DEFAULT_PITCH_MIN_MILLI_DEGREES,
  assertSimulationState,
  type SimulationEntityState,
  type SimulationState,
} from './state';
import {
  asMilliDegrees,
  asMillimeters,
  asMillimetersPerSecond,
  asSimulationTick,
  assertSimulationRateHz,
  clampMilliDegrees,
  normalizeYawMilliDegrees,
  type MilliDegrees,
  type SimulationRateHz,
  type SimulationTick,
} from './units';

export const MAX_FOUNDATION_SPEED_MM_PER_SECOND = 1_000_000 as const;

export interface SimulationStepRules {
  readonly simulationRateHz: SimulationRateHz;
  readonly walkSpeedMmPerSecond: number;
  readonly sprintSpeedMmPerSecond: number;
  readonly pitchMinMilliDegrees?: MilliDegrees;
  readonly pitchMaxMilliDegrees?: MilliDegrees;
}

export type CommandRejectionReason = 'unknown_entity' | 'stale_sequence';

export type SimulationEvent =
  | {
      readonly kind: 'player_intent_applied';
      readonly tick: SimulationTick;
      readonly entityId: EntityId;
      readonly sequence: number;
    }
  | {
      readonly kind: 'player_intent_rejected';
      readonly tick: SimulationTick;
      readonly entityId: EntityId;
      readonly sequence: number;
      readonly reason: CommandRejectionReason;
    };

export interface SimulationStepResult {
  readonly state: SimulationState;
  readonly events: readonly SimulationEvent[];
}

function assertLinearSpeed(value: number, label: string): void {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_FOUNDATION_SPEED_MM_PER_SECOND
  ) {
    throw new RangeError(
      `${label} must be an integer from 0 to ${MAX_FOUNDATION_SPEED_MM_PER_SECOND} mm/s`,
    );
  }
}

export function assertSimulationStepRules(rules: SimulationStepRules): void {
  assertSimulationRateHz(rules.simulationRateHz);
  assertLinearSpeed(rules.walkSpeedMmPerSecond, 'walk speed');
  assertLinearSpeed(rules.sprintSpeedMmPerSecond, 'sprint speed');
  if (rules.sprintSpeedMmPerSecond < rules.walkSpeedMmPerSecond) {
    throw new RangeError('sprint speed cannot be lower than walk speed');
  }

  const minimum = rules.pitchMinMilliDegrees ?? DEFAULT_PITCH_MIN_MILLI_DEGREES;
  const maximum = rules.pitchMaxMilliDegrees ?? DEFAULT_PITCH_MAX_MILLI_DEGREES;
  asMilliDegrees(minimum);
  asMilliDegrees(maximum);
  if (minimum > maximum || minimum < -90_000 || maximum > 90_000) {
    throw new RangeError('pitch bounds must be ordered within -90000..90000 milli-degrees');
  }
}

function integerSquareRootCeiling(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('integer square root input must be a non-negative safe integer');
  }
  if (value < 2) return value;

  let lower = 1;
  let upper = value;
  while (lower < upper) {
    const midpoint = Math.floor((lower + upper) / 2);
    if (midpoint * midpoint >= value) {
      upper = midpoint;
    } else {
      lower = midpoint + 1;
    }
  }
  return lower;
}

function roundDivideSigned(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new RangeError('signed division requires a safe integer numerator and positive denominator');
  }
  if (numerator === 0) return 0;
  const sign = numerator < 0 ? -1 : 1;
  return sign * Math.floor((Math.abs(numerator) + Math.floor(denominator / 2)) / denominator);
}

function planarVelocity(
  moveX: number,
  moveZ: number,
  speedMmPerSecond: number,
): readonly [number, number] {
  if (moveX === 0 && moveZ === 0) return [0, 0];
  const magnitudeSquared = moveX * moveX + moveZ * moveZ;
  const denominator = Math.max(127, integerSquareRootCeiling(magnitudeSquared));
  return [
    roundDivideSigned(moveX * speedMmPerSecond, denominator),
    roundDivideSigned(moveZ * speedMmPerSecond, denominator),
  ];
}

function integrateAxis(
  positionMm: number,
  velocityMmPerSecond: number,
  remainder: number,
  rateHz: SimulationRateHz,
): readonly [number, number] {
  const numerator = velocityMmPerSecond + remainder;
  if (!Number.isSafeInteger(numerator)) {
    throw new RangeError('position integration numerator exceeded safe integer precision');
  }
  const delta = Math.trunc(numerator / rateHz);
  const nextPosition = positionMm + delta;
  if (!Number.isSafeInteger(nextPosition)) {
    throw new RangeError('integrated position exceeded safe integer precision');
  }
  return [nextPosition, numerator - delta * rateHz];
}

function resetIntentEdges(entity: SimulationEntityState): SimulationEntityState {
  return {
    ...entity,
    intent: {
      ...entity.intent,
      pressedButtons: 0,
      releasedButtons: 0,
    },
  };
}

function applyIntent(
  entity: SimulationEntityState,
  command: BoundPlayerIntent['intent'],
  rules: SimulationStepRules,
): SimulationEntityState {
  const pitchMinimum = rules.pitchMinMilliDegrees ?? DEFAULT_PITCH_MIN_MILLI_DEGREES;
  const pitchMaximum = rules.pitchMaxMilliDegrees ?? DEFAULT_PITCH_MAX_MILLI_DEGREES;
  return {
    ...entity,
    yawMilliDegrees: normalizeYawMilliDegrees(
      entity.yawMilliDegrees + command.lookYawDeltaMilliDegrees,
    ),
    pitchMilliDegrees: clampMilliDegrees(
      entity.pitchMilliDegrees + command.lookPitchDeltaMilliDegrees,
      pitchMinimum,
      pitchMaximum,
    ),
    lastProcessedSequence: command.sequence,
    intent: {
      moveX: command.moveX,
      moveZ: command.moveZ,
      heldButtons: command.heldButtons,
      pressedButtons: (entity.intent.pressedButtons | command.pressedButtons) >>> 0,
      releasedButtons: (entity.intent.releasedButtons | command.releasedButtons) >>> 0,
      selectedSlot: command.selectedSlot ?? entity.intent.selectedSlot,
    },
  };
}

function integrateEntity(
  entity: SimulationEntityState,
  rules: SimulationStepRules,
): SimulationEntityState {
  const sprinting = (entity.intent.heldButtons & INTENT_BUTTON.sprint) !== 0;
  const speed = sprinting
    ? rules.sprintSpeedMmPerSecond
    : rules.walkSpeedMmPerSecond;
  const [velocityX, velocityZ] = planarVelocity(
    entity.intent.moveX,
    entity.intent.moveZ,
    speed,
  );

  const [positionX, remainderX] = integrateAxis(
    entity.positionMm.x,
    velocityX,
    entity.integrationRemainder.x,
    rules.simulationRateHz,
  );
  const [positionY, remainderY] = integrateAxis(
    entity.positionMm.y,
    entity.velocityMmPerSecond.y,
    entity.integrationRemainder.y,
    rules.simulationRateHz,
  );
  const [positionZ, remainderZ] = integrateAxis(
    entity.positionMm.z,
    velocityZ,
    entity.integrationRemainder.z,
    rules.simulationRateHz,
  );

  return {
    ...entity,
    positionMm: {
      x: asMillimeters(positionX),
      y: asMillimeters(positionY),
      z: asMillimeters(positionZ),
    },
    velocityMmPerSecond: {
      x: asMillimetersPerSecond(velocityX),
      y: entity.velocityMmPerSecond.y,
      z: asMillimetersPerSecond(velocityZ),
    },
    integrationRemainder: {
      x: remainderX,
      y: remainderY,
      z: remainderZ,
    },
  };
}

export function stepSimulation(
  state: SimulationState,
  commands: readonly BoundPlayerIntent[],
  rules: SimulationStepRules,
): SimulationStepResult {
  assertSimulationState(state);
  assertSimulationStepRules(rules);
  if (state.simulationRateHz !== rules.simulationRateHz) {
    throw new RangeError(
      `state runs at ${state.simulationRateHz} Hz but step rules run at ${rules.simulationRateHz} Hz`,
    );
  }

  const nextTick = asSimulationTick(state.tick + 1);
  const entities: Record<string, SimulationEntityState> = Object.create(null) as Record<
    string,
    SimulationEntityState
  >;
  for (const entityId of Object.keys(state.entities).sort()) {
    entities[entityId] = resetIntentEdges(state.entities[entityId]);
  }

  const orderedCommands = [...commands];
  for (const command of orderedCommands) {
    asEntityId(command.entityId);
    assertPlayerIntentCommand(command.intent);
  }
  orderedCommands.sort(compareBoundPlayerIntents);

  const events: SimulationEvent[] = [];
  for (const command of orderedCommands) {
    const entity = entities[command.entityId];
    if (entity === undefined) {
      events.push({
        kind: 'player_intent_rejected',
        tick: nextTick,
        entityId: command.entityId,
        sequence: command.intent.sequence,
        reason: 'unknown_entity',
      });
      continue;
    }
    if (command.intent.sequence <= entity.lastProcessedSequence) {
      events.push({
        kind: 'player_intent_rejected',
        tick: nextTick,
        entityId: command.entityId,
        sequence: command.intent.sequence,
        reason: 'stale_sequence',
      });
      continue;
    }

    entities[command.entityId] = applyIntent(entity, command.intent, rules);
    events.push({
      kind: 'player_intent_applied',
      tick: nextTick,
      entityId: command.entityId,
      sequence: command.intent.sequence,
    });
  }

  for (const entityId of Object.keys(entities).sort()) {
    entities[entityId] = integrateEntity(entities[entityId], rules);
  }

  return {
    state: {
      ...state,
      tick: nextTick,
      entities,
    },
    events,
  };
}
