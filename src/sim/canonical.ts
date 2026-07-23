import { assertSimulationState, type SimulationState } from './state';

const FNV64_OFFSET = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;
const UINT64_MASK = 0xffffffffffffffffn;

function canonicalStateValue(state: SimulationState): unknown {
  const entities = Object.keys(state.entities)
    .sort()
    .map((entityId) => {
      const entity = state.entities[entityId];
      return {
        id: entity.id,
        positionMm: {
          x: entity.positionMm.x,
          y: entity.positionMm.y,
          z: entity.positionMm.z,
        },
        velocityMmPerSecond: {
          x: entity.velocityMmPerSecond.x,
          y: entity.velocityMmPerSecond.y,
          z: entity.velocityMmPerSecond.z,
        },
        integrationRemainder: {
          x: entity.integrationRemainder.x,
          y: entity.integrationRemainder.y,
          z: entity.integrationRemainder.z,
        },
        yawMilliDegrees: entity.yawMilliDegrees,
        pitchMilliDegrees: entity.pitchMilliDegrees,
        lastProcessedSequence: entity.lastProcessedSequence,
        intent: {
          moveX: entity.intent.moveX,
          moveZ: entity.intent.moveZ,
          heldButtons: entity.intent.heldButtons,
          pressedButtons: entity.intent.pressedButtons,
          releasedButtons: entity.intent.releasedButtons,
          selectedSlot: entity.intent.selectedSlot,
        },
      };
    });

  return {
    schemaVersion: state.schemaVersion,
    rulesetId: state.rulesetId,
    simulationRateHz: state.simulationRateHz,
    tick: state.tick,
    random: {
      algorithm: state.random.algorithm,
      state: state.random.state,
    },
    entities,
  };
}

function forEachUtf8Byte(value: string, consume: (byte: number) => void): void {
  for (const symbol of value) {
    const codePoint = symbol.codePointAt(0);
    if (codePoint === undefined) continue;

    if (codePoint <= 0x7f) {
      consume(codePoint);
    } else if (codePoint <= 0x7ff) {
      consume(0xc0 | (codePoint >>> 6));
      consume(0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      consume(0xe0 | (codePoint >>> 12));
      consume(0x80 | ((codePoint >>> 6) & 0x3f));
      consume(0x80 | (codePoint & 0x3f));
    } else {
      consume(0xf0 | (codePoint >>> 18));
      consume(0x80 | ((codePoint >>> 12) & 0x3f));
      consume(0x80 | ((codePoint >>> 6) & 0x3f));
      consume(0x80 | (codePoint & 0x3f));
    }
  }
}

export function serializeCanonicalSimulationState(state: SimulationState): string {
  assertSimulationState(state);
  return JSON.stringify(canonicalStateValue(state));
}

export function hashCanonicalSimulationState(state: SimulationState): string {
  const serialized = serializeCanonicalSimulationState(state);
  let hash = FNV64_OFFSET;
  forEachUtf8Byte(serialized, (byte) => {
    hash ^= BigInt(byte);
    hash = (hash * FNV64_PRIME) & UINT64_MASK;
  });
  return hash.toString(16).padStart(16, '0');
}
