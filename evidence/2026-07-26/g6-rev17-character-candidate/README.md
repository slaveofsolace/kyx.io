# KYX.IO G6 Rev17 Character Candidate Handoff

Handoff status: Review-ready candidate; human visual acceptance required.

Rev17 is an opt-in character, enemy, and first-person presentation candidate.
It is not the default character, is not release-eligible, and is not accepted
as G6. Rev15 and Rev16 remain rejected and non-default.

## Repository state

| Purpose | Commit |
|---|---|
| Required main integration | `145264d7d72e2dc1be63eddc355edf4e5d5e2cac` |
| Rev17 authored source, GLBs, and deterministic renders | `b5df358ce9a786bfc7a1846cd0c03d4ef7b0be2a` |
| Safe merge of required main into the isolated lane | `52647d4fb890878d94b5895afb19f3b62aefc9eb` |
| Opt-in runtime integration and runtime evidence | `8dc4548eecd28b70f712fb40b2f0bd7281099d0a` |
| Consolidated handoff and post-merge validation | The commit containing this file |

Worktree: `C:\AI Projects\Projects\Games\evio\evio-g6-rev17-20260726`

Branch: `codex/g6-rev17-character-animation`

The primary checkout was not edited by this lane. No multiplayer authority,
map, UI/HUD, Cloudflare, GitHub deployment, or default-promotion file is part
of the Rev17 commits.

## Candidate assets

| Asset | Triangles | Bytes | SHA-256 |
|---|---:|---:|---|
| Third-person LOD0 | 43,928 | 3,584,252 | `a138d9322cb6386713077cce1628c92a934ccf13421e7f2d11459ef215b738e1` |
| Third-person LOD1 | 18,614 | 2,558,944 | `4862b0a0794e0ecd1c61a5151f478faa34d84dedb89c137d997f50cd6b6d24cc` |
| Third-person LOD2 | 7,109 | 1,817,156 | `dbf6be634674c2af1eb0f45f757f44784a1fb634c4ca0d509d66b42a423d4086` |
| Dedicated first-person arms/rifle | 27,026 | 2,495,708 | `bfa8af298998fa1d5e5067403ca1e00b4d48a539d7112b8f42fe0a848c28c2d6` |

The shared third-person contract has 66 joints, 14 sockets, 16 clips, three
meshes/primitives/materials, and one skin. The source `.blend`, deterministic
author/export/render/validation scripts, fresh reimport proof, candidate
manifest, and provenance record are preserved under:

`assets/source/blender/phase7-character-original-v6`

The public copies under `public/candidates/g6-rev17` are byte-exact matches of
the source exports. `public/soldier.glb` remains unchanged and still matches
the committed Git LFS OID and size.

## Runtime opt-in

Rev17 is enabled only by:

`?g6Candidate=rev17`

Evidence-only population selections are:

- `?g6Candidate=rev17&g6Population=2`
- `?g6Candidate=rev17&g6Population=4`
- `?g6Candidate=rev17&g6Population=8`

The final preview used `127.0.0.1:6099`. Ports `5173` and `8787` were not
bound by this lane.

The player uses LOD0, practice enemies use LOD1, and the camera uses the
dedicated first-person asset. LOD2 is authored and structurally valid, but
distance-based switching, hysteresis, and crossfade are not implemented or
accepted.

The live first-person reload deliberately uses a bounded camera-space dip and
roll. The raw `KYX_REV17_FP_RELOAD` clip remains embedded and appears in the
direct authored evidence, but it is not played in the live camera because its
reach did not pass camera-clearance review. This fallback is not a completed
hand/magazine retarget.

## Evidence index

- `asset-reports/author-export-audit.json`
- `asset-reports/direct-glb-render-report.json`
- `asset-reports/khronos-validator-index.json`
- `renders/eight-view`
- `renders/actions`
- `runtime/screenshots`
- `runtime/performance/runtime-performance-2-4-8.json`
- `runtime/performance/default-path-regression.json`
- `runtime/performance/runtime-asset-integrity.json`
- `runtime/performance/runtime-capture-report.json`
- `final-validation/khronos/khronos-validator-index.json`
- `final-validation/final-validation-report.json`
- `final-validation/check-logs`

The post-merge Khronos rerun passed all four GLBs with zero errors, three
disclosed `NODE_SKINNED_MESH_NON_ROOT` warnings per file, and disclosed
`UNUSED_OBJECT` informational entries. Reports were not truncated, and every
source hash and byte count remained unchanged through validation.

Chrome 150 headless measurements at 1280 by 720 on an RTX 4090/D3D11 sampled
180 consecutive animation frames after each live practice start:

| Actual population | Mean | P95 | P99 | Maximum | Frames over 20 ms |
|---:|---:|---:|---:|---:|---:|
| 2 | 2.818 ms | 3.800 ms | 5.600 ms | 5.700 ms | 0 |
| 4 | 1.974 ms | 3.600 ms | 3.700 ms | 3.900 ms | 0 |
| 8 | 2.561 ms | 3.800 ms | 5.500 ms | 5.500 ms | 0 |

These are hardware-specific review measurements, not a release-performance
guarantee.

## Automated validation

- Production build: PASS, with the repository's existing chunk-size warning.
- App, Worker, simulation-source, and simulation typechecks: PASS.
- New Rev17 modules and unaffected modified modules ESLint: PASS.
- Full Vitest run: 729 passed, one failed.
- Asset manifest validator: zero errors and 37 disclosed warnings.
- Phase 2 development/production boundary verifier: 10 passed, zero failed.
- `git diff --check`: PASS.
- Default no-query browser path: no Rev17 global, dataset, or network request;
  `/soldier.glb` returned HTTP 200; zero page errors.

The one test failure is
`tests/integration/content/inkfallGrayboxLock.test.ts` →
`recomputes every frozen source hash exactly`. Nine G3/G5 map or evidence
hashes differ from their older lock manifest. None of those files was modified
by this G6 lane, and the owning authority/map evidence was intentionally left
untouched.

Five ESLint unused-variable findings also predate this lane: three in
`PreviewCharacter.js` and two in legacy portions of `WeaponSystem.js`. Their
original blame commits and exact lines are recorded in
`final-validation/final-validation-report.json`.

## Human visual observations and non-claims

Sampled evidence shows a continuous athletic humanoid surface rather than the
rejected torn/claw-hand or primitive stacked-shape failure. Torso, pelvis,
hands, boots, rifle silhouette, two-hand contact, idle, run, fire, reload,
airborne, death, and first-person presentation are all represented.

The following remain explicit review items:

- The silhouette is stylized, with a narrow waist and broad rifle/upper armor.
- The first-person support arm forms a pronounced arc, and some hand/contact
  detail is occluded.
- The sampled death pose is a dramatic crumple, not a claimed fully settled
  ground pose.
- Sampled frames do not prove every-frame hand/weapon, arm/torso, boot/floor,
  wall, outline, camera, or muzzle-effect clipping freedom.
- The complete close/mid/far, grayscale, low/high quality, color-vision, and
  reduced-effects review matrix remains open.
- Melee carry/contact and distance-based LOD transitions are not visually
  accepted.

No automated check, render, runtime screenshot, performance sample, or this
handoff grants G6. Explicit human visual acceptance is still required before
any default promotion.
