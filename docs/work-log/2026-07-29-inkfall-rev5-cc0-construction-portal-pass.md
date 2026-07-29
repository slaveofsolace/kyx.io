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
- 14 placed donor instances, all render-only and non-authoritative.

Portal-specific CC0 donors:

- Quaternius Teleporter Base via Poly Pizza: 556 triangles, split into three
  material-free parts, two placed instances;
- Polygonal Mind ABM `Teleporter01_Art` at upstream revision
  `56db2d4088512531a070d0bf3eb9d284d077528d`: the 180-triangle orb and
  50-triangle center plate are removed, long legs shortened by 0.65 m, and a
  688-triangle material-free open frame remains verified in the provenance
  inventory but is no longer instantiated after human-eye review found it too
  bulky and layered;
- exact originals, licenses, previews, preparation scripts, derived artifacts,
  and SHA-256 contracts are preserved under their donor directories.

## Current generated facts

- build status:
  `INKFALL_REV5_GEOMETRY_PORTAL_BUILD_PASS_HUMAN_REVIEW_OPEN`;
- 44,748 Rev5 render triangles;
- 24 joined render nodes;
- runtime GLB: 2,689,992 bytes;
- runtime GLB SHA-256:
  `1783bb9292a48f0903b70c0a65e809f261ca0422cb92ca5399fd38782ae297ad`;
- every build-report check passes;
- three bridge spans retain three centered support pairs, four outer endpoint
  rail posts, and two joint sills without the rejected frame/crown cage;
- the Archive landing uses four continuous foundation-to-gantry columns, two
  underdeck braces, and two top bars;
- portal endpoints each use one grounded machine pad, one translucent field,
  six attached authored collar pieces, four connected grounded supports, and
  three exit chevrons.

## Evidence and nonclaims

Static Blender review renders:

- `assets/source/maps/inkfall-foundry/art-kit/press-archive-rev5/rev5/renders/inkfall-rev5-geometry-portal-gameplay_continuity.png`
- `assets/source/maps/inkfall-foundry/art-kit/press-archive-rev5/rev5/renders/inkfall-rev5-geometry-portal-archive_rise.png`
- `assets/source/maps/inkfall-foundry/art-kit/press-archive-rev5/rev5/renders/inkfall-rev5-geometry-portal-portal_lower.png`
- `assets/source/maps/inkfall-foundry/art-kit/press-archive-rev5/rev5/renders/inkfall-rev5-geometry-portal-portal_upper.png`
- `evidence/2026-07-29/g5-inkfall-rev5-acceptance-candidate/player-eye-v20-map-portal-cleanup/01-cleaned-spawn-and-press.png`
- `evidence/2026-07-29/g5-inkfall-rev5-acceptance-candidate/player-eye-v20-map-portal-cleanup/02-two-player-bridge-route.png`

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
- impacted app Vitest: 2 files / 6 tests PASS;
- targeted Worker Vitest: 1 file / 6 tests PASS;
- Vite staging build: PASS;
- release asset validation: PASS, 0 active release manifests/errors/warnings;
- release provenance sentinel: PASS;
- release package closed-world verifier: PASS;
- G9 control audit: PASS.

The G9 release decision remains blocked by the existing owner-only project
license selection, distribution-mode selection, and absence of a human-accepted
runtime character. Those are release nonclaims, not failures introduced by
this map batch.
