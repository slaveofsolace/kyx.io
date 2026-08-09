import type { ReliableEvent } from '../net';

export type OnlineAuthorityPresentationLane =
  | 'none'
  | 'combat'
  | 'throwable'
  | 'world';

export type OnlineAbilityPresentationAudioEvent =
  | 'throwable'
  | 'launch_detonation'
  | 'launch_impulse'
  | 'route_feedback';

export type OnlineAbilityPresentationAudioOwner =
  | 'three_runtime'
  | 'route'
  | 'none';

/**
 * Give each authoritative ability event one audio owner. The Three runtime
 * owns spatial throwable and Launch detonation audio; the route keeps input,
 * contact and Blink feedback. Per-target Launch impulse events stay silent in
 * 3D because the detonation already emitted the single world-space pulse.
 */
export function selectOnlineAbilityPresentationAudioOwner(
  event: OnlineAbilityPresentationAudioEvent,
  context: Readonly<{
    threeRuntimeActive: boolean;
    threeDimensionalMap: boolean;
  }>,
): OnlineAbilityPresentationAudioOwner {
  if (event === 'route_feedback') return 'route';
  if (context.threeRuntimeActive) {
    return event === 'launch_impulse' ? 'none' : 'three_runtime';
  }
  return context.threeDimensionalMap ? 'none' : 'route';
}

/**
 * Keep non-combat semantic payloads out of the strict combat adapter.
 *
 * World portal presentation is consumed by the Three runtime, while throwable
 * presentation has its own HUD and single-owner audio path. Every remaining semantic payload is
 * deliberately sent through the fail-closed combat adapter.
 */
export function classifyOnlineAuthorityPresentationEvent(
  event: ReliableEvent,
): OnlineAuthorityPresentationLane {
  if (event.presentation === undefined) return 'none';
  if (event.presentation.kind === 'throwable_ability_event') return 'throwable';
  if (event.presentation.kind === 'world_portal_traversed') return 'world';
  return 'combat';
}
