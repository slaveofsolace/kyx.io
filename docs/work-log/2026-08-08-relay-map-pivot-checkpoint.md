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
