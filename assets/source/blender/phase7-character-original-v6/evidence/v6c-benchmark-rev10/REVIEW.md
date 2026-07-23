# V6-C Visual Benchmark Rev10 — Direct Review

Reviewed: 2026-07-22

## Decision

**SELF-REJECTED / NOT ACCEPTED / NOT V6-C / NOT G6**

Rev10 is a materially better production-form exploration than rev9, but it still reads as a clean procedural/blockout character rather than the authored, production-quality hard-surface suit shown in the pinned target. It must not advance to rigging, export, runtime integration, or a V6-C/G6 claim.

## Pinned inputs and frozen predecessor

- Accepted V6-A: `model/kyx_vanguard_v6a_anatomy_sculpt_working.blend`
  - SHA-256: `074c17b819c9bc564f042d2dbc24bb5e359e428fce61f6cc8502a351307afa2d`
  - File and body geometry preserved unchanged.
- Production target: `concept/kyx-vanguard-v6c-production-target-v1.png`
  - SHA-256: `9c188fa32daaeec2d284727a5d9e600f94b8b57fee6f0568c7ebac9d462abdd2`
  - Preserved unchanged.
- Frozen rev9: `model/v6c-benchmark-rev9/kyx_vanguard_v6c_visual_benchmark_rev9.blend`
  - SHA-256: `4ab1bf6db12d99194ddc896077f631d5216053b343aa42c81ab2ec39c7877a19`
  - Preserved unchanged and not used as a geometry source.

## Rev10 deliverable

- Blend: `model/v6c-benchmark-rev10/kyx_vanguard_v6c_visual_benchmark_rev10.blend`
- SHA-256: `b9f7e23d216bb03c91b98b3c1bd000f86c98d1c577b0c9371ff119b627e20c42`
- Bytes: `12,915,677`
- Audit packet: 14 direct renders plus 4 boards under `evidence/v6c-benchmark-rev10/renders/`.

## What materially improved

- Eliminated the rev10 prototype's Solidify-driven spike/outlier failure by replacing projected panels with manually closed shells.
- Retained a continuous dark V6-A undersuit and added body-conforming front/rear cuirass shells with distinct clavicle, pectoral, rib, sternum, abdomen, waist, and pelvic elements.
- Built a genuinely wrapped helmet assembly with crown, brow, cheek, jaw, temple, occipital, neck-seal, pivot, and recessed multi-plane visor parts.
- Added deep shoulder/elbow/knee housings, structural bridges, side rails, pivots, broader thigh shells, anterior knee shields, and additional vent detail.
- Reworked the boots into an angular last with separate outsole, tread, toe, instep, ankle, heel-cage, and pivot components.
- Replaced the weapon with a deeper auto-rifle silhouette containing actual handguard cutouts, an open stock, optic, top rail, charging handle, and small hardware.
- Established a darker material hierarchy with restricted cyan signaling and less glossy presentation.

## Blocking visual findings

1. **Overall finish remains blockout/procedural.** Relative to the pinned target, surface density, edge control, inter-panel transitions, negative-space design, and authored secondary/tertiary detail remain far below production quality.
2. **Helmet identity is not resolved.** It is wrapped and non-planar, but the large brow/cheek/jaw pieces read as a coarse robotic face or mask. The target's sleek compound shell, integrated visor gasket, layered side structure, and precise rear transitions are not achieved.
3. **Torso armor is still a stack of simple plates.** The front has more overlap and depth, yet broad low-resolution surfaces and abrupt plate boundaries produce a kitbashed impression. The back is especially sparse and lacks the target's load-bearing complexity.
4. **Limb coverage is incomplete.** Thighs and lower legs still expose large smooth undersuit fields; knee and shin parts read as isolated shields rather than a continuous nested armor system. Elbow/wrist and hip/knee/ankle transition logic is not sufficiently convincing.
5. **Silhouette and proportions remain generic.** Shoulder caps are oversized and simple, forearm shells are tubular, the lower body is visually underbuilt, and the boots retain a toy-like profile.
6. **Materials are flat.** The bronze/beige areas dominate as broad color blocks; technical fabric weave, metal/ceramic breakup, seams, seals, abrasion, decals, and local roughness variation are absent.
7. **The rifle remains a benchmark blockout.** Its major masses and cutouts are legible, but it lacks the target's mechanical density, controlled chamfers, component separation, grip/trigger refinement, and final proportional authority.

## Integrity audit

- Author report records 227 rev10 objects: 219 meshes, 5 curves, and 3 contact-witness empties.
- Clean Blender reopen records 229 objects: 221 meshes, 5 curves, 3 empties. The two additional meshes are the accepted V6-A hidden eye meshes preserved from source.
- Armatures: 0; actions: 0; external libraries: 0.
- Rev9-named objects: 0; V6B-named objects: 0.
- Contact witnesses: exactly 3; they are intent markers only. No literal held/two-hand/shoulder-contact evidence is claimed.
- Largest character bound is the preserved continuous undersuit at 1.7751 m; no spike/outlier geometry is present.
- All 18 evidence records are unique and pass recorded byte-size and SHA-256 validation.
- Blend SHA-256 matches both authoring and rendering reports; render input remained unchanged.

## Required next strike

Use accepted V6-A and the pinned production target again, with rev10 retained only as a rejected evidence benchmark. The next attempt needs an authored hard-surface modeling pass focused on helmet shell integration, denser torso/back construction, continuous thigh-to-boot armor coverage, smaller and better nested joint shells, production material breakup, and rifle refinement. Do not solve these deficits by adding more floating primitives or by beginning rig/export work.
