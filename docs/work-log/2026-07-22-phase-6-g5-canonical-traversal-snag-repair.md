# Phase 6 / G5 bounded canonical-traversal snag repair

Status: `REVISION_3_COLLISION_CANDIDATE_DETERMINISTIC_PASS`.

## Defect and diagnosis

P5.15 stopped on `west_choice_press` at feet position
`(-16497, 182, -637)`, 3631.64 mm from `press_west`, after 15 bounded
browser recoveries with zero displacement. A focused real-Rapier reproduction
proved that the starting standing capsule is clear, but the next
`(+249, 0, +263)` mm movement cast hits
`map_collision_guard_rail_press_west_ink_s00_left` at 303 permille. The full
KCC move then fails its final clear assertion with
`PHYSICS_DEPENETRATION_FAILED`.

This is an authored shared-junction collision defect, not an ACK, session,
transport, input, or movement-solver defect.

## Bounded revision-3 candidate

Locked revision 2 was not modified. Revision 3 opens the preserved revision-2
Blender source and changes one authority collider only:

- left `press_west_ink` segment-0 rail length: 1348 mm to 1148 mm;
- shared-junction start apron: 3000 mm to 3200 mm;
- far-end apron: unchanged at 3000 mm;
- collider cardinality: unchanged at 339;
- all 338 non-target converted solid records: unchanged;
- spawn and authority volumes: unchanged;
- render GLB: byte-identical to locked revision 2.

The candidate is bundled as explicit revision 3 while the product default
remains revision 1 and the locked graybox remains revision 2.

## Identities

- revision-3 package digest:
  `c769eba175a7d1bcef92167b9f997a6b72d0e50c29f3d171bd66ce911a9ea161`
- revision-3 fixture hash: `31fea7ee73a12b91`
- revision-3 collision SHA-256:
  `5fc4f934676c96b9c06638640977fbff12c57585e56746d8129a75e59fd9a4ca`
- preserved render SHA-256:
  `90a9450491355ac6fe007a8ac337c7838df107d775c269366aaf7fc01ce4c634`

## Deterministic result

The exact revision-3 cast is clear, the complete KCC translation is applied,
it records zero contacts, and the final capsule has zero overlaps. Seven
adjacent lanes from -150 mm through +150 mm each complete twelve 300 mm-or-less
steps, reach within 100 mm of `press_west`, and record zero recoveries and zero
overlaps. The three rail-side lanes retain one or two guard contacts without
snagging; the canonical and opposite-side lanes have zero rail contacts.

Regression evidence:

- focused candidate and package tests: 9/9 PASS;
- adjacent Inkfall application suite: 68/68 PASS across 11 files;
- focused ESLint: PASS;
- asset manifest validator: 0 errors, 33 pre-existing legacy-asset warnings.
- production Vite build: PASS with the existing large-chunk advisory.

The repository-wide application TypeScript check was attempted while the
separate ACK lane was editing `tests/unit/worker/security.test.ts`; it stopped
on that unrelated in-flight test typing mismatch. No ACK/session/Worker file
was changed by this repair.

## Evidence and remaining boundary

Evidence root:
`evidence/2026-07-22/phase-6-g5-canonical-traversal-snag-repair/runtime-v1`

The evidence manifest SHA-256 is
`0127e61c87f27ec7e9b49d8db80ade6453c09ef6eae54f4a1456983268e9fc8f`.

Revision 3 is not default, promoted, shipping, or deployed. A separate exact
product-runtime canonical replay must select revision 3 and prove zero browser
recovery before any promotion or G5 claim. Human acceptance remains open.
