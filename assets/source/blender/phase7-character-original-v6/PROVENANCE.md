# KYX Vanguard v6 source provenance

## Acquisition result

On 2026-07-22 UTC, the version-pinned Blender Human Base Meshes v1.4.1 archive was acquired over HTTPS from Blender's official `download.blender.org` host into a unique operating-system temporary quarantine. The exact archive was 50,643,039 bytes with SHA-256 `811f43accbb31a88266d932f8f5563b2d13586fca0ba2693aad1f5fe582b3515`.

The official Blender demo-files listing was independently retrieved and identified the bundle as:

- Human Base Meshes v1.4.1;
- Blender Studio and community contributions;
- 49 MB;
- CC0;
- updated January 20, 2025;
- requiring Blender 4.2 LTS or newer.

The installed Blender 5.1.2 satisfies that compatibility floor. `evidence/official-listing-evidence.json` records the URL, retrieval time, response facts, page hash, and compatibility conclusion.

## Quarantine and archive inspection

The archive was inventoried before extraction by the project-authored `scripts/validate_vendor_archive.ps1`. It contained 29 entries: one `.blend`, one asset catalog `.txt`, 25 `.png` thumbnails, and two directories. Validation rejected absolute paths, parent traversal, duplicate names, symbolic links, executable/script extensions, unexpected extensions, and excessive expansion. All checks passed.

Only these two validated entries were extracted into temporary quarantine:

- `human-base-meshes-bundle-v1.4.1/human_base_meshes_bundle.blend` — 49,420,489 bytes, SHA-256 `3c121505651140ceb4d69fd1d8923f7788ffadd81672f5be14845a5f2c75c137`;
- `human-base-meshes-bundle-v1.4.1/blender_assets.cats.txt`.

The full 50.6 MB vendor ZIP was not copied into the repository. The temporary archive, extracted vendor blend, catalog, and official-page snapshot are removed after the sanitized checkpoint and checksum records are verified.

## Vendor blend inspection and risk boundary

The vendor blend was opened only for read-only data-block inventory with Blender 5.1.2, factory startup, background mode, auto-execution disabled, and a project-authored script. No bundle text or other third-party script was executed.

The vendor file contains 19 collections, 407 objects, two text blocks, 13 data blocks with drivers, and an external-path record for `C:\tmp\copybuffer.blend`. Those findings are why the vendor scene was not adopted as a working file. The two embedded text blocks are preserved verbatim in `VENDOR_EMBEDDED_TEXT_EVIDENCE.md`; one is the bundle README and one is an apparently stale Rain Rig license note. Neither entered the sanitized checkpoint.

## Exact selected source

Only the collection `Body Male - Realistic` was requested through `bpy.data.libraries.load(..., link=False)`. Its exact three objects were:

- `GEO-body_male_realistic`;
- `GEO-body_male_realistic.eye.L`;
- `GEO-body_male_realistic.eye.R`.

The main body uses 10,582 base vertices, 21,170 edges, 10,590 polygons, and a three-level Multires modifier. The source mesh data-block is named `female_v006lowresUV` in the vendor file; that inconsistent internal name is recorded rather than hidden. The selected asset is visually the realistic male full-body collection advertised by Blender.

No stylized body, female body, primitive body, separate head, hand, foot, skeleton, camera, thumbnail, material, or other bundle asset entered the sanitized source.

## Sanitized checkpoint

The sanitizer began from factory blank state with auto-execution disabled, appended only the selected collection, constructed clean local copies of the three selected mesh IDs, removed the append source and library bookkeeping, stripped custom properties unrelated to the source record, removed text/actions/materials/images/node groups, checked drivers, and preserved the body Multires data.

The resulting immutable source checkpoint is `source/kyx_vanguard_v6_cc0_anatomy_seed_sanitized.blend`, 12,582,373 bytes, SHA-256 `e2d5b41ce10364cfc570fb0efe961c6548fe6fb90ab87850b453728372669e0d`.

An independent reopen inventory confirms one collection, three mesh objects, three mesh data blocks, and zero text blocks, drivers, actions, materials, images, external libraries, or external paths. See `evidence/sanitization-report.json` and `evidence/sanitized-blend-inventory.json`.

## Rights conclusion and attribution policy

The official Blender listing and the embedded bundle README both state that the Human Base Meshes assets are CC0. The canonical CC0 legal-code URL and the evidence chain are recorded in `LICENSES/CC0-1.0.txt`. CC0 does not require attribution, but KYX retains this internal provenance and credits Blender Studio / Blender Foundation and community contributors.

The unrelated embedded `License` text says “Rain Rig” and CC BY 4.0. It is treated as stale global text because the selected product is Human Base Meshes, the bundle README specifically states all provided assets are CC0, the official listing labels this bundle CC0, and no Rain Rig, rig, action, or associated collection was selected. The anomaly remains visible in the evidence rather than being silently discarded.

## Authorship boundary

The sanitized anatomy remains third-party CC0 work. KYX may modify it, but it must not claim that base anatomy as original. Project originality begins with the documented design sculpt, technical garment, armor, helmet, cowl, gloves, boots, rifle, retopology, UVs, materials, runtime rig, LODs, first-person arms, animation, and integrations authored after this checkpoint.

These source and render artifacts are prework only. They do not clear the v5/v5b rejection, do not prove a final non-blocky player, and do not satisfy G6 or human visual acceptance.
