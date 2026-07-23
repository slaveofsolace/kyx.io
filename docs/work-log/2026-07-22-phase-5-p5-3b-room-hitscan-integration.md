# Phase 5 P5.3b authoritative room hitscan integration

Date: 2026-07-22 (America/Chicago)  
Status: **BOUNDED ROOM-INTEGRATION PASS; WIRE/RUNTIME PROOF AND G4 OPEN**

## Verdict

The pure P5.3 target-history and rewind/hitscan resolver now has an explicit,
exact opt-in inside `AuthoritativeRoom`. Existing non-combat rooms and revision-3
life/Auto Rifle rooms without this second capability preserve their previous
tick and snapshot shapes. The revision-2 product default is unchanged.

Hitscan requires all of the following room-owned configuration:

| Contract | Required value |
|---|---|
| Ruleset | `revamped_classic@3` |
| Ruleset hash | `d5f0418d1d927370` |
| Combat profile | `revamped_classic_g4_v1` |
| Hitscan capability | `authoritative_hitscan_v1` |
| World query | Synchronous authoritative occlusion function |

Unknown capability fields, a wrong capability ID, a missing/non-function world
query, and accessor-backed option fields fail closed. Merely enabling the
existing combat profile does not enable hitscan.

## Integrated authority behavior

### Server-observed transport history

`recordServerObservedRtt(playerId, roundTripMilliseconds)` is a trusted room API,
not a wire message. The room supplies the observation tick from its own current
authority tick. There is no parameter for a client timestamp, command time,
origin, target, hit, or damage claim.

Each opted-in player retains at most sixteen immutable observations. A second
measurement in the same authority tick replaces the earlier measurement rather
than creating an ambiguous duplicate. The pure resolver continues to use the
most recent eight-sample median, map the accepted 350 ms RTT profile to four
50 ms ticks, and cap larger values at four ticks / 200 ms one-way. A shot without
server RTT history is retained as an accepted rifle shot but fails hitscan with
`server_rtt_history_unavailable`; the room does not invent a zero-latency sample.

### Two-phase deterministic tick

An opted-in combat tick now has two explicit phases:

1. All players, sorted by stable player ID, advance movement and Auto Rifle
   state. Accepted shots are collected without resolving outcomes. After every
   player advances, the room records immutable current target poses and
   stance-scaled analytic hit boxes for the same authority tick.
2. Frozen shot requests are built from the phase-one state, sorted by authority
   tick, player ID, shot ordinal, and event ID, then resolved. Only after that
   stable ordering is fixed can a hit enter the existing room-owned damage
   sequence.

This means a same-tick shot cannot see a partially advanced opponent. Two
players who both accepted a shot while alive resolve from the same phase-one
state even if the first ordered damage result kills the second shooter. The
test matrix proves that reversing join order produces identical shot results
and two deterministic deaths.

### Authority-derived pose and outcomes

- Target history is recorded at 20 Hz from authoritative feet position, body
  yaw, team, life phase, stance, and the P5.3 humanoid analytic volumes scaled
  to the standing or crouched movement shape.
- Shooter position, signed body yaw, bounded movement pitch, current accepted
  look, eye height, and forward muzzle socket are derived from current movement
  state. No client origin or hit point is accepted.
- The P5.3 resolver rewinds targets only and queries the configured world port
  with its frozen 120 m ray. The shooter and world remain current.
- Self, current teammate, and current-dead filtering remain inside the pure
  authority resolver.
- Accepted hits call the existing `applyCombatDamage` path with the room-owned
  source player/team, event sequence, authority tick, and accepted-shot event ID
  as cause. Spawn protection, already-dead rejection, life state, death,
  movement halt, and respawn eligibility therefore keep the P5.1/P5.2b policy.
- Opted-in tick results expose recursively frozen accepted-shot, resolution,
  compensation/aim/occlusion debug, and damage results. This is an internal
  authority result only; it is not added to the protocol or full snapshot.

Pose history resets on authoritative respawn and authenticated resume. RTT
history also resets on resume because the connection changed and must be
measured again. A high-latency shot during the exact-history refill window fails
closed with `target_history_unavailable` rather than using a pre-discontinuity
pose.

## Executed evidence

Verification ran in-process with the repository's installed TypeScript, Vitest,
and ESLint packages. No deployment or publishing occurred.

- New P5.3b room integration suite: **8/8 PASS**.
- Combined pure P5.3, prior P5.2b compatibility, and P5.3b selection:
  **28/28 PASS** across three files.
- Full authority unit/integration selection: **89/89 PASS** across ten files.
- Application TypeScript graph: **PASS, zero diagnostics**.
- Worker TypeScript compatibility graph: **PASS, zero diagnostics**.
- Scoped lint for `src/authority/room.ts` and the new room test:
  **PASS, zero errors and zero warnings**.

The room suite directly proves:

- exact capability opt-in and unchanged prior-combat tick keys;
- rejection of client capability, timestamp, muzzle-origin, and hit claims;
- sixteen-sample RTT bounding and same-tick replacement;
- 350 ms target rewind, an 800 ms observation capped to the same four ticks,
  and a zero-RTT miss against the identical moved current pose;
- nearer authoritative world occlusion suppressing target damage;
- self, room-team, and current-dead filters;
- target-history reset on resume and respawn;
- RTT reset on shooter resume with no fabricated fallback;
- stable, join-order-independent simultaneous shot/death resolution;
- recursive freezing of room hitscan results and resolver debug.

## Explicit non-claims and remaining work

- The configured world port is exercised with deterministic test adapters only.
  It is not yet bound to the real Rapier/Inkfall collision world, so no map-level
  occlusion or performance claim is made.
- No Worker adapter or network protocol was changed. Server RTT measurement is
  not yet connected to a live WebSocket transport, and hitscan/damage/death
  results are not yet encoded as reliable events or resume payloads.
- Full snapshots intentionally do not persist pose/RTT history; resume resets
  those histories. Life and Auto Rifle state continue through the existing
  authenticated resume seam.
- Hit volumes are deterministic stance-scaled analytic authority fixtures, not
  animation-driven production-character hurt boxes.
- There is no simultaneous multi-room/Worker replay hash, real latency proxy,
  browser client, HUD hit marker, tracer, impact, audio, VFX, animation, kill
  feed, score, match result, or two-client runtime capture from this slice.
- The internal `applyCombatDamage` test seam remains non-wire authority. No
  client damage message was introduced.
- P5.4 Impulse Grenade, projectile/cooldown integration, match orchestration,
  presentation, abuse/reconnect delivery coverage, and P5.8/P5.9 runtime proof
  remain open.

Therefore P5.3b closes only the bounded room integration seam. It does not pass
G4 and does not make the combat slice a load-and-play release candidate.
