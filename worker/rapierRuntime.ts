import WORKER_RAPIER from '@dimforge/rapier3d-deterministic';
import * as wasmBindings from '@dimforge/rapier3d-deterministic/rapier_wasm3d_bg.js';
import rapierWasmModule from '@dimforge/rapier3d-deterministic/rapier_wasm3d_bg.wasm';

import {
  EXPECTED_RAPIER_VERSION,
  RAPIER_INIT_DIAGNOSTIC,
  type RapierRuntime,
} from '../src/physics/rapier/contracts';

let workerRuntime: RapierRuntime | null = null;

/**
 * The Workers package statically imports rapier_wasm3d_bg.wasm. Wrangler turns
 * that import into a precompiled WebAssembly module, avoiding runtime code
 * generation, while preserving the exact 0.19.3 deterministic engine version.
 */
export function initializeWorkerRapierRuntime(): RapierRuntime {
  if (workerRuntime !== null) return workerRuntime;
  const instance = new WebAssembly.Instance(rapierWasmModule, {
    './rapier_wasm3d_bg.js': wasmBindings,
  });
  wasmBindings.__wbg_set_wasm(instance.exports);
  const module = WORKER_RAPIER as unknown as RapierRuntime['module'];
  const version = module.version();
  if (version !== EXPECTED_RAPIER_VERSION) {
    throw new Error(
      `PHYSICS_RAPIER_VERSION_MISMATCH expected ${EXPECTED_RAPIER_VERSION}, received ${version}`,
    );
  }
  workerRuntime = Object.freeze({
    module,
    version,
    initializationDiagnostic: RAPIER_INIT_DIAGNOSTIC,
  });
  return workerRuntime;
}
