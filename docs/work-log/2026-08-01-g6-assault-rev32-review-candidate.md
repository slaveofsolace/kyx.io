# G6 Assault Rev32 review candidate — 2026-08-01

## Outcome

Built one isolated Assault-only review candidate from the V6-A anatomical/rig
foundation and the materially stronger pre-regression suit direction. This is a
human-review candidate, not a G6 pass, runtime integration, or release asset.

The candidate remains outside `public` under
`assets/review/runtime-candidates/g6-assault-rev32`.

## Material changes

- preserved the 66-bone Rev17 rig and all 16 inherited first-/third-person clips;
- corrected the presentation source from `-Y` to the runtime `+Y` forward axis;
- retained the detailed Khronos SciFiHelmet CC0 shell and pinned provenance;
- authored a slim, fitted sapphire visor at the eye line;
- removed the character-embedded rifle so equipped weapons cannot overlap it;
- preserved the authored V6-A body proportions after finding that the older
  height-only proportion pass distorted lowered wrists as if they were pelvis
  vertices and created a skirt-like waist discontinuity;
- preserved continuous source gloves rather than detached rigid bracers;
- restored the complete matched boot/cuff/outsole assembly and removed the
  fully enclosed foot helper rather than slicing skinned ankle geometry;
- triangulated only the generated runtime armor copy and cleared stale custom
  normals on generated decimated copies, closing the glTF tangent-basis error
  without mutating the frozen presentation source;
- corrected the inherited third-person death clip's missing root translation:
  its final body floor moved from `0.77171737 m` to `-0.00299972 m` in the
  authoring audit, with `0.00000036 m` maximum contact residual over 60 frames;
- exported review-only LOD0/LOD1/LOD2 GLBs.

## Exact evidence

- direct GLB packet:
  `evidence/2026-08-01/g6-assault-rev32/direct-glb-review-v10`
- report:
  `evidence/2026-08-01/g6-assault-rev32/direct-glb-review-v10/render-report.json`
- LOD0 SHA-256:
  `775a423da21ad9cafefc1b2f7882805ddcbc2531b50336857b38d350b5b4cb62`
- frozen presentation source SHA-256:
  `7b4fd749dd2214309fcbfbc859d65e3f991ff646be8d7cc18f66f294c67b9014`

The factory-empty Blender 5.1 direct import found exactly two runtime meshes,
one 66-joint armature, all 16 clips, no weapon mesh, unchanged source bytes, and
all ten required views. Python compilation passed before the final export.

The official Khronos glTF Validator `2.0.0-dev.3.10` reports zero errors and
zero warnings for LOD0, LOD1, and LOD2. Exact reports are under
`direct-glb-review-v10/external-validation`.

The exact-hash LOD0 all-frame audit sampled all 459 integer frames across all
16 clips. It found zero non-finite vertices/bones, topology changes, gross
attachment failures, floor-penetration failures, armor/body AABB detachments,
or action-semantic failures. The final death frame now reaches
`-0.0039164 m` and has a prone combined height of `0.6899824 m`. The report and
six diverse worst-metric renders are under
`direct-glb-review-v10/all-frame-deformation-audit`.

## Human Cortex visual audit

The v10 packet is materially stronger than the rejected Rev31 block-stack and
the internally rejected early Rev32 exports: anatomy is continuous, hands no
longer spike, the waist no longer flares into a skirt, shoes no longer expose
toes, and the boot pieces stay together in the sampled run/airborne poses.

Residual human-review questions are intentional and unresolved:

- whether the ornate white helmet belongs with the simpler blue torso language;
- whether the visor should remain a thin eye-line insert or become a larger lens;
- whether the smooth lower suit needs restrained shin/thigh armor after the
  Assault silhouette is accepted;
- whether the compact rounded boot silhouette is acceptable;
- whether the shoulder/back plates and exposed lower suit read as a coherent
  authored Assault silhouette rather than detached add-ons;
- whether the recorded worst-frame views are visually free of objectionable
  clipping despite passing the gross-deformation gate.

## Explicit nonclaims

- no owner visual acceptance;
- no G6 acceptance;
- no browser/runtime selection;
- no first-person arm or weapon-contact proof;
- no package-budget pass: the three GLBs total 72,021,216 bytes, of which
  63,261,648 bytes (87.84%) are the same three embedded 2048x2048 PNG helmet
  textures repeated once per LOD;
- no claim of zero visible clipping; fitted body/armor intersections remain a
  human-review concern even though all 459 frames passed structural bounds;
- no deployment or release eligibility.
