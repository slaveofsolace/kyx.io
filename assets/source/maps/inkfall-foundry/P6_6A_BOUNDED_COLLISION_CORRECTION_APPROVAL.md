# P6.6A bounded Inkfall collision-correction approval

Status: **approved for implementation; not implemented here; P6.7/G5 remain open**

The root audit independently reran
`tests/integration/authority/inkfallAuthorityPlaytest.test.ts` at 8/8 and
recomputed all 12 hashes in `p6-6-verification.json` with zero mismatches. The
immutable final P6.6 suite remains `cec7553cd9d45701`: 2-player PASS,
4-player PASS, and 8-player FAIL. That evidence is sufficient to authorize only
the measured collision corrections below. It does not authorize a topology,
spawn, timing-band, movement-profile, or visual-composition rewrite.

## Authorized corrections

1. Replace the authority collision represented by the symmetric Archive stair
   `*_s01_t00` through `*_s01_t07` tread stacks with continuous walkable ramp
   support over the same authored horizontal run and 2 m rise. Keep the visible
   staircase, route endpoints, and topology links unchanged. The purpose is to
   remove the reproduced west `s01_t01` depenetration failure and `s01_t05`
   persistent snag without relaxing the accepted 350 mm step policy.
2. Add or extend a bounded authority-only terminal support on the east Archive
   approach so the transition from the observed 5,350 mm foot level to the
   6,000 mm Archive node is split into supported rises no greater than 350 mm.
   A support top near 5,650 mm is the measured candidate; the final dimensions
   must be recorded from the regenerated fixture.
3. Author a collision-clear fixed-9 m teleport corridor and supported landing
   pair for `ink_teleport_flank`. Locally clear the cast intersection with
   `map_collision_module_press_reactor_south` and trim or move
   `map_collision_route_teleport_exit_press_core_s00` away from the landing
   capsule. The reactor must not become globally non-solid. Entry/exit relocation
   is permitted only within the existing route hypothesis and must retain a
   supported 4 m landing pad.

## Measured addendum — symmetric west terminal support

Revision-2 attempt 1 is preserved under
`evidence/2026-07-22/phase-6-p6-6a-collision-revision2/failures/attempt-1-initial-bounded-candidate/`.
Removing the authorized west `S01` authority treads allowed the synthetic agents
to reach a previously unreachable mirror of the east terminal transition. Agent
slots 4 and 6 independently stopped at approximately
`(-22000, 5414, 14430)` while targeting `(-22000, 6000, 17000)`, with
`map_collision_node_archive_west` as the tick contact. The failure repeats the
same unsupported 5,350-to-6,000 mm terminal rise already measured on the east.

A symmetric **collision-only** west terminal support with a recorded top near
5,650 mm is therefore authorized. It must remain bounded to the existing west
Archive approach, split the rise into steps no greater than 350 mm, preserve the
visible render, node/link/spawn topology, timing bands, and revision-1 assets,
and pass the same full P6.2-P6.6 regression and overlay requirements. This
addendum does not authorize any other correction discovered later.

## Required preservation and regression

- Preserve the revision-1 render/collision GLBs, fixture, reports, and all P6.6
  attempts before generating a revision-2 candidate.
- Increment the map/package revision and recompute every GLB, fixture, package,
  and evidence hash. Never overwrite revision-1 identity in place.
- Keep the P6.1 seed, nine zones, 19 nodes, 27 links, 12 spawn candidates,
  strong-position hypotheses, and governing timing bands unchanged.
- Re-run P6.2 collision sweeps, P6.3 strict package validation, P6.4 spawn/LOS,
  P6.5 telemetry fixtures, and the exact P6.6 2/4/8-player tapes.
- Require zero depenetration failures, route snags, embeds, recovery/kill entry,
  or new analytical player overlaps on the corrected tapes. Preserve any failed
  revision-2 attempt before further edits.
- Render direct revision-1 versus revision-2 collision/debug overlays. If the
  visible render GLB changes, stop for a visual audit before continuing.

Passing the corrected automated tapes can support P6.6 completion only. P6.7
graybox lock, representative final art, real human fun/readability review,
performance, product integration, and G5 acceptance remain separate gates.
