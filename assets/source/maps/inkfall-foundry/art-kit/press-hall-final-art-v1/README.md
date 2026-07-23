# Inkfall Foundry Press Hall final-art candidate v1

This package is a bounded, render-only G5 candidate for the representative Press Hall room and its Red Fold and Paper Drop transitions. It is built from original Blender geometry and original procedural materials. It does not replace the locked revision-2 authority collision, does not change `DEFAULT_MAP_REVISION = 1`, and is not wired into the product map selector.

## What is authored

- split north/south print-reactor shells inside the sealed revision-2 reactor envelopes;
- four asymmetric, panel-layered press baffles and four refined cover modules inside their sealed envelopes;
- a tiled paper/ceramic floor shell, graphite structural cassette walls, columns, ceiling trusses, bounded lighting, and hanging paper elements;
- a paired, shape-coded Red Fold transition with a vermilion split-ring silhouette;
- a Paper Drop frame, overhead paper tears, landing marking, and a controlled garden/conduit seam;
- seven semantic P6.7 material roles and deterministic gameplay, close, mid, far, transition, and grayscale renders.

## Build

Use Blender 5.1 or newer:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' `
  --background --factory-startup `
  --python .\assets\source\maps\inkfall-foundry\art-kit\press-hall-final-art-v1\build_press_hall_final_art_v1.py `
  -- --repo-root . `
  --output-root .\assets\source\maps\inkfall-foundry\art-kit\press-hall-final-art-v1
```

The builder refuses to run if the P6.7 lock, dimension contract, revision-2 Blender source, graybox render GLB, or authority-collision GLB hashes drift.

## Verify

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' `
  --background --factory-startup `
  --python .\tools\evidence\verify-inkfall-g5-press-hall-art.py `
  -- --repo-root . `
  --output-root .\assets\source\maps\inkfall-foundry\art-kit\press-hall-final-art-v1 `
  --report-output .\evidence\2026-07-22\phase-6-g5-press-hall-final-art-v1\independent-verification.json
```

Current independent result: `INDEPENDENT_G5_PRESS_HALL_ART_VERIFICATION_PASS` with 18/18 checks.

## Acceptance boundary

This package is a retained art candidate, not a G5 pass. Runtime rendering, performance budgets, collision/no-snag play, color-vision review, and human visual/playtest acceptance remain required before promotion.
