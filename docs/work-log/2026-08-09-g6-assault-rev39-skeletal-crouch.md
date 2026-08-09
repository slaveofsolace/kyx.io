# G6 Assault Rev39 skeletal crouch — 2026-08-09

Parent checkpoint: `c9abcd56c01c5d64c35625261b60b6527fad305e`.

## Implemented

- Replaced remote-avatar whole-root Y scaling with a skeletal stance contract and
  a bounded render-only vertical offset. Worker collision and stance authority
  remain unchanged.
- Added the same stance interface to the procedural fallback.
- Resolved the sanitized Rev39 lower-body bone names actually emitted by glTF.
- Added a presentation-frame reset seam so additive aim, locomotion, and stance
  offsets cannot accumulate when an animation track is not rebound in a frame.
- Wired that seam through online avatars, local player bodies, bots, the menu
  character, and the loadout turntable.
- Extended diagnostics and the player-eye harness to fail on missing stance
  contracts, non-uniform whole-body scaling, incomplete crouch propagation, or
  runtime errors.

## Consolidated verification

- `git diff --check` — pass
- app TypeScript — pass
- targeted ESLint — pass
- focused Vitest — 4 files / 14 tests — pass
- staging-review Vite build — 229 modules — pass
- staging package closure — `STAGING_REVIEW_PACKAGE_VERIFIED`
- bounded Chrome runtime — pass, pointer lock acquired, zero runtime errors
- remote candidate/clip/weapon/support contact — 7/7 each
- skeletal stance contracts — 7/7
- whole-body squash count — 0

Final evidence: `evidence/2026-08-09/g6-assault-rev39-skeletal-crouch-v5`.

## Human status

Technical pass, visual iterate. The boots are planted and the accumulated
somersault/squash defects are closed. The crouch still needs an authored
weapon-ready upper-body layer, better center of mass, and transition/locomotion
clips. Rev39 itself remains review-only because its pinched waist, weak torso
mass, material uniformity, and lack of true lower LODs are unresolved.

## Next action

Build one stronger armored Assault derivative with real LOD1/LOD2 and an authored
crouch locomotion/contact set. Do not propagate a role family or claim release
acceptance before that single role passes player-eye review.
