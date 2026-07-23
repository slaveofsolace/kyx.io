# KYX Vanguard V6-A human visual review

Status: **reviewable V6-A anatomy/silhouette candidate; human decision pending; not G6**

The candidate is a genuine project-authored deformation of the pinned CC0 realistic male anatomy seed. It visibly changes the source toward a longer-limbed, narrower mobile-operator silhouette while retaining continuous human anatomy, five-digit hands, feet, facial landmarks, UVs, and the three-level Multires sculpt data. It is deliberately naked clay: costume, armor, helmet, cowl, gloves, boots, rifle, materials, rigging, animation, retopology, LODs, exports, and runtime integration are outside V6-A.

## Review order

1. Reconfirm the pinned design direction in `../../characters/kyx-vanguard/concept/kyx-vanguard-model-sheet-v1.png`.
2. Compare the untouched seed and V6-A directly in `evidence/v6a-renders/kyx-v6a-source-vs-candidate-sheet.png`.
3. Inspect the full front, side, back, and three-quarter plate in `evidence/v6a-renders/kyx-v6a-authored-anatomy-review-sheet.png` and the four full-resolution source images beside it.
4. Inspect the true-perspective gameplay-distance read in `evidence/v6a-silhouette/kyx-v6a-distance-read-review-sheet.png` (5 m, 20 m, and 40 m; 50 mm lens on a 36 mm sensor).
5. Use `evidence/v6a-proportion-comparison.json`, `evidence/v6a-final-measurements.json`, and `evidence/v6a-render-report.json` for numeric and artifact evidence.

## What changed visibly

- standing height increased from 1.689961 m to 1.775 m (+5.03%);
- overall width reduced 5.70% and overall depth reduced 5.84%;
- height-to-width and height-to-depth ratios increased 11.38% and 11.55%;
- normalized thigh width/depth reduced 5.61%/15.37%;
- pelvis depth reduced 11.48%, waist depth 24.74%, and chest depth 12.09%;
- distal arms read longer, shoulder and upper-arm mass is more controlled, and the waist/pelvis transition is less bodybuilder-round;
- the source's continuous clavicle, shoulder, elbow, wrist, palm, fingers, pelvis, patella, calf, Achilles, heel, and toe landmarks remain visible.

The height-band comparisons are directional evidence, not landmark certification: the long-limb remap deliberately changes which vertices fall inside equivalent normalized bands. The direct source-vs-candidate plate remains the primary visual comparison.

## Authoring-lane visual assessment

`REVIEWABLE_CANDIDATE`, not approval. The candidate is visibly non-blocky and materially departs from the untouched source. The second pass corrected the first pass's excessive thigh/glute and shoulder/upper-arm mass without making the joints, hands, or feet spindly. The side view retains plausible glute and thoracic volume rather than flattening the body into a mannequin. The neck/jaw transition is clean enough for a later authored helmet seal and cowl interface.

Human review should explicitly decide whether:

- the neutral silhouette is lean and mobile enough before clothing and armor;
- shoulder width, waist taper, pelvis, and thigh mass match the intended operator rather than a bodybuilder;
- the neck/jaw interface leaves credible room for the sealed helmet/cowl construction;
- hand, foot, knee, elbow, wrist, and ankle landmarks remain convincing at full resolution;
- the 5 m silhouette has a usable baseline read and the deliberately tiny 20 m/40 m samples remain proportionally coherent.

## Integrity and provenance

- Immutable source: `source/kyx_vanguard_v6_cc0_anatomy_seed_sanitized.blend`
  - initial and final SHA-256: `e2d5b41ce10364cfc570fb0efe961c6548fe6fb90ab87850b453728372669e0d`
- Current candidate: `model/kyx_vanguard_v6a_anatomy_sculpt_working.blend`
  - initial duplicate SHA-256: `e2d5b41ce10364cfc570fb0efe961c6548fe6fb90ab87850b453728372669e0d`
  - final candidate SHA-256: `074c17b819c9bc564f042d2dbc24bb5e359e428fce61f6cc8502a351307afa2d`
  - final bytes: 12,580,228
- Concept SHA-256: `067a3eba77f9c9e566fe7aeba9684346bfd9fcd162de8ead14194640c0fb76c3`
- Body base topology remains 10,582 vertices, 21,170 edges, and 10,590 polygons in one manifold connected component with zero boundary, non-manifold, wire, or degenerate faces.
- UV layer count remains one; Multires remains 3/3/3/3 for viewport, sculpt, render, and total levels.
- Independent reopen inventory: three mesh objects, zero materials, images, texts, actions, armatures, libraries, drivers, or external paths.
- Blender invocation used 5.1.2 with `--background --factory-startup --disable-autoexec --python-exit-code 1` and project-authored scripts only.

## Preserved visual failure

`evidence/v6a-failures/attempt-1-overround-pelvis-thigh/` preserves the exact failed Blend (`f96d4b1d...`), four clay plates, source comparison, distance silhouettes, measurements, author report, render report, and rejection note. It was rejected for excessive upper-thigh/glute roundness and overly heavy shoulder/upper-arm mass.

## Decision boundary

- `ACCEPT V6-A` means only that this anatomy/silhouette checkpoint may proceed to separate V6-B garment, armor, helmet, glove, boot, and rifle construction.
- `REVISE V6-A` should identify the specific view and region to change.
- `REJECT SOURCE DIRECTION` means the CC0-derived anatomy lane should stop before any costume work.

No decision here may be interpreted as G6 acceptance. V6-A contains no costume, armor, weapon, rig, animation, retopology, runtime asset, or gameplay proof.
