# Relay Open Sky v5 environment-art evidence

## Outcome

One substantial render-only Open Sky v5 campus revision is implemented on the
isolated `codex/relay-v5-art-20260809` lane. The requested consolidated source
gate passed. Final player-eye disposition remains **REVISE**: v4 is visibly
rejected in the preserved baseline, while v5 source is directionally stronger
but its actual runtime appearance is **UNKNOWN** because the protected-process
preflight found Blender active and the browser capture was not launched.

No automated result in this packet grants human visual acceptance.

## Build contract

- Base commit: `520d94c5c9bd54b5b138ca25a116a1781f3e3356`.
- Worktree: `D:\AI Projects\Projects\Games\evio\evio-relay-v5-art-20260809`.
- Branch: `codex/relay-v5-art-20260809`.
- Presentation: `relay@1/open-sky/v5` /
  `relay_open_sky_visual_candidate_v5`.
- Review mode: preserved v13 black-box cold eye, followed by v5 white-box and
  consolidated gate review.
- Intended v5 capture: 1440 x 900, keyboard/mouse-equivalent input, same route
  and cameras as v13.
- Comparison baseline:
  `evidence/2026-08-08/relay-visual-candidate-player-eye-v13-open-sky-v4-final`.

## Implemented v5 revision

- Replaced the flat green-gray environment read with a layered sky model,
  explicit sun/haze/cloud bands, and continuous near/middle/far ridge bands.
- Rebuilt the north identity as a connected relay-campus crown with wall tie,
  plinth, pylons, curved yoke, signal arc, suspension, hub, and one lens.
- Removed both streetlamp-like beacon masts and their high-output lights.
- Replaced repeated north equipment boxes with integrated spawn operations
  facades seated in or beyond the authority boundary walls.
- Built one coherent bridge load path from dark underside/fascia members into
  capitals and hex pier skins contained by the existing support footprints;
  added rail-plane braces inside the authority rail silhouettes.
- Gave the lower service route wall-bound pipe banks, clamps, flush grates, and
  a restrained service datum terminating into the service-gate frame.
- Connected both portal frames through jambs, headers, sills, braces, and
  explicit service-wall / overlook-array ties.
- Replaced one repeated panel texture language with role-specific deck strakes,
  edge louvers, cover chevrons, brushed structure, spawn fields, and service
  grates. Cover adds inset caps, armor, and identity spines while retaining
  truthful box collision cladding.
- Reduced spawn and route emissive intensity; lighting is now wall-bound rather
  than projected from obstruction-like beacons.

## Frozen authority and parity

`MEASURED` — Relay remains Revision 1 with 56 colliders, 8 ordered spawns,
8 named zones, and the same linked two-endpoint portal capability. The only
change in `src/authority/relayAuthority.ts` is presentation reference v4 to v5.
The art factory is shared by Practice and online presentation paths, and every
new object is marked render-only/no-hit.

## Render budget

| Surface | Actual | Ceiling | Disposition |
|---|---:|---:|---|
| Base mesh objects / estimated draw calls | 54 | 96 | KEEP |
| Base realtime lights | 6 | 8 | KEEP |
| Architecture instanced mesh batches / draw calls | 22 | 28 | KEEP |
| Architecture logical instances | 122 | 180 | KEEP |
| Architecture realtime lights | 2 | 2 | KEEP |
| Existing animated portal meshes outside base budget | 10 | 10 | KEEP |

Counts are deterministic factory accounting cross-checked by unit traversal
assertions. They do not substitute for a GPU/frame-time capture.

## Consolidated gate

Full transcript: `gate/consolidated-gate-run1.log`.

- App TypeScript: PASS.
- Relay unit packet: PASS, 4 files / 12 tests.
- Targeted Relay Worker binding: PASS, 1 selected test / 7 skipped.
- Changed-file ESLint: PASS, 8 TS/MJS files.
- Production Vite build: PASS, 226 modules.
- Build warning: chunks above 500 kB after minification; retained and not
  represented as fixed by this lane.

The first transcript wrapper used an unsupported PowerShell `Tee-Object`
parameter combination and stopped before invoking TypeScript. No gate command
ran in that preflight. The corrected `run1` transcript above is the sole
executed consolidated gate.

## Human Eye evidence labels

`OBSERVED`

- V4 sky/ridges flatten scale and place.
- V4 bridge/spawn presentation reads as unsupported slabs plus a streetlamp.
- V4 cover/boundary surfaces repeat a panel-box grammar.
- V4 cyan floor wash clips material information.

`MEASURED`

- The proportional source gate passed.
- Authority cardinalities and presentation isolation remain pinned.
- Deterministic base construction stays within its explicit budget.

`INFERRED`

- V5 source directly replaces each rejected v4 relationship with a distinct,
  connected system and is likely to read as more authored.
- Source inspection cannot establish composition, lighting balance, clipping,
  motion quality, or taste at player eye.

`UNKNOWN`

- V5 menu, spawn, route, combat-contact, and portal presentation in runtime.
- V5 GPU/frame-time behavior, motion, 2/4/8 combat density, accessibility, and
  subjective human preference.

## KEEP / REVISE / REJECT

| Reviewed surface | Decision | Evidence boundary |
|---|---|---|
| Revision-1 authority fixture, spawns, zones, portals | KEEP | Measured by tests; no gameplay data changed |
| Practice/online presentation identity v5 | KEEP | Same source binding and Worker contract tested |
| Render-only/no-hit isolation and budget | KEEP | Source and unit assertions |
| V5 authored source direction | KEEP | Implementation direction only, not visual acceptance |
| V4 flat sky and ridge blobs | REJECT | Observed in v13 |
| V4 unsupported slabs and streetlamp beacon | REJECT | Observed in v13 |
| V4 repeated panel-box massing | REJECT | Observed in v13 |
| V4 overbright cyan floor treatment | REVISE | Observed in v13 |
| V5 player-eye presentation | REVISE / UNKNOWN | Capture blocked before browser launch |
| Human visual/play acceptance | REVISE | Owner review still required |

## Top five current priorities

1. `A81` — verify that v5 bridge/load path and spawn facades eliminate the
   unsupported kit-part read at the exact v13 cameras.
2. `A77` — verify role-specific materials and cover armor no longer collapse
   into repeated panel-box massing.
3. `A74` — verify that layered sky and ridge bands create near/middle/far
   environmental scale without obscuring combat silhouettes.
4. `A71` — capture v5 player-eye runtime once protected Blender and Unreal
   processes are absent.
5. `B60` — verify the reduced wall-bound signals retain floor texture and do
   not create cyan-white exposure patches.

Deterministic scoring is in `HUMAN_EYE_PRIORITY.md` and
`observations.scored.json`; raw records are in `observations.json`.

## Capture stop condition

At `2026-08-09T19:28:25Z`, Blender 5.1 was active as PID 30588. Per the lane
contract, no browser capture, Blender launch, Unreal launch, or process
termination was attempted. The intended source-matched packet remains:
`evidence/2026-08-09/relay-visual-candidate-player-eye-v14-open-sky-v5`.

## Nonclaims

- No v5 runtime screenshot or player-driven portal capture.
- No human map/play, balance, accessibility, audio, performance, or release
  acceptance.
- No new independent 2/4/8-client population or combat-density proof.
- No merge, push, deployment, canonical source edit, Blender launch, Unreal
  launch, or worktree deletion.
