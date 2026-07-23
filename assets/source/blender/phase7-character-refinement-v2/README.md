# Phase 7 character refinement v2

Status: **visual refinement candidate — G6 not claimed**

This versioned lane responds to the product owner's explicit rejection of the
Phase 7 benchmark character as too blocky and shape-like. The original
`phase7-benchmark` directory is preserved unchanged as technical pipeline
evidence and a negative visual baseline.

The v2 script builds an original, more resolved human tactical figure from a
contoured undersuit body, tapered limbs, fitted armor, harness/belt hardware,
gloves with individual fingers, boots, helmet layers, and an authored rifle.
The butt stock, pistol grip, trigger-hand region, and support-hand handguard are
placed as deliberate contacts. Oxide, teal, graphite, and desaturated armor have
separate functional roles, and two grayscale views test non-color readability.

## Rebuild

From the repository root:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' `
  --background --factory-startup --threads 1 `
  --python assets/source/blender/phase7-character-refinement-v2/build_character_refinement_v2.py
```

The build writes a `.blend`, GLB, report, and nine 900×900 PNGs beneath
`output/`. Run `verify_outputs.py` afterward for structural and hash checks.

## Honest boundary

This asset is a visual-direction and export candidate. Its rig uses rigid
bone-parented parts and a subtle breathe loop. It does not prove deformation
weights, stress poses, first-person arms, the gameplay clip matrix, LODs,
runtime outline/contact behavior, color-vision simulations, or 2/4/8-instance
performance. Those remain required before a G6 review.
