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
- exported review-only LOD0/LOD1/LOD2 GLBs.

## Exact evidence

- direct GLB packet:
  `evidence/2026-08-01/g6-assault-rev32/direct-glb-review-v10`
- report:
  `evidence/2026-08-01/g6-assault-rev32/direct-glb-review-v10/render-report.json`
- LOD0 SHA-256:
  `939737b7f145c80a07c528621efc16b55dfe790c02e3eba9af407e9bcef8e2e9`
- frozen presentation source SHA-256:
  `7b4fd749dd2214309fcbfbc859d65e3f991ff646be8d7cc18f66f294c67b9014`

The factory-empty Blender 5.1 direct import found exactly two runtime meshes,
one 66-joint armature, all 16 clips, no weapon mesh, unchanged source bytes, and
all ten required views. Python compilation passed before the final export.

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
- whether sampled armor clearances remain clean over every animation frame.

## Explicit nonclaims

- no owner visual acceptance;
- no G6 acceptance;
- no browser/runtime selection;
- no first-person arm or weapon-contact proof;
- no external glTF validator report;
- no package-budget pass (LOD0 remains 24.8 MB because helmet textures are
  embedded and not yet downscaled/compressed);
- no deployment or release eligibility.
