# Final shared-tree regression

Date: 2026-07-21 (America/Chicago)

All commands ran from the canonical repository root after the concurrent G3
protocol fields settled.

| Check | Result |
|---|---|
| `tsc -p tsconfig.json --noEmit` | PASS |
| `tsc -p tsconfig.worker.json --noEmit` | PASS |
| `tsc -p tsconfig.sim-source.json --noEmit` | PASS |
| `tsc -p tsconfig.sim.json --noEmit` | PASS |
| full ESLint command from `package.json` | PASS |
| main Vitest suite | 43 files, 433/433 PASS |
| Worker isolate Vitest suite | 2 files, 5/5 PASS |
| production Vite build | PASS |
| development asset-manifest validator | PASS, 0 errors, 33 legacy warnings |
| map-package Playwright route, Chromium desktop | 1/1 PASS |
| independent P6.3 verifier | `INDEPENDENT_P6_3_RUNTIME_EVIDENCE_PASS` |
| production map debug/artifact exclusion | PASS, 0 Inkfall GLBs |

Known non-map output retained:

- Rapier 0.19.3 prints its existing deprecated-initialization warning in four
  real-physics tests.
- Vite reports the existing 937.98 kB minified `Game` chunk above its 500 kB
  advisory threshold.
- asset validation reports 33 unresolved warnings on six legacy manifests and
  zero errors. These are release/G6/G8 debt and are not hidden by this slice.

No production deployment was performed.
