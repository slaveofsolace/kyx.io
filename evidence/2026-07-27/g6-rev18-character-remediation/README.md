# KYX.IO G6 Rev18 Character Remediation Evidence

Status: substantive first remediation candidate; not production-ready, not
default, not release-eligible, and not G6.

Rev18 is preserved because it is a visible improvement over Rev17: the lower
body has a continuous humanoid silhouette instead of floating calf blocks,
boots and leg protection are integrated, the armor is less oversized, and the
dark graphite material hierarchy is easier to read than the icy single-value
palette. The direct comparison is:

`renders/comparison/kyx-v6c-character-rev17-vs-rev18-front-left.png`

This does not make the model final. The head and visor still read oversized and
bald, the shoulder-to-upper-arm and waist-to-hip transitions are rough, the
underlying anatomy still reads too much like a smooth mannequin, the hands do
not convincingly wrap either weapon, and the inherited rifle remains oversized
and visually dominant.

## Isolated repository state

| Item | Value |
|---|---|
| Worktree | `C:\AI Projects\Projects\Games\evio\evio-g6-rev18-model-20260727` |
| Branch | `codex/g6-rev18-model-20260727` |
| Exact base | `6e67732f7525a5df7cbf1b17409157a208aec059` |
| Rev17 source input | SHA-256 `832f85562aacdface4d05d86158f9769a69572c99f3f22f98908b30cf986f7c8`, unchanged |
| Runtime integration | None |
| Default promotion | None |
| Push or deployment | None |

## Candidate artifacts

| Artifact | Triangles | Bytes | SHA-256 |
|---|---:|---:|---|
| LOD0 | 46,435 | 4,640,744 | `50a958fcf24dbc2e840e41a9cad8923cb28e6a85a0d96bee55c52e2a182e4145` |
| LOD1 | 13,982 | 2,677,980 | `05f8ba05ea214b3e9f6b6829272f5bd04753bc755699d670ac513c21b2c20582` |
| LOD2 | 5,184 | 1,928,388 | `13c4af9608851a1cd7e6a7e884a33cfc860864c3b30dcad5b5cf1924e61c6cfe` |
| First-person | 27,026 | 3,586,148 | `2b79ffe7470cfd9f8fab2228a644db58703262608d8e72d6ebe09237a28e9db0` |
| Melee proof only | 39,399 | 3,189,852 | `3def1d370e6fabcf7e741f64920e110bc748955f5a4c52daddcb139525bf74bb` |
| Master `.blend` | n/a | 6,204,503 | `7b22eee2f41d30ee633cb216e837d2c5101d14dac90a63d2f05452c4a8e81f37` |

The normal LOD0, LOD1, LOD2, and first-person assets do not contain the sword.
The sword exists only in the separate melee-proof GLB so this lane cannot
produce the runtime weapon-overlay failure by default.

## Structural and compatibility validation

- Blender 5.1.2 exported every candidate and freshly reimported the exact LOD0
  GLB with three meshes, one 67-bone armature, 15 sockets, and 17 actions.
- `KYX_REV18_TP_MELEE` uses one 24 fps action clock. The blade transform comes
  from `socket_melee`, a child of `palm.R`; the sword object has no independent
  animated translation.
- Nine swing samples measured a worst right-hand-to-grip surface gap of
  0.020736 m, below the 0.05 m structural threshold.
- All five GLBs passed Khronos glTF Validator 2.0.0-dev.3.10 with zero errors.
  Each has three disclosed `NODE_SKINNED_MESH_NON_ROOT` warnings inherited from
  the three skinned-mesh hierarchy. `UNUSED_OBJECT` entries for untextured UV
  channels are informational.
- The exact GLBs remained byte-identical through validation. Direct import
  rendered all eight LOD0 inspection views and seven melee/contact views
  without topology mutation.
- Runtime gameplay-camera loading, action wiring, performance, muzzle effects,
  and default-path regression are not tested here because Rev18 is deliberately
  not integrated.

## Evidence index

- `author-remediation-report.json`
- `direct-glb-render-report.json`
- `asset-reports/khronos/khronos-validator-index.json`
- `renders/comparison/kyx-v6c-character-rev17-vs-rev18-front-left.png`
- `renders/eight-view`
- `renders/melee-contact`

## Remaining production work

- Replace the mannequin-like inherited anatomy with a true sculpt, retopology,
  cloth-breakup, and hand/finger pass.
- Redesign the head/helmet/visor proportions and resolve the exposed bald cap.
- Rebuild shoulder articulation and waist/hip armor transitions so they deform
  cleanly through the full clip set.
- Reduce or replace the inherited rifle and author convincing two-hand,
  trigger-finger, support-hand, and reload contact with weapon-space IK.
- Redesign the proof sword and guard; the socket attachment is structurally
  stable, but the close-up pose and finger wrap are not visually acceptable.
- Integrate only after review, then capture actual player/enemy gameplay-camera
  evidence, every-frame clipping/contact proof, muzzle/nozzle behavior,
  LOD/performance measurements, and default-path regression.

No automated check, render, comparison image, or this handoff grants G6.
Explicit human visual acceptance remains required.
