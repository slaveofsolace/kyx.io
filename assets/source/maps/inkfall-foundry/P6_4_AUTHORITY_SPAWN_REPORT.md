# Inkfall Foundry P6.4 authority-spawn report

Date: 2026-07-21 (America/Chicago)  
Verdict: **DELEGATED P6.4 AUTHORITY-SPAWN SLICE COMPLETE**  
Whole Phase 6 verdict: **PARTIAL**  
G5 verdict: **NOT PASSED**

## Closed scope

Inkfall Foundry now has a deterministic authority-owned spawn selector bound to
the immutable P6.3 runtime package and converted collision fixture:

| Binding | Value |
|---|---|
| Map | `inkfall_foundry@1` |
| Package digest | `a593ad82b2e9f713a4a8d775002c1583c0fb3dfd3acdf004ba7bd6b144173267` |
| Authority fixture hash | `2a0a446a0b152395` |
| Authority boxes | 346 |
| Spawn candidates | 12 |
| Saved fixture set | `runtime/spawn-fixtures.p6-4.v1.json` |
| Saved fixture SHA-256 | `beebe56866dc405ab393bedffbc33cbee958419ac9948d9cb70ffb6700bb05ca` |

`src/authority/spawn/inkfallSpawnAuthority.ts` accepts an unknown input and
snapshots it without invoking accessors. It rejects non-plain structures,
unknown or missing fields, client-selected score/position fields, duplicate
identifiers, invalid/future ticks, invalid normalized aim, unknown spawn
references, wrong map/fixture identity, and invalid mode/team state. Limits are
bounded for players, history, objectives, arrays, fields, and nesting.

The authority chooses a transform from the validated map manifest. A client
position or score is never an input. Every active enemy contributes a retained
per-enemy row to every candidate; the implementation never reduces the model to
the nearest enemy.

## Deterministic score and rejection policy

All score components are integer-valued and returned for debug/evidence:

| Component | Authority source / policy |
|---|---|
| Enemy distance | Sum over all enemies; increases through a bounded 40 m safety band |
| LOS/exposure | Standing and crouched-eye segment traces against the 346 converted authority boxes |
| Recent enemy aim | Normalized Q15 alignment, bounded to a 10-tick recent window |
| Travel/arrival pressure | Conservative 9 m/s spatial lower bound, optionally lowered by an authority route-probe estimate |
| Recent death | Time and distance decay over 200 ticks / 12 m; requester deaths weigh more |
| Recent use | Per-candidate decay over 160 ticks |
| Teammate support | Bounded support preference around 12 m in TDM |
| Team clustering | Penalty for every teammate inside 7 m plus an excess-cluster penalty |
| Objective pressure | Explicit authority objective list; exactly neutral when the list is empty |
| Occupancy | All active players; overlap is a hard rejection |
| Mode/team territory | FFA uses deathmatch candidates; TDM uses the authority-assigned west/east territory |
| Escape count/quality | Manifest route-family count plus pinned route-family quality weights |

Any standing **or** crouched direct enemy LOS rejects a candidate, satisfying
the zero-direct-LOS selection contract. Occupancy overlap and mode/team mismatch
also reject. If no candidate remains, the result is `no_safe_spawn`; the code
does not silently use a fallback. Equal eligible totals are resolved by score
descending, then spawn semantic ID in code-unit ascending order.

`fixtureLineOfSight.ts` traces the same immutable oriented boxes produced by the
P6.3 collision conversion. It accepts no presentation mesh. Collider order and
equal-hit resolution are stable by collider ID.

## Saved deterministic fixtures

| Fixture | Players | Mode | Expected result | Decision hash |
|---|---:|---|---|---|
| `ffa_2_player_occluded` | 2 | FFA | `spawn_dm_ink_w` | `2ff86027cd9ca213` |
| `ffa_4_player_all_enemy_aggregate` | 4 | FFA | `spawn_dm_ink_e` | `aabbcef2ce8f30cc` |
| `ffa_8_player_safe_pockets` | 8 | FFA | `spawn_dm_ink_w` | `196138c60153ded0` |
| `tdm_4_player_team_cluster` | 4 | TDM | `spawn_w_archive` | `4ad48c0fd9e11aeb` |
| `ffa_visual_score_pressure` | 2 | FFA | `spawn_dm_ink_e` | `81286ef1c04ce7e4` |
| `ffa_no_safe_spawn` | 5 | FFA | `no_safe_spawn` | `4ad254e4323673e7` |

Focused tests also prove open versus named-occluder rays, standing-visible versus
crouched-occluded sampling, all-enemy component sums, input-order invariance,
fresh/stale aim, authority arrival overrides, recent death/use decay, explicit
and empty objectives, team clustering, occupancy, stable ties, immutable output,
and fail-closed malformed input.

## Visible development evidence

Development route: `/__test__/map`

The existing P6.3 route now executes all six fixtures before publishing its
read-only surface. It overlays FFA scores and authority LOS on the collision
projection: solid red means direct exposure/rejection; dashed green means a
named authority collider blocks the ray. The route remains development-only.

Evidence:

- `evidence/2026-07-21/phase-6-p6-4-authority-spawns/authority-spawn-capture.json`
- `evidence/2026-07-21/phase-6-p6-4-authority-spawns/independent-verification.json`
- `evidence/2026-07-21/phase-6-p6-4-authority-spawns/screenshots/inkfall-spawn-authority.png`
- screenshot: 1600 x 1388, 237623 bytes, SHA-256
  `7b6f91d19012f401a8b806d2d9df2e5ca9281d89745d540b093fbd58eea1aa0e`
- Chromium 149.0.7827.55; both GLBs HTTP 200; zero console, page,
  request, or HTTP errors
- capture: `P6_4_AUTHORITY_SPAWN_EVIDENCE_PASS`
- independent verification:
  `INDEPENDENT_P6_4_AUTHORITY_SPAWN_VERIFICATION_PASS`

The first capture attempt failed one evidence-composition assertion because its
enemy position correctly occluded all four FFA candidates, leaving no open FFA
ray to visualize. The implementation was unchanged; the visual fixture was
moved to a mixed open/blocked authority position. Both failure records remain
under `evidence/.../failures/`.

## Automated proof

- Focused P6.4 integration: **12/12 PASS**
- Development browser route: **1/1 PASS**
- Full main suite: **462/462 PASS** across 45 files
- Worker isolate suite: **6/6 PASS** across 2 files
- App, Worker, simulation-source, and simulation TypeScript: **PASS**
- Full repository lint: **PASS** after removing one unused test import found by
  the first lint attempt
- Production Vite build: **PASS**; the known 937.98 kB `Game` chunk warning
  remains
- Production output search: **PASS**; no P6.4 dev-route, fixture-set, or spawn
  evidence strings are present in `dist`
- Development asset validation: **PASS with 0 errors and 33 preserved legacy
  warnings**; no warning is attributed to P6.4
- Independent P6.3 runtime evidence re-verification:
  `INDEPENDENT_P6_3_RUNTIME_EVIDENCE_PASS`

## Explicit boundary and remaining work

This delegated P6.4 result is automated authority and fixture proof. It does
**not** claim:

- that the current offline/product respawn path or Worker room is wired to this
  selector; the module is ready for later product integration, but this task did
  not touch networking, combat, or legacy gameplay;
- subjective spawn balance, spawn-trap elimination in human matches, or human
  playtest acceptance;
- final nav travel times: absent an authority route estimate, the scorer uses a
  conservative spatial lower bound; P6.6 authoritative route tapes remain;
- P6.5 route/death/damage/sightline/occupancy telemetry;
- P6.6 authoritative movement tapes and live 2/4/8-player playtests;
- P6.7 topology lock or modular art-kit dimensions;
- a final-art room, combat readability verdict, no-snag runtime sweep,
  performance capture, or G5 acceptance.

The P6.3 manifest and its digest remain unchanged, so its embedded
`spawnScoringComplete: false` truth boundary is still accurate for that immutable
package revision. P6.4 proof is intentionally carried by the separately bound
selector, fixture set, report, and evidence. G5 remains **NOT PASSED**.
