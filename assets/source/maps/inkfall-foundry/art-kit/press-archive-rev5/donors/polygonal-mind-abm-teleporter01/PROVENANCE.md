# Polygonal Mind ABM Teleporter01 donor

This directory preserves one authored CC0 gateway donor for the Inkfall
Foundry Rev5 review candidate.

- Creator: Polygonal Mind
- CC0 conversion repository: https://github.com/ToxSam/cc0-models-Polygonal-Mind
- Locked repository revision:
  `56db2d4088512531a070d0bf3eb9d284d077528d`
- Original open-source initiative:
  https://github.com/PolygonalMind/initiative-opensource-release
- License: CC0 1.0 Universal / Public Domain
- Retrieved: 2026-07-29
- Original file SHA-256:
  `566822f43f2ca4c7cc435d7229f75878c2f33f69c31f3b1b6179fd9201918e5c`
- Source thumbnail SHA-256:
  `ee7effd57d0ec5888d144a4cbd559caec95a05323896527109d6382801fbd441`
- Preserved repository license SHA-256:
  `a2010f343487d3f7618affe54f789f5487602331c0a8d03f49e9a7c547cf0499`

The source GLB contains one 918-triangle textured mesh. Its gateway frame and
center orb share one fused mesh. `prepare_geometry_only_donor.py` verifies the
exact source artifact and topology, removes the unique 180-triangle orb and
50-triangle fused center plate, bakes the imported world transform, shortens
its unusually long legs by 0.65 m, normalizes the remaining frame to a
floor-centered origin, and exports a 688-triangle material-free open frame.

The derived frame is 35,428 bytes with SHA-256
`1d3be423843326698ff94822579981751b898309f1351049f694b7126fb6daed`.
Inkfall supplies its own endpoint material and energy field. The donor remains
render-only and never defines collision, triggers, spawns, zones, teleport
behavior, or any other gameplay authority.

`donor-manifest.json` is the fail-closed source contract. The generated
`geometry-only/geometry-only-donor-manifest.json` records the derivation.
