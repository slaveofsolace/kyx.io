# Inkfall Foundry Press Archive Rev4.1

This package is a bounded, non-default G5 art candidate that preserves the
material-correct Press Hall v3.3 source and adds the west ascent into one Paper
Archive landing. It is original KYX.IO work. No code, geometry, coordinates,
wording, or assets were copied from `NotHereButAfk/Ev.io`.

## What changed in the evidence correction

- `gameplay_continuity` is a 28 mm, 1.72 m gameplay-eye-height view that shows
  Press Hall, the west ascent, and the amber Archive wheel in one continuous
  level-wide frame.
- `overhead_context` is a zero-roll, 1600 x 1200 orthographic top-down view.
  Its framing is calculated from the complete bounded derivative render scene
  with an eight-percent margin, so the Press Hall parent, diagonal ascent,
  entry, exit, and Archive landing are visible without edge clipping. It is
  not evidence of map-wide Inkfall coverage.
- `index_wheel` is pulled back 13.59 m at 45 mm so the wheel reads with its
  landing deck, gantry, ledger racks, and return rail rather than as an
  isolated close-up.
- The inherited neutral palette now has a clearer ceramic / steel / cast-iron
  value ladder. The ascent's two tread bands use the lighter inherited ceramic
  material, correcting the earlier mismatch between the authored intent and
  the material assignment.

## Artifacts

- `rev4/source/inkfall_foundry_press_archive_rev4.blend`
- `rev4/export/inkfall_foundry_press_archive_rev4.spatial-material-joined.glb`
- `rev4/renders/inkfall-rev4-press-archive-gameplay_continuity.png`
- `rev4/renders/inkfall-rev4-press-archive-overhead_context.png`
- `rev4/renders/inkfall-rev4-press-archive-index_wheel.png`
- `rev4/manifest.inkfall-rev4-press-archive.json`
- `rev4/validation/inkfall-rev4-press-archive-build-report.json`
- `rev4/validation/inkfall-rev4-press-archive-independent-verification.json`

The Rev4.1 export contains 45 joined render meshes, 190,788 triangles, and the
nine inherited Press Hall materials. The GLB is 12,954,608 bytes with SHA-256
`5e2aa22cc598f49181524ce78b481adf091f71a91a823171277963de11d4db00`.
The independent verifier passes 17/17 structural, hash, frozen-input, evidence
framing, and non-default-boundary checks.

## Rebuild and verify

From the repository root:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' `
  --background `
  --python 'assets/source/maps/inkfall-foundry/art-kit/press-archive-rev4/build_press_archive_rev4.py' `
  -- `
  --repo-root (Get-Location).Path `
  --output-root ((Get-Location).Path + '\assets\source\maps\inkfall-foundry\art-kit\press-archive-rev4\rev4')

& 'C:\Users\suhai\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' `
  'tools/evidence/verify-inkfall-g5-press-archive-rev4.py' `
  --repo-root (Get-Location).Path
```

The builder verifies all frozen inputs before and after generation. In
particular, Revision 3 authority collision remains byte-exact at SHA-256
`1cce637ab4f83766627527b3885c3e9da819d8bcabdfa2144f8dc6b46bc5bba8`,
and `src/content/maps/constants.ts` remains byte-exact at SHA-256
`7dd9dc7b6aa00207d819434695d3daae6e313d1947e19891bab97d5207908dcd`.

Validation executed on 2026-07-27:

- Blender 5.1.2 build: pass.
- Independent manifest/GLB/frozen-input verification: 17/17.
- Focused non-default selection, map-package, runtime-authority, traversal,
  and west-Archive regression tests: 32/32.
- TypeScript project typecheck: pass.
- Vite production build: pass.
- The isolated worktree's older P6.7 frozen-source byte test reports nine
  checkout-only CRLF hash differences; this branch changes none of those nine
  files. The same test passes 7/7 in canonical `main`, and the Rev4 verifier
  separately confirms its seven directly bound frozen inputs byte-for-byte.

## Explicit limitations

- This is render-only authored art. It is not collision or authority geometry.
- It is not wired into the product map selector or shipping runtime.
- `DEFAULT_MAP_REVISION` remains `1`; Revision 3 is not promoted.
- The top-down evidence covers only the bounded Press Hall-to-Archive
  derivative, not the full Inkfall map.
- G5 is open. Human visual acceptance and human 2/4/8-player review have not
  passed.
- Target-hardware performance and runtime traversal have not been accepted for
  this candidate.
- The Archive index wheel is a visual orientation landmark only and has no
  objective or gameplay semantics.
- No deployment or publishing authorization was used.
