# V6-C Visual Benchmark Revision 11 Review

## Decision

**SELF-REJECTED / NOT ACCEPTED / NOT V6-C / NOT G6**

Revision 11 is a materially cleaner construction study than revisions 9 and 10, but direct inspection of the five-view, hero/gameplay, component, reference-comparison, and true-perspective distance evidence still reads as a procedural hard-surface blockout. It does not meet the pinned production concept's authored topology, surface hierarchy, or distinctive gameplay silhouette. Rigging, animation, export, LOD, GLB, and runtime integration remain intentionally unstarted.

## Pinned sources and isolation

- Accepted V6-A anatomy source: `model/kyx_vanguard_v6a_anatomy_sculpt_working.blend`
  - SHA-256 before/after: `074c17b819c9bc564f042d2dbc24bb5e359e428fce61f6cc8502a351307afa2d`
  - Body geometry SHA-256 before/after: `83af5095af6866b186bed5f2caa5903f45c630a0958c74dff15cad5c1fa71856`
- Sole visual reference: `concept/kyx-vanguard-v6c-production-target-v1.png`
  - SHA-256 before/after: `9c188fa32daaeec2d284727a5d9e600f94b8b57fee6f0568c7ebac9d462abdd2`
- No revision 9, revision 10, or V6-B Blend was opened, appended, linked, or used as geometry.

## Output

- Blend: `model/v6c-benchmark-rev11/kyx_vanguard_v6c_visual_benchmark_rev11.blend`
- SHA-256: `7d6fbd8f1494240519d58f3dda0acbb98f8bab3fe8e6a1ac3b446f98c5992e53`
- Authoring report: `v6c-benchmark-rev11-authoring-report.json`
- Render report: `v6c-benchmark-rev11-render-report.json`

## What improved

- The torso and pelvis now read as one carrier system with explicit clavicle, sternum, oblique, rear, hip, and ankle load paths instead of disconnected accessory primitives.
- The helmet is a single enclosed shell with a closer neck seal and a narrower recessed visor.
- Hip saddles, thigh carriers, shin carriers, knee housings, and boot collars produce a more continuous lower-body mass.
- The rear view has a clearer armor envelope and better shoulder-to-waist continuity.
- The rifle is a new multi-depth build with receiver, handguard negative space, open stock, barrel, optic, controls, magazine, grip, and hardware; no weapon detail is floating outside its collection.
- Source toes are concealed without changing the accepted V6-A mesh geometry.

## Acceptance blockers

- The full silhouette still reads as broad, simple shells around a mannequin rather than a deliberately authored exoskeletal suit.
- The helmet remains a generic rounded dome; visor framing, shell segmentation, neck integration, and face-protective structure are well below the reference.
- The chest is too wide, flat, and schematic. Its rails describe lines but do not create convincing load-bearing construction or overlapping plate depth.
- Pelvis, thigh, knee, shin, and boot forms remain slab-like. Joint articulation and functional overlap are not resolved.
- The boot last is still chunky and rectangular, despite removal of the exposed source-toe defect.
- The rear carrier is a large rounded mass with sparse plate breaks and insufficient authored structure.
- Material response is too clean and pale. Roughness breakup, coating contrast, edge treatment, panel variation, decals, wear, and small-scale manufacturing detail do not approach production quality.
- The rifle has more parts, but its topology and surface language still read as a smooth blockout rather than a production asset.
- At 12-20 m, distinctive equipment language collapses into generic pale armor. The pinned concept's aggressive visor, shoulder-to-waist tension, and lower-leg identity do not survive gameplay distance.

## Evidence

- Direct five-view board: `renders/kyx-v6c-benchmark-rev11-direct-review-board.png`
- Hero/gameplay and 5 m / 12 m board: `renders/kyx-v6c-benchmark-rev11-hero-gameplay-board.png`
- Component board: `renders/kyx-v6c-benchmark-rev11-component-review-board.png`
- Pinned-source comparison board: `renders/kyx-v6c-benchmark-rev11-source-reference-board.png`
- The render report records 18 source renders plus 4 boards. All 22 files are unique and were rehashed successfully; every byte count and SHA-256 matches the report.

## Clean-reopen integrity

- Blender clean reopen succeeded.
- Lane inventory: 215 objects: 178 meshes, 34 curves, and 3 contact-intent empties.
- Mesh inventory: 28,465 vertices and 26,210 polygons.
- Exactly three contact-intent empties are present: primary grip, support grip, and shoulder. They are future witnesses only and are not held-contact proof.
- Armatures: 0. Actions: 0. External libraries: 0.
- Names containing `rev9`, `rev10`, or `V6B`: 0.
- Two accepted V6-A eye meshes remain hidden in viewport and render.
- Lane bounds are sane: 1.848885 m wide by 0.399183 m deep by 1.861509 m tall, including the rifle. The connected armor is 1.835194 m tall; the rifle is 1.848885 m long.
- Final Blend SHA-256, accepted V6-A SHA-256, pinned-reference SHA-256, and all evidence hashes were verified after authoring and rendering.

## Required next strike

The next attempt must replace the broad primitive shells with authored hard-surface topology and a controlled secondary/tertiary detail hierarchy. Priority order: helmet and visor architecture; chest-to-pelvis construction; articulated hip/knee/ankle overlaps; a purpose-built boot last; rear carrier segmentation; then production material breakup and rifle surfacing. More primitive layering on the current forms will not close V6-C.
