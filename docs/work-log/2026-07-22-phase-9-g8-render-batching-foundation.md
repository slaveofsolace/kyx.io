# Phase 9 / G8 render batching foundation

Date: 2026-07-22  
Status: `BOUNDED_OPTIMIZATION_PASS` / `G8_OPEN`

## Outcome

The current playable Offline Practice world now batches its largest repeated static decorations instead of submitting hundreds of separate meshes. The same slice hardens the G8 instrumentation contract so a short, headless, software-rendered run cannot be presented as named-tier or soak evidence.

The preserved post-change smoke passes all 14 capture checks and all 22 independent checks. Its active render-call distribution is 437 p50 and 619 maximum while the new activity pattern drives movement, fire, jump, and ability input. The earlier preserved smoke reported 785 steady calls and 2,119 scene objects; the new smoke reports 1,710 scene objects. The activity patterns differ, so the comparison is directional, not a final controlled benchmark.

## Implementation

- Added keyed static instancing for repeated marker bulbs, orbital nodes, rubble, and supply-crate components.
- Preserved supply-crate hit testing through shared-geometry invisible CPU raycast proxies plus unchanged explicit collision boxes.
- Removed redundant per-face material groups from town-building bodies while retaining the separate roof shell.
- Added strict qualifying-soak prerequisites, real/software renderer disclosure, warmup separation, deterministic activity, resource ranges, interval work, memory trends, payload signals, and an explicit non-claiming assessment.
- Added `src/world/World.js` to the evidence source fingerprint boundary.

## Verification

- app TypeScript: PASS
- movement unit regression: PASS, 26/26
- browser shell and renderer diagnostics: PASS, Chromium desktop 2/2
- capture/verifier syntax and targeted lint: PASS
- capture: PASS, 14/14 structural checks
- independent verifier: PASS, 22/22 checks
- screenshot reviewed: the playable arena, bot, viewmodel, HUD, and repeated wall markers remain present

## Remaining budget failures

The capture is intentionally labeled `NON_QUALIFYING_INSTRUMENTATION_SMOKE`. SwiftShader frame timing cannot establish named-GPU performance. The current active window still exceeds the low-tier draw-call maximum, repeats long tasks over 50 ms, and exceeds the low-tier first-playable transfer target. Final map/character/VFX assets, room tick p99, real-GPU tiers, and the qualifying 30-minute soak remain open.

Evidence: `evidence/2026-07-22/phase-9-g8-render-batching/`.
