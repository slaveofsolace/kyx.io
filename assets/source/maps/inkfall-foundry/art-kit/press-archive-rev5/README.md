# Inkfall Foundry Rev5 geometry and portal correction

Rev5 is a non-default Inkfall presentation candidate built against the frozen
Revision 3 authority package. It replaces the rejected Rev4 construction
language with a connected bridge/girder/support system, a foundation-supported
Archive landing, and a linked Red Fold industrial portal pair.

The runtime GLB contains only Rev5 modular render art. It deliberately excludes
the inherited Press Hall context so the product renderer cannot stack a second
wall shell over the authority-aligned runtime map. Render meshes remain
`noHit`; frozen Revision 3 collision remains authoritative.

The portal authority overlay uses the existing movement-state teleport
cooldown, collision/volume checks, and semantic teleport events. Its exits are
outside the partner trigger, destination blockage fails closed, and the
reliable `world_portal_traversed` event carries arrival/departure audio and VFX
hooks. The online Three runtime renders the portal waves and delegates audio to
its shared tactical feedback mixer; Rev5 does not create an independent audio
context.

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
