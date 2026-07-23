# P6.7 Inkfall Foundry graybox lock work log

Date: 2026-07-22

## Scope held

Promoted native `inkfall_foundry@2` from a staged revision to the locked Phase
6 graybox while keeping `DEFAULT_MAP_REVISION = 1`. The change adds only lock
metadata, explicit catalog lock selection, a prospective modular art-kit
dimension contract, validation, and evidence.

No Blender source, render GLB, collision GLB, package v1/v2, topology seed,
spawn fixture, telemetry fixture, playtest tape, movement profile, physics
adapter, route band, authority behavior, or prior evidence artifact was
changed. No deployment or product selection was performed.

## Implementation

1. Added `runtime/graybox-lock.p6-7.v1.json` with the exact map/movement/
   physics identity, twelve frozen source hashes, thirteen canonical gameplay
   fingerprints, frozen counts, P6.6B automated result, mutation rules, and
   explicit nonclaims.
2. Added `art-kit/graybox-dimensions.p6-7.v1.json` with 16 required module
   families, 37 versioned modules, semantic material slots, pivot/grid rules,
   authority-collision boundaries, critical clearances, and exact parity for
   all six seed modules.
3. Added a distinct catalog lock selector and lookup functions. Revision 2 is
   now the locked graybox; revision 1 remains the runtime default.
4. Added a seven-test strict lock suite that recomputes every frozen source
   hash and canonical fingerprint, validates catalog separation, verifies the
   exact corrected automated result, and checks all art-kit dimensions and
   nonclaims.
5. Added an independent evidence verifier with immutable `wx` output. It is
   run only after the final inventories are sealed.

## Preserved failures

- The first focused test found a 2900 mm prospective flank-door outer envelope
  that did not snap to the 250 mm structural fine grid. The outer envelope was
  corrected to 3000 mm; the locked 1400 x 2400 mm clear opening never changed.
- The second focused test found that exact seed modules such as the 2400 x
  1250 x 600 mm half cover are documented clearance exceptions rather than
  250 mm grid multiples. The contract now labels the three affected interfaces
  explicitly instead of rounding them.
- The first revision-2 Blender rerun supplied `PASS` as the expected build
  report status. The frozen report correctly contains
  `P6_6A_BOUNDED_COLLISION_REVISION_2_CANDIDATE`, so the validator preserved a
  one-assertion failure. A separately named rerun with the exact status passed
  15/15. The failure remains at
  `adjacent/p6-2-revision2-lock-rerun.json`.
- The first immutable evidence-verifier run passed 14/15 checks. Its only
  failure was a verifier bug: it compared the four adjacent-matrix counters to
  an exact object while the record also intentionally carried a `coverage`
  array. The failed output remains at `p6-7-verification.json`, SHA-256
  `4d234c7589f4ccc654c4addf3257d34da36ab30072964f7f0a0496579a137ac1`.
  The verifier now checks the four counters individually and writes the retry
  to a new immutable path.

The two focused failures are recorded in
`failures/p6-7-contract-test-attempts.json`. No failure was overwritten or
converted into a pass.

## Validation

- Focused P6.7 lock suite: 7/7 PASS.
- Adjacent map/content/physics/spawn/telemetry/playtest matrix: 58/58 PASS in
  8 files.
- Revision-2 offline Blender sweep: 15/15 PASS, 25 physical links, 12 spawns,
  1646 samples.
- Revision-1 offline Blender regression: 14/14 PASS, 25 physical links, 12
  spawns, 1653 samples.
- Application, Worker, simulation-source, and simulation TypeScript: PASS.
- Focused lint: PASS.
- Repository lint: PASS.
- Production build: PASS with the existing large-chunk advisory.

The sealed P6.6B verifier remains the broad regression basis and is included in
the lock source set at SHA-256
`7567b847fba9517fd8b70f018dfb7e9a74e88d582d347cdd0a78bcbe6afbebd4`.

## Claim boundary

Allowed claim: `P6_7_GRAYBOX_LOCK_PASS`.

Still open: G5, human fun/readability acceptance, visual acceptance, final
art, named-tier performance/soak, product integration, revision-2 default or
shipping promotion, and deployment.
