# Local Inkfall Practice authority route — 2026-07-31

## Outcome

Inkfall Foundry now has a visible, desktop-browser Practice route at
`/practice`. It does not boot the legacy `Game` runtime underneath the new
route, so the page owns exactly one renderer, one input stack, one first-person
weapon, and one HUD.

The route runs one browser-local authority room at an exact fixed 20 Hz with
one local player and seven deterministic bots. It consumes the same
hash-locked Inkfall profile, collision fixture, combat snapshot, reliable event
projection, ability projection, and Three presentation used by the online
vertical slice. Browser-rate inputs buffer short button edges and mouse motion
until the next authority tick; Blink uses hold-to-preview and release-to-submit.

The root launcher remains truthfully labeled as the Iron Bastion legacy
experience. Inkfall is launched through the map library until the root launcher
is separated from the legacy runtime.

## Player-eye correction

The first active 1600×900 capture exposed a real integration defect: the WebGL
canvas retained its intrinsic 300×150 size while the HUD filled the viewport.
The Practice route stylesheet now explicitly sizes the canvas to the viewport,
and the browser test fails if either rendered dimension is smaller than the
browser viewport.

The corrected 1440×900 capture proves:

- the Inkfall scene fills the viewport;
- the local rifle is visible with exactly two first-person hands and no second
  overlapping weapon;
- seven remote authority avatars are present;
- health, shield, ammunition, team score, and Q/E/F/Z ability state are driven
  by the live authority snapshot;
- the temporary enemy bodies and portions of the map are still visibly rough.

This is runtime observation, not human map, character, weapon-art, or HUD
acceptance.

## Consolidated verification

- App TypeScript: PASS.
- Worker TypeScript: PASS.
- Impacted-file ESLint: PASS.
- Practice input/host Vitest: 2 files, 6 tests PASS.
- Worker combat-presentation projection: 1 file, 4 tests PASS.
- Production Vite build: PASS; the existing greater-than-500-kB chunk warning
  remains, with the largest reported chunk at 2,671.71 kB before gzip.
- Desktop Chromium `/practice` proof: 1 test PASS in 58.3 seconds at 1440×900.
  It observed the exact Inkfall host/map identity, eight total players, seven
  bots, advancing authority ticks, at least 72 accepted input packets, zero
  missed scheduler ticks, seven remote avatars, one selected rifle, two
  first-person hands, and zero console errors.

The Playwright duration includes full-resolution WebGL startup under the
headless software renderer. It is not a frame-time or release-performance
claim; the final 2/4/8 performance matrix remains separate.

## Truth boundary and remaining work

- No owner visual/play acceptance is claimed.
- The procedural fallback enemy/player body remains in use and is visibly
  below the target quality bar.
- Inkfall still needs manual collision, geometry, sightline, spawn-safety,
  readability, and portal play review.
- Practice/online convergence is materially advanced but not declared fully
  complete until the remaining command/presentation parity is audited.
- The final source-frozen 2/4/8 matrix and 30-minute soak were deliberately not
  run while the slice is still changing.
- No staging or production deployment occurred in this checkpoint.
