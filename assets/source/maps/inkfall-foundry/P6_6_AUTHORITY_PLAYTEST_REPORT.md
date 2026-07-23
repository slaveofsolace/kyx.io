# P6.6 automated authority playtest foundation

Status: **PARTIAL — 2-player and 4-player synthetic tapes pass; 8-player tape remains blocked. G5 is not passed.**

This phase is an automated, deterministic, non-human authority exercise. It is not a human fun, readability, or visual-acceptance playtest. No P6.1 topology seed, P6.2/P6.3 map geometry, spawn package, or production runtime was changed in response to these results.

## Immutable binding

- Map: `inkfall_foundry`, revision `1`
- Package digest: `a593ad82b2e9f713a4a8d775002c1583c0fb3dfd3acdf004ba7bd6b144173267`
- Authority fixture: `2a0a446a0b152395`, 346 fixed collision boxes
- P6.1 topology seed SHA-256: `562c5ea8711a1eb1f4a08a31c8872c68c23778aa159110a107c9da0b74e67a63`
- Movement: `phase3_hypothesis_v1` revision 1, deterministic Rapier adapter `0.19.3`, 20 Hz
- P6.4 spawn decisions: `2ff86027cd9ca213`, `aabbcef2ce8f30cc`, `196138c60153ded0`
- Final suite hash: `cec7553cd9d45701`
- Scenario replay hashes: `0f7f6c2965a594c6`, `88ce02f1c029c9d9`, `c47c2acd6ab3541e`

## Passing measurements

| Occupancy | Metric | Measured | Governing band | Result |
| --- | --- | ---: | ---: | --- |
| 2 players | west/east spawn to first choice | 1.60 / 1.60 s | 1.00–2.50 s | PASS |
| 2 players | west/east probable Press contact | 5.45 / 5.20 s | 4.00–9.00 s | PASS |
| 2 players | fast central crossing | 5.30 s | 4.00–7.00 s | PASS |
| 4 players | west/east probable Press contact | 4.80 / 5.30 s | 4.00–9.00 s | PASS |
| 4 players | west/east probable Ink contact | 8.45 / 8.75 s | 4.00–9.00 s | PASS |
| 8 players | west/east probable Press contact | 4.80 / 5.20 s | 4.00–9.00 s | PASS |
| 8 players | west/east probable Ink contact | 8.45 / 8.75 s | 4.00–9.00 s | PASS |

The 2-player and 4-player scenarios completed every tape with zero capsule embeds, zero analytical body overlaps, zero route snags, zero route entries into recovery/kill volumes, valid P6.4 spawn decisions with no direct spawn line of sight, and valid privacy-quantized P6.5 telemetry. Their recovery-only, kill-priority, and post-recovery escape probes also passed.

## Required no-mutation report

The final 8-player tape is an intentional failure artifact. Its Archive and teleport measurements are incomplete and must not be converted into a PASS label.

### West Archive ascent

- Expected: `spawn_to_archive_contact_west` completes within 4.00–9.00 s; the same ascent then permits the 15.00–28.00 s outer-loop measurement.
- Slot 4, tick 91: `PHYSICS_DEPENETRATION_FAILED` on `west_choice_archive`, waypoint 2. Position `(-25265,2571,7778)`, target `(-26000,4000,12000)`, velocity `(206,0,41)`. Support was `map_collision_stair_west_choice_archive_s01_t01`.
- The tape had contacted `map_collision_route_west_choice_archive_s00`, `map_collision_stair_west_choice_archive_s01_t02`, and `map_collision_waypoint_west_choice_archive_w01` before halting.
- Independent slot 6, tick 166: after 40 ticks with less than 250 mm progress, position `(-25566,3386,9836)`, target `(-26000,4000,12000)`, distance 2,291 mm, zero velocity. Both support and current contact were `map_collision_stair_west_choice_archive_s01_t05`.
- Observed: Archive contact and full outer-loop time remain unmeasured after the 650-tick bound.

Smallest coherent candidate correction for audit: keep the visible staircase and endpoints, but replace the authority collision for the symmetric `*_s01_t00`–`*_s01_t07` tread stacks with one continuous walkable collision ramp (approximately the already-authored 2 m rise over 5 m horizontal run), or otherwise eliminate the two reproduced Rapier seam/depenetration failures. Re-run P6.2 sweeps and this exact tape before accepting the change. No such correction is applied here.

### East Archive terminal rise

- Expected: `spawn_to_archive_contact_east` completes within 4.00–9.00 s.
- Slot 5, tick 161: after 40 ticks with less than 250 mm progress, position `(21992,5350,14430)`, target `(22000,6000,17000)`, distance 2,651 mm, velocity `(1,11,0)`.
- Support was `map_collision_route_press_east_archive_s02`; the blocking contact was `map_collision_node_archive_east`.
- The node support top is 6,000 mm while the observed incoming foot level is about 5,350 mm, leaving a 650 mm terminal rise against a 350 mm configured step limit.

Smallest candidate correction for audit: add/extend one authority-only terminal tread/ramp so the remaining rise is split into steps no greater than 350 mm (for example an intermediate support top near 5,650 mm), while preserving the 6,000 mm Archive node and visible composition. No correction is applied here.

### Teleport shortcut

- Expected: `ink_teleport_flank` completes in 1.80–4.00 s, landing on the authored exit `(1000,1000,-5000)`.
- The harness moved to the authored entry, then aimed directly at the authored exit; it did not manufacture a 9 m overshoot.
- Slot 7, tick 145: the authority controller reported only a partial teleport from `(-4006,-2940,-10024)` to `(-1694,-1120,-7703)`.
- The authority cast blocker was `map_collision_module_press_reactor_south`. The partial destination had no ground support; the tape entered recovery at tick 155, `(569,-3870,-5360)`, and kill at tick 157, `(1178,-5020,-4846)`.
- The authored exit itself is supported by `map_collision_node_teleport_exit`, but a capsule overlap probe also names `map_collision_route_teleport_exit_press_core_s00` at that exact endpoint.
- A bounded yaw/pitch search found no unobstructed, grounded 9 m destination from the authored entry in the nearby corridor. This is not a waypoint-tolerance failure.

Smallest coherent candidate correction for audit: author a collision-clear teleport corridor and landing pair compatible with the fixed 9 m authority tool. That requires clearing the `press_reactor_south` cast intersection and trimming the exit-route collider away from the landing capsule, or relocating the entry/exit plus a supported 4 m landing pad. Making the reactor non-solid globally is not recommended. No correction is applied here.

### Secondary occupancy observation

Slots 4 and 6 analytically overlapped at tick 120 only after slot 4 had halted on the failed west stair. This is classified as a consequence of the persistent traversal failure, not independent evidence that the normal 8-player spawn arrangement is unsafe.

## Evidence and decision

- Definition: `runtime/playtest-tapes.p6-6.v1.json`
- Raw result: `evidence/2026-07-22/phase-6-p6-6-authority-playtest/authority-playtest-raw.json`
- Summary: `evidence/2026-07-22/phase-6-p6-6-authority-playtest/authority-playtest-summary.json`
- Preserved failures: `evidence/2026-07-22/phase-6-p6-6-authority-playtest/failures/`
- Work log: `evidence/2026-07-22/phase-6-p6-6-authority-playtest/P6_6_WORK_LOG.md`
- Verification: `evidence/2026-07-22/phase-6-p6-6-authority-playtest/p6-6-verification.json`

The dedicated regression file passed all 8 assertions, and the broader authority matrix passed 111/111 tests across 13 files. The final main-project TypeScript check had zero diagnostics, and P6.6 ESLint findings were zero. A write-disabled production build contained no P6.6 runner markers.

Decision: **`REPORT_REQUIRED_BEFORE_PACKAGE_CHANGE`**. P6.7 topology lock, final art, human fun/readability acceptance, and G5 remain open.
