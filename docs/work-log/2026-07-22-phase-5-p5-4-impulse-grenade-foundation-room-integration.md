# Phase 5 P5.4 authoritative Impulse Grenade foundation and room integration

Date: 2026-07-22 (America/Chicago)  
Status: **BOUNDED FOUNDATION/ROOM PASS; REAL WORLD, WIRE, PRESENTATION, AND G4 OPEN**

## Verdict

The reviewed `revamped_classic@3` Impulse Grenade now has a deterministic pure
authority service and a separate exact opt-in inside `AuthoritativeRoom`.
Existing non-combat rooms, revision-3 life/Auto Rifle rooms, and hitscan rooms
without the new nested capability preserve their previous tick, snapshot, and
protocol shapes.

The room capability requires all of the following server-owned configuration:

| Contract | Required value |
|---|---|
| Ruleset | `revamped_classic@3` |
| Ruleset hash | `d5f0418d1d927370` |
| Combat profile | `revamped_classic_g4_v1` |
| Grenade capability | `authoritative_impulse_grenade_v1` |
| World seam | Schema-1 sweep, radial LOS, and collision-safe impulse functions |

A wrong capability, extra option field, wrong world schema, or missing world
method fails closed. Merely enabling the combat or hitscan capability does not
enable grenades.

## Exact revision-3 contract implemented

- Ability ID `vertical_impulse_grenade_v1`; damage is always zero.
- Eight-tick ready delay, 240-tick cooldown, and at most two active projectiles
  per owner. An accepted throw creates the projectile and starts cooldown in
  the same immutable authority result.
- Server-owned ID, owner/team, origin, accepted look, direction, velocity,
  acceleration, radius, seed, lifetime, fuse, collision policy, and bounce
  state. Client origins, target lists, fuse times, detonations, and outcomes are
  not accepted.
- 18,000 mm/s at 20 Hz, integrated as deterministic integer translation with
  carried remainders. The reviewed profile does not contain gravity, so the
  explicit acceleration vector is zero rather than an invented engine default.
- Swept sphere radius 150 mm. The adapter may return unordered contacts; the
  authority service validates, sorts by time of impact and stable identifiers,
  and selects the earliest qualifying world/player contact.
- Owner body contacts are filtered for ticks 0 through 5 after spawn and become
  normal contacts on tick 6.
- The first qualifying contact starts the 30-tick fuse. Material response uses
  550-permille restitution and 200-permille friction. Three bounces are allowed;
  the following contact settles the projectile without creating a fourth
  bounce. Lifetime detonates at 120 ticks if the fuse has not done so first.
- Detonation changes state once and uses one stable event ID. A subsequent step
  rejects `already_detonated`; the room removes the projectile immediately.
- Radial resolution uses current authoritative player life, team, capsule
  center, and velocity. Targets are sorted by stable player ID; dead players,
  teammates, out-of-radius players, and LOS-blocked players are excluded.
- Linear falloff reaches zero at 11,000 mm. Self and enemy impulse caps are
  9,000 and 7,000 mm/s respectively, with an 8,000 mm/s vertical cap.
- The collision-safety adapter sees current velocity and the requested impulse.
  Its response may only preserve or clamp each component; redirection,
  sign-flipping, vertical over-cap, and magnitude amplification fail closed.

All vector inputs are bounded to keep squared-distance and material-response
math inside JavaScript's safe-integer range.

## Room-owned integration and ordering

`abilityOne` is sampled only from the validated authority input queue. On an
accepted edge, the room derives the grenade origin from authoritative feet,
stance-scaled eye height, current accepted yaw/pitch, and a 200 mm forward
socket. It derives owner/team and seed from room state and the match identity.
Accepted offense ends spawn protection through the existing life service.

Each opted-in tick has stable phases:

1. Players sorted by ID advance movement, rifle, and grenade readiness/cooldown.
   Accepted throws create projectiles without accepting any outcome claim.
2. Hitscan requests retain the P5.3b frozen phase-one behavior. Active
   projectiles are separately sorted by stable projectile ID and stepped once.
3. After the room owns the new tick, hitscan resolves through the existing path.
   Grenade detonations then resolve in tick/projectile/event order. Each radial
   result sorts targets, calls LOS and collision-safety ports, and only then adds
   the validated impulse to room-owned movement velocity.

This makes simultaneous projectile resolution independent of join/map insertion
order. Multiple detonations have explicit `resolutionOrdinal` values and can
observe only earlier, deterministically ordered velocity mutations. Health is
never changed by this ability.

Authenticated resume preserves cooldown and active room projectiles while
clearing ordinary input edges through the existing room path. Death immediately
marks the ability dead; authoritative respawn applies a fresh eight-tick ready
delay without erasing a longer existing cooldown. Projectiles already in flight
remain server owned. Entering postmatch clears active projectiles.

Exact-capability full snapshots include the player's grenade ability state and
sorted active projectile states for internal resume/debug work. Tick results
include recursively frozen grenade events and radial results. These fields are
not encoded into the live network protocol, and `protocolEntities()` remains
player-only.

## Executed evidence

Verification ran in-process with the repository's installed TypeScript, Vitest,
and ESLint packages. No deployment, Worker mutation, or publishing occurred.

- Pure P5.4 foundation suite: **9/9 PASS**.
- Exact room-integration suite: **5/5 PASS**.
- Combined focused P5.4 selection: **14/14 PASS** across two files.
- Full authority unit/integration selection: **103/103 PASS** across twelve files.
- Application TypeScript graph: **PASS, zero diagnostics**.
- Worker TypeScript compatibility graph: **PASS, zero diagnostics**.
- Scoped lint for the P5.4 source, room integration, exports, and both new test
  files: **PASS, zero errors and zero warnings**.

The focused suites directly prove:

- ready delay, atomic cooldown, and maximum-active rejection;
- 900 mm-per-tick deterministic trajectory and stable seed;
- unordered world/player contact sorting with the earliest player selected;
- owner immunity through five ticks and expiry on tick six;
- first-contact fuse start and detonation exactly 30 ticks later;
- three-bounce limit followed by a settled transition;
- LOS, linear falloff, teammate/dead/radius filtering, and separate self/enemy
  caps with zero damage;
- rejection of an amplifying collision-safety response;
- no duplicate detonation in the pure service or following room tick;
- exact nested room opt-in and rejection of client origin/target claims;
- authority-derived spawn socket and room-owned cooldown/projectile snapshot;
- two same-tick projectiles resolving once in stable projectile-ID order; and
- server-applied movement velocity with health and wire entities unchanged; and
- immediate death state plus respawn readiness without cooldown erasure.

## Explicit non-claims and remaining work

- The world seam is exercised with deterministic test adapters. It is not bound
  to the production Rapier/Inkfall collision world, so there is no map-level
  tunneling, LOS, bounce-material, wall-launch, or performance claim yet.
- The collision-safe adapter contract is strict, but a real adapter still needs
  to cast the player capsule against current map geometry and clamp stacked
  impulse using its current velocity/contact context.
- Zero acceleration is the honest revision-3 value. A gravity arc requires a
  reviewed content revision and replay fixtures; it was not silently invented.
- No Worker adapter, WebSocket protocol, reliable event/resume delivery,
  predicted/confirmed projectile visual, HUD cooldown, animation, audio, VFX,
  camera response, or accessibility presentation was added.
- There is no real multi-room replay hash, latency proxy, two-browser playtest,
  abuse harness against a live transport, or runtime evidence capture.
- P5.5 consolidated equip/resource/teleport work, P5.6 TDM score/feed, P5.7
  presentation, P5.8 abuse coverage, and P5.9 two-browser proof remain open.
- The checked-in content still labels the ability `contract_only` until the
  missing real runtime and evidence work is completed.

Therefore this closes only the bounded P5.4 pure and room-integration seam. It
does not pass G4 and does not make the combat slice load-and-play complete.
