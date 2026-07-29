# KYX canonical acceptance matrix — 2026-07-28

Recovery base:
`12bfd882ae9ac43bd95905e0ce6c2b7c5aee77da`

Consolidated recovery gate completed:
`2026-07-29T01:52:21.961Z`

This matrix separates compile/test status, runtime evidence, release controls,
and human visual decisions. Commands are run from canonical
`E:\AI Projects\Projects\Games\evio\evio-repo`.

| Gate | Authoritative command | Audit-anchor state | Recovered state | Evidence / owner decision |
| --- | --- | --- | --- | --- |
| App typecheck | `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit` | PASS | PASS | Consolidated result JSON |
| Worker typecheck | `node node_modules/typescript/bin/tsc -p tsconfig.worker.json --noEmit` | PASS | PASS | Consolidated result JSON |
| Simulation typechecks | `node node_modules/typescript/bin/tsc -p tsconfig.sim-source.json --noEmit` then `node node_modules/typescript/bin/tsc -p tsconfig.sim.json --noEmit` | PASS | PASS / PASS | Consolidated result JSON |
| ESLint | `node node_modules/eslint/bin/eslint.js "src/**/*.ts" "worker/**/*.ts" "tests/**/*.ts" "tools/**/*.mjs" vitest.worker.config.ts vitest.authority-soak.config.ts --no-error-on-unmatched-pattern` | PASS | PASS | Consolidated result JSON |
| App Vitest | `node node_modules/vitest/vitest.mjs run` | FAIL: 843 pass, 1 stale Rev30 approval assertion | PASS: 116 files / 867 tests | Rev30 remains `candidate`; it was not re-approved |
| Routine Worker Vitest | `node node_modules/vitest/vitest.mjs run --config vitest.worker.config.ts --maxWorkers=1 --no-isolate` | Included the dedicated soak unintentionally | PASS: 12 files / 49 tests; named soak excluded | `test:authority-soak` remains opt-in for the final evidence phase |
| Production build | `node node_modules/vite/bin/vite.js build` | Previously green but copied unapproved candidates | PASS: 255 ms; no provenance-bearing binary output | Existing chunk-size advisory remains non-fatal |
| Release asset validation | `node tools/assets/validate-manifests.mjs --release` | FAIL: 9 manifests, 68 errors, 33 warnings | PASS: 0 manifests, 0 errors, 0 warnings | Empty active inventory exactly matches empty supported-binary `public/` inventory |
| Provenance cleanup sentinel | `node tools/assets/verify-release-provenance-cleanup.mjs` | FAIL: public/ledger/manifest mismatch | PASS | Six unresolved legacy assets remain exact and quarantined |
| Built-package closure | `node tools/assets/verify-release-package.mjs` | Missing gate | PASS: 0 provenance-bearing artifacts, 0 ledger assets, 0 active manifests | Initial recovery run caught 8 unledgered map GLBs; production graph now excludes review GLBs |
| G9 controls | `node tools/security/audit-g9-readiness.mjs` | FAIL: missing Rev31 ledger entries and stale one-binding assertion | PASS: 9/9 controls / BLOCKED release | Both intended staging DO bindings pass; production namespace reuse absent |
| Rev30 visual | Owner runtime/render review | REJECT | REJECT; review-only, non-shipped | Owner decision preserved |
| Rev31 visual/runtime | Owner review plus browser runtime selection proof | REJECT / not runtime-integrated | REJECT; review-only asset batch | Blocky stacked-plate direction rejected; no runtime-family claim |
| Inkfall Rev5 | 2/4/8 runtime proof plus human play/visual review | Rev4 technical proof only | OPEN | Owner must judge collision, sightlines, spawn safety, portal, readability, and fun |
| Arena Instrument HUD | Representative Practice/online desktop, reduced-motion, and high-contrast captures | Candidate | OPEN | Owner visual/accessibility acceptance required |

## Recovered release-package policy

- Rev17, Rev30, and Rev31 exact bytes and records are preserved under
  `assets/review/`; they are not release-packaged.
- `assets/manifests/` contains only active release assets.
- `public/` currently contains no supported binary assets.
- Known text/build output is allowlisted. Every other file emitted into `dist/`
  must have exact shipped-ledger and active-manifest coverage with provenance,
  approval, integrity, and validation or the gate fails.
- Rev5/Rev3 map GLBs remain development review inputs. Production validates the
  bundled manifest and 339-collider fixture, then uses the procedural
  authority-containment visual until map art is human-accepted.

## Known release blockers

- `PROJECT_LICENSE_SELECTION_REQUIRED`
- `G6_ACCEPTED_RUNTIME_CHARACTER_REQUIRED`
- `DISTRIBUTION_MODE_DECISION_REQUIRED`
- Human Inkfall Rev5, HUD, audio/VFX, animation, and integrated gameplay
  acceptance
- Final source-frozen 2/4/8 regression, G8 soak, staging verification, and
  rollback rehearsal

No production deployment is authorized by this matrix.

Machine-readable consolidated results:
`evidence/2026-07-28/mainline-recovery/consolidated-gate-results.json`.
