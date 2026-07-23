import RAPIER from '@dimforge/rapier3d-deterministic-compat';

import {
  EXPECTED_RAPIER_VERSION,
  RAPIER_INIT_DIAGNOSTIC,
  type RapierRuntime,
} from './contracts';

export {
  EXPECTED_RAPIER_VERSION,
  RAPIER_INIT_DIAGNOSTIC,
  type RapierRuntime,
} from './contracts';

let initialization: Promise<RapierRuntime> | null = null;

/** Initialize WASM before a simulation tick. The exact upstream warning remains visible. */
export function initializeRapierRuntime(): Promise<RapierRuntime> {
  if (initialization) return initialization;
  initialization = (async () => {
    await RAPIER.init();
    const version = RAPIER.version();
    if (version !== EXPECTED_RAPIER_VERSION) {
      throw new Error(`PHYSICS_RAPIER_VERSION_MISMATCH expected ${EXPECTED_RAPIER_VERSION}, received ${version}`);
    }
    return Object.freeze({
      module: RAPIER,
      version,
      initializationDiagnostic: RAPIER_INIT_DIAGNOSTIC,
    });
  })().catch((error: unknown) => {
    initialization = null;
    throw error;
  });
  return initialization;
}
