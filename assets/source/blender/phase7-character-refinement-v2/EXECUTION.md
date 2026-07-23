# Phase 7 character refinement v2 execution record

- Date: 2026-07-20 (America/Chicago)
- Status: `VISUAL_REFINEMENT_CANDIDATE_NOT_G6`
- Blender: 5.1.2, build hash `ec6e62d40fa9`
- CLI executable: `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe`
- Mode: `--background --factory-startup --threads 1`
- Runtime or package changes: none
- Third-party art or textures: none
- Product-owner baseline: `../phase7-benchmark/VISUAL_REVIEW.md` remains
  `NOT APPROVED` and unchanged

## Final output

| Metric | Result |
|---|---:|
| Export objects | 92 |
| Mesh objects / GLB meshes | 90 / 90 |
| Source vertices | 11,946 |
| Source polygons / triangles | 12,398 / 23,532 |
| Materials | 10 |
| Bones / skins | 20 / 1 |
| Named actions | 1 |
| GLB animation channels | 54 |
| GLB bytes | 795,320 |
| Current GLB SHA-256 | `6d97a2da53e49560a87b97f124bb8bbb2621f0ca69267d8c250cda7b1cf9226e` |
| `.blend` bytes | 344,681 |
| Current `.blend` SHA-256 | `43d4895f976ed949605b122ebaadc233c9e24cf143f9c17c6a569fd81697cf12` |
| Renders | 9 at 900×900 |
| Final render time | 2.769583 s |
| Final scripted run | 3.520778 s |

The final GLB is a valid version-2 container whose declared byte length matches
the file. It contains 110 nodes, 90 meshes, 10 materials, one skin, and the
`REFINEV2_CombatReady_Breathe` animation. It declares no required extensions.
The project-local verifier completed with `PASS` and explicitly reported
`g6Claimed: false`.

## Visual inspection

All nine final PNGs were inspected. Compared with the preserved negative
benchmark, the candidate now has:

- a tapered torso/pelvis and anatomically segmented limbs under the armor;
- body-bowed chest, abdomen, thigh, and shin plates instead of a cube-only
  silhouette;
- undersuit breaks, shoulder shells, harness, belt, buckles, pouches, gloves,
  individual fingers, cuffs, boots, soles, helmet rails, and vents;
- a continuous authored rifle axis, visible shoulder stock relationship,
  right-hand pistol-grip contact, and left-hand handguard contact;
- primary/secondary/tertiary form and color roles that remain separable in the
  close and front grayscale captures; and
- readable close, tactical-mid, far, front, side, back, and dedicated contact
  views.

This is materially less blocky and more resolved than the v1 mannequin, but it
is still a stylized procedural candidate. It has not received human visual
approval and is not recorded as the final player-model direction.

## Repeatability result

Two additional unchanged single-threaded headless builds both exited 0. They
retained the same scene contract, object/mesh/material/bone/action counts, GLB
length (795,320 bytes), and byte-identical GLB JSON document. The binary mesh
chunk and Eevee PNG bytes were not byte-identical between builds. The two GLB
hashes were:

- `95c65870699fed874df64335c692ba99041aeee3fb2c44c90f0c9c7153096156`
- `6d97a2da53e49560a87b97f124bb8bbb2621f0ca69267d8c250cda7b1cf9226e`

This is structural/render repeatability, not byte determinism. The current
artifact identities are recorded in `output/character-refinement-v2-report.json`.
No stable-hash claim is made for generated GLB, PNG, or `.blend` bytes.

## Known blockers before G6

- Rigid bone parenting does not prove deformation-capable skin or stress-pose
  weights.
- The breathe loop is not the first/third-person gameplay clip matrix.
- First-person arms, LODs, KTX2/meshopt, runtime outline/contact testing, and
  2/4/8-character profiling are absent.
- Wireframe/topology, color-vision simulations, low/high quality comparisons,
  and Khronos glTF Validator evidence are absent.
- Human visual approval is explicitly absent.
