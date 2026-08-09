# Relay Open Sky v5 source-only continuation

## Outcome

This packet records one bounded render-only refinement on the existing Relay
Open Sky v5 lane. The source candidate is complete enough for the next
player-eye review, but visual acceptance remains **UNKNOWN / REVISE**. The
authoritative shared-runtime hold prohibited browser, server, build, capture,
Blender, Unreal, and runtime-test execution during this continuation.

No static result in this packet grants Human Eye acceptance.

## Lane and ownership

- Worktree: `D:\AI Projects\Projects\Games\evio\evio-relay-v5-art-20260809`.
- Branch: `codex/relay-v5-art-20260809`.
- Parent commit: `e663c356b7a33669bee4c07d26da955d684857d2`.
- Canonical checkout: read-only and untouched.
- Source ownership: `src/app/relayVisualContinuity.ts` and
  `src/app/relayArchitectureSkin.ts`.
- Contract ownership: the two matching unit-test files in `tests/unit/app/`.
- Evidence ownership: this packet and the appended v5 continuation section in
  `docs/work-log/2026-08-08-relay-map-pivot-checkpoint.md`.

## Source revision

- Corrected collider material classification so `relay_floor_*`, ramps,
  bridges, and `relay_step_*` use their top surface elevation instead of
  falling into the generic dark-structure bucket. Bridge supports remain
  structure, so their collision does not masquerade as walkable deck.
- Closed the bridge underside seams at the center/side-deck joints, added two
  contained joint collars, and extended each pier capital into the underside.
  The load path now meets instead of reading as separated floating slabs.
- Moved spawn operations backplanes, fins, sills, and signal spines to the
  exact boundary-wall plane or exterior side. Fin cant now stays in the facade
  plane rather than rotating into playable space.
- Skinned the four existing spawn sight-protection walls as exit shoulders.
  West uses bracket codes; east uses chevrons. No arch or post was added to a
  spawn route, and the armor/caps remain inside the known wall envelopes.
- Added paired portal-destination keys: the cyan service gate previews the
  amber crown at Array Overlook, while the amber overlook gate previews the
  cyan pipe bank at Lower Relay. Both symbols are shallow header inlays tied to
  the unchanged two-endpoint portal authority.
- Aligned rotated cover caps, armor, and identity spines to the actual rotated
  colliders and limited their visible surface relief to 12 mm.
- Reduced route/spawn emissive output, point-light intensity/range, and floor
  inlay lift/thickness. The lower-service datum and grates now sit flush rather
  than reading as bright floating floor patches.
- Strengthened the sky palette from green-gray toward a warm-horizon,
  cool-upper-air, deep-blue-zenith hierarchy while keeping the existing three
  ridge depths and north campus crown.

## Authority compatibility

`OBSERVED` by blob identity: these authority/parity files match the parent
commit exactly after the source batch.

| File | Parent/current Git blob |
|---|---|
| `src/authority/relayAuthority.ts` | `57f7e5a13b3824e1cebdc307f414873e2f943cf9` |
| `src/authority/portal/relayPortalAuthority.ts` | `ba3e71013150af4f2d6d408895f460d5d8d57b3e` |
| `src/app/localInkfallPracticeRoute.ts` | `fbd6f7a1b12274d5798b1358e7b124e3fe9c8df4` |
| `src/app/onlineAuthorityRoute.ts` | `80d5cde473ca4eaff3bf80bcaafc6656880cd76f` |

The unchanged, already-pinned Relay Revision-1 package remains 56 colliders,
8 ordered spawns, 8 zones, and 2 linked portal endpoints. This continuation
does not independently execute those runtime/unit contracts under the hold;
it proves that their source blobs were not edited.

Every added object is produced by the render-only architecture factory,
inherits `noHit: true` and `renderMeshesMayBeAuthority: false`, and leaves
`fakeTraversableSurfaceCount` at zero.

## Explicit source-accounting budget

The prior committed v5 factory result was 54 base meshes, 6 lights, 22
architecture batches, and 122 architecture instances. This continuation adds
five shared instanced batches, 27 logical instances, and one collider-material
batch created by the corrected lower-deck role. It adds no light.

| Surface | Expected after source batch | Ceiling | Status |
|---|---:|---:|---|
| Base mesh objects / estimated draw calls | 60 | 96 | within source budget |
| Base realtime lights | 6 | 8 | within source budget |
| Architecture batches / estimated draw calls | 27 | 28 | within source budget |
| Architecture logical instances | 149 | 180 | within source budget |
| Architecture realtime lights | 2 | 2 | at ceiling, unchanged |
| Existing animated portal meshes outside base budget | 10 | 10 | unchanged |

These are deterministic source-accounting expectations, not a fresh runtime
factory traversal, GPU profile, or frame-time result.

## Static-only gate

The exact commands and results are recorded in `source-static-facts.json`.
Only TypeScript compilation, changed-file lint, whitespace/diff checks, JSON
parsing, and protected-source blob comparisons are permitted in this packet.
Unit tests and builds are intentionally not executed.

## Human Eye cold-eye boundary

`OBSERVED`

- The preserved v13/v4 packet exposes generic dark boxes, weak spawn exits,
  floating bridge relationships, cyan floor wash, and a flat environment read.
- Current source directly changes the responsible classifier, transforms,
  connected members, signal levels, and navigation symbols.
- Authority and Practice/online binding source blobs are unchanged.

`INFERRED`

- Top-elevation material roles should separate main, upper, and lower routes.
- Connected bridge joints/capitals and wall-contained spawn shoulders should
  reduce the floating-kit and graybox read.
- Paired destination symbols should make portal outcome more legible before
  entry without adding text or collision.

`UNKNOWN`

- Actual v5 composition, clipping, exposure, landmark dominance, and portal
  recognition at player eye.
- Safe-exit readability during combat and route clarity at 2, 4, and 8 players.
- GPU/frame-time behavior, Human Eye preference, balance, accessibility, and
  release fitness.

| Surface | Disposition | Boundary |
|---|---|---|
| Relay Revision-1 authority and parity bindings | KEEP | unchanged source blobs |
| Render-only/no-hit containment contract | KEEP | source contract; runtime recheck pending |
| Material-role and construction correction | KEEP as source direction | not visual acceptance |
| V4 graybox/Foundry-like massing and flat sky | REJECT | observed preserved v13 baseline |
| V4 floating bridge and overbright floor patch read | REJECT | observed preserved v13 baseline |
| V5 player-eye presentation | REVISE / UNKNOWN | representative capture prohibited |
| Human visual/play acceptance | REVISE | owner review required |

## Expected player-eye views after hold release

1. West spawn A and B, facing the center route, with both bracket-coded sight
   walls visible and the exit free of decorative obstruction.
2. East spawn A and B, facing the center route, with chevron-coded shoulders
   distinct from the west bay.
3. Center court toward the north crown at low and high combat density, checking
   upper/lower route separation and cover silhouette truth.
4. Bridge approach, deck joint, side-deck seam, and underside/pier contact from
   both center court and lower-service eye height.
5. Lower-service descent and court, checking grates, pipe datum, floor exposure,
   and the cyan service identity without a blown patch.
6. Service gate before entry, verifying that its amber crown preview reads as
   the destination rather than the current cyan room.
7. Array Overlook gate before return, verifying that its cyan pipe preview
   reads as Lower Relay and that crown/portal assemblies remain connected.
8. Diagonal wall/facade seam views at both spawns, checking that no facade
   member clips into playable space.
9. Matched 2-, 4-, and 8-player sightline frames for spawn safety, cover rhythm,
   landmark occlusion, and portal approach legibility.

The intended new packet should preserve the v13 camera sequence where useful
and add the contact/seam views above. Capture may begin only after the parent
explicitly releases the shared-runtime hold.

## Known risks

- Architecture uses 27 of 28 batch slots and both allowed local lights, so a
  later visual fix should replace or merge a batch rather than add casually.
- The expected 60/27/149 counts are source arithmetic until the factory tests
  can be rerun after hold release.
- Twelve-millimeter cover/exit/header relief may still reveal z-fighting,
  aliasing, or collision-perception mismatch at oblique player-eye angles.
- Lower-service and sky palette changes are deliberately restrained without a
  live exposure reference; either may still need color/value revision.
- Spawn safety, portal prediction, and landmark occlusion remain unobserved at
  2/4/8 occupancy.

## Provenance boundary

All changes use project-authored TypeScript, procedural Three.js primitives,
and project-generated data textures/materials already in this repository. No
external model, texture, map byte, `.evmap`, or ev.io artwork was copied. The
only borrowed ideas are general architectural principles: continuous load
paths, three-depth atmospheric hierarchy, and paired destination wayfinding.
Those ideas do not carry donor bytes or proprietary map geometry.

## Integration conflict note

Read-only canonical inspection shows one direct changed-path overlap:
`docs/work-log/2026-08-08-relay-map-pivot-checkpoint.md` is also dirty in the
canonical checkout. Preserve and manually reconcile both appended histories;
do not replace the canonical file wholesale. Canonical
`src/app/onlineAuthorityRoute.ts` is also dirty under another lane, but this
continuation does not modify that file and its parent/current blob remains
identical in this worktree. No source-code conflict is present inside this
bounded commit itself.

## Nonclaims

- No browser, dev server, production build, capture, Blender, or Unreal was
  launched for this continuation.
- No unit/Worker/runtime test was executed under the hold.
- No v5 screenshot, 2/4/8-client proof, GPU profile, performance soak, Human
  Eye PASS, balance approval, or release approval is claimed.
- No canonical edit, merge, push, deployment, authority revision, worktree
  creation/deletion, stash, reset, or clean operation is claimed.
