# KYX Vanguard original v5b human-review packet

## Decision boundary

This packet is **rejected evidence**, not a visual pass, runtime candidate, or G6 artifact. `HUMAN_VISUAL_DECISION.md` is authoritative.

## Review plates

- `output/renders/kyx-vanguard-v5b-hero-close-color.png` — primary construction and silhouette plate.
- `output/renders/kyx-vanguard-v5b-three-quarter-color.png` — opposite three-quarter silhouette.
- `output/renders/kyx-vanguard-v5b-front-ortho-color.png` — proportion, symmetry, and grip placement.
- `output/renders/kyx-vanguard-v5b-side-ortho-color.png` — posture, boot profile, receiver depth, and armor float.
- `output/renders/kyx-vanguard-v5b-back-ortho-color.png` — rear shell, belt, garment, calf, and heel construction.
- `output/renders/kyx-vanguard-v5b-weapon-contact-color.png` — both palms and forward support placement.
- `output/renders/kyx-vanguard-v5b-trigger-contact-color.png` — trigger-hand/guard contact authority.
- `output/renders/kyx-vanguard-v5b-hero-close-grayscale.png` — value grouping and silhouette without hue.
- `output/renders/kyx-vanguard-v5b-front-ortho-grayscale.png` — front value grouping without hue.

## Structural evidence

- Source: `output/kyx_vanguard_original_v5b.blend`.
- Runtime interchange candidate: `output/kyx_vanguard_original_v5b.glb`.
- Build script: `build_character_original_v5b.py`.
- Generated report and artifact manifest: `output/character-original-v5b-report.json`.
- Structural result: 116 GLB meshes, 9 materials, 1 skin, and 1 `KYX_V5_CombatIdle_ContactLocked` animation in the preserved build.
- Structural scope: exporter/source integrity only. It cannot prove modeling quality, deformation quality, runtime suitability, LODs, first-person arms, or G6.

## Candid visual finding

V5b is a useful negative benchmark: sectional lofts fixed v5's inflated pelvis and limb masses, and separate phalanges made hand intent inspectable. The review plates still expose a procedural mannequin, floating shell armor, weak boots, extrusion-led rifle, and ambiguous trigger/support contact. The next source must enter a sculpt-retopo pipeline instead of iterating this generator.
