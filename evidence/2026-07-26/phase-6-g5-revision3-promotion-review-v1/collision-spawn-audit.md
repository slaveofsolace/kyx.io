# Revision 3 collision and spawn audit

Status: packet complete for review; **G5 remains open**.

## Collision pairing and scope

- Render/collision identity matches the frozen Revision 3 manifest.
- Authority fixture contains 339 solids.
- Revision 3 changes are bounded to the repaired west Press rail and the two
  inner Press baffles; all non-target fingerprints match Revision 2.
- The browser collision-overlay capture is
  `captures/09-rev3-collision-overlay.jpg`.

## Traversal and snag checks

| Route | Steps | Final distance | Snags | Overlap samples | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| West shotgun breach | 30 | 3 mm | 0 | 0 | Pass |
| East shotgun breach | 30 | 122 mm | 0 | 0 | Pass |
| Press Core south-to-north | 28 | 112 mm | 0 | 0 | Pass |

Canonical regressions also pass:

- Press junction: clear cast, clear final overlap.
- West Archive runtime-v45 endpoint: `(-23958, 37, 402)` mm, clear final
  overlap.

The route set covers the modified mid and the two bounded canonical
regressions. It does not replace human free-form movement through every ramp,
ledge, doorway, and jump line.

## Spawn placement

- 12/12 spawn candidates are clear of blocking collider overlap.
- All spawn records resolve to known escape-route families.
- West/east team sets and deathmatch candidates are represented.
- Spawn layout capture: `captures/07-rev3-spawn-audit.jpg`.

Still open for humans:

- enemy line-of-sight pressure at actual player timing;
- spawn selection/scoring under occupancy;
- repeated-spawn and revenge-loop behavior;
- 4-player and 8-player congestion;
- perception of safe exit choices under sniper pressure.

## Volumes, zones, and objectives

- Recovery-volume probe: pass.
- Kill-volume probe: pass.
- Zones: 9 across `archive_walk`, `crosslink`, `ink_channel`, `press_hall`,
  and `spawn`.
- Supported modes: deathmatch and team deathmatch.
- Objective contract:
  `FRAG_MODES_NO_STATIC_OBJECTIVE_REQUIRED`.
- Pickups: 0.
- Red Fold teleport: contract-only, not a runtime teleport acceptance claim.

## Navigation and verticality

- Spawn height levels: -3,000 mm, 0 mm, and 6,000 mm.
- Vertical range: 9,000 mm.
- Three representative movement routes pass.
- Both canonical movement regressions pass.
- Verticality capture: `captures/08-rev3-verticality.jpg`.

Automated collision/spawn status: pass for the checks above.

Promotion status: open. Human graybox and 2/4/8-player evidence are required.
