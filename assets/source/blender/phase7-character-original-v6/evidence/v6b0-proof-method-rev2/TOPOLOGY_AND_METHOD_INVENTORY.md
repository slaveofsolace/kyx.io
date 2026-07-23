# V6-B0 revision 2 topology and method inventory

Status: **direct technical inventory only; no visual acceptance claim**

The numbers below come from a clean evaluated Blender scene inventory in `authoring-report.json`.

## Scene totals

- V6-B0 objects: 55
- Visible proof objects: 42
- Hidden boolean/construction witnesses: 13
- Base vertices: 7,479
- Base polygons: 6,989
- Evaluated vertices: 54,476
- Evaluated polygons: 53,934
- Evaluated triangles: 108,880
- Armatures: 0
- Actions: 0
- External libraries: 0
- V6-B0 materials: 9

## Hero objects

| Object | Construction method | Base verts/polys | Evaluated triangles | Live modifiers |
| --- | --- | ---: | ---: | --- |
| `V6B0_Undersuit_TorsoRightArm_SurfaceExtract` | V6-A surface extraction | 2,607 / 2,496 | 52,584 | Shrinkwrap, Subdivision, Solidify, Bevel |
| `V6B0_Armor_ThoracicSurfaceRetopo` | surface retopology | 427 / 376 | 19,656 | Shrinkwrap, Subdivision, Solidify, Bevel, 5 Boolean cuts |
| `V6B0_Armor_RightDeltoidSurfaceRetopo` | deltoid surface retopology | 116 / 92 | 6,566 | Shrinkwrap, Subdivision, Solidify, Bevel, 2 Boolean cuts |
| `V6B0_Glove_SourceSurfaceExtract` | five-digit V6-A hand extraction plus proportional sculpt deformation | 777 / 763 | 12,312 | Corrective Smooth, Subdivision, Solidify |
| `V6B0_Rifle_Grip` | asymmetric five-ring ergonomic loft | 80 / 66 | 1,444 | Bevel, Subdivision |
| `V6B0_Rifle_ReceiverCore` | custom hard-surface profile | 22 / 13 | 788 | Bevel, 3 Boolean cuts |
| `V6B0_Rifle_StockContactPad` | custom contact profile | 10 / 7 | 376 | Bevel |

The upper/lower stock rails, trigger guard, trigger, garment seams/folds, armor load rails, and edge seals are continuous Blender curves. Curve tessellation is retained as live curve data and is therefore not included in the mesh triangle subtotal above.

## Materials

- `V6B0_MAT_TechnicalFabric`
- `V6B0_MAT_SeamRubber`
- `V6B0_MAT_WarmCeramic`
- `V6B0_MAT_EdgeMetal`
- `V6B0_MAT_Graphite`
- `V6B0_MAT_GripRubber`
- `V6B0_MAT_GloveTextile`
- `V6B0_MAT_CyanDevice`
- `V6B0_MAT_SafetyRed`

This inventory verifies that the method used native surface, thickness, deformation, bevel, curve, and boolean operations and contains no runtime rig. It does **not** override the strict visual rejection in `SELF_REVIEW.md`.
