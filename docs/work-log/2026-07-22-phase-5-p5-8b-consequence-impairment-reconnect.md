# Phase 5 P5.8B combat consequence impairment and composite reconnect

Date: 2026-07-22 (America/Chicago)  
Status: **BOUNDED TEST SLICE PASS; P5.8, P5.9, AND G4 REMAIN OPEN**

## Scope and governing contract

This bounded slice implements the next two open P5.8 rows from
`docs/design/g4-authoritative-combat-slice-plan.md`:

1. loss/reorder/duplicate delivery without duplicate ammo, damage, effect,
   death, score, feed, or cooldown consequences; and
2. one reconnect snapshot containing an active reload, active projectile, dead
   player with respawn countdown, and in-progress match.

It adds test and retained-failure evidence only. It does not change the Worker,
protocol, authority implementation, G3 evidence, Inkfall map files, character
files, or the sealed P5.7 presentation adapter.

## Deterministic impairment profiles

`tests/unit/authority/combat/p58ConsequenceReconnect.test.ts` runs four
room-level profiles twice each through 400 authoritative ticks:

| Profile | Delivery behavior | Canonical FNV-1a-64 replay hash |
|---|---|---|
| baseline | one ordered copy of every input batch | `02bc18767aada74b` |
| loss | sequence 1 is dropped; later input crosses the bounded skip/recovery path | `8895a698a8421aed` |
| reorder | sequence 2 arrives before sequence 1 | `02bc18767aada74b` |
| duplicate | every delivered batch is immediately replayed and rejected as `duplicate_sequence` | `02bc18767aada74b` |

Every profile must reproduce its literal hash, full snapshot, and semantic event
stream on its second execution. Baseline, reorder, and duplicate are byte-equal.
The loss profile has a distinct trace because it exercises the declared missing
sequence recovery, but its final combat consequences are identical and bounded:

- 15 accepted cadence shots and exactly 15 rounds consumed;
- 10 authoritative damage events, one death, one team-score change, and one
  kill-feed entry;
- one accepted Impulse Grenade throw, one detonation, and one applied self
  impulse effect;
- one completed cooldown with the ability returned to `ready`;
- no repeated semantic event ID in any profile.

The five shots after the lethal tenth hit consume ammo but correctly apply no
additional damage, death, score, or feed consequence.

## Composite reconnect proof

The second scenario resumes `player_A` at server tick 44 and validates one
authoritative snapshot containing all of the following at once:

- active revision-3 TDM match with blue score 1 and feed sequence 1;
- active rifle reload at 49/50 rounds, completing at tick 104;
- active fused Impulse Grenade projectile, detonating at tick 71 with a tick-161
  lifetime safety boundary;
- local grenade cooldown ending at tick 281;
- dead `player_B` at 0 health with respawn eligibility at tick 200.

The snapshot is also hydrated through the sealed P5.7 presentation adapter.
Continuation to tick 281 produces exactly one rifle reload-completed event, one
grenade-detonated event, and one grenade impulse-applied event, leaves no
projectile, and finishes the rifle at 50/149 rounds without replaying
pre-resume consequences.

## Retained failures

Every P5.8A/P5.8B failed attempt is retained under
`evidence/2026-07-22/phase-5-p5-8/failures/`:

- `p58a-focused-attempt-1.json`;
- `p58b-focused-attempt-1.json` through `p58b-focused-attempt-8.json`;
- `p58b-selected-matrix-attempt-1.json`.

These record the exact sequence-boundary, sealed TDM duration, invalid fake
contact, warmup/fuse, sparse-input, deterministic spread, replay-hash
calibration/recalibration, effect coverage, and selected-matrix timeout
corrections. None is overwritten by a later pass.

## Executed verification

- Focused P5.8B: **2/2 PASS** in one file.
- Selected combat/protocol/reliability/presentation matrix: **146/146 PASS**
  across 16 files.
- Current full shared-tree Vitest: **611/611 PASS** across 63 files.
- Application TypeScript graph: **PASS, zero diagnostics**.
- Focused P5.8B ESLint: **PASS, zero errors and zero warnings**.

Artifact hashes:

| File | SHA-256 |
|---|---|
| `tests/unit/authority/combat/p58ConsequenceReconnect.test.ts` | `bb6d2b6a80abb22167ce089b403595fb8694cd36c7896b8224bb95ab23ef0ba7` |
| `tests/unit/authority/combat/p58AbuseBoundaries.test.ts` | `e99b3004b46f5adb520356fc713b1fedf00ae9865200f12686ebb9d7a277043a` |

The P5.7 seal remains unchanged:

| File | Preserved SHA-256 |
|---|---|
| `src/client/combat/presentationAdapter.ts` | `b32eef1afc9e3dcd2a62413d6677f428e18b280b29a935f7c78361d7291b17e1` |
| `tests/unit/client/combat/presentationAdapter.test.ts` | `214887d86ee7d96ff890f3383e914f665dab1e0c454366e25dd28fc2b40f9a5a` |
| `src/client/combat/index.ts` | `6465fce04a7676462508d3914b1a6f6181e9ca7b08e872fd55806ccfe8e64aa5` |
| `src/client/index.ts` | `9681e1bc8c4e1281a1edb9ab299388544af1bb937ec2a385ed3d5d4d828863fb` |

## Exact remaining boundary

P5.8 remains open for runtime seams that this room-level Node suite cannot
claim:

1. A real accepted/rejected loadout authority path. `worker/room.ts` still
   returns `COMBAT_NOT_IMPLEMENTED` for every `loadoutRequest`.
2. The same pinned combat replay hash across Node, Worker isolate, and the
   development browser evidence route.
3. Full consequence impairment through the actual Worker/WebSocket transport,
   including synthetic loss, reorder, and duplicate delivery at that seam.

P5.9 remains wholly open. It requires two real isolated browser clients in one
authority room with rendered and machine-readable proof for rifle
fire/ammo/reload/hit/damage, death/score/feed/respawn, grenade
collision/detonation/reconciled movement, hostile probes, impairment profiles,
ruleset identity, and aligned HUD/VFX/audio/animation markers. Screenshots and
video are required there; this deterministic room test is not visual evidence.

Therefore this slice closes the room-level consequence and composite reconnect
rows only. It does not pass P5.8, P5.9, or G4.
