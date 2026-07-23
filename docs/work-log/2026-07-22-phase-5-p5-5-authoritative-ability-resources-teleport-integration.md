# Phase 5 P5.5 authoritative ability resources and teleport integration

Date: 2026-07-22 (America/Chicago)  
Status: **BOUNDED POLICY/ROOM PASS; REAL WIRE, PRESENTATION, RUNTIME PROOF, AND G4 OPEN**

## Verdict

P5.5 now has one immutable authority resource model for the reviewed revision-3
loadout and a separate exact opt-in inside `AuthoritativeRoom`. It consolidates
the already authoritative Auto Rifle, Impulse Grenade, and movement teleport
state without creating another resolver for any of them.

The nested room capability is exactly:

`authoritative_ability_resources_teleport_v1`

It is absent by default, requires the existing exact Impulse Grenade room
capability, and requires all of the following accepted movement identity and
teleport values:

| Contract | Required value |
|---|---|
| Movement profile | `phase3_hypothesis_v1@1` |
| Movement profile hash | `8ab4ed437a4393c0` |
| Maximum range | 9,000 mm |
| Backward search | 100 mm, at most 90 steps |
| Cooldown | 160 authority movement ticks |
| Failure cooldown | disabled |
| Velocity retention | 1,000 permille planar, zero vertical |
| Grounded destination required | no |

A wrong capability, extra option field, missing grenade capability, modified
profile, modified profile hash, or changed teleport value fails closed. Rooms
without the nested capability retain their prior tick and snapshot shapes.

## Responsibility boundary

P5.5 does not choose, cast, search, validate, or apply a teleport destination.
The accepted G2/G3 movement controller remains the only owner of:

- server-look direction and range;
- stance-capsule cast and blocking contact;
- overlap, forbidden-volume, kill-volume, and optional ground checks;
- bounded backward search;
- atomic position and velocity mutation; and
- movement cooldown consumption and `teleport_succeeded` or
  `teleport_rejected` outcome creation.

The room resource seam runs only after that movement step. It filters the
movement-owned outcome for the current player/tick, derives the resulting
resource snapshot, and validates these invariants:

- at most one teleport outcome exists for a player in an authority tick;
- a success owns exactly the full 160-tick movement cooldown;
- a cooldown rejection still has movement cooldown remaining;
- blocked, forbidden, kill-volume, and no-ground failures consume no cooldown;
- tick, player identity, vectors, reason, and outcome contain only supported
  bounded fields; and
- the existing implemented integration adds zero weapon-recovery ticks and
  preserves the current combat state.

Thus a resource event confirms a result already committed by movement. It is
not new gameplay or destination authority.

## Authoritative loadout and resources

Exact-capability snapshots expose a recursively frozen internal resource view:

- primary slot 0: `vertical_rifle_v1`, selected/equipped status, phase,
  magazine, reserve, next-shot tick, and reload-completion tick;
- damage slot 1: `vertical_impulse_grenade_v1`, equip/ready/cooldown/dead
  phase, ready and cooldown timers, active projectile count, and exact ceiling
  of two;
- damage slot 2: `vertical_deployable_v1`, explicitly
  `contract_only_unavailable` rather than invented behavior;
- utility slot: `vertical_teleport_v1`, movement-owned ready/cooldown/dead
  phase, remaining cooldown, 9,000 mm range, and movement-query destination
  authority;
- no ammo ability, matching the reviewed contract; and
- dead, sprint-input, and sliding locks derived from authority state.

The room still samples only schema-validated input. Clients cannot provide a
destination, cooldown, resource count, weapon-ready result, movement outcome,
or ability event. Existing slot/equip, reload, sprint interruption, ammo,
grenade cooldown/projectile, life, and movement behavior remains owned by its
existing authority service.

## Tick and lifecycle behavior

For each sorted player in warmup or active play, the room now performs:

1. Existing movement step, including any movement-owned teleport result.
2. Existing Auto Rifle transition and accepted-shot processing.
3. Existing Impulse Grenade transition and accepted projectile creation.
4. Exact-capability resource derivation followed by observation of the one
   current-player teleport result, if present.

This ordering means a successful teleport and an already-ready rifle shot can
coexist in one tick under the explicit zero-recovery policy. The resource view
contains the post-step position cooldown and the post-combat ammo/phase. A
second teleport edge sees the decremented remaining cooldown and cannot move
the player.

Death prevents movement and drains queued input through the existing room
path. While dead, the movement cooldown remains frozen because movement is not
stepped; the resource phase is `dead`. Authoritative respawn creates a fresh
movement state at the resolved spawn, which restores teleport readiness and
does not replay the drained utility edge. Existing P5.4 grenade behavior is
preserved: respawn reapplies its eight-tick equip delay without silently
erasing a longer grenade cooldown.

## Executed evidence

Verification ran in-process with the repository's installed TypeScript,
Vitest, and ESLint packages. No deployment, Worker mutation, wire-format edit,
or publishing occurred.

- Pure P5.5 policy suite: **6/6 PASS**.
- Exact room-integration suite: **6/6 PASS**.
- Combined focused P5.5 selection: **12/12 PASS** across two files.
- Full authority unit/integration selection at execution time: **123/123 PASS**
  across fifteen files.
- Application TypeScript graph: **PASS, zero diagnostics**.
- Worker TypeScript compatibility graph: **PASS, zero diagnostics**.
- Scoped lint for the P5.5 source, room integration, exports, and both new test
  files: **PASS, zero errors and zero warnings**.

The focused suites directly prove exact immutable rules, default-room
compatibility, profile/capability rejection, deterministic equip/readiness
transitions, reload cancellation by sprint, unchanged ammo on interruption,
grenade resource bounds, atomic teleport/cooldown ownership, same-tick
zero-recovery rifle readiness, cooldown-spam rejection, blocked destination
without cooldown, forged client field rejection, dead input draining, frozen
dead cooldown, and authority-only respawn restoration.

## Explicit non-claims and remaining work

- This is an internal authority snapshot/event seam. It adds no network
  protocol field, Worker adapter, reliable delivery, resume delta, HUD,
  animation, audio, VFX, camera treatment, or accessibility presentation.
- The teleport still uses the already accepted movement query port. P5.5 adds
  no production Rapier/Inkfall map proof, proxy latency proof, two-browser
  playtest, correction trace, or performance capture.
- `vertical_deployable_v1` remains unavailable. No behavior, balance, resource,
  or outcome was inferred for it.
- No new teleport damage, ammo, charge count, equip delay, weapon lockout,
  destination outcome, or failure cost was invented. The checked-in teleport
  content remains `contract_only` until the missing runtime and evidence work
  is completed.
- P5.6 TDM score/feed, P5.7 presentation, P5.8 broader abuse coverage, P5.9
  real two-browser evidence, and the independent P5.1-P5.5 audit remain open.

Therefore this closes only the bounded P5.5 policy and exact room-integration
seam. It does not pass G4 and does not make the combat slice load-and-play
complete.
