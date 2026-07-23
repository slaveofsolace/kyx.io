# Integrated checkpoint: P5.12 + G7 browser slices + Press Hall runtime

Classification: `INTEGRATED_BOUNDED_CHECKPOINT_PASS`

Formal acceptance remains G0-G2 only. G3-G9 remain open.

This checkpoint combines the frozen P5.12 exact-profile Inkfall product client, the new G7 rendered browser slices and accessibility fixes, and the explicit non-default Press Hall runtime inspection. The merged app and Worker typechecks, full lint, 83 app files/684 tests, 8 Worker files/29 tests, isolated production build, Worker packaging dry-run, and all four Press Hall Chromium cases pass.

Boundaries remain explicit:

- P5.12 proves exact profile/map binding, real server collision/occlusion, damage/death/score/grenade, and fail-closed mismatch, but active-match reconstitution and G4/G5 are open.
- G7 now has 12 viewport/HUD-scale cases, forced-colors/reduced-mode evidence, and three zoom-equivalent layouts, but literal zoom control, screen-reader/human review, pointer-lock/focus video, organic combat states, and named-machine performance remain open.
- Press Hall loads through the real Three.js path at 27 art calls, but the current GLB carries no explicit base colors or base-color textures and is visibly mostly white. It is not G5/G8-ready.
- The production character/contact rig remains rejected and under active recovery.

The next parallel lanes are P5.13 active-match reconstitution, Press Hall v3.3 material-correct export, and the contact-first character recovery.
