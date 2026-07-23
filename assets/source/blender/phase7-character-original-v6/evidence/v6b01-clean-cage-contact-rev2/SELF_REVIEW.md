# V6-B0.1 clean-cage/contact proof revision 2 strict self-review

Date: 2026-07-22

Decision: **SELF-REJECTED / CONTACT METHOD NOT APPROVED / NOT V6-B0.1 APPROVED / NOT V6-B / NOT V6-C / NOT G6**

Revision 2 is the bounded correction after the preserved revision 1 failure. It starts again from the immutable continuous V6-A anatomy, not from revision 1, either old proof-method file, revision 12, or any later character attempt. It lowers and contours the neckline, re-seats the subdivided garment surface, adds a recessed gasket behind the one clean panel, reduces stock/receiver opacity and radius, and adds separate orthographic contact crops. Direct inspection still rejects the method. No full character, full rifle, production rig, export, LOD, animation, or runtime integration was produced.

## Technical method state

- Garment cage: 186 vertices, 152/152 quad faces, one connected component, four explicit boundary loops (waist, neck, left armhole, right armhole), live initial and final Shrinkwrap passes, Subdivision, Solidify, and edge softening.
- Armor panel: 20 vertices, 12/12 quad faces, one connected component, one continuous perimeter, live projection to the garment, physical thickness, bevel, an oversize shrinkwrapped gasket bed, and two restrained backed fasteners.
- Contact hand: the complete continuous V6-A body is preserved. A temporary 16-bone hand/finger armature deforms the source hand; there are zero independent finger meshes or finger primitives.
- Immutable V6-A and pinned-concept hashes remained unchanged.

These facts verify construction intent and file integrity. They do not override the failed direct visual gate.

## Direct visual gate

| Required proof | Direct result | Decision |
| --- | --- | --- |
| Garment seats through neckline, shoulder, axilla, and waist | Torso penetration is corrected and the neckline is lower, but the lateral arm-hole surface stretches into fin-like wings behind the upper arm | **Fail** |
| One armor panel has a continuous manufactured perimeter, thickness, gasket/recess transition, attachment, and arm clearance | Perimeter, thickness, gasket lip, and two fasteners are visible; the broad plate still reads as a simplified shield and does not establish production chest-to-shoulder construction | **Partial / not approved** |
| Palm seats on grip and four digits visibly wrap the grip | The orthographic crop shows the continuous hand beside and partly behind the grip; no unobstructed palm seat or four surface contacts are visible | **Fail** |
| Index sits inside the guard at the trigger with clearance | The index crop shows separated digits below/beside the trigger region; the index is not seated on the trigger and clearance is not proven | **Fail** |
| Stock pad seats tangentially in the shoulder pocket | The dedicated crop shows the pad near the shoulder, but the pad/body interface is partially occluded and the rail termination does not prove a clean tangent seat | **Fail** |

## Why the bounded method stops here

1. A parameterized cylindrical ring cage can be topologically clean yet still fail the axilla. Shrinkwrapping deleted side bands cannot replace deliberate Poly Build edge flow around the acromion, pectoral insertion, scapular side, and arm-hole oval.
2. Coordinate-banded weights on a temporary scripted hand rig preserve the real five-digit mesh but do not pose it around a fixed ergonomic grip with reliable joint arcs. The visible fingers curl in space rather than onto the grip surface.
3. A grip, trigger, guard, and stock staged around a neutral low hand produce an apparatus-like vertical load path. Literal contact should be solved in a hand-first interactive file with final grip/guard geometry and the receiver hidden until all five contact requirements pass.
4. Additional scripted ring or weight tweaks would repeat the same method failure. This lane therefore stops before full production.

## Required next production method

- In interactive Blender, Poly Build a manual garment cage directly over the V6-A torso with explicit shoulder, axilla, neck, and arm-hole edge flow; inspect the unsmoothed side/three-quarter cage before Solidify.
- Build and lock the final grip, trigger, and guard first. Pose the continuous hand with a proper articulated metacarpal/finger rig or corrective lattice while viewing palm, four gripping digits, thumb opposition, index/trigger, and guard clearance simultaneously.
- Keep the receiver hidden and the stock sectioned until hand contact passes. Then place the stock pad in a separate shoulder-tangent camera and prove zero gap/penetration.
- Retopologize the armor outline interactively over the seated garment, with curvature and inset transitions derived from the pinned concept rather than a broad grid plate.

Start review with:

1. `renders/kyx-v6b01-clean-cage-contact-rev2-proof-board.png`
2. `renders/kyx-v6b01-clean-cage-contact-rev2-contact-palm-four-fingers-ortho.png`
3. `renders/kyx-v6b01-clean-cage-contact-rev2-contact-index-trigger-guard-ortho.png`
4. `renders/kyx-v6b01-clean-cage-contact-rev2-contact-stock-shoulder-ortho.png`
5. `authoring-report.json`

