# KYX V6C character Rev16 corrective checkpoint

Status: **STRUCTURALLY VALID; VISUALLY REJECTED; NOT G6**

Rev16 is an isolated corrective experiment. It does not replace a public
runtime model and is not a release candidate.

## Exact runtime export

- file: `../../model/v6c-character-rev16/export/kyx-v6c-character-rev16.runtime-candidate.glb`
- bytes: `3,073,000`
- SHA-256:
  `13a3f3761960b0aad80653dce5c7f3439f29458f8979b8f10537e9be40b9c0eb`
- geometry: 36,082 triangles across three role meshes/primitives/materials
- rig: one skin, 52 joints
- animation: ten embedded third-person clips
- Khronos validator: zero errors, three
  `NODE_SKINNED_MESH_NON_ROOT` warnings, and three unused-UV informational
  messages

The fresh export/reimport audit, eight-view direct-GLB capture, before/after
GLB hash check, deterministic repeat renders, contact-mask check, clip check,
weight check, and topology checks all passed their bounded structural
contracts.

## Strict visual review

The exact-current renders fail the G6 visual bar:

- both hands read as fragmented open claws rather than convincing grips;
- the oversized torso shell intersects the arms and reads as a cone/barrel;
- its lower rim creates a skirt-like hip brim over a jagged pelvis;
- the gaiters remain blunt capped cylinders;
- the run poses do not convincingly show planted weight or contact; and
- the overall silhouette is still blockier and less human than the required
  production-quality target.

Numeric fingertip proximity and contact-mask coverage do not override these
visible defects.

## Boundary

Rev16 provides useful failure evidence and an exact reproducible source lane,
but it does not supply LOD1/LOD2, first-person arms, the complete animation
matrix, final textures, runtime integration, performance proof, human
acceptance, or G6 acceptance.

*Currently being worked on.*
