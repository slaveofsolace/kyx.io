# Phase 9 G8 default-path asset preload optimization

Status: **BOUNDED PERFORMANCE IMPROVEMENT; G8 REMAINS OPEN**

This checkpoint removes obsolete eager model downloads from the default Offline
Practice path. It does not claim final integrated performance, a named-hardware
profile, or the required 30-minute soak.

## Change

- Menu initialization now fetches only the preferred `soldier.glb` player model.
- The older `player.glb` and `spartan.glb` fallbacks are no longer fetched eagerly.
- `weapons.glb` is no longer downloaded on launch; the existing detailed
  procedural weapon path remains available.
- `zombie.glb` is deferred until Survival is selected, where the existing
  60-second grace period provides a loading window.
- Accepted Offline Practice mode, bot count, loadout, rules, and coordinates are
  unchanged.

## Measured result

The comparable earlier low-tier dev-server smoke observed 13,557,909 bytes and
eager requests for five GLBs. This source-frozen smoke observes:

- first-play transfer signal: **9,720,514 bytes** (provisional 12,000,000-byte
  budget signal passes);
- requested GLBs: **only `/soldier.glb`** at 2,159,764 bytes;
- removed eager GLB response bodies: `player.glb` 1,363,668 bytes,
  `spartan.glb` 256,508 bytes, `weapons.glb` 2,019,140 bytes, and `zombie.glb`
  234,604 bytes;
- capture checks: **14/14 pass**;
- general independent verification: **23/23 pass**;
- dedicated default-path asset verification: **10/10 pass**, including literal
  absence of the four removed eager GLB requests.

The total observed transfer reduction is 3,837,395 bytes (about 28.3%). Browser
request timing and concurrent source changes mean the direct total comparison is
diagnostic; the per-resource removals above are the literal causal evidence.

## Remaining G8 failures and limitations

- Draw-call signal is still over budget: observed maximum **455**, target <=300.
- The capture used headless Chromium with SwiftShader, lasted five active
  seconds, and is labeled `NON_QUALIFYING_INSTRUMENTATION_SMOKE`.
- It is not a named-GPU or headed capture and includes neither a 60-second warmup
  nor a 30-minute active soak.
- Final map, final character, final VFX, full occupancy, GPU timer queries,
  authoritative tick p99, and memory/leak review remain outstanding.
- Cold-cache production-host transfer proof remains separate from this
  dev-server browser signal.

## Verification

- App TypeScript: pass.
- Focused `Game.js` ESLint: pass.
- Capture/verifier syntax and ESLint: pass.
- Vite production build: pass with the existing large-chunk warning.
- Full Node Vitest: **79 files / 668 tests pass**.
- Full Worker Vitest: **7 files / 26 tests pass**.
- Worker TypeScript: pass.
- Screenshot review: runtime remains visually intact; no approval claim.

See `smoke-v1/runtime-instrumentation.json`,
`smoke-v1/independent-verification.json`,
`smoke-v1/asset-preload-verification.json`, and
`smoke-v1/active-match.png`.

## Immutable fingerprints

- capture JSON: `667b83b8c2baaad43363cbb9d7b35c97835636e7984af3675b2ba2eff489f322`
- independent verification: `0b9497482cacfaa80affbc48b2cd12bd258b713228ef4eceedadadfa61571317`
- asset-preload verification: `a348c4f09a836360105768ca1f177c31795794476ffdce6ae19824497d173305`
- screenshot: `992f247762b31d9d5c8d3efc2a1bbdcb23fe37947d201e5ad073e487584a9b68`
- `src/core/Game.js`: `e152d6b93b211b38238661a07f21c6fd34203cacd33fecef3cf84a2c08da7780`
- capture tool: `445988d9338a24e9f8998c59899d06bcdf1e6c13dc16d9515c078576fe496802`
- verifier: `06cb357d2e9354cf5369e4fb654daf72618e63be89f0f0d0654e8e2005a848d3`
- asset-preload verifier: `7e7ebe1d6ed40f86d7d60dfc6f0d99ec816bbf5a7bab9a751a139a9162a7018c`
