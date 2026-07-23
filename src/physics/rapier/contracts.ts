import type RAPIER from '@dimforge/rapier3d-deterministic-compat';

export const EXPECTED_RAPIER_VERSION = '0.19.3' as const;
export const RAPIER_INIT_DIAGNOSTIC = Object.freeze({
  code: 'RAPIER_COMPAT_INIT_DEPRECATION_WARNING' as const,
  upstreamMessage: 'using deprecated parameters for the initialization function; pass a single object instead',
  handling: 'exposed_by_upstream_not_suppressed' as const,
});

export interface RapierRuntime {
  readonly module: typeof RAPIER;
  readonly version: typeof EXPECTED_RAPIER_VERSION;
  readonly initializationDiagnostic: typeof RAPIER_INIT_DIAGNOSTIC;
}
