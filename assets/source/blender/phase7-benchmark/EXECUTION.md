# Phase 7 benchmark execution record

- Date: 2026-07-20 (America/Chicago)
- Status: `EXECUTED_BENCHMARK_ONLY`
- G6: not claimed
- Blender: 5.1.2, build hash `ec6e62d40fa9`
- CLI: `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe`
- Mode: `--background --factory-startup`
- Runtime/package changes: none
- Third-party art or textures: none

## Final output

| Metric | Result |
|---|---:|
| Export objects | 31 |
| Mesh objects / GLB meshes | 28 / 28 |
| Source vertices | 930 |
| Source triangles | 1,748 |
| Source primitives | 28 |
| Materials | 8 |
| Bones | 23 |
| Skins in GLB | 1 |
| Named actions | 1 |
| F-curves / source keys | 45 / 135 |
| GLB animation channels | 51 |
| GLB bytes | 139,236 |
| GLB SHA-256 | `6761391bb7eb88bcbb826ef9db9744905aa4f272ec102ecb09456c0653de75c2` |
| GLB export | 0.390096 s |
| Three 720×720 renders | 1.522412 s total |
| Final scripted run | 2.048600 s |

The exported GLB container is version 2, its declared byte length matches its
file length, and it contains the named `BENCH_TacticalShift_Loop` animation,
one skin, 28 meshes, 8 materials, 48 nodes, and no required extensions.

## Reproducibility check

Three complete headless builds were run after Blender 5.1 compatibility fixes.
The GLB was byte-identical on all three successful builds, retaining the hash
shown above. Blender `.blend` serialization and Eevee/Freestyle PNG byte hashes
changed between runs, so their hashes are recorded only as identities of the
current artifacts, not as cross-run determinism sentinels.

## Visual inspection

The three frames were inspected at original 720×720 resolution. They show a
coherent loop endpoint at frames 1 and 24 and a distinct committed pose at
frame 12. The character and rifle axis remain legible, the left shoulder/device
creates the intended asymmetrical read, and ink/paper/oxide/aqua/saffron masses
remain separated without bloom. The result is intentionally a simple low-poly
mannequin benchmark, not a finished hero or production weapon.

## Known limitations and warnings

- Rigid bone-parented parts are not skin-deformation proof.
- There are no LODs, first-person arms, viewmodel, texture atlases, KTX2,
  meshopt, or production runtime materials.
- One sub-second pose loop is not the required first/third-person clip matrix.
- Freestyle contours are render-only and do not prove runtime outline stability.
- Khronos glTF Validator was not installed or run; only structural GLB parsing
  and Blender exporter completion were verified.
- No close/mid/far, grayscale, color-vision, low/high, or 2/4/8-instance profile
  has been performed.
- No human art approval or G6 acceptance is implied.
