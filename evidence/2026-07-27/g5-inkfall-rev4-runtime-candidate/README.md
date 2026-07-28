# Inkfall Foundry Rev4.1 / Revision 3 runtime candidate evidence

This evidence was captured from isolated branch
`codex/g5-inkfall-rev4-20260727`, based on
`b2877e999f45abe4e7732c5426b135be8fc15b29`.

## Explicit candidate route

`?mapArt=inkfall_foundry%403%2Fpress_archive%2Fv4.1%2Fspatial-material-joined`

The selector is opt-in and fail-closed. The catalog default remains
`inkfall_foundry@1`. Rev4.1 presentation art is never supplied to the runtime
map-package loader; the loader receives only the frozen Revision 3 graybox
render and Revision 3 authority collision.

## Pinned artifacts and authority

- Rev4.1 presentation GLB:
  `5e2aa22cc598f49181524ce78b481adf091f71a91a823171277963de11d4db00`
  (`12,954,608` bytes, `45` meshes, `190,788` triangles)
- Revision 3 package digest:
  `260b90de2e0c2d51fa01e166d11401a04a1cb76943042de9993e85560e37f39a`
- Revision 3 fixture hash: `6cf785c5171f2ff5`
- Revision 3 graybox render:
  `19bbf6f627f46146a7266d39e00e0635d7b4b09e556bfa0dee988bb2375c5ed6`
- Revision 3 authority collision:
  `1cce637ab4f83766627527b3885c3e9da819d8bcabdfa2144f8dc6b46bc5bba8`
- Frozen runtime metadata: `339` solid colliders, `9` zones, `12` spawns

## Measured binding checks

- Art-to-authority route-point delta: maximum `600 mm` planar / `60 mm`
  vertical
- Art segment midpoint-to-authority collider delta: maximum `319 mm`
  planar / `178 mm` vertical
- Visual lane: `2,180 mm` inside `2,400 mm` authority clearance
- Archive landing art floor and authority support top: exactly `6,000 mm`
- Rev4.1 archive mesh groups: `7` rise and `9` landing
- Decorative vertical overhang above the bounded playable package height:
  `755 mm`; it is not marked walkable

The executable Rapier movement simulation traversed Press Hall through the
west ascent into `archive_walk_west` in the captured run, with three completed
legs and no final capsule overlap. This is automated runtime evidence, not a
human playtest.

## Verification

- Independent frozen Rev4 verifier: `17/17 PASS`
- Focused Vitest regression: `50/50 PASS`
- TypeScript typecheck: `PASS`
- Focused ESLint: `PASS`
- Production Vite build: `PASS`
- Rev4.1 runtime Playwright capture: `1/1 PASS`
- Legacy Rev3.3 runtime regression: `PASS`
- Legacy Rev3.2 runtime regression: `PASS` with the heavyweight inspection
  test's timeout raised from 60 to 120 seconds; it completed in 59.2 seconds

`press-archive-rev4-rev3-authority-overlay.png` is the executable runtime
capture with presentation art and the separate Revision 3 authority overlay.
Its displayed frame percentile is a bounded headless development/test capture,
not shipping-hardware performance evidence. Performance acceptance remains
open.

## Non-claims

- G5 is not passed by this candidate.
- No human visual acceptance has been recorded.
- No human 2/4/8-player playtest has been performed.
- No shipping-default map selection changed.
- No production deployment, merge, or publish action was performed.
