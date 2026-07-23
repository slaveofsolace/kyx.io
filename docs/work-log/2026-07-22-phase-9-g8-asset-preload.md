# 2026-07-22 Phase 9 G8 default-path asset preload optimization

## Outcome

Removed four unnecessary eager GLB downloads from the default Offline Practice
launch. A source-frozen non-qualifying browser smoke reduced the observed
first-play transfer signal from 13,557,909 to 9,720,514 bytes while retaining
only the preferred soldier model request. The provisional 12 MB transfer signal
now passes in this harness.

G8 remains open. The smoke is short, headless, SwiftShader-based, and not the
final integrated map/character build. Draw calls remain over the provisional
ceiling and the required named-hardware soak has not been run.

## Implementation

- `src/core/Game.js`
  - kept the preferred human soldier preload;
  - removed eager legacy player/Spartan and weapon-catalog preloads;
  - moved zombie preload into the Survival branch.
- Performance capture and independent verifier now fingerprint `Game.js`, so
  future asset-loading evidence is bound to the source that controls requests.

## Evidence

`evidence/2026-07-22/phase-9-g8-asset-preload/`

- `smoke-v1/runtime-instrumentation.json`
- `smoke-v1/independent-verification.json`
- `smoke-v1/asset-preload-verification.json`
- `smoke-v1/active-match.png`
- `README.md`
- `test-results/verification.txt`

The evidence explicitly preserves every non-claim and open budget signal.
