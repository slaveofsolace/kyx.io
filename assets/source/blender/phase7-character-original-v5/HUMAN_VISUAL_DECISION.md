# KYX Vanguard original v5 visual decision

- Decision: **REJECTED — ORIGINAL_V5_VISUAL_REJECTED**
- G6: **not claimed**
- Runtime integration: **not authorized**
- Review basis: direct inspection of the color, grayscale, orthographic, and weapon-contact renders generated on 2026-07-21.

## What genuinely improved

- This is a clean-room, project-original Blender source and does not import or derive from `public/soldier.glb`.
- One source build produces a valid GLB with a skin, one named contact-locked action, materials, and review plates.
- The body is a continuous surface rather than the visibly intersecting primitive stacks in v2/v3.
- Helmet, armor, boot, glove, and rifle pieces have explicit construction roles and pinned concept provenance.
- The rifle is constructed in one common design frame rather than from unrelated floating objects.

## Why it is rejected

- The unified body reads as an inflated smooth mannequin rather than a lean adult human in tailored technical cloth.
- Pelvis, glute, thigh, calf, upper-arm, and forearm masses are exaggerated and round; joints lack bony landmarks and garment tension.
- Helmet still reads as a dome with added clamshell pieces instead of a layered, panel-resolved protective shell.
- Shoulder and knee armor read as large primitive clamshells.
- Gloves read as balls/mitten masses with decorative dots; individual fingers are not legible at ordinary review distance.
- Boots are simplified rounded shoes with shallow attached details, not a convincing outsole/heel/ankle/shin system.
- The rifle remains too thick and extrusion-led around the receiver and handguard.
- The trigger close-up does not show a credible index finger seated inside/at the trigger guard.
- Both hands visually cluster around the receiver; the support hand is not clearly forward on the handguard and the firing hand is not unmistakably wrapped around the pistol grip.

## Required next source change

A follow-up original v5b source must replace the voxel-inflated body with authored sectional anatomy/garment lofts, reduce limb and pelvis mass, separate the firing hand into a shaped palm plus readable phalanges around a thinner pistol grip, move the support hand forward under the handguard, reduce armor shell bulk, and slim the receiver. The contact cameras must make trigger and forward-support contact self-evident without relying on metadata.

Counts, hashes, and exporter success do not alter this decision. Human visual acceptance remains mandatory.
