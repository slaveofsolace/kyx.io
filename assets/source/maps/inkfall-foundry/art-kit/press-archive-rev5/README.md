# Inkfall Foundry Rev5 geometry and portal correction

Rev5 is a non-default Inkfall presentation candidate built against the frozen
Revision 3 authority package. It replaces the rejected Rev4 construction
language with a connected bridge/girder/support system, a foundation-supported
Archive landing, and a linked Red Fold industrial portal pair.

The 2026-07-29 construction pass uses a deliberately bounded CC0 donor
vocabulary from the free Quaternius Modular Sci-Fi MegaKit Standard. Only ten
selected models are preserved as compact geometry-only GLBs; every upstream
material and texture is stripped. Inkfall supplies its own materials,
composition, lighting, placement, and authority separation. Exact source and
derived hashes are recorded under `donors/quaternius-standard/`, alongside the
original CC0 license text.

The portal pair also uses Quaternius's CC0 Teleporter Base from Poly Pizza as
the floor-flush machine pad beneath each aperture. Its 556 triangles are split
into three material-free parts so Inkfall can map them to cast iron, worn
steel, and the endpoint accent. The original file, preview, derivation script,
license, provenance, and exact hashes are preserved under
`donors/quaternius-teleporter-base/`. It adds no collision or portal authority.

The gateway silhouette is adapted from Polygonal Mind's CC0 ABM
`Teleporter01_Art`, locked to revision
`56db2d4088512531a070d0bf3eb9d284d077528d` of ToxSam's CC0 conversion
repository. Its fused orb and center plate are removed, the long legs are
shortened for player-scale proportions, and the resulting 688-triangle open
frame is stripped to material-free render geometry. The original GLB,
thumbnail, upstream CC0 license, deterministic preparation script, provenance,
and exact hashes are preserved under
`donors/polygonal-mind-abm-teleporter01/`.

The runtime GLB contains only Rev5 modular render art. It deliberately excludes
the inherited Press Hall context so the product renderer cannot stack a second
wall shell over the authority-aligned runtime map. Render meshes remain
`noHit`; frozen Revision 3 collision remains authoritative. Generated float
accessors are canonicalized to five decimal places so repeat builds produce
the same exact runtime GLB hash.

The portal authority overlay uses the existing movement-state teleport
cooldown, collision/volume checks, and semantic teleport events. Its exits are
outside the partner trigger, destination blockage fails closed, and the
reliable `world_portal_traversed` event carries arrival/departure audio and VFX
hooks. The render-only portal presentation is one translucent field inside a
six-piece authored collar on a grounded CC0 machine pad. The oversized donor
gateway, nested guide rings, and loose-ended turbine spiral remain in the
provenance inventory but are not instantiated. Rev5 does not create an
independent audio context.

Build from the repository root:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' `
  --background `
  --python 'assets/source/maps/inkfall-foundry/art-kit/press-archive-rev5/build_press_archive_rev5.py' `
  -- `
  --repo-root (Get-Location).Path `
  --output-root ((Get-Location).Path + '\assets\source\maps\inkfall-foundry\art-kit\press-archive-rev5\rev5')
```

Automated structure/collision checks do not grant human visual acceptance.
Human 2/4/8-player flow, portal combat readability, target-hardware
performance, and G5 acceptance remain open.
