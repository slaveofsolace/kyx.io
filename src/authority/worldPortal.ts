import type {
  MovementProfileV1,
  MovementQueryMetrics,
  MovementSemanticEvent,
  MovementSimulationState,
} from '../sim/movement';

export const AUTHORITY_WORLD_PORTAL_SCHEMA_VERSION = 1 as const;

export interface AuthorityWorldPortalAdvanceInputV1 {
  readonly schemaVersion: 1;
  readonly authorityTick: number;
  readonly previousState: MovementSimulationState;
  readonly nextState: MovementSimulationState;
  readonly profile: MovementProfileV1;
}

export interface AuthorityWorldPortalAdvanceResultV1 {
  readonly schemaVersion: 1;
  readonly state: MovementSimulationState;
  readonly events: readonly MovementSemanticEvent[];
  readonly metrics: MovementQueryMetrics;
}

/**
 * Optional server-owned world transition hook. Implementations may move an
 * entity only after the ordinary movement step and must return all additional
 * collision-query accounting with the result.
 */
export interface AuthorityWorldPortalPort {
  readonly schemaVersion: typeof AUTHORITY_WORLD_PORTAL_SCHEMA_VERSION;
  readonly capabilityId: string;
  advance(
    input: AuthorityWorldPortalAdvanceInputV1,
  ): AuthorityWorldPortalAdvanceResultV1;
}
