# 2026-07-22 — integrated P5.12 / G7 / Press Hall checkpoint

## Decision

`INTEGRATED_BOUNDED_CHECKPOINT_PASS`

No formal gate promotion. G0-G2 remain accepted; G3-G9 remain open.

## Integrated results

- App typecheck: pass.
- Worker typecheck: pass.
- Full ESLint: pass.
- App Vitest: 83 files, 684 tests pass.
- Worker Vitest: 8 files, 29 tests pass.
- Production build: pass.
- Worker dry-run: 2829.83 KiB / 773.11 KiB gzip.
- Press Hall route: 4/4 Chromium cases across desktop and mobile-unsupported projects.
- P5.12 independent root re-verification: pass, 13 artifact hashes and 10 source hashes.
- Press Hall independent root re-verification: 42/42.
- G7 viewport/HUD matrix: 12/12.
- G7 zoom-equivalent matrix: 3/3.

## Defects found and corrected during integration

1. Reduced-motion cascade specificity allowed late `!important` transition shorthands to retain 120ms transitions. The accessibility selectors now out-rank them while preserving near-zero completion lifecycles.
2. A max-width media query mistook a 200% zoomed desktop for touch-only and covered the game with `DESKTOP REQUIRED`. The fallback now depends on coarse/no-hover input.
3. The Press Hall mobile route hid the critical G5/G8-open disclaimer. It now remains visible in a compact responsive form; all four browser cases pass.

## Open critical path

- P5.13 active-match checkpoint/reconstitution.
- Production contact rig/model and animation proof.
- Material-correct Press Hall v3.3 export and actual-loader recapture.
- Remaining G7 human/assistive/organic-state/named-machine rows.
- G8 named-tier optimization and soak.
- Phases 10-12 content/progression/security/legal/staging/rollback/packaging/final regression.
