# Inkfall Rev5 CC0 construction and portal pass

Status: `AUTOMATED_BUILD_PASS_HUMAN_PLAYER_EYE_REVIEW_OPEN`

This pass responds to the rejected Rev5 player-eye evidence by changing the
map's construction language before another runtime matrix:

- replaced thin diagonal bridge brace clutter with grounded piers, feet, and
  caps;
- replaced the oversized torus/clamp portal with an open authored hexagonal
  donor frame, grounded machine pad, concentric turbine field, plinths, side
  piers, access terminal, floor insert, and header light;
- added a restrained industrial service vocabulary at Archive landing and
  bridge joints;
- raised black/steel material values enough to preserve depth in browser
  lighting without returning to a flat graybox;
- removed review-only shadow-buffer overflow and corrected the upper portal
  evidence camera;
- fixed the shared glTF donor placement path so evaluated world transforms are
  preserved before its temporary placement root is removed;
- kept Revision 3 collision, spawn positions, zones, teleport authority, and
  catalog default unchanged.

## CC0 donor boundary

Source: Quaternius Modular Sci-Fi MegaKit Standard
License: CC0 1.0 Universal
Archive SHA-256:
`4ca9acbc7a13e7baa48e24c4853b779889b7ab21587004c36668826e705c8a10`

The checked-in donor library is geometry-only:

- 10 approved source models;
- 664,528 total derived bytes;
- no upstream textures, materials, lights, cameras, animation, code, or
  collision;
- exact upstream glTF/bin and derived GLB hashes in
  `geometry-only-donor-manifest.json`;
- 20 placed donor instances, all render-only and non-authoritative.

Portal-specific CC0 donors:

- Quaternius Teleporter Base via Poly Pizza: 556 triangles, split into three
  material-free parts, two placed instances;
- Polygonal Mind ABM `Teleporter01_Art` at upstream revision
  `56db2d4088512531a070d0bf3eb9d284d077528d`: the 180-triangle orb and
  50-triangle center plate are removed, long legs shortened by 0.65 m, and a
  688-triangle material-free open frame is placed at both endpoints;
- exact originals, licenses, previews, preparation scripts, derived artifacts,
  and SHA-256 contracts are preserved under their donor directories.

## Current generated facts

- build status:
  `INKFALL_REV5_GEOMETRY_PORTAL_BUILD_PASS_HUMAN_REVIEW_OPEN`;
- 65,520 Rev5 render triangles;
- 24 joined render nodes;
- runtime GLB: 3,805,416 bytes;
- runtime GLB SHA-256:
  `b7ca109de054b56c8c9692e507942b27f5b64e46a60a6cdf140972910b48586f`;
- every build-report check passes;
- portal endpoints each use one open authored gateway frame, one grounded
  machine pad, three energy guide rings, six connected turbine arms, four
  grounded supports, and three exit chevrons.

## Evidence and nonclaims

Static Blender review renders:

- `assets/source/maps/inkfall-foundry/art-kit/press-archive-rev5/rev5/renders/inkfall-rev5-geometry-portal-gameplay_continuity.png`
- `assets/source/maps/inkfall-foundry/art-kit/press-archive-rev5/rev5/renders/inkfall-rev5-geometry-portal-archive_rise.png`
- `assets/source/maps/inkfall-foundry/art-kit/press-archive-rev5/rev5/renders/inkfall-rev5-geometry-portal-portal_lower.png`
- `assets/source/maps/inkfall-foundry/art-kit/press-archive-rev5/rev5/renders/inkfall-rev5-geometry-portal-portal_upper.png`

These renders establish construction intent only. They do not grant human
player-eye acceptance, fun/readability approval, 2/4/8 runtime acceptance,
shipping approval, or production deployment authorization. The next required
step is a source-frozen browser player-eye capture followed by the consolidated
2/4/8 runtime matrix.

## Consolidated local gate

Run once after the coherent implementation batch:

- app TypeScript: PASS;
- Worker TypeScript: PASS;
- simulation source/output TypeScript: PASS;
- full ESLint surface: PASS;
- app Vitest: 117 files / 874 tests PASS;
- routine Worker Vitest: 12 files / 50 tests PASS;
- Vite production build: 198 modules PASS;
- release asset validation: PASS, 0 active release manifests/errors/warnings;
- release provenance sentinel: PASS;
- release package closed-world verifier: PASS;
- G9 control audit: PASS.

The G9 release decision remains blocked by the existing owner-only project
license selection, distribution-mode selection, and absence of a human-accepted
runtime character. Those are release nonclaims, not failures introduced by
this map batch.
