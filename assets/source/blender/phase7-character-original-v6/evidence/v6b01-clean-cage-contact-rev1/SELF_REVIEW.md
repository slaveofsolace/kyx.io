# V6-B0.1 clean-cage/contact proof revision 1 strict self-review

Date: 2026-07-22

Decision: **SELF-REJECTED / METHOD PARTIALLY PROVEN / NOT V6-B0.1 APPROVED / NOT V6-B / NOT V6-C / NOT G6**

Revision 1 is the first clean-cage/contact specimen after the forbidden anatomy-face-mask approach was retired. It is preserved because it demonstrates two real method improvements, but the direct board fails the visual contact and fit contract. No full character, full rifle, production rig, export, LOD, animation, or runtime integration was produced.

## Credible method wins

- The garment is an independently drawn cage, not selected or duplicated anatomy faces: 162 vertices, 128/128 quad faces, one connected component, and four explicit boundary loops for waist, neck, left armhole, and right armhole.
- The armor specimen is one connected 4x5 quad retopology panel with one continuous manufactured perimeter, physical thickness, a multi-segment bevel, and three backed fasteners.
- The contact body remains the complete continuous V6-A body mesh. A temporary 16-bone hand/finger armature deforms the existing five-digit source hand; no finger tubes or independent digit meshes exist.
- V6-A and the pinned concept hashes remained unchanged.

## Direct visual failures

1. The neckline and upper shoulder rings flare into a poncho/collar silhouette instead of seating through the clavicle and axilla.
2. Body penetration is visible through the smoothed garment because the live modifier stack does not re-seat the subdivided result after smoothing.
3. The armor panel has a continuous perimeter, but its broad shield-like surface and exposed bolts read as a floating plate instead of a gasketed, recessed chest-to-shoulder assembly.
4. The contact camera is dominated by the two stock rails and the transparent receiver. It crops the palm and most fingers, so four-digit wrap, index-on-trigger, and trigger-guard clearance are not visible.
5. The stock path reaches the shoulder region, but the proof lacks an unobstructed orthographic tangent crop of the pad/body interface.

## Required bounded revision

- lower and contour the neckline/shoulder rings, re-seat the subdivided cage, and show side/three-quarter axilla and waist fit;
- seat the same single panel with a visible gasket/recess/edge transition and preserve an explicit arm-clearance gap;
- reduce receiver/rail visual dominance and add separate unobstructed orthographic crops for palm plus four gripping digits, index/trigger/guard clearance, and stock/shoulder contact;
- self-reject again if any literal contact must be inferred.

Start review with `renders/kyx-v6b01-clean-cage-contact-rev1-proof-board.png`.

