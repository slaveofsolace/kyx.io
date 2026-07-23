# P6.7 Inkfall Foundry graybox lock report

Status: **`P6_7_GRAYBOX_LOCK_PASS`**. Native map revision 2 is promoted from a
staged collision candidate to the locked Phase 6 graybox. This is a
graybox-version decision only: catalog revision 1 remains the runtime default,
revision 2 still requires explicit selection, and no product, shipping, or
deployment promotion is made.

## Locked binding

- Map: `inkfall_foundry@2`
- Graybox lock: revision 1, `graybox_locked_non_default`
- Runtime package digest:
  `77a7b6c41416f9caaf615f3af5dacda1153cee65a239c04f2004e30fc1663520`
- Authority fixture: `bf85e42731fd088e`
- Render SHA-256:
  `90a9450491355ac6fe007a8ac337c7838df107d775c269366aaf7fc01ce4c634`
- Collision SHA-256:
  `cd661c12534dd7d2362c862f4ff9f9177cb9f8ef0cea85d14a3b18e3dfb1380e`
- Layout seed SHA-256:
  `562c5ea8711a1eb1f4a08a31c8872c68c23778aa159110a107c9da0b74e67a63`
- Movement profile: `phase3_hypothesis_v1` revision 1, hash
  `8ab4ed437a4393c0`
- Canonical movement hash: `66fcaf19c3fd94ad`
- Physics adapter: `0.19.3`
- Authority rate: 20 Hz

The lock manifest is
`runtime/graybox-lock.p6-7.v1.json`, SHA-256
`feb6c299c426eff8fccdb3b9a92e3e0f8fd9d73d6dd32b678b68e5ef09178fdd`.
It freezes twelve source/evidence artifacts and thirteen independently
recomputable canonical contract fingerprints.

## Frozen gameplay contract

The lock preserves the already accepted automated revision-2 result without
changing geometry, collision, topology, spawns, route endpoints, waypoint
order, route bands, movement sizing, physics, triggers, authority volumes, or
the corrected tape:

- 9 zones, 19 nodes, 27 links, 12 route metrics, and 12 spawns;
- 3 strong positions and 5 intentional movement features;
- 346 render nodes, 339 authority solids, and 2 authority volumes;
- corrected 2/4/8-player status `PASS / PASS / PASS` with zero issues;
- suite hash `143d09532b9c2b24`;
- `ink_teleport_flank` 3950 ms inside the unchanged 1800-4000 ms band;
- `archive_drop_flank` 3300 ms inside the unchanged 2500-5000 ms band;
- zero embeds, depenetration failures, snags, incomplete routes, recovery
  entries, kill entries, or analytical player overlaps.

The canonical topology fingerprint is
`fff6f80ad8ac7ac235faee53668ca573050082ea93debce440478260a65c9716`.
Separate fingerprints lock zones, nodes, links, strong-position counters,
runtime and seed spawns, route metrics, authority scenarios, movement sizing,
coordinate/grid rules, seed art modules, and the functional map package.

## Catalog promotion boundary

`src/content/maps/catalog.ts` now carries two distinct selectors:

- `DEFAULT_MAP_REVISION = 1` for the unchanged product/runtime default;
- `LOCKED_GRAYBOX_MAP_REVISION = 2` for explicit development and evidence
  selection of the locked graybox.

The catalog exposes the locked revision and package through dedicated lookup
functions. Tests require revision 1 and revision 2 to remain distinct. Any
future default-revision change is a separate product-integration decision and
must not be inferred from P6.7.

## Modular art-kit dimension contract

`art-kit/graybox-dimensions.p6-7.v1.json`, SHA-256
`66b84c1d23a948b474a4cbc602a3e9b8a170a7f4be67d7d3c4356778825e3d83`,
defines 16 required families and 37 prospective modules:

1. structural bays;
2. walls;
3. corners;
4. columns;
5. floors;
6. ramps;
7. stairs;
8. platforms;
9. rails;
10. door frames;
11. cover;
12. vents and crouch tunnels;
13. ink conduits;
14. garden fragments;
15. trims and decals;
16. landmark hero pieces.

The contract fixes millimeter dimensions, axis order, pivots, semantic
material slots, grid rules, collision policy, and replacement rules. Critical
interfaces remain exact: 2400 x 3000 mm main-door clearance, 1400 x 2400 mm
flank-door clearance, 1400 x 1350 x 4800 mm slide-gate clearance, ordinary
ramps below 20 degrees, and 250 mm rise / 500 mm run stairs. All six original
seed modules reproduce their dimensions exactly. Documented seed-clearance
exceptions remain explicit instead of being silently rounded.

The art-kit file is a dimension and replacement contract, not authored final
meshes. Render art may iterate inside the locked envelopes, but any authority
collision or functional-envelope change requires a new map revision and a
fresh P6.2-P6.7 acceptance chain.

## Regression result

- P6.7 lock suite: 7/7 tests.
- Adjacent Inkfall P6.2-P6.6 matrix: 58/58 tests across 8 files.
- Locked revision-2 Blender sweep: 15/15 assertions, 25 physical links, 12
  spawns, and 1646 capsule samples.
- Preserved revision-1 Blender regression: 14/14 assertions, 25 physical
  links, 12 spawns, and 1653 capsule samples.
- Application, Worker, simulation-source, and simulation TypeScript: PASS.
- Focused and repository lint: PASS.
- Production build: PASS with the existing greater-than-500 kB chunk advisory.

Four development failures remain preserved. Two lock-test failures exposed a
prospective door-frame grid error and the need to label exact seed-clearance
exceptions. The first revision-2 Blender rerun used the wrong expected status
literal and correctly failed only `artifact_validator_passed`; a new output
with the exact frozen report status passed 15/15. No failing record was
overwritten or relabeled. The first evidence-verifier output also remains
preserved: 14/15 checks passed, but an exact-object comparator incorrectly
rejected valid adjacent-matrix coverage metadata. The corrected verifier
checks the four governing counters individually and writes to a new immutable
path.

## Visual evidence boundary

P6.7 changes no geometry or rendering. The existing revision-2 collision
overlays therefore remain the applicable visuals:

- `revisions/revision-2/overlay/revision1-vs-candidate-collision-diff-plan.png`
- `revisions/revision-2/overlay/revision1-vs-candidate-collision-diff-oblique.png`
- `preview/inkfall-graybox-overview.png`

Those images document graybox and collision shape only; they do not grant
visual or final-art acceptance.

## Remaining G5 work and nonclaims

P6.7 closes the Phase 6 version lock. G5 remains open for:

- product-visible loading/selection of the locked render and separate
  authority-collision package;
- human multi-role playtests for fun, navigation, readability, no-snag feel,
  and real counterplay at strong positions;
- one representative final-art Press Hall room plus two transitions from the
  authored modular kit;
- post-art collision/topology/spawn/route regression and polish;
- named-tier renderer, frame-time, payload, unload, and soak evidence.

This report does not claim `G5_PASSED`, human fun/readability acceptance,
visual acceptance, final art, performance acceptance, product integration,
revision-2 default/shipping status, or deployment authorization.
