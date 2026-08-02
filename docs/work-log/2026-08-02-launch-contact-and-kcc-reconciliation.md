# Launch contact and Practice KCC reconciliation

Date: 2026-08-02

Status: automated implementation and desktop-browser runtime proof complete;
human visual and audio acceptance pending.

## Outcome

- Preserved the existing authoritative Launch v2 contract: 19.2 m/s2 gravity,
  zero bounces, zero restitution, player-body collision ignored, and one
  same-tick detonation on first qualifying world contact.
- Replaced the purple emissive placeholder projectile with the procedural
  `cutline_launch_canister_v1`: a velocity-aligned graphite/metal canister with
  restrained cyan charge bands and an amber contact cap.
- Replaced the generic purple blast with a dedicated cyan-white radial pressure
  pulse and added distinct Launch ejection/detonation audio profiles.
- Kept collision and per-target impulse events in the reliable authority stream,
  while suppressing their duplicate local HUD/audio cues. One detonation now
  produces one terminal `Launch pulse` presentation instead of sounding like
  repeated rebounds.
- Added Practice diagnostics for accepted throws, collisions, detonations,
  applied impulses, terminal tick identity, bounce count, canister creation,
  and terminal-pulse presentation.

## Causal defect found during runtime proof

The extended browser exercise reached a pre-existing deterministic Practice
failure that the former 300-tick regression stopped before observing. Bot 03
failed at authority tick 334 at the east-choice rail corner:

- feet: `(22457, -22, -3172)` mm
- desired translation: `(-189, 64, 45)` mm
- collider: `map_collision_guard_rail_ink_east_choice_s02_right`
- post-KCC reconciliation: `(10, 3, 30)` mm, 31.76 mm total

The KCC had reported that same collider, but the rising capsule changed closest
rail face after integer quantization and required 11.76 mm more than the 20 mm
contact skin. The adapter now permits the existing bounded 25 mm integer/GJK
tolerance only for upward motion and only when post-correction contacts are
already reported movement contacts. Purely planar movement receives no added
tolerance, so the sealed Revision 2 embedded-rail defect still fails closed.

The authority room now preserves player/tick/pose context when a movement step
fails, instead of surfacing an unlocated physics error.

## Consolidated verification

The package-manager wrapper attempted no tests because the migrated desktop
environment lacked Node on `PATH`; its dependency reconciliation stopped before
changing `node_modules`. All recorded commands below invoked repository-local
binaries with the bundled Node runtime and performed no install.

| Gate | Result |
| --- | --- |
| App, Worker, and sim-source/sim TypeScript | PASS |
| Full configured ESLint surface | PASS |
| Consolidated Launch/audio/room/client/KCC tests | PASS, 6 files / 38 tests |
| Production Vite build | PASS, 216 modules; existing chunk-size warning only |
| Local Practice authority regression | PASS, 5/5 including two deterministic 1+7 runs through 360 ticks and a separate Launch sequence |
| KCC safety boundary | PASS, new upward rail reconciliation succeeds and the exact Revision 2 planar embed still throws fail-closed |
| Desktop Chromium `/practice` | PASS, 1/1 in 91.9 seconds under the software renderer |

The passing browser run proved one shared eight-player authority runtime,
pointer lock, movement, an accepted E/Launch input, canister construction,
zero-bounce collision, same-tick terminal detonation, pulse presentation,
projectile cleanup, zero missed scheduler ticks, and zero page/console errors.

## Evidence

- `evidence/2026-08-02/inkfall-launch-contact-presentation.png`
- `evidence/2026-08-02/inkfall-launch-runtime-complete.png`
- `docs/audits/KYX_LAUNCH_CONTACT_HUMAN_CORTEX_2026-08-02.json`

## Nonclaims and next decision

- No claim that the new procedural audio has passed a human listening review.
- No claim that the canister or pulse has passed owner visual review.
- No fresh two-client online presentation capture in this checkpoint; online
  cue coalescing is source-implemented and compile-tested.
- No balance change, map-art acceptance, character acceptance, staging deploy,
  or production deploy occurred.

Next: owner review of the source-matched player-eye capture and a human-ear pass;
then capture the same single-terminal Launch behavior in a real two-client
online room before the final 2/4/8 matrix.
