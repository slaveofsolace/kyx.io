# Inkfall Foundry Press Hall visual strike v2

This is a preserved, render-only successor to the verified v1 Press Hall art candidate. It adds visibly supported print stock, press hardware, fasteners, conduits, surface history, restrained registration marks, and a rebuilt Paper Drop roller/chute assembly while keeping every P6.7 replacement envelope, authority-collision artifact, and the revision-1 catalog default unchanged.

## Result

- Automated bounded build: `BOUNDED_PRESS_HALL_ART_V2_BUILD_PASS`.
- Independent Blender verification: `INDEPENDENT_G5_PRESS_HALL_ART_V2_VERIFICATION_PASS` (18/18 checks).
- Strict visual decision: **NOT_APPROVED for G5**. Retain as evidence and a source candidate only.
- Product integration: not performed.

The mechanical and material strike is materially stronger than v1, especially at Paper Drop. The large inherited room, cover, reactor, and suspended-panel forms still read too much like a dressed modular blockout at gameplay distance, so structural PASS results must not be interpreted as visual acceptance.

## Main artifacts

- Blender source: `source/inkfall_foundry_press_hall_final_art_v2.blend`
- staged render-only GLB: `export/inkfall_foundry_press_hall_final_art_v2.glb`
- seven deterministic views: `renders/`
- two 1920x1080 review boards: `boards/`
- build report: `validation/press-hall-final-art-v2-build-report.json`
- independent report: `evidence/2026-07-22/phase-6-g5-press-hall-final-art-v2/independent-verification.json`

## Rebuild

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' `
  --background --python .\assets\source\maps\inkfall-foundry\art-kit\press-hall-final-art-v2\build_press_hall_final_art_v2.py `
  -- --repo-root . `
  --output-root .\assets\source\maps\inkfall-foundry\art-kit\press-hall-final-art-v2
```

The builder opens the exact verified v1 `.blend` and refuses to proceed if v1 or any frozen P6.7 input hash drifts.

## Independent verification

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' `
  --background --python .\tools\evidence\verify-inkfall-g5-press-hall-art-v2.py `
  -- --repo-root . `
  --output-root .\assets\source\maps\inkfall-foundry\art-kit\press-hall-final-art-v2 `
  --report-output .\evidence\2026-07-22\phase-6-g5-press-hall-final-art-v2\independent-verification.json
```

## Acceptance boundary

No G5, human visual, playtest, runtime, accessibility, performance, no-snag, product-integration, shipping-default, or deployment claim is made. Revision 1 remains the catalog default.
