import {
  combatSnapshotFromAuthority,
  type AuthorityFullSnapshot,
  type AuthorityPlayerSnapshot,
  type KyxDeathmatchAuthorityModeId,
} from '../authority';
import {
  deriveLocomotionPresentationSignal,
  type RemoteRenderState,
} from '../client';
import type { AuthorityEvidencePresentation } from '../dev/authorityEvidenceClient';
import type { CombatSnapshotV1, ReliableEvent } from '../net';
import type { HudViewModelV1 } from '../ui/hudViewModel';
import { createAuthorityPracticeHudViewModel } from './authorityHudProjection';

const IMPLICIT_DISCONTINUITY_DISTANCE_MILLIMETERS = 2_000;

interface RenderMovementState {
  readonly feetPosition: Readonly<{ x: number; y: number; z: number }>;
  readonly velocity: Readonly<{ x: number; y: number; z: number }>;
  readonly yawMilliDegrees: number;
  readonly pitchMilliDegrees: number;
  readonly grounded: boolean;
  readonly stance: 'standing' | 'crouched';
  readonly locomotion: 'grounded' | 'airborne' | 'sliding';
  readonly teleportCooldownTicksRemaining: number;
}

export interface LocalInkfallPracticePresentation {
  readonly presentation: AuthorityEvidencePresentation;
  readonly combat: Readonly<{
    snapshot: CombatSnapshotV1;
    recentEvents: readonly ReliableEvent[];
    localPlayerId: string;
  }>;
  readonly hud: HudViewModelV1;
  readonly localMovement: RenderMovementState;
}

export interface LocalInkfallPracticePresentationInput {
  readonly snapshot: AuthorityFullSnapshot;
  readonly previousSnapshot?: AuthorityFullSnapshot;
  readonly interpolationAlpha?: number;
  readonly localPlayerId: string;
  readonly recentEvents?: readonly ReliableEvent[];
  readonly aimHeld?: boolean;
  readonly matchMode?: KyxDeathmatchAuthorityModeId;
}

function clamp01(value: number | undefined): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value ?? 1 : 1));
}

function lerp(left: number, right: number, alpha: number): number {
  return left + (right - left) * alpha;
}

function lerpYaw(left: number, right: number, alpha: number): number {
  const signedDelta = ((right - left + 540_000) % 360_000) - 180_000;
  return (left + signedDelta * alpha + 360_000) % 360_000;
}

function playerById(
  snapshot: AuthorityFullSnapshot | undefined,
  playerId: string,
): AuthorityPlayerSnapshot | undefined {
  return snapshot?.players.find((player) => player.playerId === playerId);
}

function renderMovement(
  current: AuthorityPlayerSnapshot,
  previous: AuthorityPlayerSnapshot | undefined,
  alpha: number,
): RenderMovementState {
  const currentState = current.movement.player;
  const previousState = previous?.movement.player;
  if (previousState === undefined) {
    return Object.freeze({
      feetPosition: Object.freeze({ ...currentState.feetPosition }),
      velocity: Object.freeze({ ...currentState.velocity }),
      yawMilliDegrees: currentState.yawMilliDegrees,
      pitchMilliDegrees: currentState.pitchMilliDegrees,
      grounded: currentState.grounded,
      stance: currentState.stance,
      locomotion: currentState.locomotion,
      teleportCooldownTicksRemaining: currentState.teleportCooldownTicksRemaining,
    });
  }
  const displacement = Math.hypot(
    currentState.feetPosition.x - previousState.feetPosition.x,
    currentState.feetPosition.y - previousState.feetPosition.y,
    currentState.feetPosition.z - previousState.feetPosition.z,
  );
  const mix = displacement > IMPLICIT_DISCONTINUITY_DISTANCE_MILLIMETERS ? 1 : alpha;
  return Object.freeze({
    feetPosition: Object.freeze({
      x: lerp(previousState.feetPosition.x, currentState.feetPosition.x, mix),
      y: lerp(previousState.feetPosition.y, currentState.feetPosition.y, mix),
      z: lerp(previousState.feetPosition.z, currentState.feetPosition.z, mix),
    }),
    velocity: Object.freeze({
      x: lerp(previousState.velocity.x, currentState.velocity.x, mix),
      y: lerp(previousState.velocity.y, currentState.velocity.y, mix),
      z: lerp(previousState.velocity.z, currentState.velocity.z, mix),
    }),
    yawMilliDegrees: lerpYaw(
      previousState.yawMilliDegrees,
      currentState.yawMilliDegrees,
      mix,
    ),
    pitchMilliDegrees: lerp(
      previousState.pitchMilliDegrees,
      currentState.pitchMilliDegrees,
      mix,
    ),
    grounded: currentState.grounded,
    stance: currentState.stance,
    locomotion: currentState.locomotion,
    teleportCooldownTicksRemaining: currentState.teleportCooldownTicksRemaining,
  });
}

function remoteState(
  player: AuthorityPlayerSnapshot,
  previous: AuthorityPlayerSnapshot | undefined,
  alpha: number,
): RemoteRenderState {
  const movement = renderMovement(player, previous, alpha);
  return Object.freeze({
    entityId: player.playerId,
    feetPosition: movement.feetPosition,
    velocity: movement.velocity,
    yawMilliDegrees: movement.yawMilliDegrees,
    pitchMilliDegrees: movement.pitchMilliDegrees,
    grounded: movement.grounded,
    stance: movement.stance,
    locomotion: movement.locomotion,
    locomotionSignal: deriveLocomotionPresentationSignal(
      movement.velocity,
      movement.yawMilliDegrees,
    ),
  });
}

export function createLocalInkfallPracticePresentation(
  input: LocalInkfallPracticePresentationInput,
): LocalInkfallPracticePresentation {
  const alpha = clamp01(input.interpolationAlpha);
  const localPlayer = playerById(input.snapshot, input.localPlayerId);
  if (localPlayer === undefined) throw new Error('LOCAL_INKFALL_PRACTICE_PLAYER_MISSING');
  const localMovement = renderMovement(
    localPlayer,
    playerById(input.previousSnapshot, input.localPlayerId),
    alpha,
  );
  const combatSnapshot = combatSnapshotFromAuthority(input.snapshot, input.localPlayerId);
  if (combatSnapshot === null) throw new Error('LOCAL_INKFALL_PRACTICE_COMBAT_MISSING');
  const remotes = Object.freeze(input.snapshot.players
    .filter(({ playerId }) => playerId !== input.localPlayerId)
    .map((player) => Object.freeze({
      entityId: player.playerId,
      mode: 'authoritative' as const,
      state: remoteState(
        player,
        playerById(input.previousSnapshot, player.playerId),
        alpha,
      ),
    })));
  const presentation = Object.freeze({
    localPredicted: localMovement.feetPosition,
    localAuthoritative: Object.freeze({ ...localPlayer.movement.player.feetPosition }),
    remotes,
    estimatedServerTick: input.snapshot.serverTick - (1 - alpha),
  }) satisfies AuthorityEvidencePresentation;
  return Object.freeze({
    presentation,
    combat: Object.freeze({
      snapshot: combatSnapshot,
      recentEvents: Object.freeze([...(input.recentEvents ?? [])]),
      localPlayerId: input.localPlayerId,
    }),
    hud: createAuthorityPracticeHudViewModel({
      snapshot: input.snapshot,
      combat: combatSnapshot,
      localPlayerId: input.localPlayerId,
      aimHeld: input.aimHeld === true,
      ...(input.matchMode === undefined ? {} : { matchMode: input.matchMode }),
    }),
    localMovement,
  });
}
