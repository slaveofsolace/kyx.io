# Inkfall Foundry revision-2 staging evidence

Status: **revision 2 is staged and validated through P6.5; P6.6 is blocked and
the default remains revision 1.** This is not a P6.6, P6.7, G5, final-art, or
human-acceptance claim.

## Frozen candidate identity

- Map package: `inkfall_foundry@2`
- Package digest: `77a7b6c41416f9caaf615f3af5dacda1153cee65a239c04f2004e30fc1663520`
- Authority fixture hash: `bf85e42731fd088e`
- Render: 346 nodes, 613564 bytes,
  `90a9450491355ac6fe007a8ac337c7838df107d775c269366aaf7fc01ce4c634`
- Collision: 339 nodes, 604228 bytes,
  `cd661c12534dd7d2362c862f4ff9f9177cb9f8ef0cea85d14a3b18e3dfb1380e`
- The render is byte-identical to revision 1. Revision-1 files were not
  overwritten.

## P6.2-P6.5 result

- P6.2: 15/15 offline assertions, 25/25 physical links, 12/12 spawn
  candidates, and 1646 dense capsule samples passed. The two approved Archive
  continuous-ramp exceptions and the revision-2 teleport landing/trim contract
  are recorded explicitly in the report.
- P6.3: the strict loader accepts the real revision-2 manifest and GLBs as 339
  authority boxes plus two authority volumes. Revision 2 is registered but is
  not the default.
- P6.4: all six native revision-2 spawn fixtures pass with revision-2 decision
  hashes.
- P6.5: the 18-event all-family fixture passes with snapshot hash
  `b1fe23e2b3ba0570`.
- Revision-1 offline P6.2 regression: 14/14 and 1653 capsule samples.
  Focused revision regression: 44/44. Full authority regression: 143/143.
  Full lint: 214 files, zero errors or warnings. The staged slice type-checks
  with zero errors, both simulation TypeScript targets pass, and the production
  build passes.
- The repository-wide main run is 567/568 because an out-of-slice Worker
  attachment-version test is concurrently inconsistent; the same Worker area
  accounts for the two repository-wide TypeScript findings. Exact diagnostics
  are preserved in `revision2-staging-report.json`.

## P6.6 remains blocked

The clean frozen-candidate rerun remains suite `f715642abbc126f0`, with
FAIL/FAIL/FAIL and seven adapted-runner issues. Native revision-2 P6.4 fixtures
remove the three revision-1 binding mismatches only. These four real P6.6
findings remain:

1. Tick 430: slots 0 `(13895,161,-2113)` and 7 `(14343,189,-2325)` overlap.
2. Tick 430: slots 3 `(7887,-2814,-15939)` and 6 `(8339,-2830,-16315)` overlap.
3. Tick 470: slots 2 `(-7941,-2830,-19988)` and 6
   `(-7478,-2830,-19623)` overlap.
4. `ink_teleport_flank` measures 5100 ms against the unchanged 1800-4000 ms
   governing band.

No further geometry, timing, tape, topology, or retained-agent semantics change
was made. The JSON report records proposed separate correction/semantics options
only; none is implemented or treated as acceptance.

## Primary evidence

- `revision2-staging-report.json`
- `assets/source/maps/inkfall-foundry/revisions/revision-2/validation/playable-surface-validation.revision2.json`
- `assets/source/maps/inkfall-foundry/revisions/revision-2/overlay/collision-overlay-report.json`
- `assets/source/maps/inkfall-foundry/revisions/revision-2/overlay/revision1-vs-candidate-collision-diff-plan.png`
- `assets/source/maps/inkfall-foundry/revisions/revision-2/overlay/revision1-vs-candidate-collision-diff-oblique.png`
