# Relay map pivot checkpoint — 2026-08-08

## Scope

This checkpoint replaces the rejected Foundry player-facing presentation with
the original Relay map candidate. Historical Foundry source/evidence remains
preserved, but its 5.09 MB review GLB is excluded from the staging package and
is no longer requested by the menu or local-practice runtime.

## Implemented truth

- Player-facing arena identity: `Relay` / `relay@1`.
- Local authority host: `local_relay_practice_authority_v1`.
- Collision fixture: `relay_map_collision`, Revision 1, 56 named colliders.
- Spawn set: 8 deterministic Relay spawns.
- The local room uses Relay collision for movement, hitscan occlusion, and
  impulse-grenade contact rather than the old Inkfall fixture.
- The upper route was moved out of the spawn sightline to the north flank; the
  central court is open, with separate upper, main, and lower combat tiers.
- The menu fly-through and local route render the same Relay candidate.
- Old Foundry static portal presentation is disabled on Relay. Portal UI copy
  is also removed until Relay owns a matching server-authoritative contract.
- Renderer diagnostics distinguish Relay authority from the temporary online
  compatibility presentation and report exact fixture/spawn counts.

## Runtime evidence

Latest completed packet:
`evidence/2026-08-08/relay-visual-candidate-player-eye-v4/`

Observed in the completed browser run:

- pointer lock acquired;
- 8 live combatants (1 local + 7 authority bots);
- `mapId=relay`, `fixtureId=relay_map_collision`;
- 56 authority colliders;
- 7 remote avatars;
- first-person weapon overlap check true;
- zero console, page, or failed-request errors;
- no retired Foundry GLB request.

Automated/runtime proof does not grant visual or play acceptance. Relay is an
original, playable graybox-plus candidate with a readable route hierarchy; it
is not final environment art.

## Consolidated verification

- App TypeScript: PASS.
- Worker TypeScript: PASS.
- Simulation source/build TypeScript: PASS.
- Affected Vitest packet: PASS, 4 files / 12 tests.
- Staging build before the final copy-only edit: PASS.
- Staging package verifier before the final copy-only edit: PASS; retired map
  artifact absent.
- ESLint first run found one unused import introduced by the generic combat
  world refactor; the import was removed.
- Final lint/build/package rerun: INCONCLUSIVE because the Windows command
  bridge stopped launching even a one-line PowerShell command. No code failure
  was returned. Do not upgrade this to PASS until it is rerun.

## Exact resume step

After this checkpoint was written, a bounded architectural-skin source batch
was added in `src/app/relayArchitectureSkin.ts`: flush upper-deck fascia,
boundary panel rhythm, team-side readability lights, lower-route ribs, and
cover faceplates. It deliberately adds no collision or implied traversal.
Because the command bridge remained unavailable, this newest skin layer is
source-complete but not yet compiled or captured and must be treated as
unverified.

When the Windows command bridge responds again:

1. Run ESLint once.
2. Rebuild staging and rerun `verify-staging-review-package.mjs`.
3. Restart only the repo-owned preview on port 6338.
4. Capture the source-matched v5 packet with
   `tools/evidence/capture-relay-player-eye.mjs`.
5. Run the bounded local-practice Playwright route and inspect every v5 frame.
6. Keep Relay unaccepted until the owner gives a human map/play verdict.

No commit, push, merge, staging deployment, or production deployment is
claimed by this checkpoint.

## Continuation after the command-bridge workaround

The PowerShell launch path remained unavailable, so validation was moved to a
repo-local Node execution host rather than pausing development or weakening a
gate. The v5-v10 packets preserve each visual/runtime iteration, including the
rejected overly dark v6/v7 lighting attempts.

Current source-matched packet:
`evidence/2026-08-08/relay-visual-candidate-player-eye-v10-floor-portals/`

### Map and presentation changes

- Relay visual continuity is now `relay@1/open-sky/v2`.
- The oversized ring/dish silhouette was rebuilt as a smaller blocked signal
  array with a central lens and structural spokes; it no longer suggests an
  enterable portal aperture.
- Authority cladding uses distinct upper/main/lower material roles, segmented
  center-route inlays, connected upper-deck fascia/underside bands, lower-route
  ribs, and restrained west/east spawn signals.
- The retired Foundry render GLB remains source-preserved but is still absent
  from staging output and generated no browser request.

### Authoritative floor repair

Player-eye v9 exposed a real collision defect: the original central court
ended at x +/-10 m while the side connectors ended at x +/-13 m. A normal
diagonal sprint fell through that three-meter gap to y=-3773 and invoked
recovery. The authoritative center floor now spans x +/-13 m and extends from
z=-8.5 m to z=10 m, preserving the lower stair descent while meeting both side
connectors and the north floor.

The identical v10 route stayed grounded at y=127, crossed the repaired seam,
and ended at x=-2969 / z=2843 with no recovery. Fixture cardinality remains 56;
the exact post-repair fixture hash is `95ec4f13a599892b`.

### Relay portal contract

- Capability: `relay_revision_1_linked_world_portal_v1`.
- Pair: lower service court `relay_service_gate` to upper overlook
  `relay_overlook_gate`, with bidirectional return.
- The room owns edge-entry detection, destination capsule overlap, grounded
  placement, forbidden/kill-volume rejection, cooldown, velocity reset,
  reliable traversal events, and audio/VFX hook identity.
- Two map-specific filled apertures (10 persistent meshes) are mounted in the
  browser runtime. The v10 walk route proves their presence and authority
  binding; direct traversal is proven against the exact Rapier fixture in unit
  tests, but the current player-eye route does not claim a human-driven portal
  transit.

### Consolidated verification after the repair

- App TypeScript: PASS.
- Worker TypeScript: PASS.
- Simulation source TypeScript: PASS.
- Compiled simulation TypeScript: PASS.
- Full ESLint: PASS.
- Relay map/portal/host packet: PASS, 6 files / 24 tests.
- Exact Rapier standing-exit clearance: PASS for both Relay endpoints.
- Deterministic local 1+7 run: PASS through 360 ticks in two identical hosts.
- Local Launch sequence: PASS through collision and detonation.
- Staging build: PASS, 225 modules; existing large-chunk warning remains.
- Staging package verifier: PASS; retired Foundry artifact absent, selected
  weapon and Rev38 character LODs exact-hash verified.
- v10 browser capture: PASS, pointer lock true, 1+7 combatants, two static
  portals, first-person overlap-free, zero runtime errors.

### Remaining nonclaims and next action

Relay remains a graybox-plus candidate, not final environment art and not
human-accepted. Online Worker rooms still use the older Inkfall authority
profile; this new Relay collision/portal authority is currently proven in the
local shared-authority route only. The next coherent batch is an explicit
player-driven portal traversal capture plus a structural art pass for the
spawn buildings, cover modules, lower court, and skyline. No commit, push,
merge, deployment, or release is claimed here.

## Work-in-progress publish checkpoint

The command bridge was bypassed with a repository-local Node execution host;
no validation rule was removed. Relay visual continuity is now
`relay@1/open-sky/v3`.

### Player-input portal proof

Source-matched runtime packet:
`evidence/2026-08-08/relay-portal-player-input-v6-visual-v3/`

- Normal keyboard/mouse-equivalent movement crossed the repaired center seam,
  entered the lower service gate, arrived on the upper overlook, waited for the
  complete 160-tick authority cooldown, and returned through the upper gate.
- First arrival: `(0, 3930, 17000)` mm.
- Return arrival: `(0, -3000, -17150)` mm.
- Local-player traversal events: 2.
- Portal presentation events: 2.
- Runtime errors: 0.
- One earlier visual-v3 capture was interrupted by live bot combat and remains
  a preserved failed packet; the unmodified retry completed.

### Structural presentation revision

- Both portal apertures now sit inside continuous wall/rail bays with headers,
  jambs, sills, backplanes, and restrained route-light inlays.
- The signal array now faces the playable court. The center spike mast was
  removed and replaced with two outboard supports, a crossbeam, and a base.
- Center-deck panel breaks add material rhythm without introducing false cover.
- Portal event lights were reduced to a local pulse instead of washing the
  whole arrival view in one color.

### Verification for this revision

- App TypeScript: PASS.
- Targeted ESLint: PASS.
- Relay presentation/portal unit packet: PASS, 3 files / 7 tests.
- Staging build: PASS, 227 modules; the existing large-chunk warning remains.
- Player-input 1+7 round trip: PASS with zero runtime errors.

This is a work-in-progress staging candidate. Automated proof establishes the
route and presentation behavior; it does not grant final map art, balance,
online Worker, or human play acceptance.

## Online authority and reload-continuity checkpoint

Relay is now the default real browser/Worker authority profile rather than a
local-only presentation. Commit `210a87d` binds the exact 56-collider fixture,
8 spawns, linked portal capability, Worker room creation/verification, online
Three presentation, combat, and active checkpoints. Commit `ac23bc6` preserves
the opaque rotated resume credential in tab-scoped storage, binds it to the
exact authority origin/room/profile/map/fixture, and starts reconnect before
large presentation assets load.

Public staging proof used two independent browser clients. A real page reload
then returned with the same match ID, player ID, and exact authoritative
position; `resumeSuccesses` advanced from 0 to 1 and prediction error settled
to 0. The main-menu online control also exposes the corrected available
accessible name. This is staging proof, not production deployment.

## Relay Open Sky v4 presentation and zone batch

Current source presentation reference: `relay@1/open-sky/v4`.

- Practice and online now consume the same presentation reference and exact
  zone cardinality.
- Eight named callout zones cover the west/east spawn bays, signal court,
  north gallery, upper bridge/overlook, and lower descent/service route.
- The authority package digest now covers the collision fixture, ordered
  spawns, zones, and linked-gate contract instead of aliasing the fixture hash.
- Deterministic generated panel albedo, roughness, and height maps replace the
  broad flat-color collider treatment without adding network requests or
  external payloads.
- Dark spawn-deck inserts, signal tracks, boundary bay frames, upper-ramp
  inlays, bridge collars, and equipment housings add coherent structural
  hierarchy while remaining render-only and outside/flush with authority
  geometry.
- A flat sky-disc experiment in the v12 packet was visually rejected and
  removed before the final source-matched capture.

Resource Pilfer disposition for the supplied NotHereButAfk/Ev.io archive
remains `REFERENCE ONLY`: the archive matches the audited upstream tree, but a
root license covering the code and assets is absent. No upstream source,
geometry, texture, audio, or `.evmap` entered this implementation.

Consolidated gates for the v4 batch:

- App and Worker TypeScript: PASS.
- Changed-surface ESLint: PASS.
- Relay unit packet: 3 files / 7 tests PASS.
- Relay Worker room/profile packet: 1 file / 8 tests PASS.
- Staging build: PASS, 228 modules; existing large-chunk warning remains.
- Staging package closure: PASS; retired Foundry GLB absent and selected
  character/weapon artifacts exact-hash verified.
- Final player-eye packet:
  `evidence/2026-08-08/relay-visual-candidate-player-eye-v13-open-sky-v4-final/`.
  Pointer lock, 1+7 population, 56 colliders, 8 spawns, 8 zones, 2 portals,
  7 remote avatars, overlap-free first-person mount, and zero runtime errors
  were observed.

Human Eye verdict remains **REVISE**. Material breakup and route readability
are better, but the arena is still graybox-plus with repetitive box massing.
No human map/play acceptance, 4/8 public population run, final performance
qualification, or release claim is made by this batch.

## Relay product-default convergence

The unprofiled product path now resolves to Relay consistently instead of
falling back to the retired Inkfall/flat-run inspection profile. Main-menu
Quick Play, Practice, direct online create/join, landing scope copy, transition
notices, and the loading overlay all identify Relay / Open Sky Campus. Explicit
historical profile URLs retain their requested profile rather than being
silently relabeled. Arena selection is a required radio group, and the dormant
mode-card path now routes through the same Practice entry adapter.

Stale presentation copy was corrected to match the implemented authority
contract: 56 colliders, eight spawns, eight zones, linked portals, and shared
Practice/online presentation are live; visual, balance, public-population, and
human play approval remain open.

Consolidated lightweight verification for this batch:

- App TypeScript: PASS.
- Changed TypeScript ESLint surface: PASS.
- Online authority selection/routing: 1 file / 13 tests PASS.
- `git diff --check` on the touched Relay/default files: PASS (line-ending
  conversion notices only).

This checkpoint does not claim a new staging build, deployment, final map art,
or human acceptance.
## Relay Open Sky v5 environment-art lane — 2026-08-09

Current source presentation reference: `relay@1/open-sky/v5`.

The v4 section above and its source-matched v13 packet remain preserved as
history and comparison evidence. The v5 lane is based directly on commit
`520d94c5c9bd54b5b138ca25a116a1781f3e3356` in isolated worktree
`D:\AI Projects\Projects\Games\evio\evio-relay-v5-art-20260809` on branch
`codex/relay-v5-art-20260809`; the dirty canonical checkout is read-only.

### Frozen gameplay authority

- Relay Revision 1 remains exactly 56 colliders, 8 ordered spawns, 8 named
  zones, and the linked two-endpoint portal capability.
- The authority fixture, package digest inputs, portal triggers/exits,
  sightline layout, and Practice/online binding are unchanged by this art lane.
- Every v5 environment member is marked render-only, no-hit, and not authority.
  The architectural layer reports zero fake traversable surfaces.

### Authored campus revision

- The green-gray field was replaced with a layered high-altitude sky shader:
  stronger zenith/horizon separation, warm sun/haze, and restrained cloud
  bands. Three continuous near/middle/far ridge bands replace the repeated
  dodecahedral horizon blobs and establish environmental scale.
- The generic ring-on-sticks landmark became a physically anchored campus
  crown: foundation wall tie, plinth, twin pylons, curved structural yoke,
  restrained signal arc, crossbar, suspension, hub, and one readable lens.
- Both spawn ends now read as operations facades built into/outside the exact
  boundary wall. Dark pad inserts, facade crowns, canted ceramic fins, and
  low-output signal blades replace the obstructive streetlamp-like beacons.
- The upper bridge now has one continuous underside/fascia load path, hexagonal
  pier skins within the existing support footprints, capitals, and rail-plane
  braces contained by existing authority rails.
- The lower service court now has wall-bound pipe banks, clamps, flush grates,
  and a low-luminance datum that terminate into the service portal structure.
- Both portal apertures have hex jambs, headers, sills, diagonal braces, and
  explicit wall/array ties. The assemblies remain visual-only around the
  unchanged portal authority endpoints.
- Cover retains truthful box collision cladding but adds inset saddle caps,
  recessed armor, and alternating identity spines. Surface maps now use
  role-specific strakes, louvers, chevrons, brushed structure, spawn fields,
  and service grates instead of one repeated square-panel texture.

### Explicit render budget

- V5 base candidate ceiling: 96 mesh objects / estimated base draw calls and
  8 realtime lights.
- V5 architectural layer ceiling: 28 instanced mesh batches, 28 estimated draw
  calls, 2 lights, and 180 logical instances.
- The two animated portal apertures retain their existing 10 presentation
  meshes outside the base-candidate budget.

Verification and the source-matched player-eye packet are intentionally not
claimed in this source checkpoint. They will be recorded only after the one
consolidated proportional gate and the protected-process preflight.

### V5 consolidated result and evidence boundary

Dedicated packet:
`evidence/2026-08-09/relay-open-sky-v5-art/`.

- App TypeScript: PASS.
- Relay unit packet: PASS, 4 files / 12 tests.
- Targeted Relay Worker binding: PASS, 1 selected test / 7 skipped.
- Changed-file ESLint: PASS, 8 TS/MJS files.
- Production build: PASS, 226 modules. The existing greater-than-500-kB chunk
  warning remains.
- Deterministic base construction: 54 mesh objects / estimated draw calls and
  6 lights, including 22 architectural instance batches representing 122
  logical members. This is below both explicit v5 budgets.

The first logging wrapper failed before invoking any gate command because its
PowerShell `Tee-Object` parameter combination was invalid. The corrected
`consolidated-gate-run1.log` is the only executed proportional gate and passed
all five requested steps.

The browser/player-eye capture was not launched. The required preflight found
Blender 5.1 active as PID 30588 at `2026-08-09T19:28:25Z`; that protected
process was neither closed nor disturbed. V5 runtime appearance is therefore
`UNKNOWN`, the preserved v13 packet remains the only observed visual baseline,
and Human Eye disposition remains **REVISE** pending owner review. No automated
PASS grants visual acceptance.

## Relay Open Sky v5 source-only continuation - 2026-08-09

Dedicated packet:
`evidence/2026-08-09/relay-open-sky-v5-source-continuation/`.

The existing `codex/relay-v5-art-20260809` lane continued from commit
`e663c356b7a33669bee4c07d26da955d684857d2`. No second worktree was opened,
and the dirty canonical checkout remained read-only.

### Source batch

- Corrected floor/step/bridge material roles from actual top elevation while
  keeping supports structural. Main, upper, and lower traversal can now carry
  distinct surface language instead of collapsing into generic dark boxes.
- Closed center/side bridge underside seams and connected pier capitals into
  the load path. Boundary facade members were moved to the exact wall plane,
  and their cant no longer rotates into playable space.
- Aligned rotated cover skins to the actual collider rotation and capped
  visible no-hit relief at 12 mm.
- Turned the four unchanged spawn sight walls into recognizable west-bracket
  and east-chevron exit shoulders without adding an arch, post, floor, or
  collision obstruction.
- Added paired portal destination keys: service previews the overlook crown;
  overlook previews the lower-service pipe bank.
- Reduced local emissive/light limits and seated route tracks, grates, and the
  lower datum flush to authority surfaces. The sky palette now has a warmer
  horizon, cooler upper air, and deeper blue zenith.

### Frozen authority and budget

The Relay authority fixture, linked-portal authority, Practice route, and
online route files retain the exact Git blob identities from the parent
commit. The inherited package therefore remains Revision 1 with 56 colliders,
8 spawns, 8 zones, and 2 linked portal endpoints; no authority source was
edited in this continuation.

Expected source accounting is 60 base meshes/draw calls and 6 lights,
including 27 instanced architecture batches representing 149 logical members.
This remains within the existing 96/8 base and 28/2/180 architecture ceilings.
The figures are source accounting, not a fresh runtime traversal or GPU test.

### Shared-runtime hold and acceptance boundary

The parent hold remained authoritative. No Blender, Unreal, browser, dev
server, build, capture, unit/runtime test, or other protected runtime was
launched. The non-incremental app typecheck, lint on the four changed TS files,
diff whitespace check, evidence JSON parse, and four protected-source blob
comparisons passed. Unit/Worker tests and builds were intentionally not run.

The source direction is `KEEP`; the rejected v4 graybox, floating construction,
and bright floor-patch relationships remain `REJECT`; v5 player-eye appearance
and Human Eye acceptance remain `REVISE / UNKNOWN` until representative 2/4/8
occupancy evidence is captured and reviewed after an explicit hold release.
