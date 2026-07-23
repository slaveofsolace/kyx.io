# G5 bounded canonical-traversal snag repair — revision-3 candidate

Status: `REVISION_3_COLLISION_CANDIDATE_DETERMINISTIC_PASS`.

The P5.15 revision-2 defect is reproduced at feet position
`(-16497, 182, -637)`: the next `(+249, 0, +263)` mm cast hits
`map_collision_guard_rail_press_west_ink_s00_left` at 303 permille and the
full KCC move fails with `PHYSICS_DEPENETRATION_FAILED`.

The explicit non-default revision-3 candidate trims only 200 mm from that
rail's shared-junction start. The rail remains present, its length changes from
1348 mm to 1148 mm, and the junction-start apron changes from 3000 mm to
3200 mm. All other 338 authority solids are byte-equivalent after conversion,
the collider count remains 339, authority volumes and spawn are unchanged, and
the revision-2 render GLB is copied byte-for-byte.

The same exact revision-3 probe has a clear cast, applies the complete KCC
translation, records zero contacts, and ends with zero overlaps. Seven adjacent
lanes from -150 mm through +150 mm each reach within 100 mm of `press_west`
with zero recovery and zero overlap. The rail-side lanes retain bounded guard
contacts while continuing through the junction.

Canonical identities:

- revision 2 package: `77a7b6c41416f9caaf615f3af5dacda1153cee65a239c04f2004e30fc1663520`
- revision 2 fixture: `bf85e42731fd088e`
- revision 3 package: `c769eba175a7d1bcef92167b9f997a6b72d0e50c29f3d171bd66ce911a9ea161`
- revision 3 fixture: `31fea7ee73a12b91`
- revision 3 collision SHA-256: `5fc4f934676c96b9c06638640977fbff12c57585e56746d8129a75e59fd9a4ca`
- preserved render SHA-256: `90a9450491355ac6fe007a8ac337c7838df107d775c269366aaf7fc01ce4c634`

This package does not promote revision 3, change the default or locked
revision-2 identity, claim an exact product-runtime replay, claim human
acceptance, or claim G5 passed.
