import { hashMovementString } from './hash';
import { assertMovementSimulationState, type MovementSimulationState } from './state';

function canonicalSupport(state: MovementSimulationState) {
  const support = state.player.support;
  if (support === null) return null;
  return {
    colliderId: support.colliderId,
    layer: support.layer,
    normalQ15: {
      x: support.normalQ15.x,
      y: support.normalQ15.y,
      z: support.normalQ15.z,
    },
    velocity: {
      x: support.velocity.x,
      y: support.velocity.y,
      z: support.velocity.z,
    },
  };
}

function canonicalMovementStateValue(state: MovementSimulationState): unknown {
  const player = state.player;
  return {
    schemaVersion: state.schemaVersion,
    identity: {
      rulesetId: state.identity.rulesetId,
      rulesetRevision: state.identity.rulesetRevision,
      // Schema v1 preserves the accepted Phase 3 movement hash. The content
      // hash is required and compared by replay/network identity boundaries,
      // but is intentionally not folded into this legacy state hash.
      movementProfileId: state.identity.movementProfileId,
      movementProfileRevision: state.identity.movementProfileRevision,
      movementProfileHash: state.identity.movementProfileHash,
      fixtureId: state.identity.fixtureId,
      fixtureHash: state.identity.fixtureHash,
      physicsAdapterId: state.identity.physicsAdapterId,
      physicsAdapterVersion: state.identity.physicsAdapterVersion,
    },
    simulationRateHz: state.simulationRateHz,
    tick: state.tick,
    player: {
      id: player.id,
      feetPosition: {
        x: player.feetPosition.x,
        y: player.feetPosition.y,
        z: player.feetPosition.z,
      },
      velocity: {
        x: player.velocity.x,
        y: player.velocity.y,
        z: player.velocity.z,
      },
      integrationRemainders: {
        positionX: player.integrationRemainders.positionX,
        positionY: player.integrationRemainders.positionY,
        positionZ: player.integrationRemainders.positionZ,
        planarAcceleration: player.integrationRemainders.planarAcceleration,
        gravity: player.integrationRemainders.gravity,
      },
      yawMilliDegrees: player.yawMilliDegrees,
      pitchMilliDegrees: player.pitchMilliDegrees,
      lastProcessedSequence: player.lastProcessedSequence,
      ticksSinceAcceptedCommand: player.ticksSinceAcceptedCommand,
      intent: {
        moveX: player.intent.moveX,
        moveZ: player.intent.moveZ,
        heldButtons: player.intent.heldButtons,
        pressedButtons: player.intent.pressedButtons,
        releasedButtons: player.intent.releasedButtons,
        selectedSlot: player.intent.selectedSlot,
      },
      stance: player.stance,
      locomotion: player.locomotion,
      grounded: player.grounded,
      support: canonicalSupport(state),
      coyoteTicksRemaining: player.coyoteTicksRemaining,
      jumpBufferTicksRemaining: player.jumpBufferTicksRemaining,
      slideTicksRemaining: player.slideTicksRemaining,
      slideCooldownTicksRemaining: player.slideCooldownTicksRemaining,
      teleportCooldownTicksRemaining: player.teleportCooldownTicksRemaining,
      standBlocked: player.standBlocked,
      activeVolumes: [...player.activeVolumes]
        .sort((left, right) => (
          left.colliderId < right.colliderId ? -1 : left.colliderId > right.colliderId ? 1 : 0
        ))
        .map((volume) => ({ colliderId: volume.colliderId, kind: volume.kind })),
    },
  };
}

export function serializeCanonicalMovementState(state: MovementSimulationState): string {
  assertMovementSimulationState(state);
  return JSON.stringify(canonicalMovementStateValue(state));
}

export function hashCanonicalMovementState(state: MovementSimulationState): string {
  return hashMovementString(serializeCanonicalMovementState(state));
}
