# Phase 5 P5.3 pose-history and rewind/hitscan foundation

Date: 2026-07-21 (America/Chicago)  
Status: **PURE AUTHORITY FOUNDATION PASS; ROOM/WIRE/RUNTIME INTEGRATION AND G4 OPEN**

## Implemented boundary

The new pure combat modules provide the bounded deterministic seam required
between an accepted P5.2 Auto Rifle shot and the existing internal P5.2b room
damage seam:

- `poseHistory.ts` retains immutable 20 Hz target pose/hit-volume history with
  an exact 16-sample (800 ms) cap, unique increasing authority ticks, stable
  input-order-independent batch recording, and yaw-oriented analytic boxes for
  head, torso, and limb classification;
- `rewindHitscan.ts` consumes a complete server-accepted P5.2 shot event,
  server receipt tick, server-observed RTT history, the shooter's current
  authoritative pose, and the current accepted look. It has no client timestamp,
  origin, target, hit, damage, or outcome field;
- RTT compensation uses the median of the most recent eight of at most sixteen
  server observations. The accepted 350 ms round-trip profile maps to four
  50 ms ticks. Larger values are capped at exactly four ticks / 200 ms one-way;
- only eligible targets are rewound to an exact authority sample. The shooter
  remains at the current pose and the world port is queried without mutating or
  temporarily restoring shared collision state;
- body-relative accepted aim is clamped to 90 degrees yaw and 89 degrees pitch,
  then the accepted P5.2 Auto Rifle recoil/spread sample is applied. Eye and
  muzzle origins are derived from current authoritative pose/socket offsets and
  the final trace is capped at 120,000 mm;
- target volumes use analytic ray versus yaw-oriented box intersections.
  Candidate ordering is distance, stable player ID, hit-region priority, then
  stable volume ID. An authoritative world collision at the same or nearer
  distance wins;
- self, current teammate, current-dead, and historically-dead targets are
  filtered. A missing exact pose for an otherwise eligible target fails closed;
- results, debug facts, collision queries, and pose histories are recursively
  frozen and do not mutate source state. Debug output names median RTT,
  requested/applied compensation, cap use, target tick, aim clamp/recoil/spread,
  filter counts, and explicitly records `clientTimestampUsed: false`.

`strictCombatData.ts` is a private validation utility for this boundary. Before
any untrusted field is read, it rejects accessors, cycles or repeated object
aliases, sparse/custom arrays, symbol fields, exotic prototypes, and unsupported
value types. Module-specific validators then reject unknown/missing fields,
NaN/non-finite values, unsafe integers, overflows, duplicate pose/RTT samples,
duplicate hit volumes and player histories, future samples, forged accepted-shot
fields, and malformed collision-adapter replies.

## Stable semantic outcomes

Resolved shots return `hit`, `no_target`, or `world_occluded`. Timing and
authority inconsistencies return stable fail-closed reasons for future/stale
receipt, shot-tick or shot-player mismatch, non-current shooter pose/look, dead
shooter, pre-zero rewind, and unavailable target history. Structural or numeric
malformation throws before collision resolution rather than silently coercing
input.

## Executed proof

Verification ran in-process through the repository's installed Node packages
because the shared PowerShell launcher was stalled. No shell fallback or
deployment was used.

- Focused P5.3 suite: **15/15 PASS**.
- Combined combat unit suite: **40/40 PASS** across life, Auto Rifle, room
  integration, and rewind/hitscan tests.
- Full authority unit/integration selection: **75/75 PASS** across nine files.
- Application TypeScript compiler graph: **PASS, zero diagnostics**.
- Worker TypeScript compiler graph: **PASS, zero diagnostics**.
- Scoped ESLint for the three new modules, combat export, and focused test:
  **PASS, zero errors and zero warnings**.

The focused suite covers the 20 Hz/history bounds, source immutability, shuffled
sample recording, duplicate and hostile pose data, the 350 ms and over-cap RTT
cases, present-versus-rewound targets, stale/future/mismatched timing, missing
history, world occlusion, stable nearest-hit ordering, self/team/dead filtering,
no-target misses, head/torso/limb classification at the current 1.0 multiplier,
aim clamp plus recoil/spread application, 120 m range, render-frame independence,
unknown/forged fields, cycles, accessors, NaN, duplicates, future poses, and
malformed world-collision responses.

## Explicit non-claims and next integration seam

- `AuthoritativeRoom` does not yet record these pose histories or invoke this
  resolver. No room file was changed in this slice.
- The world-occlusion port is an explicit validated interface; it is not yet
  bound to the room's Rapier/Inkfall collision query.
- A resolved hit does not yet allocate a room combat sequence or call
  `applyCombatDamage`; simultaneous accepted-shot ordering remains to be pinned
  at room level.
- No new protocol command/event, reconnect payload, Worker-isolate execution,
  browser route, HUD marker, VFX, audio, animation, two-client runtime capture,
  or latency-injected product proof is claimed.
- This module imports the exact pinned Auto Rifle fixture constants. Room
  integration must still require and record the validated `revamped_classic@3`
  identity rather than enable the slice for the revision-2 default.
- P5.4 Impulse Grenade, match score/feed/timer, presentation confirmation,
  abuse/reconnect coverage, and the full P5.8/P5.9 evidence matrix remain open.

Therefore this is a bounded P5.3 pure-foundation milestone only. It does not
close G4 or make the product combat slice load-and-play.
