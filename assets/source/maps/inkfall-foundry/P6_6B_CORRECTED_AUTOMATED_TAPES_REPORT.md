# P6.6B corrected automated tapes report

Status: **`P6_6_CORRECTED_AUTOMATED_TAPES_PASS`**. This is a synthetic,
automated revision-2 tape result only. P6.7, G5, revision-2 promotion, human
acceptance, visual acceptance, final art, performance, and product integration
remain open.

## Frozen binding

- Map package: `inkfall_foundry@2`
- Package digest:
  `77a7b6c41416f9caaf615f3af5dacda1153cee65a239c04f2004e30fc1663520`
- Authority fixture: `bf85e42731fd088e`
- Collision SHA-256:
  `cd661c12534dd7d2362c862f4ff9f9177cb9f8ef0cea85d14a3b18e3dfb1380e`
- Render SHA-256:
  `90a9450491355ac6fe007a8ac337c7838df107d775c269366aaf7fc01ce4c634`
  (unchanged from revision 1)
- Topology seed SHA-256:
  `562c5ea8711a1eb1f4a08a31c8872c68c23778aa159110a107c9da0b74e67a63`
- Movement profile: `phase3_hypothesis_v1`, revision 1
- Physics adapter: `0.19.3`
- Authority rate: 20 Hz

Revision 2 remains staged and non-default. No geometry, collision, topology,
spawn, route endpoint, waypoint order, movement-profile, physics, capsule,
teleport, authority-rate, or timing-band value changed in P6.6B.

## Authorized tape changes

The new native tape is
`runtime/playtest-tapes.p6-6.v2.json`; revision-1 tape
`runtime/playtest-tapes.p6-6.v1.json` remains unchanged.

The 8-player tape appends exactly the three approved retained-agent egress
sequences:

1. Slot 0: `press_east_choice` forward/run, then `east_choice_spawn`
   forward/run.
2. Slot 2: `ink_west_mid_w` reverse/run, `west_choice_ink` reverse/run, then
   `west_spawn_choice` reverse/run.
3. Slot 3: `ink_mid_w_mid_e` reverse/run, then
   `ink_mid_w_teleport_entry` forward/crouch.

Slot 7 keeps the original links, endpoints, waypoint order, metric, and start
delay. Its bounded posture semantics are:

- `ink_mid_w_teleport_entry`: run; at waypoint target 1 after 9 authority
  ticks, slide; at waypoint target 2, crouch.
- `teleport_shortcut`: unchanged teleport.
- `teleport_exit_press_core`: the already-authored jump mode.

All completed agents remain physical and included in analytical overlap
sampling through the full 600-tick scenario bound.

## Corrected result

- Scenario status: `PASS / PASS / PASS`
- Issue count: 0
- Suite hash: `143d09532b9c2b24`
- Scenario replay hashes:
  `92aa8378d2e0d27e`, `2010f3a3d1897f31`, `909814a9d725d187`
- Native spawn-decision hashes:
  `ce3bd1acc10ee6b0`, `2f490c09ee239e75`, `4882737c21f26463`
- `ink_teleport_flank`: 79 ticks / 3950 ms against the unchanged
  1800-4000 ms band
  - `ink_mid_w_teleport_entry`: 40 ticks
  - `teleport_shortcut`: 6 ticks
  - `teleport_exit_press_core`: 35 ticks
- `archive_drop_flank`: 66 ticks / 3300 ms against 2500-5000 ms
- Every other governing metric remains inside its original band.
- Across every complete scenario bound: zero capsule embeds, snags,
  depenetration failures, route incompletes, recovery entries, kill entries,
  and analytical player overlaps.

Nineteen bounded results are preserved. Attempts 1-18 remain diagnostic
failures. Attempt 19 first combined the exact-band entry posture with the
authored exit jump and produced the zero-issue corrected result; it was written
under the preallocated `failures/` path before its outcome was known, and a
separate final raw result was then captured under `corrected/`.

## Regression result

- Native revision-2 P6.2 Blender sweep: PASS, 15/15 assertions, 25 physical
  links, 12 spawns, 1646 dense capsule samples.
- Revision-1 P6.2 Blender regression: PASS, 14/14 assertions, 25 physical
  links, 12 spawns, 1653 samples.
- Focused revision matrix: 46/46 tests across 6 files.
- Full authority run: 170/171; an out-of-slice P5.8B impairment test exceeded
  its 5-second per-test timeout under the combined run. Its immediate isolated
  rerun passed 2/2 in 6.48 seconds. This transient timeout is preserved and is
  not converted into P6.6 evidence.
- Application, Worker, simulation-source, and simulation TypeScript: PASS.
- Focused and repository lint: PASS.
- Production build: PASS, with the existing large-chunk advisory only.

## Evidence and nonclaims

- Final raw result:
  `evidence/2026-07-22/phase-6-p6-6b-residual-correction/corrected/authority-playtest-raw.json`
- Probe matrix:
  `evidence/2026-07-22/phase-6-p6-6b-residual-correction/corrected/posture-probe-matrix.json`
- Summary and verification:
  `evidence/2026-07-22/phase-6-p6-6b-residual-correction/corrected/`

This report does not claim `P6_7_TOPOLOGY_LOCK_PASSED`, `G5_PASSED`,
revision-2 default/shipping status, human fun/readability acceptance, visual
acceptance, final art, performance acceptance, or product integration.
