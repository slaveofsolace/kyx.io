# P6.6B residual correction work log

Date: 2026-07-22

## Scope held

Implemented only the authorization in
`assets/source/maps/inkfall-foundry/P6_6B_RESIDUAL_CORRECTION_APPROVAL.md`:
a versioned native revision-2 tape, the three exact idle-egress sequences, and
bounded tape/runner posture semantics on the existing teleport route.

No map, collision, topology, movement profile, physics adapter, authority
rate, route endpoint, waypoint order, start delay, spawn, capsule, teleport,
or metric-band change was made. Revision 1 and all prior evidence remain in
place. Revision 2 remains staged and non-default.

## Execution order

1. Recomputed the frozen attempt-9 baseline: 5100 ms end-to-end from
   61/7/36-tick constituents, three retained-agent overlaps, and no capsule or
   volume defect on slot 7.
2. Added native revision-2 suite identity and fixtures without changing the
   revision-1 runner output. Revision-1 tests passed 9/9 with the original
   suite/replay locks.
3. Added the exact slot 0, 2, and 3 egress steps. The first native run produced
   PASS/PASS/FAIL, zero overlaps over all 600 ticks, and only the unchanged
   5100 ms timing miss.
4. Preserved each posture probe before changing the tape again. Attempts 1-18
   retained every timing miss, overlap, depenetration, snag, unsafe-volume, and
   incomplete-route failure. No failure was truncated or relabeled.
5. Attempt 19 combined run -> slide -> crouch at the existing entry waypoints
   with the existing jump mode on the exit link. It produced 3950 ms,
   PASS/PASS/PASS, and zero issues through the full downstream route.
6. Captured a fresh immutable raw result and reran focused, authority,
   Blender, TypeScript, lint, and production-build regressions.

## Deterministic locks

- Suite: `143d09532b9c2b24`
- Scenario replays:
  - 2 player: `92aa8378d2e0d27e`
  - 4 player: `2010f3a3d1897f31`
  - 8 player: `909814a9d725d187`
- Spawn decisions:
  - 2 player: `ce3bd1acc10ee6b0`
  - 4 player: `2f490c09ee239e75`
  - 8 player: `4882737c21f26463`
- Telemetry snapshots:
  - 2 player: `5d37b370751328b4`
  - 4 player: `5712b51ece736e9e`
  - 8 player: `66dd524e72e35915`

The corrected test executes two in-process replays and requires byte-equivalent
results. The later 46-test focused matrix repeated the locked suite in a fresh
process.

## Validation record

- Corrected native test: 7/7 PASS.
- Focused P6.2-P6.6 revision matrix: 46/46 PASS in 6 files.
- Revision-2 offline P6.2: 15/15 PASS, 1646 samples.
- Revision-1 offline P6.2: 14/14 PASS, 1653 samples.
- Full authority: 170/171; the only failure was an out-of-slice P5.8B test
  timeout at 5000 ms. Its immediate isolated rerun passed 2/2. No P6.6 test
  failed.
- App TypeScript: PASS.
- Worker TypeScript: PASS.
- Simulation-source TypeScript: PASS.
- Simulation TypeScript: PASS.
- Focused lint: PASS.
- Repository lint: PASS.
- Production build: PASS with the pre-existing large-chunk advisory.

## Allowed claim and nonclaims

Allowed claim: `P6_6_CORRECTED_AUTOMATED_TAPES_PASS`.

Still open: P6.7 topology lock, G5, revision-2 promotion/shipping, human
fun/readability acceptance, visual acceptance, final art, performance, and
product integration.
