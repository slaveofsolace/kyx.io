# V6-C Visual Benchmark Revision 12 Review

## Decision

**SELF-REJECTED / NOT ACCEPTED / NOT V6-C / NOT G6**

Revision 12 proves that a clean modeling-strategy reset is technically feasible in the installed Blender 5.1 environment, and it improves substantially on revision 11's primitive-cylinder construction. It still does not clear the user's “too blocky/shape-like” complaint or the pinned production concept. No rig, animation, export, LOD, GLB, or runtime work is authorized from this result.

## Isolation and pinned sources

- Accepted V6-A: `model/kyx_vanguard_v6a_anatomy_sculpt_working.blend`
  - SHA-256 before/after: `074c17b819c9bc564f042d2dbc24bb5e359e428fce61f6cc8502a351307afa2d`
  - Body geometry SHA-256 before/after: `83af5095af6866b186bed5f2caa5903f45c630a0958c74dff15cad5c1fa71856`
  - Use: hidden anatomical/proportion cage only. It is not rendered.
- Pinned concept: `concept/kyx-vanguard-v6c-production-target-v1.png`
  - SHA-256 before/after: `9c188fa32daaeec2d284727a5d9e600f94b8b57fee6f0568c7ebac9d462abdd2`
  - Use: sole visual construction reference.
- No revision 9, 10, or 11 armor Blend was opened, linked, appended, or inherited.

## Output and method

- Blend: `model/v6c-benchmark-rev12/kyx_vanguard_v6c_visual_benchmark_rev12.blend`
- SHA-256: `7a05872b098daf0931fe3f6558bdd7d051b2c4d4ce5351a51bb57149d1d8499a`
- Authoring report: `v6c-benchmark-rev12-authoring-report.json`
- Render report: `v6c-benchmark-rev12-render-report.json`

The visible body is new multi-ring athletic loft topology with Catmull-Clark subdivision. Armor uses fitted curved quad grids with physical shell thickness and bevels, plus manufactured profile volumes for hard plates. The helmet, torso carrier, pelvis/limb load path, rear spine pack, combat boots, and rifle were all rebuilt in the isolated revision 12 namespace.

Inventory:

- 242 revision 12 objects: 210 meshes, 29 curves, and 3 contact-intent empties.
- 5,542 base vertices and 4,009 base polygons.
- 35,610 evaluated polygons with subdivision, shell thickness, and bevel modifiers.
- Seven isolated production collections and ten revision 12 materials.

## Improvements over revision 11

- The accepted anatomy is now hidden; the visible undersuit has its own athletic cross-section flow instead of exposing the source mannequin under primitive armor.
- Head scale, leg length, stance, hand scale, pelvis width, and foot scale were corrected over seven preserved preview passes.
- The helmet has separate crown, brow, cheek, jaw, chin, temple, and occipital components around a smaller compound aperture.
- Shoulder caps were replaced by fitted deltoid shells tied into explicit clavicle-to-deltoid seat rails.
- Chest, thigh, and shin armor was split into stepped, overlapping shells with dark negative-space articulation.
- The pelvis cod piece was reduced and the rear spine/pack was split into upper/lower modules tied continuously to the lumbar and hip rails.
- Boots now include an anatomical upper, contoured outsole, tread, heel/toe structure, and recessed lace bridges.
- The rifle is human-scaled and staged off the ground, with receiver, stock, buffer bridge, handguard, optic, grip, magazine, foregrip, barrel, muzzle, vents, rail teeth, controls, and fasteners.
- Graphite, smoked ceramic, gunmetal, cyan, and restrained warm-metal materials replace the revision 11 pale-only hierarchy.

## Static contact audit

The audit renderer applies a deterministic static arm-surface deformation after loading the unchanged Blend. It is not a rig or animation claim.

- Primary hand/control worst-side witness clearance: 7.771 mm.
- Support hand/foregrip worst-side witness clearance: 8.308 mm.
- Stock/shoulder worst-side witness clearance: 2.471 mm.
- Weapon-side primary and support targets land on exact evaluated weapon vertices.

This establishes geometric proximity, but direct inspection shows open palms touching the controls rather than fingers convincingly wrapping them. Therefore revision 12 does **not** claim a believable held pose.

## Visual blockers

- The character still reads as a simplified armored mannequin, not an authored production soldier. The torso is rectilinear, limb transitions remain generic, and the silhouette is substantially less anatomical than the concept.
- Primary armor shells are still broad, low-information shapes. Their separation and curved rails often read as floating decorative pieces rather than mechanically seated construction.
- The helmet is more segmented, but the aperture is still too broad and reflective; its crown, temple, and jaw construction lacks the interlocking density of the concept.
- The pelvis/hip transition remains schematic, and thigh/knee/shin articulation does not convincingly demonstrate range of motion or load transfer.
- The boots are materially better than the failed pill-shaped feet, but remain simplified wedge forms with insufficient ankle, vamp, outsole, and tread engineering.
- The rear view has a continuous center rail, yet the carrier still reads as symmetrical plates on exposed cloth rather than a fitted spine/pack mechanism.
- Material response remains too uniformly clean and reflective. Authored roughness variation, coating changes, edge treatment, decals, grime, textile directionality, wear, and manufacturing marks are absent.
- The rifle silhouette is complete, but the receiver and handguard remain broad slab-like volumes; vents are surface inserts instead of credible cut geometry, and grip/magazine/stock surfacing is not production grade.
- The static contact pose has measured proximity but visibly unconvincing hand articulation and forearm deformation.
- At 12 m and 20 m, the armor hierarchy collapses into a generic silver/dark mannequin. The pinned concept's aggressive visor, fitted shoulder-to-waist tension, articulated lower-leg identity, and equipment density do not survive.

## Evidence

- Direct five-view board: `renders/kyx-v6c-benchmark-rev12-direct-audit-board.png`
- Hero plus true-perspective 5 m / 12 m / 20 m board: `renders/kyx-v6c-benchmark-rev12-gameplay-distance-board.png`
- Helmet, torso, lower body, boots, rear carrier, and rifle board: `renders/kyx-v6c-benchmark-rev12-component-audit-board.png`
- Static contact board: `renders/kyx-v6c-benchmark-rev12-contact-audit-board.png`
- Pinned-concept comparison: `renders/kyx-v6c-benchmark-rev12-concept-comparison-board.png`
- Failed iteration checkpoints remain preserved under `preview`, `preview-pass2`, `preview-pass3`, `preview-pass4`, `preview-pass5`, `preview-pass6`, and `preview-pass7`.

The render report records 18 source renders plus 5 boards. All 23 records have unique file names, and every byte count and SHA-256 was revalidated successfully.

## Clean-reopen integrity

- Blender clean reopen succeeded.
- Revision 12 lane: 242 objects: 210 meshes, 29 curves, and exactly 3 contact-intent empties.
- Armatures: 0. Armature objects: 0. Actions: 0. External libraries: 0.
- Revision 12 names containing `rev9`, `rev10`, `rev11`, or `V6B`: 0.
- The accepted V6-A body and two eye meshes remain hidden in viewport and render.
- Character bounds: 1.088383 m wide by 0.448101 m deep by 1.895277 m tall.
- Rifle bounds: 1.179294 m long by 0.081380 m deep by 0.362096 m tall, staged at chest height.
- Final Blend, accepted V6-A, pinned concept, and all evidence hashes match their reports.

## Required next strategy

Do not continue by adding more scripted profile plates to revision 12. Closing V6-C requires an interactive high-poly sculpt and retopology pass: manually authored anatomical suit tension, interlocking armor topology, true joint clearances, carved negative space, purpose-built boots and hands, production weapon booleans/retopo, authored UVs, and a controlled texture/material pass. Only after new direct and gameplay-distance evidence unmistakably clears the concept comparison should rigging or export begin.
