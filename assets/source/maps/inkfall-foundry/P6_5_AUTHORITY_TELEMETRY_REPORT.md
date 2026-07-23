# Inkfall Foundry P6.5 authority-telemetry report

Date: 2026-07-21 (America/Chicago)  
Verdict: **DELEGATED P6.5 AUTHORITY-TELEMETRY SLICE COMPLETE**  
Whole Phase 6 verdict: **PARTIAL**  
G5 verdict: **NOT PASSED**

## Closed scope

Inkfall Foundry now has a deterministic, authority-owned, privacy-safe telemetry
journal bound to the immutable P6.3 runtime package and converted collision
fixture:

| Binding | Value |
|---|---|
| Map | `inkfall_foundry@1` |
| Package digest | `a593ad82b2e9f713a4a8d775002c1583c0fb3dfd3acdf004ba7bd6b144173267` |
| Authority fixture hash | `2a0a446a0b152395` |
| Authority boxes | 346 |
| Authority rate | 20 Hz / 50 ms per tick |
| Heat cell | 4,000 x 3,000 x 4,000 mm |
| Saved fixture | `runtime/telemetry-fixtures.p6-5.v1.json` |
| Saved fixture SHA-256 | `4fd1d58657a9bb79bf3818a639a0bae527cdbab1571545fa5ee1137152bd3e8c` |
| Saved snapshot hash | `264136593a919c7f` |

`src/authority/telemetry/inkfallAuthorityTelemetry.ts` accepts only unknown
authority input. Before validation, it takes a defensive JSON-compatible
snapshot without invoking accessors. It rejects non-plain prototypes, accessors,
symbols, sparse or named arrays, cycles, aliased object references, unknown or
missing fields, malformed package bindings, invalid semantic IDs, invalid
positions, unbounded arrays, invalid ticks, and invalid finite vocabulary.

The journal owns event IDs, ordering, replay rejection, line-of-sight results,
quantization, aggregation, and output hashes. A client outcome, client-selected
position, account ID, display name, or network identifier is never accepted.

## Authority event contract

| Family | Retained authority result |
|---|---|
| Route traversal | Authored route/direction, resolved zones, movement mode, entry/exit/duration ticks, completed/aborted |
| Spawn choice | Manifest spawn ID, authority decision hash and score, evaluated/eligible counts |
| Spawn result | Observation duration, alive/death result, route/contact delays, damage taken |
| No safe spawn | Bounded rejection counts and authority retry delay |
| Damage location | Ephemeral source/target slots, cause, points, quantized zone cell |
| Death location | Ephemeral victim/killer slots, cause, assists, respawn tick, quantized zone cell |
| Sightline exposure | Authority-fixture LOS/blocker, 5 m distance band, stances, exposure ticks, quantized endpoints |
| Occupancy sample | Aggregate player, zone, and cell counts; individual exact positions and occupant slots are discarded |
| Objective pressure | Bounded objective/team slots, friendly/enemy counts, permille pressure, quantized cell |
| Authority volume | Recovery/kill volume kind and outcome, ephemeral actor slot, quantized cell |

The finite route table contains all 27 P6.3 routes. One-way teleport/drop links
reject reverse traversal and require their authored special movement mode;
ordinary routes reject un-authored teleport/drop semantics. Traversals must span
at least one 20 Hz authority tick.

Sightline telemetry recomputes standing or crouched eye traces against the same
346 named oriented authority boxes used by P6.4. No presentation mesh or
client-provided LOS result enters the decision.

## Privacy, bounds, and deterministic behavior

- Actor identity is an ephemeral match slot from 0 through 63. No durable player
  identity is retained.
- Exact millimeter positions are validation inputs only. Stored events and
  aggregates contain bounded heat-cell indices.
- Event batches contain at most 64 events. The raw-event ring defaults to 256,
  is configurable from 4 through 4,096, and evicts oldest events deterministically.
  Lifetime aggregates remain intact after raw-event eviction.
- Incoming batches are copied, validated, sorted by authority tick then event
  sequence, and committed atomically. Duplicate sequence numbers, replay,
  sequence/tick inconsistency, and tick regression leave the prior hash and
  state unchanged.
- Event IDs encode map revision, zero-padded authority tick, and zero-padded
  authority sequence. Aggregate arrays use stable code-unit ordering.
- The snapshot explicitly records millimeters, 20 Hz ticks, 50 ms tick duration,
  integer damage points, and objective pressure in permille.

## Saved deterministic fixture

The saved fixture contains 18 deliberately permuted events across all ten event
families. It includes open and named-collider-blocked sightlines, ordinary,
teleport, and drop routes, spawn choice/result/no-safe-spawn, damage/death,
objective pressure, recovery and kill outcomes, and one each of 2-, 4-, and
8-player occupancy samples.

| Event family | Samples |
|---|---:|
| Route traversal | 3 |
| Spawn choice | 1 |
| Spawn result | 1 |
| No safe spawn | 1 |
| Damage location | 1 |
| Death location | 1 |
| Sightline exposure | 2 |
| Occupancy sample | 3 |
| Objective pressure | 1 |
| Authority volume | 4 |

Forward and reverse fixture permutations produce the same ordered events and
snapshot hash `264136593a919c7f`. The retained snapshot contains 11 active heat
cells and exactly one 2-player, one 4-player, and one 8-player arrangement.

## Visible development evidence

Development route: `/__test__/map`

The existing read-only map laboratory now executes the saved P6.5 fixture before
publishing `window.__KYX_MAP_EVIDENCE__`. Its collision projection overlays the
quantized activity cells while preserving the P6.4 spawn score and authority LOS
view. The route labels the P6.6/G5 boundary and remains guarded by development
mode.

Evidence:

- `evidence/2026-07-21/phase-6-p6-5-authority-telemetry/authority-telemetry-verification.json`
- `evidence/2026-07-21/phase-6-p6-5-authority-telemetry/browser-capture.json`
- `evidence/2026-07-21/phase-6-p6-5-authority-telemetry/inkfall-authority-telemetry.png`
- screenshot: 1600 x 1200, 240561 bytes, SHA-256
  `875369f28f37f15323e6ef8446fabfd38fdf1c2bd4c91de42574a9927d9895bc`
- Chromium 149.0.7827.55; both GLBs loaded; zero console, page, request,
  HTTP, or external-request errors
- capture: `P6_5_AUTHORITY_TELEMETRY_BROWSER_PASS`

The first browser-plugin selection found no attachable browser. The first direct
Playwright launch then requested an absent older browser revision, and the next
capture harness attempt stopped on a local binding error before navigation. No
browser was downloaded or installed. The final capture used the already-present
Chromium 149 executable. All failed attempts remain recorded under
`evidence/.../failures/browser-connection-unavailable.json`.

This is an automated visual/debug-surface pass, not human balance or playtest
acceptance.

## Automated proof

- Focused P6.5 integration: **9/9 PASS**
- Authority regression: **60/60 PASS** across 8 files
- Full main suite: **482/482 PASS** across 48 files
- Worker isolate suite: **8/8 PASS** across 3 files after the settled G3 capture
- App, Worker, simulation-source, and simulation TypeScript: **PASS**
- Full repository lint: **PASS** across 188 files
- Explicit production Vite build: **PASS**; known 937896-byte `Game` chunk
  warning boundary remains
- Production output search: **PASS**; no map test-route path, read-only evidence
  surface, P6.5 telemetry status, or saved telemetry snapshot hash is present
- Direct development browser contract and screenshot capture: **PASS**

Focused tests cover malformed and unknown data, accessors, cycles, aliased
objects, wrong package/fixture bindings, one-way and movement-mode rules,
out-of-zone positions, actor/objective/occupancy/volume bounds, oversized batches,
duplicate and replayed sequences, tick regression, sequence/tick ordering,
atomic failure, bounded ring overflow, lifetime aggregates, stable permutation,
stable event IDs, exact-position removal, and authority-derived open/blocked LOS.

## Explicit boundary and remaining work

This delegated P6.5 result is an authority contract, deterministic fixture,
aggregation, and read-only development evidence slice. It does **not** claim:

- that the product/offline respawn path, combat runtime, or Worker room emits
  this journal yet; product wiring belongs to a later explicitly authorized
  integration and was not added here;
- client authority over outcomes or telemetry positions;
- P6.6 authoritative movement tapes or live 2/4/8-player playtests;
- P6.7 topology lock or modular art-kit dimensions;
- subjective route/spawn/combat balance, human playtest acceptance, final-art
  readability, no-snag runtime proof, performance acceptance, or G5 closure.

The P6.3 manifest and package digest remain unchanged, including its original
truth fields. P6.5 proof is carried by a separately bound authority module,
fixture, tests, development-only surface, report, and evidence. P6.6 and G5
remain open.
