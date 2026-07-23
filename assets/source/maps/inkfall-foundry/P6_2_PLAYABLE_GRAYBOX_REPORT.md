# Inkfall Foundry P6.2 playable-graybox report

Date: 2026-07-21  
Verdict: **P6.2 COMPLETE — offline Blender graybox and separate collider package**  
G5 verdict: **NOT PASSED**

## What this verdict means

The immutable P6.1 topology seed now produces a seed-bounded Blender graybox,
a separate render GLB, and a separate static authoritative-collision GLB.  An
independent validator, which does not import the builder, swept the accepted
movement capsule across every physical seed link and every seed spawn candidate.

The first topology-only extrusion is superseded.  P6.2 is complete within its
asset-authoring scope because the final saved artifacts pass both structural and
playability validation.  This is not a runtime, playtest, performance, art, or G5
claim.

## Immutable source identity

- Seed: `inkfall-foundry.layout-seed.v1.json`
- SHA-256: `562c5ea8711a1eb1f4a08a31c8872c68c23778aa159110a107c9da0b74e67a63`
- Topology preserved: 9 zones, 19 nodes, 27 links, 12 spawn candidates
- No seed node or link was moved or rewritten.

## Final geometry

- 59 physical route segments with continuous floor support
- 24 authored stair treads on three segments that exceed the ordinary 20-degree
  ramp allowance; each tread is at most 250 mm rise and at least 500 mm run
- 111 physical route guard rails
- 7 audited shared-node rail openings, each tied to a neighboring physical seed
  link and verified rail-free in collision
- 2 broad team spawn-pocket floors, 12 explicit spawn pads, 4 guarded deathmatch
  egress spurs, 6 pocket walls, and 4 spawn sight blockers
- 6 authored transition frames / 18 frame parts
- 4 hard seed-boundary guards; trigger/kill/recovery volumes remain P6.3
- 8 teleport boundary markers around two clear landing pads; no physical teleport
  bridge
- 2 Paper Drop shoulder guards; no returnable drop ramp
- 2 explicit optional jump gaps with guarded sides and no bridging support:
  - `press_gap_west`: 4199.668 mm measured, 4200 mm target
  - `archive_gap_east`: 5200.423 mm measured, 5200 mm target

## Independent capsule evidence

`validation/playable-surface-validation.json`: **PASS, 14/14 assertions**

- Capsule: 1800 mm standing height, 1100 mm crouched height, 350 mm radius,
  20 mm contact skin
- 25/25 physical seed links passed
- 1653 completed sweep samples at 250 mm spacing
- 12/12 seed spawn candidates supported, clear, and seed-bounded
- Slide gate: 1399.954 mm measured clear width and 1350.000 mm measured clear
  height; standing capsule rejected by the roof, crouched capsule clears
- 2/2 jump gaps passed geometry, non-bridge, side-guard, and ballistic-range checks
- Paper Drop passed as an intentional one-way fall seam
- Teleport passed as a nonphysical connector with readable, clear endpoints
- Collision AABB remains exactly inside the seed bound:
  Blender minimum `[-36, -28, -3.256622]`, maximum `[36, 28, 8.4]`

The capsule test uses dense medial-axis spheres against the actual oriented box
colliders in the saved Blend.  It also validates route footprint support, waypoint
aprons, stair dimensions, posture through the slide gate, and obstacle clearance.

## Structural artifact evidence

`validation/graybox-artifact-validation.json`: **PASS, 29/29 assertions**

- Saved Blend: 346 render objects and 346 collision objects
- Render and collision collection stems match one-to-one
- Collision contains only simple static convex boxes
- Render GLB contains no collision/guide objects
- Collision GLB contains no render/guide objects, skins, animations, textures, or
  images
- Both exports contain 346 mesh nodes and 4152 triangles
- Builder/report hashes match the files on disk

Final artifact fingerprints:

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `source/inkfall_foundry.blend` | 517870 | `5d7582a64f7bc141e0501646954133451bba2f22ecf9f503dd9927cb88ab5742` |
| `export/render.graybox.glb` | 613564 | `90a9450491355ac6fe007a8ac337c7838df107d775c269366aaf7fc01ce4c634` |
| `export/collision.authority.glb` | 614548 | `40fc9fa07da89779bb2cb150cc9b642b3598fdf54d041f23d4b6ab203df2d2f0` |

Source fingerprints:

- Builder: `fc1f36526fc6cf46f7f6d49bad7158fdd06155e1ebbe19f736277e2201d926e4`
- Structural validator: `b13e2495e3f48a3cff43324de7ccb119ebdd56e2fbeda546d3bc6e424f0b5c99`
- Capsule validator: `94db05d09e3d0a71c672d4a8a30a298024706fb64eddbc716c7e4872c657381d`

## Visual inspection

The final overview, plan, tier elevation, spawn-pocket close-up, movement-feature
view, and collision view were inspected at original resolution.  The geometry now
reads as a bounded three-tier arena rather than route ribbons: spawn pockets have
real enclosure and occlusion, route families have deliberate edge language,
stairs/frames expose vertical transitions, and drop/teleport/jump interfaces are
visually distinct.

This is accepted as a P6.2 graybox/collision result only.  It is not final art and
does not establish fun, combat readability, spawn safety against enemies, or human
G5 acceptance.

## Preserved failures

All material failed states remain under `validation/failures/`:

1. `attempt-1-topology-extrusion`: coincident slide-gate walls and out-of-bounds
   spawn anchors (`+/-37 m` versus the `+/-36 m` seed bound)
2. `attempt-2-playability-sweep`: 19/25 physical links blocked, slide crouch
   obstructed, and the 4.2 m gap bridged
3. `attempt-3-trimmed-rails-partial`: 10 physical links still blocked
4. `attempt-4-three-links-remaining`: three physical links still blocked
5. `attempt-5-one-link-remaining`: `press_west_ink` blocked by a shared-junction
   rail
6. `attempt-6-cover-obstruction`: the same link blocked by misplaced cover after
   the rail interval was fixed

## Exact remaining scope

- P6.3: strict runtime map schema/loader, authoritative spawns, pickups, zones,
  trigger/kill/recovery volumes
- P6.4: spawn scoring, LOS fixtures, and debug visualization
- P6.5: route/death/damage/sightline/occupancy telemetry
- P6.6: authoritative runtime movement tapes plus 2/4/8-player playtests and
  topology/spawn revision
- P6.7: graybox lock and modular art-kit dimensions
- G5: runtime package metrics, no snag/embed/escape evidence, counter-position
  proof, playtest fun/readability, and one representative final-art room

## Reproduction

Run from the repository root with Blender 5.1.2 or the recorded compatible build:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' --background --factory-startup --python assets/source/maps/inkfall-foundry/build_inkfall_foundry_graybox.py -- --seed assets/source/maps/inkfall-foundry/inkfall-foundry.layout-seed.v1.json --output-root assets/source/maps/inkfall-foundry
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' --background --python assets/source/maps/inkfall-foundry/validate_inkfall_foundry_graybox.py -- --seed assets/source/maps/inkfall-foundry/inkfall-foundry.layout-seed.v1.json --output-root assets/source/maps/inkfall-foundry
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' --background --python assets/source/maps/inkfall-foundry/validate_inkfall_playability.py -- --seed assets/source/maps/inkfall-foundry/inkfall-foundry.layout-seed.v1.json --output-root assets/source/maps/inkfall-foundry
```
