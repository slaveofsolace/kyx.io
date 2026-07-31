# Inkfall Rev5 / VLR-7 player-eye recovery checkpoint

Status: `AUTOMATED_CHECKS_PASS_REVIEW_CANDIDATE_HUMAN_ACCEPTANCE_OPEN`

This checkpoint makes one bounded presentation recovery pass without changing
Worker authority, collision, spawns, zones, combat rules, or the accepted Rev3
map fixture.

## Player-facing changes

- The staging-review VLR-7 uses a smaller hip/ADS composition, a restrained
  dark-alloy material response, lower camera-space fill lighting, and the
  Quaternius CC0 review shell without the detached procedural action block.
- The first-person contact rig keeps two hands and both grip markers, lowers
  the elbow/shoulder paths, and crops upper-arm geometry outside the first-
  person camera instead of drawing an oversized V through the sight picture.
- Inkfall subordinates the two joined ceiling-lattice meshes while retaining
  the lighter ceramic datum.
- The former hanging rectangular press crosshead is replaced with a connected
  cylindrical roller, compression band, two bearings, and two hangers. All six
  meshes remain render-only and no-hit.
- A source-matched gallery and capture command now cover rifle hip/ADS/reload
  plus spawn, press, portal, and overhead map compositions.

## Consolidated verification

- `git diff --check` — pass.
- `node --check tools/evidence/capture-kyx-first-person-composition.mjs` — pass.
- `tsc -p tsconfig.json --noEmit` — pass.
- affected-file ESLint — pass.
- `vitest run tests/unit/weapons/kyxArmoryPresentation.test.ts tests/unit/app/inkfallRev5VisualContinuity.test.ts` — 2 files / 7 tests pass.
- `node tools/build/build-staging-review.mjs` — pass, 207 modules.
- `node tools/assets/verify-staging-review-package.mjs` —
  `STAGING_REVIEW_PACKAGE_VERIFIED`.
- `node tools/evidence/capture-kyx-first-person-composition.mjs <output>` —
  seven captures, zero reported page/console errors.

The final source-matched local packet is outside the release package at:

`D:/AI Projects/Projects/Games/evio/review-evidence/2026-07-31/kyx-weapon-map-batch-rev4-a1ba98f`

## Nonclaims

- This is not human visual acceptance of the weapon, arms, HUD, portal, or map.
- The Quaternius shell remains a staging-review candidate and is not promoted
  to an accepted release asset.
- Static gallery captures do not prove movement feel, weapon feel, animation,
  combat, 2/4/8-player performance, or reconnect behavior.
- The canonical authority fixture and gameplay rules are unchanged.
