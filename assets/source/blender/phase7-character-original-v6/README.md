# KYX Vanguard v6 production-source lane

Status: **V6-A authored anatomy/silhouette candidate complete; human review pending; not G6**

This lane replaces the rejected procedural-body starting point with a sanitized anatomical sculpt seed from Blender Studio / Blender Foundation Human Base Meshes v1.4.1. The selected input is the bundle's `Body Male - Realistic` collection. It is CC0 third-party anatomy and is not claimed as original KYX work.

The immutable sanitized checkpoint is:

- `source/kyx_vanguard_v6_cc0_anatomy_seed_sanitized.blend`
- SHA-256 `e2d5b41ce10364cfc570fb0efe961c6548fe6fb90ab87850b453728372669e0d`
- 12,582,373 bytes
- one collection, three mesh objects (body and two eyes), no scripts, text blocks, drivers, actions, materials, images, external libraries, or external paths

The current front/side/back/three-quarter plates under `evidence/renders/` show the unmodified CC0 anatomy source. Their labels and review report explicitly identify them as sculpt-seed prework. They are not a visual acceptance packet for a finished character.

The project-authored V6-A candidate is:

- `model/kyx_vanguard_v6a_anatomy_sculpt_working.blend`
- SHA-256 `074c17b819c9bc564f042d2dbc24bb5e359e428fce61f6cc8502a351307afa2d`
- 12,580,228 bytes
- one continuous manifold body plus two eyes; source topology, UV, and three Multires levels preserved
- no materials, images, texts, actions, armatures, libraries, drivers, or external paths

Read `V6A_HUMAN_REVIEW.md` and inspect `evidence/v6a-renders/` plus `evidence/v6a-silhouette/`. This checkpoint is reviewable but not self-approved.

## Required next work

Obtain an explicit human `ACCEPT V6-A`, `REVISE V6-A`, or `REJECT SOURCE DIRECTION` decision. Do not begin V6-B costume/armor work before that decision. The technical garment, armor, helmet, cowl, gloves, boots, rifle, retopology, textures, runtime rig, LODs, first-person arms, animation, and weapon contact remain to be project-authored.

## Non-claims

- The anatomy is CC0 source scaffolding, not original KYX anatomy.
- V6-A is only a candidate anatomy checkpoint. No costume, armor, helmet, rifle, retopology, authored UVs, textures, rig, LOD, animation, GLB, first-person asset, or runtime integration exists in this lane yet.
- The rejected v5/v5b evidence remains authoritative and untouched.
- This lane does not satisfy G6, human visual acceptance, or release acceptance.
