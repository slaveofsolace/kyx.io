# Phase 5 P5.2b authoritative room combat integration — 2026-07-21

## Verdict

**BOUNDED ROOM-INTEGRATION SLICE COMPLETE. G4 IS NOT PASSED.**

The P5.1 life service and P5.2 Auto Rifle state machine now run inside
`AuthoritativeRoom`, but only when a room explicitly opts into the exact
`revamped_classic@3` fixture identity:

| Field | Required value |
|---|---|
| Ruleset ID | `revamped_classic` |
| Revision | `3` |
| Content hash | `d5f0418d1d927370` |
| Combat profile | `revamped_classic_g4_v1` |

Revision 2 remains the default and prior G3 rooms omit all new combat snapshot
and tick fields. This preserves the accepted G2 identity and keeps the current
G3 evidence path from silently enabling unfinished combat.

## Integrated authority behavior

- Joining an enabled room creates immutable life and Auto Rifle state from the
  pinned rules, a room-owned team resolver, and a trusted spawn resolver.
- Auto Rifle intent is sampled from the already validated 20 Hz movement input:
  primary-fire/reload/sprint button bits and selected slot zero. There is no
  second client combat-outcome message and no client field for ammo, cadence,
  shot time, origin, hit, damage, death, score, or respawn transform.
- Accepted room shots update ammo/cadence/recoil state and end the shooter's
  spawn protection at the accepted authority tick.
- The room-owned damage seam allocates event sequences, derives source team from
  room state, applies health/death exactly once, clears pending movement on
  death, and projects authoritative health/shield into protocol entities.
- Dead players cannot move; their weapon state receives the dead life phase and
  cancels its active reload through the P5.2 policy.
- Respawn is accepted only at the authority eligibility tick and only at a
  transform/semantic spawn returned by the room's trusted resolver. Movement is
  recreated at that authoritative discontinuity and queued dead-state input is
  discarded.
- Full snapshots and authenticated resume preserve immutable life/ammo/reload
  state. Rooms without the combat opt-in preserve their historical snapshot
  shape.

## Executed evidence

Because the shared Windows PowerShell launcher became temporarily unable to
start even trivial commands, verification ran through the already-live Node
analysis kernel without spawning another shell. It used the same TypeScript,
Vitest, Cloudflare Worker pool, and ESLint packages installed by the repository.

- New room-combat integration tests: **5/5 PASS**.
- Combined content/life/Auto Rifle/room group: **31/31 PASS**.
- Full main suite: **473/473 PASS** across 47 files.
- Worker isolate suite: **6/6 PASS** across two files.
- App, Worker, simulation-source, and simulation TypeScript: **PASS** with zero
  diagnostics.
- Scoped changed-file lint: **PASS**.

The first room test correctly showed that one held-fire command is neutralized
after the movement profile's bounded held-command reuse window. The fixture was
corrected to submit one validated command per 20 Hz authority tick, matching the
real client contract; accepted shots then occurred at the exact ready/cadence
ticks. No authority implementation rule was weakened to satisfy the test.

## Explicitly not closed

This slice does not implement or prove rewind, authoritative muzzle/eye origin,
hitscan occlusion, target hit-volume history, simultaneous cross-player
shot/death ordering, the Impulse Grenade, score/feed/match result, presentation,
wire-level combat event delivery, product UI integration, two-browser play, or
G4 acceptance. `applyCombatDamage` is an internal authority seam for the later
P5.3 resolver; it is not exposed as a client message.

The next combat step is P5.3 authoritative aim history and rewind/hitscan, after
which same-tick accepted shots can drive this damage seam under a single room
ordering policy.
