# V6-C Visual Benchmark Revision 8 Review

## Decision

`SELF_REJECTED_FOR_V6-C`

`NOT_ACCEPTED` / `NOT_V6-C` / `NOT_G6`

Revision 8 materially replaces revision 7's floating foam patches, decorative cable arcs, egg-only helmet, and soft slab rifle with a coherent construction vocabulary. It still does not meet the pinned production target. The direct and component renders retain a procedural polygonal-blockout read, so this revision must not advance the gate.

## What materially improved

- Revision 8 was built directly from the accepted V6-A body, not from revision 7 geometry; V6-A proportions and mesh geometry remain authoritative and unchanged.
- The torso is now one front-side-back tapered cuirass system with explicit clavicle, sternum, rib, waist, scapular, lumbar, and back-spine interfaces.
- Recessed seams and flush fasteners replace revision 7's cable-like rib arcs and cloud-like ivory patches.
- The helmet is sealed and faceted, with a complete visor perimeter, jaw rails, crown plate, temple modules, and a separate occipital vent housing.
- Limb protection now exposes woven flex zones between shoulder, elbow, forearm, thigh, knee, shin, ankle, and boot components.
- The rifle now has real open stock negative space, a stepped receiver, ejection area, magazine well and magazine, trigger guard, support-hand zone, vented handguard, rooted barrel, muzzle device, and indexed top rail.
- The armored silhouette remains readable at 5 m, 20 m, and 40 m.

## Why it is self-rejected

- The front and rear cuirass are still dominated by broad, flat extruded faces. Their sidewalls and overlaps read as assembled profile prisms rather than body-conforming production hard-surface armor.
- Shoulder, upper-arm, forearm, thigh, knee, and shin pieces remain visibly polygonal pads. Their transition surfaces do not yet follow anatomy with the compound curvature, controlled thickness, and nested bevel hierarchy shown by the pinned target.
- The helmet no longer reads as an egg, but its crown, visor, jaw, and temple construction remains a small set of large planar volumes. It needs compound wrap, finer plane changes, and more credible brow/temple/rear integration.
- The boot retains a rounded underlying last and the toe, instep, ankle, and shin components do not yet resolve as one manufactured technical boot.
- The rifle is functionally decomposed and substantially stronger than revision 7, but the receiver and handguard remain broad layered profiles. The grip, trigger region, magazine interface, barrel rooting, controls, seams, and cutouts remain below production-reference fidelity.
- Material separation is technically present but visually too pale and uniform under the review lighting. Ceramic, satin metal, woven fabric, rubber, recessed seams, and restrained emissives need a stronger PBR/value hierarchy.
- At distance the armor reads clearly, but the identity remains a generic low-poly robot/combat mannequin rather than the authored agile arena combatant in the production target.

## Evidence packet

- Direct review board: `renders/kyx-v6c-benchmark-rev8-direct-review-board.png`
- Component review board: `renders/kyx-v6c-benchmark-rev8-component-review-board.png`
- Distance review board: `renders/kyx-v6c-benchmark-rev8-distance-review-board.png`
- Source-reference board: `renders/kyx-v6c-benchmark-rev8-source-reference-board.png`
- Standalone rifle view: `renders/kyx-v6c-benchmark-rev8-rifle.png`
- Authoring report: `v6c-benchmark-rev8-authoring-report.json`
- Render report: `v6c-benchmark-rev8-render-report.json`

## Integrity result

- Revision 8 blend SHA-256: `9f4c21b756c54f93710c5c0435326aaa321faeccd79d2524a0c5a61ed651d886`
- Accepted V6-A preserved SHA-256: `074c17b819c9bc564f042d2dbc24bb5e359e428fce61f6cc8502a351307afa2d`
- Preserved revision 7 SHA-256: `b07d9657cefe68d33f4657da8fb2cf3498339bbc49c333036f0782c78137e4d6`
- Pinned production-target SHA-256: `9c188fa32daaeec2d284727a5d9e600f94b8b57fee6f0568c7ebac9d462abdd2`
- V6-A, revision 7, and the production target remained byte-identical during authoring and rendering.
- The accepted V6-A body geometry hash is identical before and after revision 8 construction.
- Blender 5.1.2 reopen audit: 175 objects, 172 meshes, 173 revision-8-prefixed objects, and exactly three contact-witness empties.
- Reopen audit found zero V6-B objects, armatures, actions, and external libraries.
- All 17 evidence assets exist, are non-empty, and match the byte counts and SHA-256 values in the render report.
- Rendering did not alter the revision 8 blend or the pinned reference.

## Exact work remaining

1. Replace profile-prism torso construction with body-conforming multi-plane surfaces that wrap the accepted V6-A anatomy and have deliberate inner/outer thickness, stepped bevels, recessed seams, fastener seats, and nonuniform plate breaks.
2. Rebuild shoulder, elbow, forearm, thigh, knee, and shin components around anatomical axes with genuine overlapping shells and retained woven flex zones; eliminate shield-pad and square-block silhouettes.
3. Rebuild the helmet as a compound faceted shell with a wrapped visor, integrated brow and jaw, layered temple mechanisms, and a mechanically joined rear vent housing; retain complete facial coverage.
4. Replace the rounded boot base with one coherent angular technical last, outsole, toe box, instep, heel counter, ankle hinge, and shin interface.
5. Rebuild the rifle receiver and handguard as true multi-depth mechanical volumes with modeled cutouts and clearer grip, trigger, magazine, barrel, rail, vent, control, and manufacturing interfaces.
6. Establish a darker and more legible charcoal-fabric, satin-gunmetal, warm-pearl, rubber, seam, cyan, and coral material/value hierarchy, then repeat direct, component, distance, and source-reference review.
7. Obtain explicit root/human V6-C visual acceptance. No downstream production gate may begin before this.
8. Only after V6-C acceptance: perform final retopology, authored UVs, bake/textures, rig and skinning, literal two-hand/shoulder contact, animation, first-person arms, LODs, GLB export, runtime integration, performance validation, and final G6 acceptance in that order.

## Explicit non-claims

The three contact empties are future intent only. No held contact, retopology, authored UVs, texture bake, rig, animation, LOD, GLB, runtime integration, performance result, V6-C acceptance, or G6 acceptance is claimed.
