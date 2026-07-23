# P6.6B residual tape-correction approval

Status: **approved for bounded implementation; not implemented here; P6.6,
P6.7, and G5 remain open**

This addendum follows the independent audit of the frozen native revision-2
candidate. It authorizes only a new, versioned native revision-2 playtest tape
and a bounded tape/runner posture-semantics iteration. It does not authorize a
map, collision, topology, movement-profile, production-runtime, metric, or
acceptance-contract change.

## Frozen starting point

- Candidate: `inkfall_foundry@2`
- Package digest:
  `77a7b6c41416f9caaf615f3af5dacda1153cee65a239c04f2004e30fc1663520`
- Authority fixture: `bf85e42731fd088e`
- Candidate collision SHA-256:
  `cd661c12534dd7d2362c862f4ff9f9177cb9f8ef0cea85d14a3b18e3dfb1380e`
- Candidate render SHA-256:
  `90a9450491355ac6fe007a8ac337c7838df107d775c269366aaf7fc01ce4c634`
  (byte-identical to revision 1)
- Adapted candidate suite: `f715642abbc126f0`, still FAIL/FAIL/FAIL.
- Real residuals before this authorization: three retained-agent analytical
  overlaps and an end-to-end `ink_teleport_flank` measurement of 5100 ms
  against the unchanged 1800-4000 ms governing band. The adapted result also
  contains three obsolete revision-1 spawn-binding mismatches; native
  revision-2 fixtures must replace those bindings rather than waive them.

All existing revision-1 and revision-2 assets, failed attempts, reports,
hashes, and evidence are immutable inputs to this work.

## Authorization 1: versioned native revision-2 tape

Create a new native revision-2 P6.6 tape. Do not edit or overwrite
`runtime/playtest-tapes.p6-6.v1.json`. The new tape must bind directly to the
revision-2 package, authority fixture, and native revision-2 P6.4 spawn
fixtures.

For `synthetic_8_player_full_route_occupancy`, preserve all eight physical
agents and all existing measured route steps, then add only these measured
post-completion idle-egress steps:

1. Slot 0: `press_east_choice` forward/run, then `east_choice_spawn`
   forward/run.
2. Slot 2: `ink_west_mid_w` reverse/run, then `west_choice_ink` reverse/run,
   then `west_spawn_choice` reverse/run.
3. Slot 3: `ink_mid_w_mid_e` reverse/run, then
   `ink_mid_w_teleport_entry` forward/crouch.

The audit-only adapted run using exactly those egress sequences eliminated all
three retained-agent overlaps and produced zero retained-agent overlaps. Its
only remaining records were the three obsolete
revision-1 spawn-binding mismatches and the 5100 ms `ink_teleport_flank` miss.
That read-only result authorizes the exact sequence above; it is not itself a
P6.6 pass and does not authorize any other start delay, route, idle target, or
agent-lifecycle change.

Completed agents must remain present, physical, and included in analytical
overlap sampling through the scenario bound. No agent may be despawned,
disabled, made non-solid, teleported out of the test, omitted from sampling, or
granted an overlap exemption.

## Authorization 2: measure-then-adjust teleport posture semantics

For `ink_teleport_flank`, first record deterministic constituent timing for the
existing end-to-end route across `ink_mid_w_teleport_entry`,
`teleport_shortcut`, and `teleport_exit_press_core`. After measurement, adjust
only the versioned tape/runner's use and transition points of already-supported
movement postures on that same route. The purpose is to find the smallest
posture-only sequence that completes the existing end-to-end metric in
1800-4000 ms without causing any later defect.

The movement profile, movement constants, physics adapter, authority rate,
teleport behavior, route endpoints, waypoint order, topology, geometry, and
collision remain frozen. If a posture transition cannot be expressed without
changing production movement or map authority, stop and request a separate
approval.

The independent probes are diagnostic failures, not approved final semantics:

- slide measured 5000 ms and later depenetrated;
- run snagged or remained incomplete at
  `map_collision_module_ink_slide_gate_roof`;
- staged run-then-crouch measured 4100 ms and later depenetrated at
  `map_collision_stair_press_west_archive_s00_t06`.

None of those probes may be relabeled as passing, and their downstream defects
may not be truncated from the scenario. Further iteration must remain within
the posture-only boundary above and preserve the full post-teleport route.

## Explicitly forbidden

- Substituting teleport actuation time, a sub-link time, or any newly invented
  measure for the existing end-to-end `ink_teleport_flank` metric.
- Widening, moving, deleting, special-casing, or otherwise weakening the
  1800-4000 ms band or any other governing timing band.
- Changing map geometry, collision, render geometry, topology, nodes, links,
  spawns, route endpoints, waypoint order, or package identity.
- Changing Phase 3 movement-profile values, physics behavior, teleport
  distance, capsule dimensions, step policy, simulation rate, or production
  player movement.
- Despawning or excluding completed agents, suppressing overlap samples,
  changing overlap dimensions/thresholds, granting pairwise exemptions, or
  classifying a retained-agent overlap as harmless.
- Reordering or delaying active measured routes to manufacture clearance. Only
  the three exact post-completion egress sequences above are authorized.
- Editing revision-1 tapes/assets, overwriting failed artifacts, replacing
  immutable evidence, or promoting revision 2 as the default before all
  required gates pass.

## Required validation for a corrected P6.6 result

Every item below is required; a partial result remains blocked.

1. Save the new tape under a new version and record its SHA-256, native
   revision-2 package/fixture/spawn bindings, runner source inventory, and
   deterministic suite/replay hashes. Preserve every failed iteration before
   the next change.
2. Run the unchanged 2-, 4-, and 8-player scenarios against the native
   revision-2 package. All three scenario statuses must be PASS with zero
   issues; adapter binding mismatches are failures, not ignorable noise.
3. Measure the original end-to-end `ink_teleport_flank` metric at 1800-4000 ms
   inclusive. Report its constituent link timings as diagnostics only. Every
   other governing metric must remain inside its existing band.
4. Across the complete scenario bounds, require zero capsule embeds, physics
   depenetration failures, route snags/incompletes, recovery-volume entries,
   kill-volume entries, and analytical player overlaps. This includes all
   eight retained agents after their measured routes complete.
5. Prove the three authorized egress sequences are present exactly as written
   and that no other route, start delay, spawn, lifecycle, collision, geometry,
   or timing-band field changed relative to the frozen inputs.
6. Run repeated clean deterministic replays and require identical suite,
   scenario, spawn-decision, and replay hashes. A nondeterministic pass is a
   failure.
7. Re-run P6.2 collision/playability sweeps, P6.3 strict package loading, P6.4
   native spawn/LOS fixtures, P6.5 telemetry, the revision-1 regression, and
   the focused revision matrix. Require all to pass with no unexpected render
   or package-identity change.
8. Run the relevant TypeScript targets, lint, automated test matrices, and
   write-disabled production build. Distinguish and preserve any proven
   out-of-slice failure; do not convert it into a P6.6 pass.
9. Produce a new immutable raw result, summary, verification record, and work
   log. The verification must recompute every recorded source and evidence
   hash from disk and must state every nonclaim below.

## Acceptance boundary and nonclaims

Passing all validation above may support only the claim
`P6_6_CORRECTED_AUTOMATED_TAPES_PASS`. It does not itself promote revision 2 or
establish any of the following:

- `P6_7_TOPOLOGY_LOCK_PASSED`
- `G5_PASSED`
- `REVISION_2_DEFAULT_OR_SHIPPING`
- `HUMAN_FUN_OR_READABILITY_ACCEPTED`
- `VISUAL_ACCEPTANCE_PASSED`
- `FINAL_ART_COMPLETE`
- `PERFORMANCE_OR_PRODUCT_INTEGRATION_ACCEPTED`

P6.7, G5, promotion, human playtesting, visual review, final art, performance,
and product integration remain separate open decisions after any corrected
automated P6.6 result.
