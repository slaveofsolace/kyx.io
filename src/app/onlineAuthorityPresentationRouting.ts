import type { ReliableEvent } from '../net';

export type OnlineAuthorityPresentationLane =
  | 'none'
  | 'combat'
  | 'throwable'
  | 'world';

/**
 * Keep non-combat semantic payloads out of the strict combat adapter.
 *
 * World portal presentation is consumed by the Three runtime, while throwable
 * presentation has its own HUD/audio path. Every remaining semantic payload is
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
