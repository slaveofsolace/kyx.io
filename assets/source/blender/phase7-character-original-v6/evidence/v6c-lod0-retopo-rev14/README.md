# Rev14 LOD0 Character Evidence

Decision: **machine/export checks pass in bounded scope; direct visual review fails open; NOT G6; NOT runtime integrated.**

This packet describes the isolated `V6C_LOD0_SEMANTIC_RETOPO_CANDIDATE_REV14`. It does not replace `public/soldier.glb`, close G6, or establish release eligibility.

## Corrected export defect

The first Rev14 direct renders exposed a giant lower-body pyramid. The source was Blender's importer-only `Icosphere` bone-control helper: 80 triangles in the reserved `glTF_not_exported` collection were incorrectly classified as hard-surface geometry, reduced to eight triangles, joined into the hard role, and exported.

The authoring script now excludes importer-only meshes before semantic allocation and role consolidation. The rebuilt GLB and all five current direct renders show the full character without that artifact. The audit explicitly records the excluded `Icosphere` and asserts that it never enters the reduction records.

## Exact rebuilt artifact

- GLB: `../../model/v6c-lod0-retopo-rev14/export/kyx-v6c-lod0-retopo-rev14.runtime-candidate.glb`
- Bytes: `3,314,572`
- SHA-256: `4a42ab81a4df17f40572a0fb276ab7a5310cae71edfe8ac5f65868d3e77e9dbb`
- Runtime mesh roles/primitives/materials: `3 / 3 / 3`
- Triangles: `41,682` total (`19,868` soft, `14,882` hard, `6,932` rifle)
- Skin: `1`, with `52` joints
- Embedded clips: `10`
- Contact-marker round trip: `1,388` expected and `1,388` reimported vertices; maximum world-coordinate delta `1.7881393432617188e-7`
- Export/reimport assertions: all `17` true

The contact-marker count proves preservation of the rifle marker geometry. It does not prove convincing hand placement.

## Official Khronos glTF Validator

The untouched raw report is `khronos-gltf-validator-report.json`.

- Validator: official Khronos `gltf-validator` `2.0.0-dev.3.10`
- Report SHA-256: `9744936dc3b51fb84146c20fd8dc6ac4d0ad7d3b870054ea63d70569ec470544`
- Result: `0` errors, `3` warnings, `3` infos, `0` hints; not truncated
- Warnings: `NODE_SKINNED_MESH_NON_ROOT` at `/nodes/52`, `/nodes/53`, and `/nodes/54`
- Infos: `UNUSED_OBJECT` for `TEXCOORD_0` on each of the three primitives because no final texture atlas is attached yet

The three non-root skin warnings remain open for product-integration review. They do not invalidate parsing, but parent transforms on those skinned mesh nodes would not affect the meshes.

## Direct render evidence

`direct-glb-render-report.json` fresh-imports the exact GLB and records five views: front three-quarter idle, opposite/rear-side idle, firing-side weapon contact, support-side weapon contact, and a run-clip sample. Every view was rendered twice and each repeat was byte-identical. Imported topology and the source GLB hash remained unchanged.

Visual review still fails open:

- The firing hand is open and offset rather than convincingly gripping the trigger and handle.
- The support hand has loose/open fingers, sits below the foregrip, and may clip the underside.
- Torso-to-hip material transitions remain patchy.
- Pants and boots lack final production surface detail.
- The sampled run frame reads nearly static; convincing run-stride readability is not visually proven.

## Still open

Human visual acceptance, corrected weapon contact, animation readability, LOD1/LOD2, final texture atlases, first-person arms, gameplay markers, product/runtime integration, and 2/4/8-player performance remain open. Rev14 is an isolated source candidate only.

*Currently being worked on.*
