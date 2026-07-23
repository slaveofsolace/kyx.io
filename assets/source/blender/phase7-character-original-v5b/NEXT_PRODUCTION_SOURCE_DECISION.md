# KYX Vanguard next production source decision

- Decision date: 2026-07-21
- Decision status: **APPROVE SOURCE PLAN; ACQUISITION NOT YET AUTHORIZED OR PERFORMED**
- Recommended new lane: `assets/source/blender/phase7-character-sculpt-v6/`
- G6 status: **open; not claimed**
- Runtime integration: **not authorized by this decision**

## Decision

Use **Blender Studio / Blender Foundation Human Base Meshes v1.4.1**, specifically the bundle's realistic male full-body collection, as an anatomical high-resolution sculpt seed for KYX Vanguard. Use the locally installed **Blender 5.1** as the canonical authoring tool. Use Blender's bundled **Rigify** only as an animator-facing control-rig scaffold; bake approved actions to a separately defined KYX runtime deform skeleton.

The bundle must not become a minimally edited final character. It supplies continuous human anatomy and credible hand, foot, joint, and torso landmarks. The visible silhouette, face/helmet interface, technical garment, armor, gloves, boots, rifle, topology, UVs, textures, rig, weights, LODs, and animation remain project-authored work driven by the pinned KYX Vanguard sheet.

This is the recommended route because it removes the procedural capsule/loft base that caused v5 and v5b to fail while avoiding an executable third-party character-generator add-on.

## Local audit

Read-only inspection on 2026-07-21 found:

- `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe`, file/product version 5.1, published by Blender Foundation;
- bundled core `rigify` present;
- no MPFB, MakeHuman, MB-Lab, or CharMorph installation in the Blender 5.1 user extension tree;
- no provenance-safe external humanoid base in the searched project asset tree or user Downloads location;
- only the already preserved KYX v2-v5b outputs, all of which remain rejected or blocked.

Nothing was downloaded, installed, imported, or executed for this research decision.

## Official sources and rights

| Item | Official source | Rights and compatibility finding | Disposition |
|---|---|---|---|
| Human Base Meshes v1.4.1 | [Blender Demo Files](https://www.blender.org/download/demo-files/) and [official v1.4.1 ZIP](https://www.blender.org/download/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip) | Blender lists the 49 MB bundle as **CC0**, by Blender Studio and community contributors, and requiring Blender 4.2 LTS or newer. Blender 5.1 satisfies that requirement. CC0 permits commercial use, modification, and redistribution without required attribution. | **Selected anatomical source.** |
| Blender 5.1 and Rigify | [Blender license](https://www.blender.org/about/license/) and [Blender Manual license explanation](https://docs.blender.org/manual/en/3.2/getting_started/about/license.html) | Blender is GPL software; the GPL applies to the application, not artwork created with it. Local Blender 5.1 and bundled Rigify are already present. | **Selected toolchain.** |
| MPFB 2.0.16 | [official MPFB releases](https://static.makehumancommunity.org/mpfb/releases/index.html), [2.0.16 notes](https://static.makehumancommunity.org/mpfb/releases/release_2016.html), [2.0.14 Blender 5.1 notes](https://static.makehumancommunity.org/mpfb/releases/release_2014.html), [license](https://static.makehumancommunity.org/about/license.html), and [closed-source game FAQ](https://static.makehumancommunity.org/mpfb/faq/use_in_closed_source.html) | MPFB code is GPL and its core mesh/targets/skins are CC0. The official FAQ permits selling models and use in closed-source games, but separately sourced assets can have other terms. MPFB 2.x requires Blender 4.2+; 2.0.14 explicitly added Blender 5.1 compatibility fixes, and 2.0.16 is the later current release. | **Fallback reference generator only.** It executes a substantial extension and a default output would retain a recognizable generator look. Do not use it unless the selected Blender base proves unusable, and then use core CC0 assets only after code and asset-pack review. |
| MB-Lab 1.8.1 | [archived official repository](https://github.com/animate1978/MB-Lab) and [license file](https://github.com/animate1978/MB-Lab/blob/master/license.txt) | Repository archived 2024-07-21; it states Blender 4.0+ rather than verified 5.1 support. Its database/meshes are AGPL-3.0 and its license says generated 3D models default to AGPL-3.0 and must carry the database copyright. | **Rejected.** Output terms conflict with the intended closed-source-ready runtime asset lane, and maintenance/5.1 risk is high. |
| CharMorph | [official documentation](https://blendercharacterproject.org/docs/html/Introduction.html) and [official downloads](https://blendercharacterproject.org/download.html) | Add-on code is GPL, but character content has mixed licenses: CC-BY, AGPL, or CC0 depending on the selected character. No official Blender 5.1 support declaration was found in the reviewed material. | **Rejected as canonical source.** Per-character license branching and generator identity add risk without improving on the selected static CC0 sculpt bundle. |

License conclusions apply only to the named core assets. Do not silently add community clothing, hair, textures, motion, or other packs; every such item requires its own source and license record.

## Required source bundle and provenance record

At acquisition time, create a quarantined source record separate from runtime exports:

```text
assets/source/vendor/blender-human-base-meshes/1.4.1/
  SOURCE.lock.json
  CREDITS.from-bundle.md
  LICENSES/
    CC0-1.0.txt
  inventory.json
  original/
    human-base-meshes-bundle-v1.4.1.zip
  extracted/
    human_base_meshes_bundle.blend

assets/source/blender/phase7-character-sculpt-v6/
  PROVENANCE.md
  source-reference.json
  model/
  retopo/
  textures/
  rig/
  animation/
  exports/
  evidence/
```

`SOURCE.lock.json` must record:

- exact product and version (`Human Base Meshes 1.4.1`);
- official listing and direct-download URLs;
- acquisition timestamp and operator;
- ZIP byte size and SHA-256;
- extracted `.blend` byte size and SHA-256;
- exact selected collection/object data-block names;
- bundled author/credit text copied verbatim from the archive;
- CC0 license text and its source URL;
- Blender version used to inventory and sanitize it;
- hashes of the sanitized imported base and first project sculpt;
- a statement that no other bundle assets entered the KYX source.

CC0 does not legally require attribution, but KYX must retain internal credit and the full provenance chain. The original ZIP is about 49 MB and this repository currently has no Git LFS policy. Do not add that binary to normal Git history until the project selects Git LFS or a durable source-artifact store; meanwhile, the lock, license, credits, and hashes belong in the repository and the exact archive belongs in the approved source store. Nothing under this vendor tree enters `public/` or a web build.

## Deterministic acquisition and safe import

Do not run these steps until acquisition is explicitly authorized.

1. Download only version 1.4.1 over HTTPS from the official Blender URL above into a new quarantine directory. Do not use search-result mirrors or an extension installer.
2. Compute SHA-256 and byte size before extraction. Blender does not publish a checksum beside the reviewed listing, so the first reviewed acquisition hash becomes the project pin rather than a publisher-authenticated checksum. A changed payload at the same versioned URL must stop the pipeline for review.
3. Enumerate the ZIP and reject path traversal, executable files, symlinks, or unexpected extensions before extracting. Retain the untouched archive and bundled README/license/credit material.
4. Inventory the `.blend` using Blender 5.1 with `--factory-startup --disable-autoexec --background`. Use only an audited in-repository inventory script; do not enable embedded Python or load user extensions.
5. Assert that the expected realistic male full-body collection exists and write all collection, object, mesh, material, image, text, driver, library, and external-path names to `inventory.json`.
6. In a fresh blank file, use `bpy.data.libraries.load(..., link=False)` to append only the selected collection. Do not open the vendor file as the working scene. Remove text blocks, drivers, handlers, external library links, non-selected materials/images, and unused data from the sanitized copy.
7. Save the immutable sanitized base and record its hash. Duplicate it into the v6 sculpt lane; never modify the vendor original or sanitized checkpoint in place.
8. Re-run the inventory after sanitization and require no scripts, external links, missing files, or unapproved data blocks. A human then checks neutral front/side/back anatomy plates before sculpt work begins.

The planned acquisition target and command shape are pinned below for the authorized run; this block has not been executed:

```powershell
$kyxVendorRoot = 'C:\AI Projects\Projects\Games\evio\evio-repo\assets\source\vendor\blender-human-base-meshes\1.4.1'
$kyxQuarantine = Join-Path $kyxVendorRoot 'quarantine'
$kyxArchive = Join-Path $kyxQuarantine 'human-base-meshes-bundle-v1.4.1.zip'
$kyxExtracted = Join-Path $kyxVendorRoot 'extracted'

New-Item -ItemType Directory -Force -Path $kyxQuarantine, $kyxExtracted
Invoke-WebRequest -Uri 'https://www.blender.org/download/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip' -OutFile $kyxArchive
Get-Item -LiteralPath $kyxArchive | Select-Object FullName, Length, LastWriteTimeUtc
Get-FileHash -Algorithm SHA256 -LiteralPath $kyxArchive
Expand-Archive -LiteralPath $kyxArchive -DestinationPath $kyxExtracted
Get-ChildItem -LiteralPath $kyxExtracted -Recurse -File | Get-FileHash -Algorithm SHA256
```

Before `Expand-Archive` is used in the real run, a read-only ZIP-entry validator must pass. The shown extraction line is the deterministic destination, not permission to skip that validator.

The `.blend` is a data file, but Blender files can contain text blocks, drivers, external links, and auto-run requests. `--disable-autoexec`, factory startup, append-only selection, a data-block inventory, and sanitization are mandatory supply-chain controls.

## Production path from source to runtime

### 1. Sculpt and design approval

- Establish adult athletic proportions and a distinctive KYX silhouette from the pinned model sheet in neutral A-pose.
- Sculpt readable clavicle/deltoid/elbow/wrist/pelvis/patella/calf/ankle/heel/palm/digit landmarks before adding costume pieces.
- Obtain human approval of clay front/side/back, three-quarter, and grayscale plates at 5 m/20 m/40 m reads. Do not conceal weak anatomy under armor.
- Author technical cloth from garment patterns and tension/fold logic. Author ceramic pieces as fitted layers with deformation gaps, not inflated duplicates of the body.
- Model helmet crown, brow, visor seal, cheeks, chin, rear shell, and neck interface as connected construction.
- Model gloves, five-digit grip anatomy, boots, and the Auto Rifle as separate production assets. The rifle needs real stock/receiver/grip/magazine/handguard/barrel continuity, negative space, trigger guard, and reachable controls.

### 2. Retopology, UVs, and materials

- Build a new project-authored deformation cage; do not decimate the sculpt into LOD0.
- Preserve loops at shoulders, elbows, wrists, thumb web/fingers, hips, knees, ankles, and neck. Remove hidden body faces only after armor deformation and clipping are proven.
- Target the existing desktop budgets: third-person LOD0 **25k-45k tris**, LOD1 **12k-22k**, LOD2 **4k-8k**, with **1-3 materials/primitives**.
- Create non-overlapping authored UVs with measured texel density. Use 1K-2K atlases per visible family unless a measured viewmodel need justifies 4K; plan KTX2 plus mipmaps for runtime.
- Author cloth, ceramic, rubber, painted metal, skin, line, team, and wear masks from scratch. No bundle or generator-default surface should remain visible.
- Derive LOD1/LOD2 from controlled retopo/decimation, then manually repair silhouette, joints, hands, helmet, weapon contact, and outline behavior.

### 3. Rig, weights, and animation

- Define one KYX runtime skeleton with stable names/axes, root/hips/spine/chest/neck/head, complete limbs/fingers, required sockets, and only approved twist/helper bones.
- Target **60-90 runtime deform bones** and at most **four influences per vertex**. Rigify may drive authoring controls, but generated UI/control bones must not leak into the runtime skeleton.
- Weight-test extreme shoulder, elbow, wrist, hip, knee, ankle, crouch, slide, jump, landing, and death poses before animation production.
- Constrain both hands to authored rifle contacts. Evidence must show right index inside the guard on the trigger, right grip wrap, left palm/digit wrap, stock-to-shoulder contact, reload clearance, and no clipping.
- Bake the required third-person and first-person locomotion/combat action matrix and markers to the runtime deform rig, then validate loops, planted-foot slide, contact error, and transition discontinuities.

### 4. Dedicated first-person assets

- Build dedicated first-person arms/sleeves/hands from the approved high-detail source, not a camera-cropped third-person body.
- Target **15k-30k tris** and **1-2 materials** for the arms. Give hands/grips more detail than third person and author viewmodel-specific weights and poses.
- Build separate world and viewmodel Auto Rifle exports. Test 70-110 gameplay FOV plus the selected viewmodel FOV, wall proximity, sprint, slide, reload, melee, grenade/ability transitions, muzzle/casing sockets, lighting, outline, and camera clipping.

### 5. Release evidence

- Preserve high-poly source, retopo, UV, texture, rig, action, and export checkpoints with hashes.
- Produce close/mid/far color and grayscale plates, topology/UV sheets, armor-gap and boot-floor close-ups, extreme-deformation plates, trigger/support-hand/stock contact plates, and LOD comparisons.
- Validate GLB structure and Khronos glTF output, asset manifests, bones, clips, markers, texture memory, encoded bytes, and provenance.
- Integrate only after explicit human visual approval, then capture runtime 2/4/8-player LOD, contact-shadow, outline, clipping, animation, and performance evidence.

## Why this can clear the visual rejection

V5 and v5b failed because their anatomy and equipment were generated from capsules, sectional lofts, slabs, rods, and box extrusions. Human Base Meshes supplies continuous organic anatomy with actual joint, hand, foot, torso, and facial landmarks, which gives a sculpt artist credible underlying planes and transitions instead of another shape assembly.

The source alone does not clear the bar. The bar can be cleared only by the manual v6 sculpt/design/retopo process above: a distinctive concept-matched body, tailored cloth, constructed armor and helmet, fully modeled gloves/boots/rifle, authored surfaces, production deformation, and unambiguous weapon contact. Treating the CC0 base as invisible anatomical scaffolding avoids both the rejected procedural look and a recognizable generator-final look.

## Explicit non-claims

- No asset or add-on has been acquired or installed.
- No third-party code has been executed.
- No new character source has been imported.
- No v6 geometry, rig, LOD, first-person arms, rifle, animation, or runtime integration exists from this decision.
- This decision does not reverse the v5/v5b visual rejection and does not satisfy or claim G6.
